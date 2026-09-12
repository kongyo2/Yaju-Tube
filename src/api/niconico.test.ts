import {
  NiconicoApiError,
  NiconicoAuthError,
  NiconicoNetworkError,
  NiconicoTimeoutError,
  type EssentialVideo,
  type NiconicoClient,
  type WatchResult,
} from '@kongyo2/niconicojs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addToWatchLater,
  defaultSortOrder,
  embedPlayerUrl,
  fetchComments,
  fetchMylistItems,
  fetchRanking,
  fetchRelatedVideos,
  fetchWatchHistory,
  formatDuration,
  nicoErrorKey,
  nicoWatchUrl,
  removeWatchLater,
  searchVideos,
  setLiked,
  toVideoCard,
  toWatchDetail,
} from './niconico'

function essentialVideo(overrides: Partial<EssentialVideo> = {}): EssentialVideo {
  return {
    id: 'sm9',
    title: 'レッツゴー！陰陽師',
    registeredAt: '2007-03-06T00:33:00+09:00',
    count: { view: 23_070_228, comment: 5_691_606, mylist: 183_198, like: 45_398 },
    thumbnail: {
      url: 'https://example.test/9',
      middleUrl: 'https://example.test/9.M',
      largeUrl: null,
    },
    duration: 320,
    owner: { type: 'user', id: '4', name: '中の', iconUrl: 'https://example.test/icon' },
    ...overrides,
  } as EssentialVideo
}

interface ClientStub {
  search: { searchVideos: ReturnType<typeof vi.fn> }
  ranking: { getRanking: ReturnType<typeof vi.fn> }
  videos: { getRecommendations: ReturnType<typeof vi.fn> }
  comments: { fetchCommentsWithKey: ReturnType<typeof vi.fn> }
  likes: { like: ReturnType<typeof vi.fn>; unlike: ReturnType<typeof vi.fn> }
  mylists: {
    getMylist: ReturnType<typeof vi.fn>
    addWatchLater: ReturnType<typeof vi.fn>
  }
  history: { getMyWatchHistory: ReturnType<typeof vi.fn> }
  http: { getJson: ReturnType<typeof vi.fn>; sendJson: ReturnType<typeof vi.fn> }
  isLoggedIn: ReturnType<typeof vi.fn>
}

let stub: ClientStub

function client(): NiconicoClient {
  return stub as unknown as NiconicoClient
}

beforeEach(() => {
  stub = {
    search: { searchVideos: vi.fn() },
    ranking: { getRanking: vi.fn() },
    videos: { getRecommendations: vi.fn() },
    comments: { fetchCommentsWithKey: vi.fn() },
    likes: { like: vi.fn(), unlike: vi.fn() },
    mylists: { getMylist: vi.fn(), addWatchLater: vi.fn() },
    history: { getMyWatchHistory: vi.fn() },
    http: { getJson: vi.fn(), sendJson: vi.fn() },
    isLoggedIn: vi.fn(() => true),
  }
})

describe('toVideoCard', () => {
  it('flattens the nested payload the views bind to', () => {
    expect(toVideoCard(essentialVideo())).toEqual({
      videoId: 'sm9',
      title: 'レッツゴー！陰陽師',
      thumbnailUrl: 'https://example.test/9.M',
      ownerName: '中の',
      ownerId: '4',
      viewCount: 23_070_228,
      commentCount: 5_691_606,
      mylistCount: 183_198,
      likeCount: 45_398,
      durationSeconds: 320,
      registeredAt: '2007-03-06T00:33:00+09:00',
      isChannelVideo: false,
    })
  })

  it('falls back through the thumbnail sizes the API actually filled in', () => {
    const card = toVideoCard(
      essentialVideo({
        thumbnail: { url: 'https://example.test/9', middleUrl: null, largeUrl: null, listingUrl: 'https://example.test/9.L' },
      }),
    )

    expect(card.thumbnailUrl).toBe('https://example.test/9.L')
  })

  it('survives a payload without a thumbnail, owner or counts', () => {
    const card = toVideoCard({ id: 'sm1', title: 'x' } as unknown as EssentialVideo)

    expect(card).toMatchObject({
      videoId: 'sm1',
      thumbnailUrl: '',
      ownerName: '',
      ownerId: null,
      viewCount: 0,
      durationSeconds: 0,
      registeredAt: null,
    })
  })
})

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(9)).toBe('0:09')
    expect(formatDuration(320)).toBe('5:20')
    expect(formatDuration(3723)).toBe('1:02:03')
    expect(formatDuration(Number.NaN)).toBe('0:00')
  })
})

describe('searchVideos', () => {
  beforeEach(() => {
    stub.search.searchVideos.mockResolvedValue({ items: [essentialVideo()], totalCount: 1, hasNext: false })
  })

  it('omits the sort direction for the relevance sort keys', async () => {
    expect(defaultSortOrder('hot')).toBe('none')
    expect(defaultSortOrder('personalized')).toBe('none')
    expect(defaultSortOrder('viewCount')).toBe('desc')

    await searchVideos(client(), { keyword: '野獣' })

    expect(stub.search.searchVideos).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: '野獣', sortKey: 'hot', sortOrder: 'none' }),
    )
  })

  it('searches by tag with a direction when one applies', async () => {
    const page = await searchVideos(client(), { tag: '野獣先輩', sortKey: 'registeredAt', page: 3, pageSize: 10 })

    expect(stub.search.searchVideos).toHaveBeenCalledWith(
      expect.objectContaining({ tag: '野獣先輩', sortKey: 'registeredAt', sortOrder: 'desc', page: 3, pageSize: 10 }),
    )
    expect(stub.search.searchVideos.mock.calls[0]?.[0]).not.toHaveProperty('keyword')
    expect(page.items[0]?.videoId).toBe('sm9')
  })

  it('passes an abort signal through only when given one', async () => {
    const controller = new AbortController()

    await searchVideos(client(), { keyword: 'a', signal: controller.signal })
    expect(stub.search.searchVideos.mock.calls[0]?.[0]).toMatchObject({ signal: controller.signal })

    await searchVideos(client(), { keyword: 'a' })
    expect(stub.search.searchVideos.mock.calls[1]?.[0]).not.toHaveProperty('signal')
  })
})

describe('fetchRanking', () => {
  it('defaults to the all-genre 24h ranking and drops an empty tag', async () => {
    stub.ranking.getRanking.mockResolvedValue({
      items: [essentialVideo()],
      hasNext: true,
      featuredKey: 'e9uj2uks',
      label: '総合',
      trendTags: ['tag'],
      pagination: { page: 1, pageSize: 100, totalCount: 300, maxPage: 3 },
    })

    const result = await fetchRanking(client(), { tag: '' })

    expect(stub.ranking.getRanking).toHaveBeenCalledWith(
      expect.objectContaining({ featuredKey: 'e9uj2uks', term: '24h', page: 1 }),
    )
    expect(stub.ranking.getRanking.mock.calls[0]?.[0]).not.toHaveProperty('tag')
    expect(result).toMatchObject({ label: '総合', totalCount: 300, hasNext: true, trendTags: ['tag'] })
  })
})

function watchResult(overrides: Record<string, unknown> = {}): WatchResult {
  return {
    actionTrackId: 'abc',
    data: {
      video: {
        id: 'sm9',
        title: 'レッツゴー！陰陽師',
        description: '本文',
        count: { view: 1, comment: 2, mylist: 3, like: 4 },
        duration: 320,
        thumbnail: { url: 'https://example.test/9', middleUrl: null, largeUrl: 'https://example.test/9.L' },
        registeredAt: '2007-03-06T00:33:00+09:00',
        viewer: { like: { isLiked: true } },
      },
      owner: { id: 4, nickname: '中の', iconUrl: 'https://example.test/icon' },
      genre: { key: 'music_sound', label: '音楽・サウンド' },
      tag: { items: [{ name: '陰陽師' }, { name: '公式' }] },
      media: {
        domand: {
          videos: [
            { id: 'video-720p', label: '720p', isAvailable: true },
            { id: 'video-1080p', label: '1080p', isAvailable: false },
          ],
          audios: [],
        },
      },
      comment: {
        threads: [
          { id: 1, forkLabel: 'owner', isDefaultPostTarget: false },
          { id: 1_173_108_780, forkLabel: 'main', isDefaultPostTarget: true },
        ],
        nvComment: { threadKey: 'key', server: 's', params: { targets: [], language: 'ja-jp' } },
      },
      series: { id: 42, title: 'シリーズ' },
      ...overrides,
    },
  } as unknown as WatchResult
}

describe('toWatchDetail', () => {
  it('maps the watch payload, including the viewer like state', () => {
    const detail = toWatchDetail(watchResult())

    expect(detail).toMatchObject({
      videoId: 'sm9',
      title: 'レッツゴー！陰陽師',
      description: '本文',
      thumbnailUrl: 'https://example.test/9.L',
      durationSeconds: 320,
      viewCount: 1,
      likeCount: 4,
      tags: ['陰陽師', '公式'],
      genreLabel: '音楽・サウンド',
      ownerId: 4,
      ownerName: '中の',
      seriesId: 42,
      seriesTitle: 'シリーズ',
      isLiked: true,
      qualityLabels: ['720p'],
      defaultThreadId: 1_173_108_780,
    })
  })

  it('reports no like for a guest watch payload', () => {
    expect(toWatchDetail(watchResult({ video: { ...watchResult().data.video, viewer: null } })).isLiked).toBe(false)
  })
})

describe('fetchComments', () => {
  const nvComment = {
    threadKey: 'key',
    server: 'https://public.nvcomment.nicovideo.jp',
    params: {
      language: 'ja-jp',
      targets: [
        { id: '1', fork: 'main' as const },
        { id: '1', fork: 'owner' as const },
        { id: '1', fork: 'easy' as const },
      ],
    },
  }

  it('skips the easy-comment fork by default and sorts by playback position', async () => {
    stub.comments.fetchCommentsWithKey.mockResolvedValue([
      { id: '1', fork: 'main', comments: [{ id: 'b', no: 2, vposMs: 5000, body: 'b', commands: [] }] },
      { id: '1', fork: 'owner', comments: [{ id: 'a', no: 1, vposMs: 1000, body: 'a', commands: [] }] },
    ])

    const comments = await fetchComments(client(), nvComment)

    expect(stub.comments.fetchCommentsWithKey).toHaveBeenCalledWith(
      'key',
      [
        { id: '1', fork: 'main' },
        { id: '1', fork: 'owner' },
      ],
      expect.objectContaining({ language: 'ja-jp' }),
    )
    expect(comments.map((comment) => comment.id)).toEqual(['a', 'b'])
  })

  it('includes the easy fork when asked', async () => {
    stub.comments.fetchCommentsWithKey.mockResolvedValue([])

    await fetchComments(client(), nvComment, { includeEasy: true })

    expect(stub.comments.fetchCommentsWithKey.mock.calls[0]?.[1]).toHaveLength(3)
  })

  it('does not call the API when there is nothing to read', async () => {
    await expect(
      fetchComments(client(), { ...nvComment, params: { ...nvComment.params, targets: [] } }),
    ).resolves.toEqual([])
    expect(stub.comments.fetchCommentsWithKey).not.toHaveBeenCalled()
  })
})

describe('setLiked', () => {
  it('likes and unlikes through the API', async () => {
    await setLiked(client(), 'sm9', true)
    expect(stub.likes.like).toHaveBeenCalledWith('sm9')

    await setLiked(client(), 'sm9', false)
    expect(stub.likes.unlike).toHaveBeenCalledWith('sm9')
  })

  it('treats a 404 on unlike as success', async () => {
    stub.likes.unlike.mockRejectedValue(new NiconicoApiError('https://example.test', { status: 404 }))

    await expect(setLiked(client(), 'sm9', false)).resolves.toBeUndefined()
  })

  it('still reports other failures', async () => {
    stub.likes.unlike.mockRejectedValue(new NiconicoApiError('https://example.test', { status: 500 }))
    await expect(setLiked(client(), 'sm9', false)).rejects.toBeInstanceOf(NiconicoApiError)

    stub.likes.like.mockRejectedValue(new NiconicoApiError('https://example.test', { status: 404 }))
    await expect(setLiked(client(), 'sm9', true)).rejects.toBeInstanceOf(NiconicoApiError)
  })
})

describe('watch later', () => {
  it('treats a duplicate queue entry as success', async () => {
    stub.mylists.addWatchLater.mockRejectedValue(new NiconicoApiError('https://example.test', { status: 409 }))

    await expect(addToWatchLater(client(), 'sm9')).resolves.toBeUndefined()
  })

  it('reports a real failure to queue', async () => {
    stub.mylists.addWatchLater.mockRejectedValue(new NiconicoApiError('https://example.test', { status: 500 }))

    await expect(addToWatchLater(client(), 'sm9')).rejects.toBeInstanceOf(NiconicoApiError)
  })

  it('removes queue entries by item id', async () => {
    await removeWatchLater(client(), [1, 2])

    expect(stub.http.sendJson).toHaveBeenCalledWith(
      'https://nvapi.nicovideo.jp/v1/users/me/watch-later?itemIds=1&itemIds=2',
      'DELETE',
      undefined,
      expect.objectContaining({ headers: { 'X-Request-With': 'https://www.nicovideo.jp' } }),
    )
  })

  it('sends nothing when there is nothing to remove', async () => {
    await removeWatchLater(client(), [])

    expect(stub.http.sendJson).not.toHaveBeenCalled()
  })
})

describe('fetchMylistItems', () => {
  const mylistItem = { itemId: 7, watchId: 'sm9', addedAt: '2026-01-01T00:00:00+09:00', video: essentialVideo() }

  it('reads a mylist through the library', async () => {
    stub.mylists.getMylist.mockResolvedValue({ items: [mylistItem], totalItemCount: 1, hasNext: false })

    const page = await fetchMylistItems(client(), 99, { page: 2, pageSize: 10 })

    expect(stub.mylists.getMylist).toHaveBeenCalledWith(99, expect.objectContaining({ page: 2, pageSize: 10 }))
    expect(page.items[0]).toMatchObject({ itemId: 7, addedAt: '2026-01-01T00:00:00+09:00' })
    expect(page.items[0]?.video.videoId).toBe('sm9')
  })

  it('falls back to the account namespace when the mylist is not public', async () => {
    stub.mylists.getMylist.mockRejectedValue(new NiconicoApiError('https://example.test', { status: 403 }))
    stub.http.getJson.mockResolvedValue({ data: { mylist: { items: [mylistItem], totalItemCount: 1, hasNext: false } } })

    const page = await fetchMylistItems(client(), 99, { page: 1, pageSize: 25 })

    expect(stub.http.getJson).toHaveBeenCalledWith(
      'https://nvapi.nicovideo.jp/v1/users/me/mylists/99?pageSize=25&page=1',
      expect.anything(),
    )
    expect(page.totalCount).toBe(1)
  })

  it('does not try the account namespace for a signed-out reader', async () => {
    stub.isLoggedIn.mockReturnValue(false)
    stub.mylists.getMylist.mockRejectedValue(new NiconicoApiError('https://example.test', { status: 403 }))

    await expect(fetchMylistItems(client(), 99)).rejects.toBeInstanceOf(NiconicoApiError)
    expect(stub.http.getJson).not.toHaveBeenCalled()
  })
})

describe('fetchRelatedVideos', () => {
  it('keeps only the video entries of the recommendation feed', async () => {
    stub.videos.getRecommendations.mockResolvedValue({
      items: [
        { id: 'sm1', contentType: 'video', content: essentialVideo({ id: 'sm1' }) },
        { id: '30686080', contentType: 'mylist', content: { id: 30_686_080, name: '思い出動画集' } },
        { id: 'sm2', contentType: 'video' },
      ],
    })

    const related = await fetchRelatedVideos(client(), 'sm9')

    expect(related.map((video) => video.videoId)).toEqual(['sm1'])
  })
})

describe('fetchWatchHistory', () => {
  it('pages with the cursor the API returns', async () => {
    stub.history.getMyWatchHistory.mockResolvedValue({ items: [{ video: essentialVideo() }], nextCursor: 'next' })

    const first = await fetchWatchHistory(client(), { limit: 5 })

    expect(stub.history.getMyWatchHistory.mock.calls[0]?.[0]).not.toHaveProperty('cursor')
    expect(first.nextCursor).toBe('next')

    stub.history.getMyWatchHistory.mockResolvedValue({ items: [], nextCursor: undefined })

    const second = await fetchWatchHistory(client(), { limit: 5, cursor: 'next' })

    expect(stub.history.getMyWatchHistory.mock.calls[1]?.[0]).toMatchObject({ cursor: 'next' })
    expect(second.nextCursor).toBeNull()
  })
})

describe('player URLs', () => {
  it('enables the embed postMessage API', () => {
    expect(embedPlayerUrl('sm9')).toBe('https://embed.nicovideo.jp/watch/sm9?jsapi=1&playerId=1')
    expect(nicoWatchUrl('sm9')).toBe('https://www.nicovideo.jp/watch/sm9')
  })

  it('escapes the video id', () => {
    expect(embedPlayerUrl('sm9?evil=1')).toBe('https://embed.nicovideo.jp/watch/sm9%3Fevil%3D1?jsapi=1&playerId=1')
  })
})

describe('nicoErrorKey', () => {
  it('maps every failure the library reports onto a message key', () => {
    expect(nicoErrorKey(new NiconicoAuthError('rejected'))).toBe('nico.errors.unauthorized')
    expect(nicoErrorKey(new NiconicoTimeoutError('https://example.test', 20_000))).toBe('nico.errors.timeout')
    expect(nicoErrorKey(new NiconicoNetworkError('https://example.test', 3, new Error('x')))).toBe('nico.errors.network')
    expect(nicoErrorKey(new NiconicoApiError('https://example.test', { status: 401 }))).toBe('nico.errors.unauthorized')
    expect(nicoErrorKey(new NiconicoApiError('https://example.test', { status: 403 }))).toBe('nico.errors.unauthorized')
    expect(nicoErrorKey(new NiconicoApiError('https://example.test', { status: 404 }))).toBe('nico.errors.notFound')
    expect(nicoErrorKey(new NiconicoApiError('https://example.test', { status: 429 }))).toBe('nico.errors.rateLimited')
    expect(nicoErrorKey(new NiconicoApiError('https://example.test', { status: 500 }))).toBe('nico.errors.api')
    expect(nicoErrorKey(new Error('boom'))).toBe('nico.errors.unexpected')
  })
})
