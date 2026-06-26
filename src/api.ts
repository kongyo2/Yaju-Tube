// トークン取得
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

const API = axios.create();

// リクエスト先ホストを取り出す。相対 URL の場合は null (= 同一オリジン扱い)。
function getRequestHost(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

API.interceptors.request.use((config) => {
  const auth = useAuthStore();
  const token = auth.accessToken;
  if (!token) return config;

  // ログイン先ホストが分かっている場合、そのホスト宛 (または相対 URL) の
  // リクエストにのみトークンを付与し、別インスタンスへトークンが漏れないようにする。
  const authHost = auth.host;
  const requestHost = getRequestHost(config.url);
  if (!authHost || requestHost === null || requestHost === authHost) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default API;
