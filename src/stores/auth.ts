// 認証担当
// アクセストークンに加え、PeerTube へ動画を投稿するために必要な
// セッション情報 (リフレッシュトークン・クライアント資格情報・ログイン先ホスト・
// アカウント・投稿可能チャンネル) を保持する。
import { defineStore } from 'pinia';
import type {
  AuthSession,
  PeerTubeAccount,
  VideoChannel,
} from '@/types/peertube';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  tokenType: string;
  clientId: string | null;
  clientSecret: string | null;
  host: string | null;
  username: string | null;
  account: PeerTubeAccount | null;
  channels: VideoChannel[];
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    accessToken: null,
    refreshToken: null,
    tokenType: 'Bearer',
    clientId: null,
    clientSecret: null,
    host: null,
    username: null,
    account: null,
    channels: [],
  }),
  getters: {
    getAccessToken: state => state.accessToken,
    // 投稿に使えるログイン状態か (トークンと投稿先ホストの両方が必要)
    isLoggedIn: state => Boolean(state.accessToken && state.host),
  },
  actions: {
    setToken(token: string) {
      this.accessToken = token;
    },
    clearToken() {
      this.accessToken = null;
    },
    // ログイン成功時にセッション一式を保存
    setSession(session: AuthSession) {
      this.accessToken = session.accessToken;
      this.refreshToken = session.refreshToken;
      this.tokenType = session.tokenType || 'Bearer';
      this.clientId = session.clientId;
      this.clientSecret = session.clientSecret;
      this.host = session.host;
      this.username = session.username;
      this.account = session.account;
      this.channels = session.channels;
    },
    // トークン更新後にアクセス／リフレッシュトークンだけ差し替える
    updateTokens(accessToken: string, refreshToken: string) {
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
    },
    setChannels(channels: VideoChannel[]) {
      this.channels = channels;
    },
    // ログアウト: セッション情報をすべて破棄
    clearSession() {
      this.accessToken = null;
      this.refreshToken = null;
      this.tokenType = 'Bearer';
      this.clientId = null;
      this.clientSecret = null;
      this.host = null;
      this.username = null;
      this.account = null;
      this.channels = [];
    },
  },
  persist: true,
});
