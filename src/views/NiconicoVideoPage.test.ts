import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NiconicoApiError } from '@kongyo2/niconicojs'
import i18n from '@/i18n'
import { NICO_INSTANCE_URL, type NicoWatchDetail } from '@/api/niconico'
import { useHistoryStore } from '@/stores/historyStore'
import { useNiconicoStore } from '@/stores/niconicoStore'
import { usePlaylistStore } from '@/stores/playlistStore'
import { NICO_EMBED_ORIGIN } from '@/utils/nicoEmbedPlayer'
import { createTestRouter, testGlobal } from '@/testUtils'
import NiconicoVideoPage from './NiconicoVideoPage.vue'

type SheetButton = { text: string; role?: string; handler?: () => void }

const overlayMocks = vi.hoisted(() => ({
  toastCreate: vi.fn(),
  sheetCreate: vi.fn(),
  latestSheetButtons: [] as SheetButton[],
  toastMessages: [] as string[],
}))

vi.mock('@ionic/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/vue')>()

  return {
    ...actual,
    toastController: { create: overlayMocks.toastCreate },
    actionSheetController: { create: overlayMocks.sheetCreate },
  }
})

const apiMocks = vi.hoisted(() => ({
  fetchWatchDetail: vi.fn(),
  fetchComments: vi.fn(),
  fetchRelatedVideos: vi.fn(),
  fetchMyMylists: vi.fn(),
  addToMylist: vi.fn(),
  addToWatchLater: vi.fn(),
  postComment: vi.fn(),
  setLiked: vi.fn(),
}))

vi.mock('@/api/niconico', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/niconico')>()

  return { ...actual, ...apiMocks }
})

vi.mock('@/api/niconicoClient', () => ({
  getNiconicoClient: vi.fn(() => ({ isLoggedIn: () => false })),
  resetNiconicoClient: vi.fn(),
}))

const ionicStubs = {
  IonPage: { template: '<main><slot /></main>' },
  IonHeader: { template: '<header><slot /></header>' },
  IonToolbar: { template: '<div><slot /></div>' },
  IonTitle: { template: '<h1><slot /></h1>' },
  IonContent: { template: '<section><slot /></section>' },
  IonButtons: { template: '<div><slot /></div>' },
  IonBackButton: { template: '<button />' },
  IonButton: {
    name: 'IonButton',
    emits: ['click'],
    props: ['disabled', 'ariaLabel'],
    template: '<button :disabled="disabled" :aria-label="ariaLabel" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  IonIcon: { template: '<span />' },
  IonChip: {
    name: 'IonChip',
    emits: ['click'],
    template: '<button class="chip" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  IonInput: {
    name: 'IonInput',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  IonList: { template: '<div><slot /></div>' },
  IonListHeader: { template: '<div><slot /></div>' },
  IonItem: {
    name: 'IonItem',
    emits: ['click'],
    template: '<div role="button" @click="$emit(\'click\', $event)"><slot /></div>',
  },
  IonItemOption: { template: '<button><slot /></button>' },
  IonItemOptions: { template: '<div><slot /></div>' },
  IonItemSliding: { template: '<div><slot /></div>' },
  IonLabel: { template: '<span><slot /></span>' },
  IonThumbnail: { template: '<div><slot /></div>' },
  IonCard: { template: '<div><slot /></div>' },
  IonCardHeader: { template: '<div><slot /></div>' },
  IonCardSubtitle: { template: '<p><slot /></p>' },
  IonCardTitle: { template: '<h2><slot /></h2>' },
}

function watchDetail(overrides: Partial<NicoWatchDetail> = {}): NicoWatchDetail {
  return {
    videoId: 'sm9',
    title: 'レッツゴー！陰陽師',
    description: '本文です',
    thumbnailUrl: 'https://example.test/9.L',
    durationSeconds: 320,
    registeredAt: '2007-03-06T00:33:00+09:00',
    viewCount: 23_070_228,
    commentCount: 5_691_606,
    mylistCount: 183_198,
    likeCount: 45_398,
    tags: ['陰陽師', '公式'],
    genreLabel: '音楽・サウンド',
    ownerId: 4,
    ownerName: '中の',
    ownerIconUrl: null,
    seriesId: null,
    seriesTitle: null,
    isLiked: false,
    qualityLabels: ['720p'],
    defaultThreadId: 1_173_108_780,
    nvComment: { threadKey: 'key', server: 'https://example.test', params: { targets: [], language: 'ja-jp' } },
    ...overrides,
  }
}

async function mountPage(options: { session?: string } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const niconicoStore = useNiconicoStore()
  const historyStore = useHistoryStore()
  const playlistStore = usePlaylistStore()

  if (options.session !== undefined) {
    niconicoStore.session = options.session
    niconicoStore.user = { userId: 1234, nickname: 'テストユーザー', isPremium: false, iconUrl: null }
  }

  const router = createTestRouter([
    { path: '/tabs/tab7', component: { template: '<div />' } },
    { path: '/tabs/nico/:videoId', component: { template: '<div />' } },
  ])
  await router.push('/tabs/nico/sm9')
  await router.isReady()

  const wrapper = mount(NiconicoVideoPage, { global: testGlobal(pinia, router, ionicStubs) })
  await flushPromises()

  return { historyStore, niconicoStore, playlistStore, router, wrapper }
}

function emitPlayerMetadata(data: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: NICO_EMBED_ORIGIN,
      data: { sourceConnectorType: 0, playerId: '1', eventName: 'playerMetadataChange', data },
    }),
  )
}

function buttonWithText(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(text))
}

beforeEach(() => {
  vi.clearAllMocks()
  overlayMocks.toastMessages = []
  overlayMocks.latestSheetButtons = []
  overlayMocks.toastCreate.mockImplementation(async (options: { message: string }) => {
    overlayMocks.toastMessages.push(options.message)

    return { present: vi.fn().mockResolvedValue(undefined) }
  })
  overlayMocks.sheetCreate.mockImplementation(async (options: { buttons: SheetButton[] }) => {
    overlayMocks.latestSheetButtons = options.buttons

    return { present: vi.fn().mockResolvedValue(undefined) }
  })
  apiMocks.fetchWatchDetail.mockResolvedValue(watchDetail())
  apiMocks.fetchComments.mockResolvedValue([
    { id: 'c1', no: 1, vposMs: 61_000, body: '最初のコメント', commands: [], userId: 'u', isPremium: false },
  ])
  apiMocks.fetchRelatedVideos.mockResolvedValue([
    {
      videoId: 'sm2',
      title: '関連動画',
      thumbnailUrl: 'https://example.test/2.M',
      ownerName: '投稿者',
      ownerId: '5',
      viewCount: 1,
      commentCount: 0,
      mylistCount: 0,
      likeCount: 0,
      durationSeconds: 60,
      registeredAt: null,
      isChannelVideo: false,
    },
  ])
  apiMocks.fetchMyMylists.mockResolvedValue([{ mylistId: 42, name: 'お気に入り', itemsCount: 0, isPublic: false }])
})

describe('loading a video', () => {
  it('renders the details, comments and related videos', async () => {
    const { wrapper } = await mountPage()

    expect(wrapper.text()).toContain('レッツゴー！陰陽師')
    expect(wrapper.text()).toContain('23,070,228')
    expect(wrapper.text()).toContain('陰陽師')
    expect(wrapper.text()).toContain('本文です')
    expect(wrapper.text()).toContain('最初のコメント')
    expect(wrapper.text()).toContain('1:01')
    expect(wrapper.text()).toContain('関連動画')
    expect(wrapper.get('iframe').attributes('src')).toBe('https://embed.nicovideo.jp/watch/sm9?jsapi=1&playerId=1')
  })

  it('records the video in the app history as a niconico entry', async () => {
    const { historyStore } = await mountPage()

    expect(historyStore.history[0]).toMatchObject({
      videoId: 'sm9',
      videoName: 'レッツゴー！陰陽師',
      thumbnailPath: 'https://example.test/9.L',
      channelName: '中の',
      instanceUrl: NICO_INSTANCE_URL,
      source: 'niconico',
    })
  })

  it('reports a video it cannot load', async () => {
    apiMocks.fetchWatchDetail.mockRejectedValue(new NiconicoApiError('https://example.test', { status: 404 }))

    const { wrapper } = await mountPage()

    expect(wrapper.text()).toContain(i18n.global.t('nico.errors.notFound'))
    expect(wrapper.find('iframe').exists()).toBe(false)
  })

  it('opens a related video', async () => {
    const { router, wrapper } = await mountPage()

    const relatedRow = wrapper.findAll('[role="button"]').at(-1)
    await relatedRow?.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/tabs/nico/sm2')
  })

  it('searches the tapped tag', async () => {
    const { router, wrapper } = await mountPage()

    await wrapper.findAll('.chip')[0]?.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/tabs/tab7?tag=%E9%99%B0%E9%99%BD%E5%B8%AB')
  })
})

describe('account actions', () => {
  it('keeps them disabled for a signed-out reader', async () => {
    const { wrapper } = await mountPage()

    expect(buttonWithText(wrapper, i18n.global.t('nico.actions.like'))?.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain(i18n.global.t('nico.comments.loginRequired'))
  })

  it('likes and un-likes, keeping the count in step', async () => {
    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    await buttonWithText(wrapper, i18n.global.t('nico.actions.like'))?.trigger('click')
    await flushPromises()

    expect(apiMocks.setLiked).toHaveBeenCalledWith(expect.anything(), 'sm9', true)
    expect(wrapper.text()).toContain('45,399')

    await buttonWithText(wrapper, i18n.global.t('nico.actions.liked'))?.trigger('click')
    await flushPromises()

    expect(apiMocks.setLiked).toHaveBeenLastCalledWith(expect.anything(), 'sm9', false)
    expect(wrapper.text()).toContain('45,398')
  })

  it('leaves the like state alone when the request fails', async () => {
    apiMocks.setLiked.mockRejectedValue(new NiconicoApiError('https://example.test', { status: 500 }))

    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    await buttonWithText(wrapper, i18n.global.t('nico.actions.like'))?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain(i18n.global.t('nico.errors.api'))
    expect(wrapper.text()).toContain('45,398')
  })

  it('queues the video for later', async () => {
    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    await buttonWithText(wrapper, i18n.global.t('nico.actions.addWatchLater'))?.trigger('click')
    await flushPromises()

    expect(apiMocks.addToWatchLater).toHaveBeenCalledWith(expect.anything(), 'sm9')
    expect(overlayMocks.toastMessages).toContain(i18n.global.t('nico.actions.addedWatchLater'))
  })

  it('adds the video to a mylist picked from the sheet', async () => {
    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    await buttonWithText(wrapper, i18n.global.t('nico.actions.addMylist'))?.trigger('click')
    await flushPromises()

    const pick = overlayMocks.latestSheetButtons.find((button) => button.text === 'お気に入り')
    pick?.handler?.()
    await flushPromises()

    expect(apiMocks.addToMylist).toHaveBeenCalledWith(expect.anything(), 42, 'sm9')
    expect(overlayMocks.toastMessages).toContain(i18n.global.t('nico.actions.addedMylist'))
  })

  it('says so when there is no mylist to add to', async () => {
    apiMocks.fetchMyMylists.mockResolvedValue([])

    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    await buttonWithText(wrapper, i18n.global.t('nico.actions.addMylist'))?.trigger('click')
    await flushPromises()

    expect(overlayMocks.sheetCreate).not.toHaveBeenCalled()
    expect(overlayMocks.toastMessages).toContain(i18n.global.t('nico.actions.noMylists'))
  })
})

describe('commenting', () => {
  it('posts at the position the embedded player reports', async () => {
    apiMocks.postComment.mockResolvedValue({ id: 'x', no: 2 })

    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    emitPlayerMetadata({ currentTime: 42_000, duration: 320_000 })
    await flushPromises()

    await wrapper.get('input').setValue('  テストコメント  ')
    await buttonWithText(wrapper, i18n.global.t('nico.comments.post'))?.trigger('click')
    await flushPromises()

    expect(apiMocks.postComment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ threadId: 1_173_108_780, videoId: 'sm9', body: 'テストコメント', vposMs: 42_000 }),
    )
    expect(overlayMocks.toastMessages).toContain(i18n.global.t('nico.comments.posted'))
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
  })

  it('does not post an empty comment', async () => {
    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    await wrapper.get('input').setValue('   ')
    await flushPromises()

    expect(buttonWithText(wrapper, i18n.global.t('nico.comments.post'))?.attributes('disabled')).toBeDefined()
    expect(apiMocks.postComment).not.toHaveBeenCalled()
  })
})

describe('app playlist and progress', () => {
  it('saves and removes the video in the app playlist', async () => {
    const { playlistStore, wrapper } = await mountPage()

    const bookmark = wrapper.get(`[aria-label="${i18n.global.t('aria.addToPlaylist')}"]`)
    await bookmark.trigger('click')
    await flushPromises()

    expect(playlistStore.playlist[0]).toMatchObject({
      videoId: 'sm9',
      instanceUrl: NICO_INSTANCE_URL,
      source: 'niconico',
    })

    await wrapper.get(`[aria-label="${i18n.global.t('aria.removeFromPlaylist')}"]`).trigger('click')
    await flushPromises()

    expect(playlistStore.playlist).toHaveLength(0)
  })

  it('stores how far the video was watched', async () => {
    const { historyStore, wrapper } = await mountPage()

    emitPlayerMetadata({ currentTime: 65_000, duration: 320_000 })
    await flushPromises()

    expect(historyStore.getHistoryItem('sm9')).toMatchObject({ progress: 65, duration: 320 })

    wrapper.unmount()
  })

  it('resumes from the stored position once the player can seek', async () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const historyStore = useHistoryStore()
    historyStore.addToHistory({
      videoId: 'sm9',
      videoName: 'レッツゴー！陰陽師',
      thumbnailPath: '',
      channelName: '中の',
      instanceUrl: NICO_INSTANCE_URL,
      source: 'niconico',
    })
    historyStore.updateProgress('sm9', 120, 320)

    const router = createTestRouter([
      { path: '/tabs/tab7', component: { template: '<div />' } },
      { path: '/tabs/nico/:videoId', component: { template: '<div />' } },
    ])
    await router.push('/tabs/nico/sm9')
    await router.isReady()

    const postMessage = vi.fn()
    const wrapper = mount(NiconicoVideoPage, {
      attachTo: document.body,
      global: testGlobal(pinia, router, ionicStubs),
    })
    await flushPromises()

    Object.defineProperty(wrapper.get('iframe').element, 'contentWindow', {
      configurable: true,
      value: { postMessage },
    })

    emitPlayerMetadata({ currentTime: 0, duration: 320_000, isVideoMetaDataLoaded: true })
    await flushPromises()

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'seek', data: { time: 120_000 } }),
      NICO_EMBED_ORIGIN,
    )

    wrapper.unmount()
  })
})
