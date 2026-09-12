<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/tab7"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ detail?.title || $t('nico.title') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            v-if="detail"
            fill="clear"
            :color="isSavedToPlaylist ? 'primary' : 'medium'"
            :aria-label="isSavedToPlaylist ? $t('aria.removeFromPlaylist') : $t('aria.addToPlaylist')"
            @click="togglePlaylistItem"
          >
            <ion-icon
              slot="icon-only"
              :icon="isSavedToPlaylist ? bookmark : bookmarkOutline"
            ></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div
        v-if="errorMessage"
        class="nico-error"
      >
        {{ errorMessage }}
      </div>

      <div v-if="detail">
        <div class="nico-player">
          <iframe
            ref="iframeRef"
            :src="embedUrl"
            width="100%"
            height="360"
            frameborder="0"
            allowfullscreen
            allow="autoplay; fullscreen"
          ></iframe>
        </div>

        <div class="nico-info">
          <h2 class="nico-video-title">{{ detail.title }}</h2>
          <p class="nico-stats">{{ statsLine }}</p>
          <p
            v-if="detail.ownerName"
            class="nico-owner"
          >
            {{ detail.ownerName }}
          </p>
          <p
            v-if="detail.seriesTitle"
            class="nico-series"
          >
            {{ $t('nico.video.series') }}: {{ detail.seriesTitle }}
          </p>
          <p
            v-if="detail.qualityLabels.length > 0"
            class="nico-quality"
          >
            {{ $t('nico.video.quality') }}: {{ detail.qualityLabels.join(' / ') }}
          </p>
        </div>

        <div class="nico-actions">
          <ion-button
            fill="clear"
            :color="detail.isLiked ? 'primary' : 'medium'"
            :disabled="!niconicoStore.isLoggedIn || isLiking"
            @click="toggleLike"
          >
            <ion-icon
              slot="start"
              :icon="detail.isLiked ? heart : heartOutline"
            ></ion-icon>
            {{ detail.isLiked ? $t('nico.actions.liked') : $t('nico.actions.like') }}
          </ion-button>
          <ion-button
            fill="clear"
            color="medium"
            :disabled="!niconicoStore.isLoggedIn"
            @click="addWatchLater"
          >
            <ion-icon
              slot="start"
              :icon="timeOutline"
            ></ion-icon>
            {{ $t('nico.actions.addWatchLater') }}
          </ion-button>
          <ion-button
            fill="clear"
            color="medium"
            :disabled="!niconicoStore.isLoggedIn"
            @click="presentMylistPicker"
          >
            <ion-icon
              slot="start"
              :icon="albumsOutline"
            ></ion-icon>
            {{ $t('nico.actions.addMylist') }}
          </ion-button>
          <ion-button
            fill="clear"
            color="medium"
            :href="watchUrl"
            target="_blank"
            rel="noopener"
          >
            <ion-icon
              slot="start"
              :icon="openOutline"
            ></ion-icon>
            {{ $t('nico.video.openOriginal') }}
          </ion-button>
        </div>

        <div
          v-if="detail.tags.length > 0"
          class="nico-chips"
        >
          <ion-chip
            v-for="tag in detail.tags"
            :key="tag"
            outline
            @click="searchTag(tag)"
          >
            {{ tag }}
          </ion-chip>
        </div>

        <div
          class="nico-description"
          v-html="descriptionHtml"
        ></div>

        <ion-list-header>
          <ion-label>{{ $t('nico.comments.title') }}</ion-label>
          <ion-button
            fill="clear"
            :disabled="isLoadingComments"
            @click="loadComments"
          >
            {{ $t('nico.comments.load') }}
          </ion-button>
        </ion-list-header>

        <div
          v-if="niconicoStore.isLoggedIn && detail.defaultThreadId !== null"
          class="nico-comment-form"
        >
          <ion-input
            v-model="commentBody"
            :placeholder="$t('nico.comments.placeholder')"
            :maxlength="75"
            :aria-label="$t('nico.comments.placeholder')"
          ></ion-input>
          <ion-button
            :disabled="commentBody.trim().length === 0 || isPosting"
            @click="submitComment"
          >
            {{ $t('nico.comments.post') }}
          </ion-button>
        </div>
        <div
          v-else
          class="nico-note"
        >
          {{ detail.defaultThreadId === null ? $t('nico.comments.unavailable') : $t('nico.comments.loginRequired') }}
        </div>

        <ion-list v-if="comments.length > 0">
          <ion-item
            v-for="comment in comments"
            :key="`${comment.id}-${comment.no}`"
          >
            <ion-label class="ion-text-wrap">
              <p class="nico-comment-time">{{ formatDuration(comment.vposMs / 1000) }}</p>
              <h3 class="nico-comment-body">{{ comment.body }}</h3>
            </ion-label>
          </ion-item>
        </ion-list>
        <div
          v-else-if="!isLoadingComments"
          class="nico-note"
        >
          {{ $t('nico.comments.empty') }}
        </div>

        <ion-list-header>
          <ion-label>{{ $t('nico.video.related') }}</ion-label>
        </ion-list-header>
        <nico-video-list
          :items="related"
          mode="list"
          @select="openVideo"
        />
      </div>

      <div
        v-else-if="!errorMessage"
        class="nico-note"
      >
        {{ $t('nico.video.loading') }}
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  actionSheetController,
  onIonViewWillLeave,
  IonBackButton,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonPage,
  IonTitle,
  IonToolbar,
  toastController,
} from '@ionic/vue'
import {
  albumsOutline,
  bookmark,
  bookmarkOutline,
  heart,
  heartOutline,
  openOutline,
  timeOutline,
} from 'ionicons/icons'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import NicoVideoList from '@/components/NicoVideoList.vue'
import {
  addToMylist,
  addToWatchLater,
  embedPlayerUrl,
  fetchComments,
  fetchMyMylists,
  fetchRelatedVideos,
  fetchWatchDetail,
  formatDuration,
  NICO_INSTANCE_URL,
  nicoErrorKey,
  nicoWatchUrl,
  postComment,
  setLiked,
  type CommentItem,
  type NicoVideoCard,
  type NicoWatchDetail,
} from '@/api/niconico'
import { useHistoryStore } from '@/stores/historyStore'
import { useNiconicoStore } from '@/stores/niconicoStore'
import { usePlaylistStore } from '@/stores/playlistStore'
import { NicoEmbedPlayer } from '@/utils/nicoEmbedPlayer'
import { sanitizeHtml } from '@/utils/sanitize'
import '../theme/variables.css'

const NICO_VIDEO_ROUTE_PREFIX = '/tabs/nico/'
const PROGRESS_SAVE_INTERVAL_MS = 5000
const RESUME_MIN_DURATION_SECONDS = 30
const RESUME_END_THRESHOLD_SECONDS = 10

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const niconicoStore = useNiconicoStore()
const historyStore = useHistoryStore()
const playlistStore = usePlaylistStore()

const videoId = ref(String(route.params['videoId'] ?? ''))
const detail = ref<NicoWatchDetail | null>(null)
const related = ref<NicoVideoCard[]>([])
const comments = ref<CommentItem[]>([])
const descriptionHtml = ref('')
const errorMessage = ref('')
const commentBody = ref('')
const isLoadingComments = ref(false)
const isPosting = ref(false)
const isLiking = ref(false)
const resumeSeconds = ref(0)
const iframeRef = ref<HTMLIFrameElement | null>(null)

let player: NicoEmbedPlayer | null = null
let lastSavedAt = 0
let isUnmounted = false

const watchUrl = computed(() => nicoWatchUrl(videoId.value))

const embedUrl = computed(() => embedPlayerUrl(videoId.value))

const isSavedToPlaylist = computed(() => playlistStore.isInPlaylist(videoId.value, NICO_INSTANCE_URL))

const statsLine = computed(() => {
  const current = detail.value

  if (!current) {
    return ''
  }

  return [
    `${current.viewCount.toLocaleString()} ${t('nico.video.views')}`,
    `${current.commentCount.toLocaleString()} ${t('nico.video.comments')}`,
    `${current.mylistCount.toLocaleString()} ${t('nico.video.mylists')}`,
    `${current.likeCount.toLocaleString()} ${t('nico.video.likes')}`,
  ].join(' ・ ')
})

async function showToast(message: string) {
  const toast = await toastController.create({ message, duration: 2000 })

  await toast.present()
}

function computeResumeSeconds(durationSeconds: number): number {
  const saved = historyStore.getHistoryItem(videoId.value)?.progress ?? 0

  if (saved <= 0 || durationSeconds < RESUME_MIN_DURATION_SECONDS) {
    return 0
  }

  if (saved >= durationSeconds - RESUME_END_THRESHOLD_SECONDS) {
    return 0
  }

  return Math.floor(saved)
}

function rememberInHistory(current: NicoWatchDetail) {
  historyStore.addToHistory({
    videoId: current.videoId,
    videoName: current.title,
    thumbnailPath: current.thumbnailUrl,
    channelName: current.ownerName ?? '',
    instanceUrl: NICO_INSTANCE_URL,
    source: 'niconico',
  })
}

function attachPlayer(durationSeconds: number) {
  const frame = iframeRef.value

  if (!frame) {
    return
  }

  const embed = new NicoEmbedPlayer(frame)
  const trackedVideoId = videoId.value

  player = embed

  embed.onReady(() => {
    if (resumeSeconds.value > 0) {
      embed.seek(resumeSeconds.value * 1000)
    }
  })

  embed.onStatus((status) => {
    const now = Date.now()

    if (now - lastSavedAt < PROGRESS_SAVE_INTERVAL_MS) {
      return
    }

    lastSavedAt = now
    historyStore.updateProgress(
      trackedVideoId,
      status.currentTimeMs / 1000,
      status.durationMs > 0 ? status.durationMs / 1000 : durationSeconds,
    )
  })
}

function saveProgress(savedVideoId: string, fallbackDuration: number) {
  const status = player?.status

  if (!status) {
    return
  }

  historyStore.updateProgress(
    savedVideoId,
    status.currentTimeMs / 1000,
    status.durationMs > 0 ? status.durationMs / 1000 : fallbackDuration,
  )
}

function suspendPlayback() {
  player?.pause()
  saveProgress(videoId.value, detail.value?.durationSeconds ?? 0)
}

function releasePlayer() {
  saveProgress(videoId.value, detail.value?.durationSeconds ?? 0)
  player?.destroy()
  player = null
  lastSavedAt = 0
}

async function renderDescription(description: string) {
  if (description.trim().length === 0) {
    descriptionHtml.value = ''
    return
  }

  try {
    descriptionHtml.value = sanitizeHtml(await marked(description))
  } catch {
    descriptionHtml.value = sanitizeHtml(description.replace(/\n/g, '<br>'))
  }
}

async function loadRelated() {
  try {
    related.value = (await fetchRelatedVideos(niconicoStore.client, videoId.value)).slice(0, 20)
  } catch {
    related.value = []
  }
}

async function loadComments() {
  const current = detail.value

  if (!current?.nvComment) {
    return
  }

  isLoadingComments.value = true

  try {
    comments.value = await fetchComments(niconicoStore.client, current.nvComment)
  } catch (error) {
    errorMessage.value = t(nicoErrorKey(error))
  } finally {
    isLoadingComments.value = false
  }
}

async function loadVideo() {
  try {
    const loaded = await fetchWatchDetail(niconicoStore.client, videoId.value)

    if (isUnmounted) {
      return
    }

    resumeSeconds.value = computeResumeSeconds(loaded.durationSeconds)
    detail.value = loaded
    errorMessage.value = ''

    rememberInHistory(loaded)
    await renderDescription(loaded.description)
    await nextTick()
    attachPlayer(loaded.durationSeconds)

    void loadComments()
    void loadRelated()
  } catch (error) {
    detail.value = null
    errorMessage.value = t(nicoErrorKey(error))
  }
}

async function toggleLike() {
  const current = detail.value

  if (!current || isLiking.value) {
    return
  }

  const next = !current.isLiked

  isLiking.value = true

  try {
    await setLiked(niconicoStore.client, videoId.value, next)
    current.isLiked = next
    current.likeCount = Math.max(0, current.likeCount + (next ? 1 : -1))
  } catch (error) {
    errorMessage.value = t(nicoErrorKey(error))
  } finally {
    isLiking.value = false
  }
}

async function addWatchLater() {
  try {
    await addToWatchLater(niconicoStore.client, videoId.value)
    await showToast(t('nico.actions.addedWatchLater'))
  } catch (error) {
    errorMessage.value = t(nicoErrorKey(error))
  }
}

async function presentMylistPicker() {
  try {
    const mylists = await fetchMyMylists(niconicoStore.client)

    if (mylists.length === 0) {
      await showToast(t('nico.actions.noMylists'))
      return
    }

    const sheet = await actionSheetController.create({
      header: t('nico.actions.addMylist'),
      buttons: [
        ...mylists.map((mylist) => ({
          text: mylist.name,
          handler: () => {
            void submitAddToMylist(mylist.mylistId)
          },
        })),
        { text: t('menu.cancel'), role: 'cancel' },
      ],
    })

    await sheet.present()
  } catch (error) {
    errorMessage.value = t(nicoErrorKey(error))
  }
}

async function submitAddToMylist(mylistId: number) {
  try {
    await addToMylist(niconicoStore.client, mylistId, videoId.value)
    await showToast(t('nico.actions.addedMylist'))
  } catch (error) {
    errorMessage.value = t(nicoErrorKey(error))
  }
}

async function submitComment() {
  const current = detail.value
  const body = commentBody.value.trim()

  if (!current || current.defaultThreadId === null || body.length === 0) {
    return
  }

  isPosting.value = true

  try {
    await postComment(niconicoStore.client, {
      threadId: current.defaultThreadId,
      videoId: videoId.value,
      body,
      vposMs: player?.currentTimeMs ?? 0,
    })

    commentBody.value = ''
    await showToast(t('nico.comments.posted'))
    await loadComments()
  } catch (error) {
    errorMessage.value = t(nicoErrorKey(error))
  } finally {
    isPosting.value = false
  }
}

function togglePlaylistItem() {
  const current = detail.value

  if (!current) {
    return
  }

  if (isSavedToPlaylist.value) {
    playlistStore.removeFromPlaylist(videoId.value, NICO_INSTANCE_URL)
    return
  }

  playlistStore.addToPlaylist({
    videoId: videoId.value,
    videoName: current.title,
    thumbnailPath: current.thumbnailUrl,
    channelName: current.ownerName ?? '',
    instanceUrl: NICO_INSTANCE_URL,
    source: 'niconico',
  })
}

function searchTag(tag: string) {
  void router.push({ path: '/tabs/tab7', query: { tag } })
}

function openVideo(nextVideoId: string) {
  void router.push(`${NICO_VIDEO_ROUTE_PREFIX}${nextVideoId}`)
}

function resetVideoState() {
  detail.value = null
  related.value = []
  comments.value = []
  descriptionHtml.value = ''
  errorMessage.value = ''
  commentBody.value = ''
  resumeSeconds.value = 0
}

onIonViewWillLeave(() => {
  suspendPlayback()
})

watch(
  () => route.path,
  (newPath, oldPath) => {
    if (oldPath.startsWith(NICO_VIDEO_ROUTE_PREFIX) && !newPath.startsWith(NICO_VIDEO_ROUTE_PREFIX)) {
      suspendPlayback()
    }
  },
)

watch(
  () => route.params['videoId'],
  (next) => {
    const nextVideoId = typeof next === 'string' ? next : ''

    if (nextVideoId.length === 0 || nextVideoId === videoId.value) {
      return
    }

    releasePlayer()
    videoId.value = nextVideoId
    resetVideoState()
    void loadVideo()
  },
)

onMounted(() => {
  void loadVideo()
})

onBeforeUnmount(() => {
  isUnmounted = true
  releasePlayer()
})
</script>

<style scoped>
.nico-player iframe {
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
}

.nico-info {
  padding: 0 1rem;
}

.nico-video-title {
  font-size: 1.1rem;
  margin-bottom: 0.25rem;
}

.nico-stats,
.nico-owner,
.nico-series,
.nico-quality {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  margin: 0.15rem 0;
}

.nico-actions {
  display: flex;
  flex-wrap: wrap;
  padding: 0.25rem 0.5rem;
}

.nico-chips {
  display: flex;
  flex-wrap: wrap;
  padding: 0 0.5rem;
}

.nico-description {
  margin: 1rem;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.nico-description :deep(a) {
  color: #007bff;
  text-decoration: underline;
}

.nico-comment-form {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1rem;
}

.nico-comment-form ion-button {
  flex: 0 0 auto;
  white-space: nowrap;
}

.nico-comment-time {
  font-size: 0.75rem;
  color: var(--ion-color-medium);
}

.nico-comment-body {
  font-size: 0.95rem;
}

.nico-note {
  margin: 1rem;
  color: var(--ion-color-medium);
}

.nico-error {
  margin: 1rem;
  padding: 0.75rem;
  color: var(--ion-color-danger);
  border: 1px solid var(--ion-color-danger);
  border-radius: 4px;
}
</style>
