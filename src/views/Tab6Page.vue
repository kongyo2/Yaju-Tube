<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonButton,
  IonIcon,
  IonNote,
  IonProgressBar,
} from '@ionic/vue';
import { cloudUpload, logOutOutline, personCircleOutline } from 'ionicons/icons';
import { isAxiosError } from 'axios';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '@/stores/auth';
import { useInstanceStore } from '@/stores/instanceStore';
import {
  login as ptLogin,
  refreshAccessToken,
  revokeToken,
  PeerTubeAuthError,
} from '@/services/peertubeAuth';
import {
  initResumableUpload,
  uploadResumable,
  cancelResumableUpload,
  UploadAbortedError,
} from '@/services/peertubeUpload';
import { VideoPrivacy } from '@/types/peertube';
import type { UploadedVideo, VideoUploadMetadata } from '@/types/peertube';
import '../theme/variables.css';

const { t } = useI18n();
const auth = useAuthStore();
const instanceStore = useInstanceStore();

/* -------------------- ログイン -------------------- */
const loginHost = ref(auth.host ?? instanceStore.selectedInstanceUrl);
const loginUser = ref('');
const loginPass = ref('');
const loginOtp = ref('');
const needsOtp = ref(false);
const loginError = ref('');
const loggingIn = ref(false);

async function doLogin() {
  loginError.value = '';
  if (!loginHost.value.trim() || !loginUser.value.trim() || !loginPass.value) {
    loginError.value = t('auth.errors.missingFields');
    return;
  }
  loggingIn.value = true;
  try {
    const session = await ptLogin(
      loginHost.value,
      loginUser.value.trim(),
      loginPass.value,
      needsOtp.value && loginOtp.value ? loginOtp.value : undefined,
    );
    auth.setSession(session);
    channelId.value = session.channels[0]?.id ?? null;
    loginPass.value = '';
    loginOtp.value = '';
    needsOtp.value = false;
  } catch (e) {
    if (e instanceof PeerTubeAuthError) {
      switch (e.code) {
        case 'missing_two_factor':
          needsOtp.value = true;
          loginError.value = t('auth.errors.needOtp');
          break;
        case 'invalid_two_factor':
          loginError.value = t('auth.errors.invalidOtp');
          break;
        case 'invalid_credentials':
          loginError.value = t('auth.errors.invalidCredentials');
          break;
        case 'network':
          loginError.value = t('auth.errors.network');
          break;
        default:
          loginError.value = t('auth.errors.unknown');
      }
    } else {
      loginError.value = t('auth.errors.unknown');
    }
  } finally {
    loggingIn.value = false;
  }
}

async function doLogout() {
  const host = auth.host;
  const token = auth.accessToken;
  if (host && token) {
    await revokeToken(host, token, auth.tokenType);
  }
  auth.clearSession();
  resetUploadForm();
  loginUser.value = '';
}

/* -------------------- アップロード -------------------- */
const channels = computed(() => auth.channels);
const selectedFile = ref<File | null>(null);
const title = ref('');
const channelId = ref<number | null>(auth.channels[0]?.id ?? null);
const privacy = ref<VideoPrivacy>(VideoPrivacy.PUBLIC);
const description = ref('');
const nsfw = ref(false);

const uploading = ref(false);
const progress = ref(0);
const uploadError = ref('');
const uploadedUuid = ref('');

let abortController: AbortController | null = null;
let currentUploadId: string | null = null;

const privacyOptions = [
  { value: VideoPrivacy.PUBLIC, key: 'public' },
  { value: VideoPrivacy.UNLISTED, key: 'unlisted' },
  { value: VideoPrivacy.PRIVATE, key: 'private' },
  { value: VideoPrivacy.INTERNAL, key: 'internal' },
];

const fileLabel = computed(() => {
  if (!selectedFile.value) return t('upload.noFile');
  const mb = (selectedFile.value.size / (1024 * 1024)).toFixed(1);
  return `${selectedFile.value.name} (${mb} MB)`;
});

const progressPercent = computed(() => Math.round(progress.value * 100));

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  selectedFile.value = file;
  uploadedUuid.value = '';
  uploadError.value = '';
  if (file && !title.value.trim()) {
    title.value = file.name.replace(/\.[^/.]+$/, '');
  }
}

function resetUploadForm() {
  selectedFile.value = null;
  title.value = '';
  description.value = '';
  nsfw.value = false;
  privacy.value = VideoPrivacy.PUBLIC;
  progress.value = 0;
  channelId.value = auth.channels[0]?.id ?? null;
}

// アクセストークン期限切れ (401) なら一度だけリフレッシュして再試行する。
async function tryRefresh(): Promise<boolean> {
  if (!auth.host || !auth.clientId || !auth.clientSecret || !auth.refreshToken) {
    return false;
  }
  try {
    const token = await refreshAccessToken(auth.host, {
      clientId: auth.clientId,
      clientSecret: auth.clientSecret,
      refreshToken: auth.refreshToken,
    });
    auth.updateTokens(token.access_token, token.refresh_token);
    return true;
  } catch {
    return false;
  }
}

function buildMetadata(file: File): VideoUploadMetadata {
  const meta: VideoUploadMetadata = {
    name: title.value.trim() || file.name,
    channelId: channelId.value as number,
    privacy: privacy.value,
    nsfw: nsfw.value,
  };
  const desc = description.value.trim();
  if (desc) meta.description = desc;
  return meta;
}

async function runUpload(file: File): Promise<UploadedVideo> {
  const host = auth.host as string;
  const token = auth.accessToken as string;
  const uploadId = await initResumableUpload(host, token, file, buildMetadata(file));
  currentUploadId = uploadId;
  return uploadResumable(host, token, uploadId, file, {
    signal: (abortController as AbortController).signal,
    onProgress: (p) => {
      progress.value = p.ratio;
    },
  });
}

function isUnauthorized(err: unknown): boolean {
  return isAxiosError(err) && err.response?.status === 401;
}

async function startUpload() {
  if (!selectedFile.value) {
    uploadError.value = t('upload.errors.noFile');
    return;
  }
  if (channelId.value == null) {
    uploadError.value = t('upload.errors.noChannel');
    return;
  }
  if (!auth.host || !auth.accessToken) {
    uploadError.value = t('auth.errors.unknown');
    return;
  }

  const file = selectedFile.value;
  uploadError.value = '';
  uploadedUuid.value = '';
  progress.value = 0;
  uploading.value = true;
  abortController = new AbortController();

  try {
    let video: UploadedVideo;
    try {
      video = await runUpload(file);
    } catch (e) {
      if (isUnauthorized(e) && (await tryRefresh())) {
        video = await runUpload(file);
      } else {
        throw e;
      }
    }
    uploadedUuid.value = video.uuid;
    progress.value = 1;
    resetUploadForm();
  } catch (e) {
    if (e instanceof UploadAbortedError) {
      uploadError.value = t('upload.errors.canceled');
      await cancelCurrentServerUpload();
    } else if (isUnauthorized(e)) {
      uploadError.value = t('auth.errors.sessionExpired');
    } else {
      uploadError.value = t('upload.errors.failed');
    }
  } finally {
    uploading.value = false;
    abortController = null;
    currentUploadId = null;
  }
}

async function cancelCurrentServerUpload() {
  if (auth.host && auth.accessToken && currentUploadId) {
    try {
      await cancelResumableUpload(auth.host, auth.accessToken, currentUploadId);
    } catch {
      // サーバー側破棄の失敗は無視する。
    }
  }
}

function cancelUpload() {
  abortController?.abort();
}

const videoUrl = computed(() =>
  uploadedUuid.value && auth.host
    ? `https://${auth.host}/w/${uploadedUuid.value}`
    : '',
);
</script>

<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('upload.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <!-- 未ログイン: ログインフォーム -->
      <template v-if="!auth.isLoggedIn">
        <p class="section-intro">{{ $t('auth.loginIntro') }}</p>
        <ion-list>
          <ion-item>
            <ion-input
              v-model="loginHost"
              :label="$t('auth.host')"
              label-placement="stacked"
              :placeholder="$t('menu.exampleUrl')"
              autocapitalize="off"
              inputmode="url"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="loginUser"
              :label="$t('auth.username')"
              label-placement="stacked"
              autocapitalize="off"
            />
          </ion-item>
          <ion-item>
            <ion-input
              v-model="loginPass"
              type="password"
              :label="$t('auth.password')"
              label-placement="stacked"
            />
          </ion-item>
          <ion-item v-if="needsOtp">
            <ion-input
              v-model="loginOtp"
              :label="$t('auth.otp')"
              label-placement="stacked"
              inputmode="numeric"
            />
          </ion-item>
        </ion-list>

        <ion-note v-if="loginError" color="danger" class="form-note">
          {{ loginError }}
        </ion-note>

        <ion-button
          expand="block"
          :disabled="loggingIn"
          aria-label="login-submit"
          @click="doLogin"
        >
          {{ loggingIn ? $t('auth.loggingIn') : $t('auth.login') }}
        </ion-button>
      </template>

      <!-- ログイン済み: アップロードフォーム -->
      <template v-else>
        <ion-item lines="full">
          <ion-icon slot="start" :icon="personCircleOutline" />
          <ion-label>
            <h2>{{ auth.account?.displayName || auth.username }}</h2>
            <p>{{ auth.host }}</p>
          </ion-label>
          <ion-button
            slot="end"
            fill="clear"
            color="medium"
            aria-label="logout"
            @click="doLogout"
          >
            <ion-icon slot="icon-only" :icon="logOutOutline" />
          </ion-button>
        </ion-item>

        <ion-list>
          <ion-item lines="none">
            <ion-label position="stacked">{{ $t('upload.file') }}</ion-label>
            <input
              type="file"
              accept="video/*"
              class="file-input"
              aria-label="video-file"
              :disabled="uploading"
              @change="onFileChange"
            />
          </ion-item>
          <ion-item lines="none">
            <ion-note>{{ fileLabel }}</ion-note>
          </ion-item>

          <ion-item>
            <ion-input
              v-model="title"
              :label="$t('upload.name')"
              label-placement="stacked"
              :disabled="uploading"
            />
          </ion-item>

          <ion-item>
            <ion-select
              v-model="channelId"
              :label="$t('upload.channel')"
              label-placement="stacked"
              interface="popover"
              :disabled="uploading"
            >
              <ion-select-option
                v-for="ch in channels"
                :key="ch.id"
                :value="ch.id"
              >
                {{ ch.displayName || ch.name }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item>
            <ion-select
              v-model="privacy"
              :label="$t('upload.privacy')"
              label-placement="stacked"
              interface="popover"
              :disabled="uploading"
            >
              <ion-select-option
                v-for="opt in privacyOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ $t(`upload.privacyOptions.${opt.key}`) }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <ion-item>
            <ion-textarea
              v-model="description"
              :label="$t('upload.description')"
              label-placement="stacked"
              :auto-grow="true"
              :rows="3"
              :disabled="uploading"
            />
          </ion-item>

          <ion-item>
            <ion-label>{{ $t('upload.nsfw') }}</ion-label>
            <ion-toggle v-model="nsfw" :disabled="uploading" />
          </ion-item>
        </ion-list>

        <div v-if="uploading" class="progress-area">
          <ion-progress-bar :value="progress" />
          <p class="progress-label">{{ progressPercent }}%</p>
          <ion-button
            expand="block"
            color="danger"
            fill="outline"
            aria-label="cancel-upload"
            @click="cancelUpload"
          >
            {{ $t('upload.cancel') }}
          </ion-button>
        </div>

        <ion-button
          v-else
          expand="block"
          :disabled="!selectedFile"
          aria-label="start-upload"
          @click="startUpload"
        >
          <ion-icon slot="start" :icon="cloudUpload" />
          {{ $t('upload.start') }}
        </ion-button>

        <ion-note v-if="uploadError" color="danger" class="form-note">
          {{ uploadError }}
        </ion-note>

        <div v-if="uploadedUuid" class="success-area">
          <ion-note color="success">{{ $t('upload.success') }}</ion-note>
          <p>
            <a :href="videoUrl" target="_blank" rel="noopener">{{ videoUrl }}</a>
          </p>
        </div>
      </template>
    </ion-content>
  </ion-page>
</template>

<style scoped>
.section-intro {
  margin: 0 0 1rem;
  font-size: 0.95rem;
}
.form-note {
  display: block;
  margin: 0.75rem 0;
}
.file-input {
  width: 100%;
  padding: 0.5rem 0;
}
.progress-area {
  margin-top: 1rem;
}
.progress-label {
  text-align: center;
  margin: 0.5rem 0;
  font-size: 1.1rem;
}
.success-area {
  margin-top: 1rem;
  word-break: break-all;
}
</style>
