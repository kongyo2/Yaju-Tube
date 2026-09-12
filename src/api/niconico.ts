import {
  extractUserSession,
  extractVideoId,
  isNiconicoApiError,
  isVideoId,
  NiconicoApiError,
  NiconicoAuthError,
  NiconicoNetworkError,
  NiconicoTimeoutError,
  sortCommentsByVpos,
  type CommentItem,
  type EssentialVideo,
  type MylistItem,
  type MylistMeta,
  type NiconicoClient,
  type NvCommentParams,
  type NvCommentTarget,
  type PostCommentResult,
  type RankingGenre,
  type RankingTerm,
  type VideoSearchSortKey,
  type VideoSearchSortOrder,
  type WatchLaterItem,
  type WatchResult,
} from '@kongyo2/niconicojs'

export { extractUserSession, extractVideoId, isVideoId }
export type {
  CommentItem,
  NvCommentParams,
  RankingGenre,
  RankingTerm,
  VideoSearchSortKey,
  VideoSearchSortOrder,
}

const NVAPI_ORIGIN = 'https://nvapi.nicovideo.jp'

export const NICO_RANKING_ALL_KEY = 'e9uj2uks'

export const NICO_RANKING_TERMS: readonly RankingTerm[] = ['hour', '24h', 'week', 'month', 'total']

export const NICO_SEARCH_SORT_KEYS: readonly VideoSearchSortKey[] = [
  'hot',
  'registeredAt',
  'viewCount',
  'likeCount',
  'mylistCount',
  'commentCount',
  'duration',
]

export const NICO_INSTANCE_URL = 'www.nicovideo.jp'

export const NICO_EMBED_PLAYER_ID = '1'

export interface NicoVideoCard {
  videoId: string
  title: string
  thumbnailUrl: string
  ownerName: string
  ownerId: string | null
  viewCount: number
  commentCount: number
  mylistCount: number
  likeCount: number
  durationSeconds: number
  registeredAt: string | null
  isChannelVideo: boolean
}

export interface NicoVideoPage {
  items: NicoVideoCard[]
  totalCount: number
  hasNext: boolean
}

export interface NicoRankingResult extends NicoVideoPage {
  featuredKey: string
  label: string
  trendTags: string[]
}

export interface NicoMylistEntry {
  itemId: number | null
  addedAt: string | null
  video: NicoVideoCard
}

export interface NicoMylistPage {
  items: NicoMylistEntry[]
  totalCount: number
  hasNext: boolean
}

export interface NicoMylistSummary {
  mylistId: number
  name: string
  itemsCount: number
  isPublic: boolean
}

export interface NicoWatchDetail {
  videoId: string
  title: string
  description: string
  thumbnailUrl: string
  durationSeconds: number
  registeredAt: string | null
  viewCount: number
  commentCount: number
  mylistCount: number
  likeCount: number
  tags: string[]
  genreLabel: string | null
  ownerId: number | null
  ownerName: string | null
  ownerIconUrl: string | null
  seriesId: number | null
  seriesTitle: string | null
  isLiked: boolean
  qualityLabels: string[]
  defaultThreadId: number | null
  nvComment: NvCommentParams | null
}

export interface NicoWatchHistoryPage {
  items: NicoVideoCard[]
  nextCursor: string | null
}

export interface NicoPageParams {
  page?: number | undefined
  pageSize?: number | undefined
  signal?: AbortSignal | undefined
}

export interface NicoSearchParams extends NicoPageParams {
  keyword?: string | undefined
  tag?: string | undefined
  sortKey?: VideoSearchSortKey | undefined
  sortOrder?: VideoSearchSortOrder | undefined
}

const UNORDERED_SORT_KEYS: readonly VideoSearchSortKey[] = ['hot', 'personalized']

export function defaultSortOrder(sortKey: VideoSearchSortKey): VideoSearchSortOrder {
  return UNORDERED_SORT_KEYS.includes(sortKey) ? 'none' : 'desc'
}

export interface NicoRankingParams extends NicoPageParams {
  featuredKey?: string | undefined
  term?: RankingTerm | undefined
  tag?: string | undefined
}

function withSignal<T extends object>(params: T, signal: AbortSignal | undefined): T & { signal?: AbortSignal } {
  return signal === undefined ? params : { ...params, signal }
}

function pickThumbnail(video: EssentialVideo): string {
  const thumbnail = video.thumbnail as Partial<EssentialVideo['thumbnail']> | undefined

  if (thumbnail === undefined) {
    return ''
  }

  return (
    thumbnail.middleUrl
    ?? thumbnail.largeUrl
    ?? thumbnail.nHdUrl
    ?? thumbnail.listingUrl
    ?? thumbnail.url
    ?? ''
  )
}

export function toVideoCard(video: EssentialVideo): NicoVideoCard {
  return {
    videoId: String(video.id),
    title: video.title,
    thumbnailUrl: pickThumbnail(video),
    ownerName: video.owner?.name ?? '',
    ownerId: video.owner?.id ?? null,
    viewCount: video.count?.view ?? 0,
    commentCount: video.count?.comment ?? 0,
    mylistCount: video.count?.mylist ?? 0,
    likeCount: video.count?.like ?? 0,
    durationSeconds: video.duration ?? 0,
    registeredAt: video.registeredAt ?? null,
    isChannelVideo: video.isChannelVideo === true,
  }
}

function toMylistEntry(item: MylistItem | WatchLaterItem): NicoMylistEntry {
  return {
    itemId: item.itemId ?? null,
    addedAt: item.addedAt ?? null,
    video: toVideoCard(item.video),
  }
}

function toMylistSummary(mylist: MylistMeta): NicoMylistSummary {
  return {
    mylistId: mylist.id,
    name: mylist.name,
    itemsCount: mylist.itemsCount ?? 0,
    isPublic: mylist.isPublic === true,
  }
}

export async function searchVideos(
  client: NiconicoClient,
  params: NicoSearchParams = {},
): Promise<NicoVideoPage> {
  const sortKey = params.sortKey ?? 'hot'
  const result = await client.search.searchVideos(
    withSignal(
      {
        ...(params.keyword === undefined ? {} : { keyword: params.keyword }),
        ...(params.tag === undefined ? {} : { tag: params.tag }),
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 25,
        sortKey,
        sortOrder: params.sortOrder ?? defaultSortOrder(sortKey),
      },
      params.signal,
    ),
  )

  return {
    items: result.items.map(toVideoCard),
    totalCount: result.totalCount,
    hasNext: result.hasNext,
  }
}

export async function fetchRanking(
  client: NiconicoClient,
  params: NicoRankingParams = {},
): Promise<NicoRankingResult> {
  const result = await client.ranking.getRanking(
    withSignal(
      {
        featuredKey: params.featuredKey ?? NICO_RANKING_ALL_KEY,
        term: params.term ?? '24h',
        ...(params.tag === undefined || params.tag.length === 0 ? {} : { tag: params.tag }),
        page: params.page ?? 1,
      },
      params.signal,
    ),
  )

  return {
    items: result.items.map(toVideoCard),
    totalCount: result.pagination?.totalCount ?? result.items.length,
    hasNext: result.hasNext,
    featuredKey: result.featuredKey,
    label: result.label,
    trendTags: result.trendTags,
  }
}

export async function fetchRankingGenres(
  client: NiconicoClient,
  signal?: AbortSignal,
): Promise<RankingGenre[]> {
  const genres = await client.ranking.getRankingGenres(withSignal({}, signal))

  return genres.filter((genre) => genre.isEnabled)
}

export async function fetchNewArrivals(
  client: NiconicoClient,
  params: NicoPageParams = {},
): Promise<NicoVideoPage> {
  const result = await client.search.getNewArrivalVideos(
    withSignal({ page: params.page ?? 1, pageSize: params.pageSize ?? 25 }, params.signal),
  )

  return {
    items: result.items.map(toVideoCard),
    totalCount: 0,
    hasNext: result.hasNext,
  }
}

export async function fetchSuggestions(
  client: NiconicoClient,
  keyword: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (keyword.trim().length === 0) {
    return []
  }

  return client.suggestion.expand(keyword.trim(), withSignal({}, signal))
}

function readLikeState(watch: WatchResult): boolean {
  const viewer = watch.data.video['viewer']

  if (typeof viewer !== 'object' || viewer === null) {
    return false
  }

  const like = (viewer as { like?: { isLiked?: unknown } }).like

  return like?.isLiked === true
}

export function toWatchDetail(watch: WatchResult): NicoWatchDetail {
  const { data } = watch
  const domand = data.media.domand
  const defaultThread = data.comment.threads.find((thread) => thread.isDefaultPostTarget)

  return {
    videoId: data.video.id,
    title: data.video.title,
    description: data.video.description,
    thumbnailUrl:
      data.video.thumbnail.largeUrl
      ?? data.video.thumbnail.middleUrl
      ?? data.video.thumbnail.url
      ?? '',
    durationSeconds: data.video.duration,
    registeredAt: data.video.registeredAt,
    viewCount: data.video.count.view,
    commentCount: data.video.count.comment,
    mylistCount: data.video.count.mylist,
    likeCount: data.video.count.like,
    tags: data.tag.items.map((tag) => tag.name),
    genreLabel: data.genre?.label ?? null,
    ownerId: data.owner?.id ?? null,
    ownerName: data.owner?.nickname ?? null,
    ownerIconUrl: data.owner?.iconUrl ?? null,
    seriesId: data.series?.id ?? null,
    seriesTitle: data.series?.title ?? null,
    isLiked: readLikeState(watch),
    qualityLabels:
      domand?.videos.filter((video) => video.isAvailable).map((video) => video.label) ?? [],
    defaultThreadId: defaultThread?.id ?? null,
    nvComment: data.comment.nvComment,
  }
}

export async function fetchWatchDetail(
  client: NiconicoClient,
  videoId: string,
  signal?: AbortSignal,
): Promise<NicoWatchDetail> {
  const watch = await client.watch.getBestWatchData(
    videoId,
    withSignal({ noSideEffect: false }, signal),
  )

  return toWatchDetail(watch)
}

export interface NicoCommentOptions {
  includeEasy?: boolean | undefined
  signal?: AbortSignal | undefined
}

export async function fetchComments(
  client: NiconicoClient,
  nvComment: NvCommentParams,
  options: NicoCommentOptions = {},
): Promise<CommentItem[]> {
  const targets: NvCommentTarget[] = options.includeEasy === true
    ? nvComment.params.targets
    : nvComment.params.targets.filter((target) => target.fork !== 'easy')

  if (targets.length === 0) {
    return []
  }

  const threads = await client.comments.fetchCommentsWithKey(
    nvComment.threadKey,
    targets,
    withSignal({ language: nvComment.params.language }, options.signal),
  )

  return sortCommentsByVpos(threads.flatMap((thread) => thread.comments))
}

export interface NicoPostCommentParams {
  threadId: number
  videoId: string
  body: string
  vposMs: number
  commands?: readonly string[] | undefined
  signal?: AbortSignal | undefined
}

export function postComment(
  client: NiconicoClient,
  params: NicoPostCommentParams,
): Promise<PostCommentResult> {
  return client.comments.postComment(
    withSignal(
      {
        threadId: params.threadId,
        videoId: params.videoId,
        body: params.body,
        vposMs: Math.max(0, Math.floor(params.vposMs)),
        commands: params.commands ?? [],
      },
      params.signal,
    ),
  )
}

export async function setLiked(
  client: NiconicoClient,
  videoId: string,
  liked: boolean,
): Promise<void> {
  try {
    if (liked) {
      await client.likes.like(videoId)
    } else {
      await client.likes.unlike(videoId)
    }
  } catch (error) {
    if (!liked && isNiconicoApiError(error) && error.status === 404) {
      return
    }

    throw error
  }
}

export async function fetchRelatedVideos(
  client: NiconicoClient,
  videoId: string,
  signal?: AbortSignal,
): Promise<NicoVideoCard[]> {
  const result = await client.videos.getRecommendations(videoId, withSignal({}, signal))

  return result.items
    .filter((item) => item.contentType === 'video')
    .map((item) => item.content)
    .filter((content): content is EssentialVideo => content !== undefined)
    .map(toVideoCard)
}

export async function fetchMyMylists(
  client: NiconicoClient,
  signal?: AbortSignal,
): Promise<NicoMylistSummary[]> {
  const result = await client.mylists.getMyMylists(withSignal({}, signal))

  return result.mylists.map(toMylistSummary)
}

interface RawMylistResponse {
  data?: {
    mylist?: {
      items?: MylistItem[]
      totalItemCount?: number
      hasNext?: boolean
    }
  }
}

export async function fetchMylistItems(
  client: NiconicoClient,
  mylistId: number,
  params: NicoPageParams = {},
): Promise<NicoMylistPage> {
  const page = params.page ?? 1
  const pageSize = params.pageSize ?? 25

  try {
    const detail = await client.mylists.getMylist(
      mylistId,
      withSignal({ page, pageSize }, params.signal),
    )

    return {
      items: detail.items.map(toMylistEntry),
      totalCount: detail.totalItemCount,
      hasNext: detail.hasNext,
    }
  } catch (error) {
    if (!isNiconicoApiError(error) || error.status !== 403 || !client.isLoggedIn()) {
      throw error
    }
  }

  const response = await client.http.getJson<RawMylistResponse>(
    `${NVAPI_ORIGIN}/v1/users/me/mylists/${String(mylistId)}?pageSize=${String(pageSize)}&page=${String(page)}`,
    withSignal({}, params.signal),
  )

  const items = response.data?.mylist?.items ?? []

  return {
    items: items.map(toMylistEntry),
    totalCount: response.data?.mylist?.totalItemCount ?? items.length,
    hasNext: response.data?.mylist?.hasNext ?? false,
  }
}

export function createMylist(
  client: NiconicoClient,
  name: string,
  isPublic = false,
): Promise<number> {
  return client.mylists.createMylist({ name, isPublic })
}

export function addToMylist(
  client: NiconicoClient,
  mylistId: number,
  videoId: string,
): Promise<void> {
  return client.mylists.addMylistItem(mylistId, videoId)
}

export function removeMylistItems(
  client: NiconicoClient,
  mylistId: number,
  itemIds: readonly number[],
): Promise<void> {
  return client.mylists.removeMylistItems(mylistId, itemIds)
}

export function deleteMylist(client: NiconicoClient, mylistId: number): Promise<void> {
  return client.mylists.deleteMylist(mylistId)
}

export async function fetchWatchLater(
  client: NiconicoClient,
  params: NicoPageParams = {},
): Promise<NicoMylistPage> {
  const result = await client.mylists.getMyWatchLater(
    withSignal({ page: params.page ?? 1, pageSize: params.pageSize ?? 25 }, params.signal),
  )

  return {
    items: result.items.map(toMylistEntry),
    totalCount: result.totalCount,
    hasNext: result.hasNext,
  }
}

export async function addToWatchLater(client: NiconicoClient, videoId: string): Promise<void> {
  try {
    await client.mylists.addWatchLater(videoId)
  } catch (error) {
    if (isNiconicoApiError(error) && error.status === 409) {
      return
    }

    throw error
  }
}

export async function removeWatchLater(
  client: NiconicoClient,
  itemIds: readonly number[],
): Promise<void> {
  if (itemIds.length === 0) {
    return
  }

  const query = itemIds.map((itemId) => `itemIds=${encodeURIComponent(String(itemId))}`).join('&')

  await client.http.sendJson(`${NVAPI_ORIGIN}/v1/users/me/watch-later?${query}`, 'DELETE', undefined, {
    headers: { 'X-Request-With': 'https://www.nicovideo.jp' },
  })
}

export async function fetchMyLikes(
  client: NiconicoClient,
  params: NicoPageParams = {},
): Promise<NicoVideoPage> {
  const result = await client.likes.getMyLikes(
    withSignal({ page: params.page ?? 1, pageSize: params.pageSize ?? 25 }, params.signal),
  )

  return {
    items: result.items.map((item) => toVideoCard(item.video)),
    totalCount: result.items.length,
    hasNext: result.hasNext,
  }
}

export async function fetchWatchHistory(
  client: NiconicoClient,
  params: { limit?: number | undefined; cursor?: string | undefined; signal?: AbortSignal | undefined } = {},
): Promise<NicoWatchHistoryPage> {
  const result = await client.history.getMyWatchHistory(
    withSignal(
      {
        limit: params.limit ?? 25,
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
      },
      params.signal,
    ),
  )

  return {
    items: result.items.map((item) => toVideoCard(item.video)),
    nextCursor: result.nextCursor ?? null,
  }
}

export function embedPlayerUrl(videoId: string, playerId = NICO_EMBED_PLAYER_ID): string {
  const params = new URLSearchParams({ jsapi: '1', playerId })

  return `https://embed.nicovideo.jp/watch/${encodeURIComponent(videoId)}?${params.toString()}`
}

export function nicoWatchUrl(videoId: string): string {
  return `https://www.nicovideo.jp/watch/${encodeURIComponent(videoId)}`
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return '0:00'
  }

  const seconds = Math.floor(totalSeconds % 60)
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)
  const paddedSeconds = String(seconds).padStart(2, '0')

  if (hours > 0) {
    return `${String(hours)}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`
  }

  return `${String(minutes)}:${paddedSeconds}`
}

export function nicoErrorKey(error: unknown): string {
  if (error instanceof NiconicoAuthError) {
    return 'nico.errors.unauthorized'
  }

  if (error instanceof NiconicoTimeoutError) {
    return 'nico.errors.timeout'
  }

  if (error instanceof NiconicoNetworkError) {
    return 'nico.errors.network'
  }

  if (error instanceof NiconicoApiError) {
    if (error.isUnauthorized() || error.status === 403) {
      return 'nico.errors.unauthorized'
    }

    if (error.status === 404) {
      return 'nico.errors.notFound'
    }

    if (error.status === 429 || error.isAbuseBlocked()) {
      return 'nico.errors.rateLimited'
    }

    return 'nico.errors.api'
  }

  return 'nico.errors.unexpected'
}
