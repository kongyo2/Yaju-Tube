/// <reference types="cypress" />

export const DEFAULT_HOST = '810video.com'
export const PRIMARY_HOST = 'e2e.example'
export const SECOND_HOST = 'second.example'
export const REMOTE_HOST = 'remote.example'

export const PRIMARY_INSTANCE = { name: 'E2E Instance', url: PRIMARY_HOST }
export const SECOND_INSTANCE = { name: 'Second Instance', url: SECOND_HOST }

export interface InstanceRef {
  name: string
  url: string
}

export interface AppState {
  locale?: string
  instances?: InstanceRef[]
  settings?: Record<string, unknown>
  history?: Record<string, unknown>[]
  playlist?: Record<string, unknown>[]
  auth?: Record<string, unknown>
  upload?: Record<string, unknown>
  session?: Record<string, string>
}

export function seedAppState(win: Window, state: AppState = {}): void {
  win.localStorage.setItem('locale', state.locale ?? 'ja')

  if (state.instances) {
    win.localStorage.setItem('instances', JSON.stringify(state.instances))
  }
  if (state.settings) {
    win.localStorage.setItem('settings', JSON.stringify(state.settings))
  }
  if (state.history) {
    win.localStorage.setItem('history', JSON.stringify({ history: state.history }))
  }
  if (state.playlist) {
    win.localStorage.setItem('playlist', JSON.stringify({ playlist: state.playlist }))
  }
  if (state.auth) {
    win.localStorage.setItem('auth', JSON.stringify(state.auth))
  }
  if (state.upload) {
    win.localStorage.setItem('upload', JSON.stringify(state.upload))
  }
  for (const [key, value] of Object.entries(state.session ?? {})) {
    win.sessionStorage.setItem(key, value)
  }
}

export interface TestVideo {
  uuid: string
  name: string
  description?: string
  thumbnailPath: string
  previewPath?: string
  duration?: number
  channel: { name: string; displayName?: string; host?: string } | null
  views?: number
  likes?: number
  publishedAt: string
}

export function makeVideo(overrides: Partial<TestVideo> = {}): TestVideo {
  return {
    uuid: 'vid-0001',
    name: 'First E2E Video',
    description: '',
    thumbnailPath: '/static/thumbnails/vid-0001.jpg',
    previewPath: '/static/previews/vid-0001.jpg',
    duration: 600,
    channel: { name: 'e2e-channel', displayName: 'E2E Channel', host: PRIMARY_HOST },
    views: 120,
    likes: 10,
    publishedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

export function videoListBody(videos: TestVideo[], total = videos.length) {
  return { total, data: videos }
}

export function makeHistoryItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    videoId: 'vid-0001',
    videoName: 'First E2E Video',
    thumbnailPath: '/static/thumbnails/vid-0001.jpg',
    channelName: 'E2E Channel',
    instanceUrl: PRIMARY_HOST,
    watchedAt: Date.now(),
    ...overrides,
  }
}

export function makePlaylistItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    videoId: 'vid-0001',
    videoName: 'First E2E Video',
    thumbnailPath: '/static/thumbnails/vid-0001.jpg',
    channelName: 'E2E Channel',
    instanceUrl: PRIMARY_HOST,
    addedAt: 1700000000000,
    ...overrides,
  }
}

export function loggedInAuth(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    accessToken: 'e2e-access-token',
    refreshToken: 'e2e-refresh-token',
    tokenType: 'Bearer',
    username: 'e2euser',
    host: PRIMARY_HOST,
    channels: [{ id: 7, name: 'e2e-channel', displayName: 'E2E Channel' }],
    clientId: 'e2e-client-id',
    clientSecret: 'e2e-client-secret',
    expiresAt: null,
    ...overrides,
  }
}

const PENDING_KEY_SEPARATOR = String.fromCharCode(0)

export function pendingUploadKey(host: string, username: string): string {
  return `${host}${PENDING_KEY_SEPARATOR}${username}`
}

export const PENDING_FILE = {
  fileName: 'clip.mp4',
  fileSize: 2048,
  fileLastModified: 1700000000000,
}

export function pendingUploadState(overrides: Record<string, unknown> = {}) {
  const entry = {
    host: PRIMARY_HOST,
    username: 'e2euser',
    uploadId: 'up-pending',
    name: 'Pending Video',
    channelId: 7,
    privacy: 1,
    description: '',
    ...PENDING_FILE,
    uploadedBytes: 1024,
    ...overrides,
  }

  return {
    pending: {
      [pendingUploadKey(String(entry.host), String(entry.username))]: entry,
    },
  }
}

export const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'location, range',
}

export function stubUnreachable(urlPattern: string, alias: string) {
  return cy
    .intercept('GET', urlPattern, {
      statusCode: 200,
      headers: { 'access-control-allow-origin': 'https://blocked.invalid' },
      body: {},
    })
    .as(alias)
}

export function apiBase(host: string): string {
  return `https://${host}/api/v1`
}

export function videosUrl(host: string): string {
  return `${apiBase(host)}/videos`
}

export function stubVideoList(
  body: unknown = videoListBody([]),
  host = PRIMARY_HOST,
  alias = 'videoList',
) {
  return cy.intercept('GET', `${videosUrl(host)}*`, body as object).as(alias)
}

export function stubVideoDetail(video: TestVideo, host = PRIMARY_HOST, alias = 'videoDetail') {
  return cy
    .intercept('GET', `${videosUrl(host)}/${video.uuid}`, { statusCode: 200, body: video })
    .as(alias)
}

export function stubEmbed(host = PRIMARY_HOST) {
  return cy
    .intercept('GET', `https://${host}/videos/embed/*`, {
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      body: '<!doctype html><html><body>embed stub</body></html>',
    })
    .as('embed')
}

export function stubThumbnails(host = PRIMARY_HOST) {
  return cy.intercept('GET', `https://${host}/static/**`, {
    statusCode: 200,
    fixture: 'thumbnail.png',
  })
}

export function stubLogin(host: string, tokenResponse?: Record<string, unknown>) {
  cy.intercept('GET', `${apiBase(host)}/oauth-clients/local`, {
    statusCode: 200,
    body: { client_id: 'e2e-client-id', client_secret: 'e2e-client-secret' },
  }).as('oauthClient')
  cy.intercept('POST', `${apiBase(host)}/users/token`, {
    statusCode: 200,
    body: {
      access_token: 'e2e-access-token',
      refresh_token: 'e2e-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
    },
    ...(tokenResponse ?? {}),
  }).as('token')
  cy.intercept('GET', `${apiBase(host)}/users/me`, {
    statusCode: 200,
    body: {
      username: 'e2euser',
      videoChannels: [{ id: 7, name: 'e2e-channel', displayName: 'E2E Channel' }],
    },
  }).as('me')
}

export function stubUploadInit(host: string, uploadId = 'up-1') {
  return cy
    .intercept('POST', `${apiBase(host)}/videos/upload-resumable`, {
      statusCode: 201,
      headers: {
        ...CORS_HEADERS,
        location: `${apiBase(host)}/videos/upload-resumable?upload_id=${uploadId}`,
      },
      body: {},
    })
    .as('uploadInit')
}

export function stubUploadChunk(host: string, uuid: string) {
  return cy
    .intercept('PUT', `${apiBase(host)}/videos/upload-resumable*`, {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: { video: { uuid } },
    })
    .as('uploadChunk')
}

export function expectStored(key: string, assertion: (value: unknown) => void): void {
  cy.window().should((win) => {
    const raw = win.localStorage.getItem(key)
    assertion(raw === null ? null : JSON.parse(raw))
  })
}

export function expectSessionItem(key: string, expected: string | null): void {
  cy.window().should((win) => {
    expect(win.sessionStorage.getItem(key)).to.eq(expected)
  })
}
