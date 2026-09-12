import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NICO_FORWARDED_HEADER_PREFIX, NICO_PROXY_PREFIX } from './niconicoProxy'

const capacitorMocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  request: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: capacitorMocks.isNativePlatform },
  CapacitorHttp: { request: capacitorMocks.request },
}))

const {
  buildResponse,
  createNicoFetch,
  getNiconicoClient,
  hasWebProxy,
  headersToRecord,
  isNativePlatform,
  nativeNicoFetch,
  resetNiconicoClient,
  responseBodyText,
  webNicoFetch,
  withAbort,
} = await import('./niconicoClient')

beforeEach(() => {
  vi.clearAllMocks()
  capacitorMocks.isNativePlatform.mockReturnValue(false)
  resetNiconicoClient()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('headersToRecord', () => {
  it('normalizes every HeadersInit shape to lowercase keys', () => {
    expect(headersToRecord(undefined)).toEqual({})
    expect(headersToRecord({ 'X-Frontend-Id': '6' })).toEqual({ 'x-frontend-id': '6' })
    expect(headersToRecord([['X-Frontend-Id', '6']])).toEqual({ 'x-frontend-id': '6' })
    expect(headersToRecord(new Headers({ 'X-Frontend-Id': '6' }))).toEqual({ 'x-frontend-id': '6' })
  })
})

describe('responseBodyText', () => {
  it('passes strings through and serializes anything else', () => {
    expect(responseBodyText('{"a":1}')).toBe('{"a":1}')
    expect(responseBodyText({ a: 1 })).toBe('{"a":1}')
    expect(responseBodyText(null)).toBe('')
    expect(responseBodyText(undefined)).toBe('')
  })

  it('falls back to an empty body when the payload cannot be serialized', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular

    expect(responseBodyText(circular)).toBe('')
  })
})

describe('buildResponse', () => {
  it('keeps the status, body and headers', async () => {
    const response = buildResponse(200, '{"ok":true}', { 'content-type': 'application/json' })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await response.text()).toBe('{"ok":true}')
  })

  it('drops the body on statuses that must not carry one', async () => {
    expect(await buildResponse(204, 'ignored', {}).text()).toBe('')
  })

  it('rejects a status that is not a real HTTP status', () => {
    expect(() => buildResponse(0, '', {})).toThrow(/status 0/)
  })
})

describe('withAbort', () => {
  it('resolves the wrapped promise when no signal is given', async () => {
    await expect(withAbort(Promise.resolve('ok'), undefined)).resolves.toBe('ok')
  })

  it('rejects immediately for an already aborted signal', async () => {
    const controller = new AbortController()
    controller.abort(new Error('gone'))

    await expect(withAbort(Promise.resolve('ok'), controller.signal)).rejects.toThrow('gone')
  })

  it('rejects when the signal aborts while the request is in flight', async () => {
    const controller = new AbortController()
    const pending = withAbort(new Promise(() => undefined), controller.signal)

    controller.abort(new Error('cancelled'))

    await expect(pending).rejects.toThrow('cancelled')
  })
})

describe('webNicoFetch', () => {
  it('sends the request same-origin with the forbidden headers renamed', async () => {
    const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    )

    vi.stubGlobal('fetch', fetchMock)

    await webNicoFetch('https://nvapi.nicovideo.jp/v1/genres', {
      method: 'GET',
      headers: { Cookie: 'user_session=abc', 'X-Frontend-Id': '6' },
    })

    const call = fetchMock.mock.calls[0]

    expect(call?.[0]).toBe(`${NICO_PROXY_PREFIX}nvapi.nicovideo.jp/v1/genres`)
    expect(call?.[1].headers).toEqual({
      [`${NICO_FORWARDED_HEADER_PREFIX}cookie`]: 'user_session=abc',
      'x-frontend-id': '6',
    })
    expect(call?.[1].credentials).toBe('omit')
  })

  it('refuses to guess a proxy when the build has none', async () => {
    const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    )

    vi.stubGlobal('fetch', fetchMock)
    expect(hasWebProxy()).toBe(true)

    vi.stubEnv('DEV', false)

    expect(hasWebProxy()).toBe(false)
    await expect(
      webNicoFetch('https://nvapi.nicovideo.jp/v1/genres', { method: 'GET', headers: {} }),
    ).rejects.toThrow(/VITE_NICO_PROXY_BASE/)
    expect(fetchMock).not.toHaveBeenCalled()

    vi.unstubAllEnvs()
  })

  it('leaves a non-niconico URL untouched', async () => {
    const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 200 }),
    )

    vi.stubGlobal('fetch', fetchMock)

    await webNicoFetch('https://example.com/x', { method: 'GET', headers: {} })

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.com/x')
  })
})

describe('nativeNicoFetch', () => {
  it('calls the native client with the untouched URL and rebuilds a Response', async () => {
    capacitorMocks.request.mockResolvedValue({
      status: 200,
      data: { meta: { status: 200 } },
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await nativeNicoFetch('https://nvapi.nicovideo.jp/v1/genres', {
      method: 'GET',
      headers: { Cookie: 'user_session=abc' },
    })

    const options = capacitorMocks.request.mock.calls[0]?.[0] as Record<string, unknown>

    expect(options['url']).toBe('https://nvapi.nicovideo.jp/v1/genres')
    expect(options['method']).toBe('GET')
    expect(options['headers']).toEqual({ cookie: 'user_session=abc' })
    expect(options['shouldEncodeUrlParams']).toBe(false)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    await expect(response.text()).resolves.toBe('{"meta":{"status":200}}')
  })

  it('forwards a string body', async () => {
    capacitorMocks.request.mockResolvedValue({ status: 200, data: '{}', headers: {} })

    await nativeNicoFetch('https://nvapi.nicovideo.jp/v1/x', { method: 'POST', body: '{"a":1}' })

    expect((capacitorMocks.request.mock.calls[0]?.[0] as Record<string, unknown>)['data']).toBe('{"a":1}')
  })
})

describe('platform selection and client caching', () => {
  it('picks the native adapter only on a native platform', () => {
    expect(isNativePlatform()).toBe(false)
    expect(createNicoFetch()).toBe(webNicoFetch)

    capacitorMocks.isNativePlatform.mockReturnValue(true)

    expect(createNicoFetch()).toBe(nativeNicoFetch)
  })

  it('treats a platform probe failure as web', () => {
    capacitorMocks.isNativePlatform.mockImplementation(() => {
      throw new Error('no bridge')
    })

    expect(isNativePlatform()).toBe(false)
  })

  it('reuses one client per session and rebuilds it when the session changes', () => {
    const guest = getNiconicoClient()

    expect(getNiconicoClient()).toBe(guest)
    expect(getNiconicoClient('')).toBe(guest)
    expect(guest.isLoggedIn()).toBe(false)

    const authed = getNiconicoClient('user_session_1_abc')

    expect(authed).not.toBe(guest)
    expect(authed.isLoggedIn()).toBe(true)
    expect(getNiconicoClient('user_session_1_abc')).toBe(authed)

    resetNiconicoClient()

    expect(getNiconicoClient('user_session_1_abc')).not.toBe(authed)
  })
})
