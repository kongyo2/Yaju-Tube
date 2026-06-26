// PeerTube アップロード／認証で使う型定義
// 参考: framasoft/peertube mobile-application (lib/shared/auth, lib/features/video/manage)

/** OAuth クライアント資格情報 (GET /api/v1/oauth-clients/local) */
export interface OAuthClientLocal {
  client_id: string;
  client_secret: string;
}

/** トークン取得レスポンス (POST /api/v1/users/token) */
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

/** ログインしているアカウント情報 (users/me の account) */
export interface PeerTubeAccount {
  id: number;
  name: string;
  displayName: string;
}

/** 投稿先として選べる動画チャンネル (users/me の videoChannels) */
export interface VideoChannel {
  id: number;
  name: string;
  displayName: string;
  host?: string;
}

/** ログイン成功時にストアへ保存するセッション一式 */
export interface AuthSession {
  host: string;
  username: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  clientId: string;
  clientSecret: string;
  account: PeerTubeAccount;
  channels: VideoChannel[];
}

/**
 * 動画の公開範囲。PeerTube の数値 enum に対応する。
 * 1=公開, 2=限定公開(URLを知っていれば閲覧可), 3=非公開, 4=内部限定
 */
export enum VideoPrivacy {
  PUBLIC = 1,
  UNLISTED = 2,
  PRIVATE = 3,
  INTERNAL = 4,
}

/** アップロード開始時に送るメタデータ */
export interface VideoUploadMetadata {
  name: string;
  channelId: number;
  privacy: VideoPrivacy;
  description?: string;
  nsfw?: boolean;
  waitTranscoding?: boolean;
}

/** アップロードの進捗 (0..1) と転送済みバイト数 */
export interface UploadProgress {
  ratio: number;
  loaded: number;
  total: number;
}

/** アップロード完了時に PeerTube が返す動画識別子 */
export interface UploadedVideo {
  id: number;
  uuid: string;
  shortUUID?: string;
}
