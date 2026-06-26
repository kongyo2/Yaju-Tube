// PeerTube 認証サービス
// 参考: framasoft/peertube mobile-application (lib/shared/auth/auth_datasource.dart)
//
// PeerTube は OAuth2 の password グラントでトークンを発行する。
//   1. GET  /api/v1/oauth-clients/local      → client_id / client_secret
//   2. POST /api/v1/users/token              → access_token / refresh_token
//   3. GET  /api/v1/users/me                 → アカウントと投稿可能チャンネル
// 二段階認証が有効なアカウントでは x-peertube-otp ヘッダで OTP を送る。
import axios, { isAxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  AuthSession,
  OAuthClientLocal,
  PeerTubeAccount,
  TokenResponse,
  VideoChannel,
} from '@/types/peertube';

/** 認証系のエラー。code でUI側が分岐できるようにする。 */
export type AuthErrorCode =
  | 'invalid_credentials'
  | 'missing_two_factor'
  | 'invalid_two_factor'
  | 'network'
  | 'unknown';

export class PeerTubeAuthError extends Error {
  code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'PeerTubeAuthError';
    this.code = code;
  }
}

/** "https://host/" のような入力からホスト名だけを取り出す。 */
export function normalizeHost(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

function apiBase(host: string): string {
  return `https://${host}/api/v1`;
}

/** OAuth クライアント資格情報を取得する。 */
export async function fetchOAuthClient(
  host: string,
  http: AxiosInstance = axios,
): Promise<OAuthClientLocal> {
  const res = await http.get<OAuthClientLocal>(
    `${apiBase(host)}/oauth-clients/local`,
  );
  return {
    client_id: res.data.client_id,
    client_secret: res.data.client_secret,
  };
}

/** password グラントでトークンを取得する。 */
export async function requestToken(
  host: string,
  params: {
    client: OAuthClientLocal;
    username: string;
    password: string;
    otp?: string;
  },
  http: AxiosInstance = axios,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: params.client.client_id,
    client_secret: params.client.client_secret,
    grant_type: 'password',
    response_type: 'code',
    username: params.username,
    password: params.password,
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (params.otp) headers['x-peertube-otp'] = params.otp;

  try {
    const res = await http.post<TokenResponse>(
      `${apiBase(host)}/users/token`,
      body,
      { headers },
    );
    return res.data;
  } catch (err) {
    throw toAuthError(err);
  }
}

/** リフレッシュトークンでアクセストークンを更新する。 */
export async function refreshAccessToken(
  host: string,
  creds: { clientId: string; clientSecret: string; refreshToken: string },
  http: AxiosInstance = axios,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'refresh_token',
    response_type: 'code',
    refresh_token: creds.refreshToken,
  });

  try {
    const res = await http.post<TokenResponse>(
      `${apiBase(host)}/users/token`,
      body,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    return res.data;
  } catch (err) {
    throw toAuthError(err);
  }
}

interface MeResponse {
  account: PeerTubeAccount;
  videoChannels?: VideoChannel[];
}

/** ログイン中ユーザーのアカウントと投稿可能チャンネルを取得する。 */
export async function fetchMe(
  host: string,
  accessToken: string,
  http: AxiosInstance = axios,
): Promise<{ account: PeerTubeAccount; channels: VideoChannel[] }> {
  const res = await http.get<MeResponse>(`${apiBase(host)}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const account: PeerTubeAccount = {
    id: res.data.account.id,
    name: res.data.account.name,
    displayName: res.data.account.displayName,
  };

  const channels: VideoChannel[] = (res.data.videoChannels ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    displayName: c.displayName,
    ...(c.host ? { host: c.host } : {}),
  }));

  return { account, channels };
}

/** ログインの一連の流れをまとめて行い、保存用セッションを返す。 */
export async function login(
  rawHost: string,
  username: string,
  password: string,
  otp?: string,
  http: AxiosInstance = axios,
): Promise<AuthSession> {
  const host = normalizeHost(rawHost);
  if (!host) throw new PeerTubeAuthError('unknown', 'host is required');

  const client = await fetchOAuthClient(host, http);
  const token = await requestToken(
    host,
    { client, username, password, ...(otp ? { otp } : {}) },
    http,
  );
  const me = await fetchMe(host, token.access_token, http);

  return {
    host,
    username,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type || 'Bearer',
    clientId: client.client_id,
    clientSecret: client.client_secret,
    account: me.account,
    channels: me.channels,
  };
}

/** ログアウト。サーバー側のトークン失効はベストエフォートで試みる。 */
export async function revokeToken(
  host: string,
  accessToken: string,
  tokenType = 'Bearer',
  http: AxiosInstance = axios,
): Promise<void> {
  try {
    await http.post(`${apiBase(host)}/users/revoke-token`, undefined, {
      headers: { Authorization: `${tokenType} ${accessToken}` },
    });
  } catch {
    // トークン失効に失敗してもローカルのログアウトは続行する。
  }
}

/** axios のエラーを認証用のエラーコードに変換する。 */
function toAuthError(err: unknown): PeerTubeAuthError {
  if (isAxiosError(err)) {
    const data = err.response?.data as { code?: string } | undefined;
    switch (data?.code) {
      case 'missing_two_factor':
        return new PeerTubeAuthError('missing_two_factor');
      case 'invalid_two_factor':
        return new PeerTubeAuthError('invalid_two_factor');
      case 'invalid_grant':
        return new PeerTubeAuthError('invalid_credentials');
      default:
        if (err.response?.status === 400 || err.response?.status === 401) {
          return new PeerTubeAuthError('invalid_credentials');
        }
        if (!err.response) return new PeerTubeAuthError('network');
        return new PeerTubeAuthError('unknown', err.message);
    }
  }
  return new PeerTubeAuthError('unknown');
}
