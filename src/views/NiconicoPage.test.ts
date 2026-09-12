import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NiconicoApiError } from '@kongyo2/niconicojs'
import i18n from '@/i18n'
import { useNiconicoStore } from '@/stores/niconicoStore'
import { createTestRouter, testGlobal } from '@/testUtils'
import type { NicoVideoCard } from '@/api/niconico'
import NiconicoPage from './NiconicoPage.vue'

const apiMocks = vi.hoisted(() => ({
  fetchRanking: vi.fn(),
  fetchRankingGenres: vi.fn(),
  searchVideos: vi.fn(),
  fetchNewArrivals: vi.fn(),
  fetchSuggestions: vi.fn(),
  fetchMyMylists: vi.fn(),
  fetchMylistItems: vi.fn(),
  fetchWatchLater: vi.fn(),
  fetchMyLikes: vi.fn(),
  fetchWatchHistory: vi.fn(),
  removeMylistItems: vi.fn(),
  removeWatchLater: vi.fn(),
  setLiked: vi.fn(),
  createMylist: vi.fn(),
  deleteMylist: vi.fn(),
}))

vi.mock('@/api/niconico', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/niconico')>()

  return { ...actual, ...apiMocks }
})

vi.mock('@/api/niconicoClient', () => ({
  getNiconicoClient: vi.fn(() => ({ isLoggedIn: () => false })),
  resetNiconicoClient: vi.fn(),
}))

const modelStub = (tag: string) => ({
  props: ['modelValue'],
  emits: ['update:modelValue', 'ionChange', 'ionInput'],
  template: `<${tag}><slot /></${tag}>`,
})

const ionicStubs = {
  IonPage: { template: '<main><slot /></main>' },
  IonHeader: { template: '<header><slot /></header>' },
  IonFooter: { template: '<footer><slot /></footer>' },
  IonToolbar: { template: '<div><slot /></div>' },
  IonTitle: { template: '<h1><slot /></h1>' },
  IonContent: { template: '<section><slot /></section>' },
  IonButtons: { template: '<div><slot /></div>' },
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
  IonSearchbar: { ...modelStub('div'), name: 'IonSearchbar' },
  IonSegment: { ...modelStub('div'), name: 'IonSegment' },
  IonSegmentButton: { template: '<div><slot /></div>' },
  IonSelect: { ...modelStub('div'), name: 'IonSelect' },
  IonSelectOption: { template: '<div><slot /></div>' },
  IonList: { template: '<div><slot /></div>' },
  IonItem: {
    name: 'IonItem',
    emits: ['click'],
    template: '<div role="button" @click="$emit(\'click\', $event)"><slot /></div>',
  },
  IonItemOption: {
    name: 'IonItemOption',
    emits: ['click'],
    template: '<button class="remove" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  IonItemOptions: { template: '<div><slot /></div>' },
  IonItemSliding: { template: '<div><slot /></div>' },
  IonLabel: { template: '<span><slot /></span>' },
  IonThumbnail: { template: '<div><slot /></div>' },
  IonCard: { template: '<div><slot /></div>' },
  IonCardHeader: { template: '<div><slot /></div>' },
  IonCardSubtitle: { template: '<p><slot /></p>' },
  IonCardTitle: { template: '<h2><slot /></h2>' },
}

function card(overrides: Partial<NicoVideoCard> = {}): NicoVideoCard {
  return {
    videoId: 'sm9',
    title: 'レッツゴー！陰陽師',
    thumbnailUrl: 'https://example.test/9.M',
    ownerName: '中の',
    ownerId: '4',
    viewCount: 1,
    commentCount: 1,
    mylistCount: 1,
    likeCount: 1,
    durationSeconds: 320,
    registeredAt: null,
    isChannelVideo: false,
    ...overrides,
  }
}

async function mountPage(options: { path?: string; session?: string } = {}) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const niconicoStore = useNiconicoStore()

  if (options.session !== undefined) {
    niconicoStore.session = options.session
    niconicoStore.user = { userId: 1234, nickname: 'テストユーザー', isPremium: false, iconUrl: null }
  }

  const router = createTestRouter([
    { path: '/tabs/tab7', component: { template: '<div />' } },
    { path: '/tabs/nico/:videoId', component: { template: '<div />' } },
  ])
  await router.push(options.path ?? '/tabs/tab7')
  await router.isReady()

  const wrapper = mount(NiconicoPage, { global: testGlobal(pinia, router, ionicStubs) })
  await flushPromises()

  return { niconicoStore, router, wrapper }
}

function segment(wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'], index = 0) {
  const found = wrapper.findAllComponents({ name: 'IonSegment' })[index]

  if (!found) {
    throw new Error('segment not found')
  }

  return found
}

async function switchSegment(wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'], value: string) {
  const control = segment(wrapper)
  control.vm.$emit('update:modelValue', value)
  control.vm.$emit('ionChange')
  await flushPromises()
}

async function setSelect(
  wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'],
  index: number,
  value: unknown,
) {
  const control = wrapper.findAllComponents({ name: 'IonSelect' })[index]

  if (!control) {
    throw new Error('select not found')
  }

  control.vm.$emit('update:modelValue', value)
  control.vm.$emit('ionChange')
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  apiMocks.fetchRankingGenres.mockResolvedValue([
    { featuredKey: 'e9uj2uks', label: '総合', isEnabled: true },
    { featuredKey: '4eet3ca4', label: 'ゲーム', isEnabled: true },
  ])
  apiMocks.fetchRanking.mockResolvedValue({
    items: [card()],
    totalCount: 100,
    hasNext: true,
    featuredKey: 'e9uj2uks',
    label: '総合',
    trendTags: ['Nintendo_Switch2'],
  })
  apiMocks.searchVideos.mockResolvedValue({ items: [card({ videoId: 'sm2', title: '検索結果' })], totalCount: 1, hasNext: false })
  apiMocks.fetchNewArrivals.mockResolvedValue({ items: [card({ videoId: 'sm3', title: '新着動画' })], totalCount: 0, hasNext: true })
  apiMocks.fetchSuggestions.mockResolvedValue(['野獣先輩'])
  apiMocks.fetchMyMylists.mockResolvedValue([{ mylistId: 42, name: 'お気に入り', itemsCount: 1, isPublic: false }])
  apiMocks.fetchMylistItems.mockResolvedValue({
    items: [{ itemId: 7, addedAt: null, video: card({ videoId: 'sm4', title: 'マイリスト動画' }) }],
    totalCount: 1,
    hasNext: false,
  })
  apiMocks.fetchWatchLater.mockResolvedValue({
    items: [{ itemId: 8, addedAt: null, video: card({ videoId: 'sm5', title: 'あとで見る動画' }) }],
    totalCount: 1,
    hasNext: false,
  })
  apiMocks.fetchMyLikes.mockResolvedValue({ items: [card({ videoId: 'sm6', title: 'いいね動画' })], totalCount: 1, hasNext: false })
  apiMocks.fetchWatchHistory.mockResolvedValue({ items: [card({ videoId: 'sm7', title: '履歴動画' })], nextCursor: 'cursor-1' })
})

describe('browsing', () => {
  it('opens on the ranking and lists what it returns', async () => {
    const { wrapper } = await mountPage()

    expect(apiMocks.fetchRankingGenres).toHaveBeenCalled()
    expect(apiMocks.fetchRanking).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ featuredKey: 'e9uj2uks', term: '24h', page: 1 }),
    )
    expect(wrapper.text()).toContain('レッツゴー！陰陽師')
    expect(wrapper.text()).toContain('Nintendo_Switch2')
  })

  it('filters the ranking by a trend tag', async () => {
    const { wrapper } = await mountPage()

    const tagChip = wrapper.findAll('.chip').find((chip) => chip.text() === 'Nintendo_Switch2')
    await tagChip?.trigger('click')
    await flushPromises()

    expect(apiMocks.fetchRanking).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ tag: 'Nintendo_Switch2', page: 1 }),
    )
  })

  it('opens the tapped video', async () => {
    const { router, wrapper } = await mountPage()

    await wrapper.get('[role="button"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.fullPath).toBe('/tabs/nico/sm9')
  })

  it('waits for a keyword before searching', async () => {
    const { wrapper } = await mountPage()

    await switchSegment(wrapper, 'search')

    expect(apiMocks.searchVideos).not.toHaveBeenCalled()

    const searchbar = wrapper.getComponent({ name: 'IonSearchbar' })
    searchbar.vm.$emit('update:modelValue', '野獣先輩')
    searchbar.vm.$emit('ionChange')
    await flushPromises()

    expect(apiMocks.searchVideos).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ keyword: '野獣先輩', page: 1 }),
    )
    expect(wrapper.text()).toContain('検索結果')
  })

  it('searches by tag when the route asks for one', async () => {
    const { wrapper } = await mountPage({ path: '/tabs/tab7?tag=%E9%99%B0%E9%99%BD%E5%B8%AB' })

    expect(apiMocks.searchVideos).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tag: '陰陽師' }),
    )
    expect(apiMocks.fetchRanking).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('検索結果')
  })

  it('lists new arrivals', async () => {
    const { wrapper } = await mountPage()

    await switchSegment(wrapper, 'new')

    expect(apiMocks.fetchNewArrivals).toHaveBeenCalled()
    expect(wrapper.text()).toContain('新着動画')
  })

  it('reports what went wrong and clears the list', async () => {
    apiMocks.fetchRanking.mockRejectedValue(new NiconicoApiError('https://example.test', { status: 500 }))

    const { wrapper } = await mountPage()

    expect(wrapper.text()).toContain(i18n.global.t('nico.errors.api'))
    expect(wrapper.text()).not.toContain('レッツゴー！陰陽師')
  })
})

describe('paging', () => {
  it('walks forward and back, and stops at the ends', async () => {
    const { wrapper } = await mountPage()

    const [previous, next] = wrapper.findAll('footer button')

    expect(previous?.attributes('disabled')).toBeDefined()

    await next?.trigger('click')
    await flushPromises()

    expect(apiMocks.fetchRanking).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ page: 2 }))
    expect(wrapper.text()).toContain(i18n.global.t('nico.page', { n: 2 }))

    await wrapper.findAll('footer button')[0]?.trigger('click')
    await flushPromises()

    expect(apiMocks.fetchRanking).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ page: 1 }))
  })
})

describe('library', () => {
  it('asks the reader to sign in first', async () => {
    const { wrapper } = await mountPage()

    await switchSegment(wrapper, 'library')

    expect(wrapper.text()).toContain(i18n.global.t('nico.library.loginRequired'))
    expect(apiMocks.fetchMyMylists).not.toHaveBeenCalled()
  })

  it('lists the first mylist and removes an entry by its item id', async () => {
    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    await switchSegment(wrapper, 'library')

    expect(apiMocks.fetchMyMylists).toHaveBeenCalled()
    expect(apiMocks.fetchMylistItems).toHaveBeenCalledWith(expect.anything(), 42, expect.objectContaining({ page: 1 }))
    expect(wrapper.text()).toContain('マイリスト動画')

    await wrapper.get('button.remove').trigger('click')
    await flushPromises()

    expect(apiMocks.removeMylistItems).toHaveBeenCalledWith(expect.anything(), 42, [7])
    expect(wrapper.text()).not.toContain('マイリスト動画')
  })

  it('switches to the watch-later queue and removes by item id', async () => {
    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    await switchSegment(wrapper, 'library')
    await setSelect(wrapper, 0, 'watchLater')

    expect(apiMocks.fetchWatchLater).toHaveBeenCalled()
    expect(wrapper.text()).toContain('あとで見る動画')

    await wrapper.get('button.remove').trigger('click')
    await flushPromises()

    expect(apiMocks.removeWatchLater).toHaveBeenCalledWith(expect.anything(), [8])
  })

  it('un-likes from the likes list', async () => {
    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    await switchSegment(wrapper, 'library')
    await setSelect(wrapper, 0, 'likes')

    expect(wrapper.text()).toContain('いいね動画')

    await wrapper.get('button.remove').trigger('click')
    await flushPromises()

    expect(apiMocks.setLiked).toHaveBeenCalledWith(expect.anything(), 'sm6', false)
  })

  it('pages the watch history with the cursor it was handed', async () => {
    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    await switchSegment(wrapper, 'library')
    await setSelect(wrapper, 0, 'history')

    expect(wrapper.text()).toContain('履歴動画')
    expect(apiMocks.fetchWatchHistory.mock.calls[0]?.[1]).not.toHaveProperty('cursor')

    await wrapper.findAll('footer button')[1]?.trigger('click')
    await flushPromises()

    expect(apiMocks.fetchWatchHistory).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ cursor: 'cursor-1' }),
    )
  })

  it('shows nothing to remove in the history list', async () => {
    const { wrapper } = await mountPage({ session: 'user_session_1_abc' })

    await switchSegment(wrapper, 'library')
    await setSelect(wrapper, 0, 'history')

    expect(wrapper.find('button.remove').exists()).toBe(false)
  })
})
