<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ $t('nico.title') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button
            fill="clear"
            :color="settingsStore.displayMode === 'list' ? 'primary' : 'medium'"
            :aria-label="$t('aria.switchToList')"
            @click="settingsStore.setDisplayMode('list')"
          >
            <ion-icon
              slot="icon-only"
              :icon="list"
            ></ion-icon>
          </ion-button>
          <ion-button
            fill="clear"
            :color="settingsStore.displayMode === 'grid' ? 'primary' : 'medium'"
            :aria-label="$t('aria.switchToGrid')"
            @click="settingsStore.setDisplayMode('grid')"
          >
            <ion-icon
              slot="icon-only"
              :icon="grid"
            ></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <ion-toolbar>
        <ion-segment
          v-model="segment"
          @ionChange="onSegmentChange"
        >
          <ion-segment-button value="ranking">{{ $t('nico.segment.ranking') }}</ion-segment-button>
          <ion-segment-button value="search">{{ $t('nico.segment.search') }}</ion-segment-button>
          <ion-segment-button value="new">{{ $t('nico.segment.new') }}</ion-segment-button>
          <ion-segment-button value="library">{{ $t('nico.segment.library') }}</ion-segment-button>
        </ion-segment>
      </ion-toolbar>

      <ion-toolbar v-if="segment === 'ranking'">
        <div class="nico-controls">
          <ion-select
            v-model="genreKey"
            :label="$t('nico.ranking.genre')"
            interface="popover"
            @ionChange="onRankingGenreChange"
          >
            <ion-select-option
              v-for="genre in genres"
              :key="genre.featuredKey"
              :value="genre.featuredKey"
            >
              {{ genre.label }}
            </ion-select-option>
          </ion-select>
          <ion-select
            v-model="term"
            :label="$t('nico.ranking.term')"
            interface="popover"
            @ionChange="reload"
          >
            <ion-select-option
              v-for="option in NICO_RANKING_TERMS"
              :key="option"
              :value="option"
            >
              {{ $t(`nico.term.${option}`) }}
            </ion-select-option>
          </ion-select>
        </div>
        <div
          v-if="trendTags.length > 0"
          class="nico-chips"
        >
          <ion-chip
            :outline="rankingTag !== ''"
            @click="selectTrendTag('')"
          >
            {{ $t('nico.ranking.allTags') }}
          </ion-chip>
          <ion-chip
            v-for="tag in trendTags"
            :key="tag"
            :outline="rankingTag !== tag"
            @click="selectTrendTag(tag)"
          >
            {{ tag }}
          </ion-chip>
        </div>
      </ion-toolbar>

      <ion-toolbar v-else-if="segment === 'search'">
        <ion-searchbar
          v-model="keyword"
          :placeholder="$t('nico.search.placeholder')"
          show-cancel-button="focus"
          @ionInput="onKeywordInput"
          @ionChange="reload"
        ></ion-searchbar>
        <div class="nico-controls">
          <ion-segment
            v-model="searchMode"
            @ionChange="reload"
          >
            <ion-segment-button value="keyword">{{ $t('nico.search.keyword') }}</ion-segment-button>
            <ion-segment-button value="tag">{{ $t('nico.search.tag') }}</ion-segment-button>
          </ion-segment>
          <ion-select
            v-model="sortKey"
            :label="$t('nico.search.sort')"
            interface="popover"
            @ionChange="reload"
          >
            <ion-select-option
              v-for="option in NICO_SEARCH_SORT_KEYS"
              :key="option"
              :value="option"
            >
              {{ $t(`nico.sort.${option}`) }}
            </ion-select-option>
          </ion-select>
        </div>
        <div
          v-if="suggestions.length > 0"
          class="nico-chips"
        >
          <ion-chip
            v-for="suggestion in suggestions"
            :key="suggestion"
            outline
            @click="applySuggestion(suggestion)"
          >
            {{ suggestion }}
          </ion-chip>
        </div>
      </ion-toolbar>

      <ion-toolbar v-else-if="segment === 'library' && niconicoStore.isLoggedIn">
        <div class="nico-controls">
          <ion-select
            v-model="librarySection"
            :label="$t('nico.library.select')"
            interface="popover"
            @ionChange="reload"
          >
            <ion-select-option value="mylists">{{ $t('nico.library.mylists') }}</ion-select-option>
            <ion-select-option value="watchLater">{{ $t('nico.library.watchLater') }}</ion-select-option>
            <ion-select-option value="likes">{{ $t('nico.library.likes') }}</ion-select-option>
            <ion-select-option value="history">{{ $t('nico.library.history') }}</ion-select-option>
          </ion-select>
          <ion-select
            v-if="librarySection === 'mylists'"
            v-model="selectedMylistId"
            :label="$t('nico.library.selectMylist')"
            :placeholder="$t('nico.actions.noMylists')"
            interface="popover"
            @ionChange="reload"
          >
            <ion-select-option
              v-for="mylist in mylists"
              :key="mylist.mylistId"
              :value="mylist.mylistId"
            >
              {{ mylist.name }}
            </ion-select-option>
          </ion-select>
        </div>
        <ion-buttons v-if="librarySection === 'mylists'">
          <ion-button
            fill="clear"
            @click="promptCreateMylist"
          >
            <ion-icon
              slot="start"
              :icon="addCircleOutline"
            ></ion-icon>
            {{ $t('nico.library.createMylist') }}
          </ion-button>
          <ion-button
            v-if="selectedMylistId !== null"
            fill="clear"
            color="danger"
            @click="promptDeleteMylist"
          >
            <ion-icon
              slot="start"
              :icon="trashOutline"
            ></ion-icon>
            {{ $t('nico.library.deleteMylist') }}
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

      <div
        v-if="segment === 'library' && !niconicoStore.isLoggedIn"
        class="nico-empty"
      >
        {{ $t('nico.library.loginRequired') }}
      </div>

      <div
        v-else-if="isLoading && videos.length === 0"
        class="nico-empty"
      >
        {{ $t('menu.getLoading') }}
      </div>

      <nico-video-list
        v-else
        :items="videos"
        :mode="settingsStore.displayMode"
        :empty-text="emptyText"
        :remove-label="removeLabel"
        @select="goToVideo"
        @remove="removeEntry"
      />
    </ion-content>

    <ion-footer>
      <ion-toolbar>
        <div class="nico-pagination">
          <ion-button
            :disabled="!canGoBack || isLoading"
            :aria-label="$t('aria.prevPage')"
            @click="prevPage"
          >
            ＜
          </ion-button>
          <span class="nico-page-label">{{ $t('nico.page', { n: page }) }}</span>
          <ion-button
            :disabled="!hasNext || isLoading"
            :aria-label="$t('aria.nextPage')"
            @click="nextPage"
          >
            ＞
          </ion-button>
        </div>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import {
  alertController,
  IonButton,
  IonButtons,
  IonChip,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/vue'
import { addCircleOutline, grid, list, trashOutline } from 'ionicons/icons'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import NicoVideoList from '@/components/NicoVideoList.vue'
import {
  createMylist,
  deleteMylist,
  fetchMyLikes,
  fetchMyMylists,
  fetchMylistItems,
  fetchNewArrivals,
  fetchRanking,
  fetchRankingGenres,
  fetchSuggestions,
  fetchWatchHistory,
  fetchWatchLater,
  NICO_RANKING_ALL_KEY,
  NICO_RANKING_TERMS,
  NICO_SEARCH_SORT_KEYS,
  nicoErrorKey,
  removeMylistItems,
  removeWatchLater,
  searchVideos,
  setLiked,
  type NicoMylistSummary,
  type NicoVideoCard,
  type RankingGenre,
  type RankingTerm,
  type VideoSearchSortKey,
} from '@/api/niconico'
import { useNiconicoStore } from '@/stores/niconicoStore'
import { useSettingsStore } from '@/stores/settingsStore'
import '../theme/variables.css'

type Segment = 'ranking' | 'search' | 'new' | 'library'
type LibrarySection = 'mylists' | 'watchLater' | 'likes' | 'history'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const settingsStore = useSettingsStore()
const niconicoStore = useNiconicoStore()

const segment = ref<Segment>('ranking')
const genres = ref<RankingGenre[]>([])
const genreKey = ref<string>(NICO_RANKING_ALL_KEY)
const term = ref<RankingTerm>('24h')
const rankingTag = ref('')
const trendTags = ref<string[]>([])

const keyword = ref('')
const searchMode = ref<'keyword' | 'tag'>('keyword')
const sortKey = ref<VideoSearchSortKey>('hot')
const suggestions = ref<string[]>([])

const librarySection = ref<LibrarySection>('mylists')
const mylists = ref<NicoMylistSummary[]>([])
const selectedMylistId = ref<number | null>(null)

const videos = ref<NicoVideoCard[]>([])
const itemIdByVideoId = ref(new Map<string, number>())
const page = ref(1)
const hasNext = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const historyCursors = ref<string[]>([])
const nextHistoryCursor = ref<string | null>(null)

let latestRequestId = 0
let inFlight: AbortController | null = null
let suggestionTimer: ReturnType<typeof setTimeout> | null = null

const pageSize = computed(() => settingsStore.itemsPerPage)
const canGoBack = computed(() => page.value > 1)

const emptyText = computed(() => {
  if (segment.value === 'library') {
    return t('nico.library.empty')
  }

  return t('nico.empty')
})

const removeLabel = computed(() => {
  if (segment.value !== 'library' || !niconicoStore.isLoggedIn) {
    return undefined
  }

  if (librarySection.value === 'history') {
    return undefined
  }

  if (librarySection.value === 'likes') {
    return t('nico.actions.liked')
  }

  return t('nico.library.removeItem')
})

function goToVideo(videoId: string) {
  void router.push(`/tabs/nico/${videoId}`)
}

function beginRequest(): { requestId: number; signal: AbortSignal } {
  latestRequestId += 1
  inFlight?.abort()
  inFlight = new AbortController()

  return { requestId: latestRequestId, signal: inFlight.signal }
}

async function loadRanking(signal: AbortSignal) {
  const result = await fetchRanking(niconicoStore.client, {
    featuredKey: genreKey.value,
    term: term.value,
    tag: rankingTag.value,
    page: page.value,
    signal,
  })

  trendTags.value = result.trendTags
  hasNext.value = result.hasNext

  return result.items
}

async function loadSearch(signal: AbortSignal) {
  const query = keyword.value.trim()

  if (query.length === 0) {
    hasNext.value = false
    return []
  }

  const result = await searchVideos(niconicoStore.client, {
    ...(searchMode.value === 'tag' ? { tag: query } : { keyword: query }),
    page: page.value,
    pageSize: pageSize.value,
    sortKey: sortKey.value,
    signal,
  })

  hasNext.value = result.hasNext

  return result.items
}

async function loadNewArrivals(signal: AbortSignal) {
  const result = await fetchNewArrivals(niconicoStore.client, {
    page: page.value,
    pageSize: pageSize.value,
    signal,
  })

  hasNext.value = result.hasNext

  return result.items
}

async function loadMylistItems(signal: AbortSignal) {
  if (mylists.value.length === 0) {
    mylists.value = await fetchMyMylists(niconicoStore.client, signal)
  }

  const fallbackId = mylists.value[0]?.mylistId ?? null
  const mylistId = selectedMylistId.value ?? fallbackId

  selectedMylistId.value = mylistId

  if (mylistId === null) {
    hasNext.value = false
    return []
  }

  const result = await fetchMylistItems(niconicoStore.client, mylistId, {
    page: page.value,
    pageSize: pageSize.value,
    signal,
  })

  hasNext.value = result.hasNext
  rememberItemIds(result.items)

  return result.items.map((entry) => entry.video)
}

async function loadWatchLater(signal: AbortSignal) {
  const result = await fetchWatchLater(niconicoStore.client, {
    page: page.value,
    pageSize: pageSize.value,
    signal,
  })

  hasNext.value = result.hasNext
  rememberItemIds(result.items)

  return result.items.map((entry) => entry.video)
}

async function loadLikes(signal: AbortSignal) {
  const result = await fetchMyLikes(niconicoStore.client, {
    page: page.value,
    pageSize: pageSize.value,
    signal,
  })

  hasNext.value = result.hasNext

  return result.items
}

async function loadHistory(signal: AbortSignal) {
  const cursor = historyCursors.value[page.value - 2]
  const result = await fetchWatchHistory(niconicoStore.client, {
    limit: pageSize.value,
    ...(page.value > 1 && cursor !== undefined ? { cursor } : {}),
    signal,
  })

  nextHistoryCursor.value = result.nextCursor
  hasNext.value = result.nextCursor !== null

  return result.items
}

function rememberItemIds(entries: { itemId: number | null; video: NicoVideoCard }[]) {
  const map = new Map<string, number>()

  for (const entry of entries) {
    if (entry.itemId !== null) {
      map.set(entry.video.videoId, entry.itemId)
    }
  }

  itemIdByVideoId.value = map
}

async function loadLibrary(signal: AbortSignal) {
  if (librarySection.value === 'mylists') {
    return loadMylistItems(signal)
  }

  if (librarySection.value === 'watchLater') {
    return loadWatchLater(signal)
  }

  if (librarySection.value === 'likes') {
    return loadLikes(signal)
  }

  return loadHistory(signal)
}

async function load() {
  if (segment.value === 'library' && !niconicoStore.isLoggedIn) {
    videos.value = []
    hasNext.value = false
    return
  }

  const { requestId, signal } = beginRequest()
  const isStale = () => requestId !== latestRequestId

  isLoading.value = true

  try {
    let items: NicoVideoCard[]

    if (segment.value === 'ranking') {
      items = await loadRanking(signal)
    } else if (segment.value === 'search') {
      items = await loadSearch(signal)
    } else if (segment.value === 'new') {
      items = await loadNewArrivals(signal)
    } else {
      items = await loadLibrary(signal)
    }

    if (isStale()) {
      return
    }

    videos.value = items
    errorMessage.value = ''
  } catch (error) {
    if (isStale() || signal.aborted) {
      return
    }

    videos.value = []
    hasNext.value = false
    errorMessage.value = t(nicoErrorKey(error))
  } finally {
    if (!isStale()) {
      isLoading.value = false
    }
  }
}

function reload() {
  page.value = 1
  historyCursors.value = []
  void load()
}

function onSegmentChange() {
  errorMessage.value = ''
  reload()
}

function onRankingGenreChange() {
  rankingTag.value = ''
  trendTags.value = []
  reload()
}

function selectTrendTag(tag: string) {
  rankingTag.value = tag
  reload()
}

function applySuggestion(suggestion: string) {
  keyword.value = suggestion
  suggestions.value = []
  reload()
}

function onKeywordInput() {
  if (suggestionTimer !== null) {
    clearTimeout(suggestionTimer)
  }

  suggestionTimer = setTimeout(() => {
    void updateSuggestions()
  }, 300)
}

async function updateSuggestions() {
  const query = keyword.value.trim()

  if (query.length === 0) {
    suggestions.value = []
    return
  }

  try {
    suggestions.value = (await fetchSuggestions(niconicoStore.client, query)).slice(0, 8)
  } catch {
    suggestions.value = []
  }
}

function nextPage() {
  if (!hasNext.value) {
    return
  }

  if (segment.value === 'library' && librarySection.value === 'history') {
    const cursor = nextHistoryCursor.value

    if (cursor === null) {
      return
    }

    historyCursors.value = [...historyCursors.value.slice(0, page.value - 1), cursor]
  }

  page.value += 1
  void load()
}

function prevPage() {
  if (page.value <= 1) {
    return
  }

  page.value -= 1
  void load()
}

async function removeEntry(item: NicoVideoCard) {
  try {
    if (librarySection.value === 'likes') {
      await setLiked(niconicoStore.client, item.videoId, false)
    } else if (librarySection.value === 'watchLater') {
      const itemId = itemIdByVideoId.value.get(item.videoId)

      if (itemId === undefined) {
        return
      }

      await removeWatchLater(niconicoStore.client, [itemId])
    } else if (librarySection.value === 'mylists' && selectedMylistId.value !== null) {
      const itemId = itemIdByVideoId.value.get(item.videoId)

      if (itemId === undefined) {
        return
      }

      await removeMylistItems(niconicoStore.client, selectedMylistId.value, [itemId])
    } else {
      return
    }

    videos.value = videos.value.filter((candidate) => candidate.videoId !== item.videoId)
  } catch (error) {
    errorMessage.value = t(nicoErrorKey(error))
  }
}

async function promptCreateMylist() {
  const alert = await alertController.create({
    header: t('nico.library.createMylist'),
    inputs: [{ name: 'name', type: 'text', placeholder: t('nico.library.mylistName') }],
    buttons: [
      { text: t('menu.cancel'), role: 'cancel' },
      {
        text: t('nico.library.createMylist'),
        role: 'confirm',
        handler: (data: unknown) => {
          const name = readAlertText(data, 'name')

          if (name.length > 0) {
            void submitCreateMylist(name)
          }
        },
      },
    ],
  })

  await alert.present()
}

async function submitCreateMylist(name: string) {
  try {
    const mylistId = await createMylist(niconicoStore.client, name)

    mylists.value = await fetchMyMylists(niconicoStore.client)
    selectedMylistId.value = mylistId
    reload()
  } catch (error) {
    errorMessage.value = t(nicoErrorKey(error))
  }
}

async function promptDeleteMylist() {
  const mylistId = selectedMylistId.value

  if (mylistId === null) {
    return
  }

  const name = mylists.value.find((mylist) => mylist.mylistId === mylistId)?.name ?? ''
  const alert = await alertController.create({
    header: t('nico.library.deleteMylist'),
    message: t('nico.library.deleteMylistConfirm', { name }),
    buttons: [
      { text: t('menu.cancel'), role: 'cancel' },
      {
        text: t('menu.delete'),
        role: 'destructive',
        handler: () => {
          void submitDeleteMylist(mylistId)
        },
      },
    ],
  })

  await alert.present()
}

async function submitDeleteMylist(mylistId: number) {
  try {
    await deleteMylist(niconicoStore.client, mylistId)

    mylists.value = await fetchMyMylists(niconicoStore.client)
    selectedMylistId.value = mylists.value[0]?.mylistId ?? null
    reload()
  } catch (error) {
    errorMessage.value = t(nicoErrorKey(error))
  }
}

function readAlertText(data: unknown, field: string): string {
  if (typeof data !== 'object' || data === null) {
    return ''
  }

  const value = (data as Record<string, unknown>)[field]

  return typeof value === 'string' ? value.trim() : ''
}

async function loadGenres() {
  try {
    genres.value = await fetchRankingGenres(niconicoStore.client)
  } catch {
    genres.value = []
  }
}

function applyRouteQuery() {
  const tag = route.query['tag']

  if (typeof tag === 'string' && tag.length > 0) {
    segment.value = 'search'
    searchMode.value = 'tag'
    keyword.value = tag
    suggestions.value = []
    reload()
  }
}

watch(() => route.query['tag'], applyRouteQuery)

watch(
  () => niconicoStore.isLoggedIn,
  () => {
    mylists.value = []
    selectedMylistId.value = null
    reload()
  },
)

onMounted(async () => {
  await loadGenres()

  if (typeof route.query['tag'] === 'string') {
    applyRouteQuery()
    return
  }

  void load()
})

onBeforeUnmount(() => {
  if (suggestionTimer !== null) {
    clearTimeout(suggestionTimer)
  }

  inFlight?.abort()
})
</script>

<style scoped>
.nico-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.75rem;
}

.nico-chips {
  display: flex;
  overflow-x: auto;
  padding: 0 0.5rem 0.25rem;
  white-space: nowrap;
}

.nico-chips ion-chip {
  flex: 0 0 auto;
}

.nico-error {
  margin: 1rem;
  padding: 0.75rem;
  color: var(--ion-color-danger);
  border: 1px solid var(--ion-color-danger);
  border-radius: 4px;
}

.nico-empty {
  margin: 1rem;
  font-size: 1.1rem;
  color: var(--ion-color-medium);
}

.nico-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 0.5rem;
}

.nico-page-label {
  font-size: 1rem;
}
</style>
