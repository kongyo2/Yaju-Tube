// PeerTube 動画アップロードサービス (レジューム可能アップロード)
// 参考: framasoft/peertube mobile-application
//   lib/features/video/manage/video_manage_datasource.dart
//   lib/features/video/manage/video_manage_service.dart
//
// PeerTube はチャンク分割アップロード (Google Resumable Upload 互換 / uploadx) を使う。
//   1. POST /api/v1/videos/upload-resumable
//        ヘッダ X-Upload-Content-Length / X-Upload-Content-Type、本文に動画メタデータ
//        → 201 Created、Location ヘッダに upload_id 付き URL
//   2. PUT  /api/v1/videos/upload-resumable?upload_id=...
//        Content-Range: bytes <start>-<end>/<total> でチャンクを順次送信
//        → 途中は 308、最後は 200/201 で { video: { uuid } } を返す
//   3. DELETE /api/v1/videos/upload-resumable?upload_id=...  でキャンセル
import axios, { isAxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  UploadedVideo,
  UploadProgress,
  VideoUploadMetadata,
} from '@/types/peertube';

// 動的チャンクサイズの調整パラメータ (PeerTube web の ngx-uploadx DynamicChunk に倣う)。
// 1MB から開始し、8秒未満で送れたら倍、24秒を超えたら半分。下限 256KB、上限 100MB。
const CHUNK_MIN = 256 * 1024;
const CHUNK_INITIAL = 1024 * 1024;
const CHUNK_MAX_DEFAULT = 100 * 1024 * 1024;
const TARGET_MIN_MS = 8000;
const TARGET_MAX_MS = 24000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function apiBase(host: string): string {
  return `https://${host}/api/v1`;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

/** Location ヘッダ等の URL 文字列から upload_id を取り出す。 */
export function parseUploadId(location: string): string | null {
  const match = location.match(/upload_id=([^&]+)/);
  if (match && match[1]) return decodeURIComponent(match[1]);
  return null;
}

function readHeader(
  headers: unknown,
  name: string,
): string | undefined {
  const record = headers as Record<string, unknown> | undefined;
  if (!record) return undefined;
  const value = record[name] ?? record[name.toLowerCase()];
  return typeof value === 'string' ? value : undefined;
}

/** アップロードを初期化し、以降のチャンク送信に使う upload_id を返す。 */
export async function initResumableUpload(
  host: string,
  accessToken: string,
  file: File,
  meta: VideoUploadMetadata,
  http: AxiosInstance = axios,
): Promise<string> {
  const body: Record<string, unknown> = {
    filename: file.name,
    name: meta.name,
    channelId: meta.channelId,
    privacy: meta.privacy,
  };
  if (meta.description) body['description'] = meta.description;
  if (meta.nsfw !== undefined) body['nsfw'] = meta.nsfw;
  if (meta.waitTranscoding !== undefined) {
    body['waitTranscoding'] = meta.waitTranscoding;
  }

  const res = await http.post(`${apiBase(host)}/videos/upload-resumable`, body, {
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
      'X-Upload-Content-Length': String(file.size),
      'X-Upload-Content-Type': file.type || 'application/octet-stream',
    },
    validateStatus: (status) => status >= 200 && status < 300,
  });

  const location = readHeader(res.headers, 'location') ?? readHeader(res.headers, 'Location');
  const uploadId = location ? parseUploadId(location) : null;
  if (!uploadId) {
    throw new Error('Upload init failed: missing upload_id in Location header');
  }
  return uploadId;
}

/** サーバーに問い合わせて、再開時に次へ送るべきバイトオフセットを得る。 */
export async function getUploadOffset(
  host: string,
  accessToken: string,
  uploadId: string,
  fileSize: number,
  http: AxiosInstance = axios,
): Promise<number> {
  const res = await http.put(
    `${apiBase(host)}/videos/upload-resumable`,
    undefined,
    {
      params: { upload_id: uploadId },
      headers: {
        ...authHeaders(accessToken),
        'Content-Range': `bytes */${fileSize}`,
        'Content-Type': 'application/octet-stream',
      },
      validateStatus: (status) => status === 308 || status === 200 || status === 201,
    },
  );

  const range = readHeader(res.headers, 'range');
  if (range) {
    const match = range.match(/bytes=0-(\d+)/);
    if (match && match[1]) return Number.parseInt(match[1], 10) + 1;
  }
  return 0;
}

export interface UploadResumableOptions {
  /** 進捗コールバック (チャンク送信ごと) */
  onProgress?: (progress: UploadProgress) => void;
  /** 中断用シグナル。abort するとアップロードを停止し UploadAbortedError を投げる。 */
  signal?: AbortSignal;
  /** 再開オフセット (バイト)。未指定なら 0 から。 */
  startOffset?: number;
  http?: AxiosInstance;
}

export class UploadAbortedError extends Error {
  constructor() {
    super('Upload aborted');
    this.name = 'UploadAbortedError';
  }
}

/** ファイルをチャンクに分けて順次送信し、完了後に動画情報を返す。 */
export async function uploadResumable(
  host: string,
  accessToken: string,
  uploadId: string,
  file: File,
  options: UploadResumableOptions = {},
): Promise<UploadedVideo> {
  const http = options.http ?? axios;
  const signal = options.signal;
  const total = file.size;

  let chunkSize = CHUNK_INITIAL;
  let maxChunkSize = CHUNK_MAX_DEFAULT;
  let offset = options.startOffset ?? 0;
  let result: UploadedVideo | null = null;

  while (offset < total) {
    if (signal?.aborted) throw new UploadAbortedError();

    const end = Math.min(offset + chunkSize, total);
    const isLast = end === total;
    const chunk = file.slice(offset, end);
    const startedAt = Date.now();

    let response;
    try {
      response = await http.put(
        `${apiBase(host)}/videos/upload-resumable`,
        chunk,
        {
          params: { upload_id: uploadId },
          headers: {
            ...authHeaders(accessToken),
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes ${offset}-${end - 1}/${total}`,
          },
          ...(signal ? { signal } : {}),
          validateStatus: (status) =>
            status === 308 || status === 200 || status === 201,
        },
      );
    } catch (err) {
      // 413 (Payload Too Large): チャンクサイズを下げて同じオフセットから再試行。
      if (isAxiosError(err) && err.response?.status === 413) {
        maxChunkSize = clamp(Math.floor(maxChunkSize / 2), CHUNK_MIN, maxChunkSize);
        chunkSize = clamp(Math.floor(chunkSize / 2), CHUNK_MIN, maxChunkSize);
        continue;
      }
      if (isAxiosError(err) && (err.code === 'ERR_CANCELED' || signal?.aborted)) {
        throw new UploadAbortedError();
      }
      throw err;
    }

    // 最終チャンクのレスポンスに動画情報が含まれる。
    const video = (response.data as { video?: UploadedVideo } | undefined)?.video;
    if (video?.uuid) result = video;

    // 送信時間に応じて次のチャンクサイズを調整する。
    const elapsed = Date.now() - startedAt;
    if (elapsed < TARGET_MIN_MS) {
      chunkSize = clamp(chunkSize * 2, CHUNK_MIN, maxChunkSize);
    } else if (elapsed > TARGET_MAX_MS) {
      chunkSize = clamp(Math.floor(chunkSize / 2), CHUNK_MIN, maxChunkSize);
    }

    offset = end;
    options.onProgress?.({ ratio: total === 0 ? 1 : offset / total, loaded: offset, total });

    if (isLast && !result) {
      throw new Error('Upload finished but server did not return a video uuid');
    }
  }

  if (!result) throw new Error('Upload produced no video');
  return result;
}

/** 進行中／中断したアップロードをサーバー側で破棄する。 */
export async function cancelResumableUpload(
  host: string,
  accessToken: string,
  uploadId: string,
  http: AxiosInstance = axios,
): Promise<void> {
  await http.delete(`${apiBase(host)}/videos/upload-resumable`, {
    params: { upload_id: uploadId },
    headers: authHeaders(accessToken),
    validateStatus: (status) => status === 204 || status === 200 || status === 404,
  });
}

/** アップロード後に動画メタデータを更新する (公開範囲・説明など)。 */
export async function updateVideo(
  host: string,
  accessToken: string,
  videoUuid: string,
  params: Record<string, unknown>,
  http: AxiosInstance = axios,
): Promise<void> {
  await http.put(`${apiBase(host)}/videos/${videoUuid}`, params, {
    headers: {
      ...authHeaders(accessToken),
      'Content-Type': 'application/json',
    },
    validateStatus: (status) => status === 204 || status === 200,
  });
}

/** 初期化からチャンク送信までをまとめて実行する高レベル関数。 */
export async function uploadVideo(
  host: string,
  accessToken: string,
  file: File,
  meta: VideoUploadMetadata,
  options: UploadResumableOptions = {},
): Promise<UploadedVideo> {
  const http = options.http ?? axios;
  const uploadId = await initResumableUpload(host, accessToken, file, meta, http);
  return uploadResumable(host, accessToken, uploadId, file, options);
}
