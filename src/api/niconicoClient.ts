import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { NiconicoClient, type FetchLike } from '@kongyo2/niconicojs'
import { NicoProxyUnavailableError, toForwardedHeaders, toNicoProxyPath } from './niconicoProxy'

const REQUEST_TIMEOUT_MS = 20_000

const WEB_PROXY_BASE = readProxyBase()

function readProxyBase(): string {
  try {
    const configured = import.meta.env['VITE_NICO_PROXY_BASE']
    return typeof configured === 'string' ? configured.replace(/\/+$/, '') : ''
  } catch {
    return ''
  }
}

function isDevServer(): boolean {
  try {
    return import.meta.env.DEV === true
  } catch {
    return false
  }
}

export function hasWebProxy(): boolean {
  return WEB_PROXY_BASE.length > 0 || isDevServer()
}

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const record: Record<string, string> = {}

  if (headers === undefined) {
    return record
  }

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key.toLowerCase()] = value
    })
    return record
  }

  if (Array.isArray(headers)) {
    for (const entry of headers) {
      const [name, value] = entry
      if (name !== undefined && value !== undefined) {
        record[name.toLowerCase()] = value
      }
    }
    return record
  }

  for (const [name, value] of Object.entries(headers)) {
    record[name.toLowerCase()] = value
  }

  return record
}

function lowerCaseHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const record: Record<string, string> = {}

  for (const [name, value] of Object.entries(headers ?? {})) {
    if (typeof value === 'string') {
      record[name.toLowerCase()] = value
    }
  }

  return record
}

export function responseBodyText(data: unknown): string {
  if (typeof data === 'string') {
    return data
  }

  if (data === undefined || data === null) {
    return ''
  }

  try {
    return JSON.stringify(data)
  } catch {
    return ''
  }
}

export function buildResponse(
  status: number,
  body: string,
  headers: Record<string, string>,
): Response {
  if (!Number.isInteger(status) || status < 200 || status > 599) {
    throw new Error(`niconico request failed with status ${String(status)}`)
  }

  const bodyless = status === 204 || status === 205 || status === 304

  return new Response(bodyless ? null : body, { status, headers })
}

export function withAbort<T>(promise: Promise<T>, signal: AbortSignal | null | undefined): Promise<T> {
  if (!signal) {
    return promise
  }

  if (signal.aborted) {
    return Promise.reject(signal.reason)
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)

    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', onAbort)
    })
  })
}

export const nativeNicoFetch: FetchLike = async (url, init) => {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = headersToRecord(init.headers)
  const body = typeof init.body === 'string' ? init.body : undefined

  const response = await withAbort(
    CapacitorHttp.request({
      url,
      method,
      headers,
      ...(body === undefined ? {} : { data: body }),
      responseType: 'text',
      shouldEncodeUrlParams: false,
      connectTimeout: REQUEST_TIMEOUT_MS,
      readTimeout: REQUEST_TIMEOUT_MS,
    }),
    init.signal,
  )

  return buildResponse(
    response.status,
    responseBodyText(response.data),
    lowerCaseHeaders(response.headers),
  )
}

export const webNicoFetch: FetchLike = async (url, init) => {
  const proxyPath = toNicoProxyPath(url)
  const headers = headersToRecord(init.headers)

  if (proxyPath === null) {
    return fetch(url, init)
  }

  if (!hasWebProxy()) {
    throw new NicoProxyUnavailableError()
  }

  return fetch(`${WEB_PROXY_BASE}${proxyPath}`, {
    ...init,
    headers: toForwardedHeaders(headers),
    credentials: 'omit',
  })
}

export function createNicoFetch(): FetchLike {
  return isNativePlatform() ? nativeNicoFetch : webNicoFetch
}

export function createNiconicoClient(session?: string | undefined): NiconicoClient {
  return new NiconicoClient({
    session,
    timeoutMs: REQUEST_TIMEOUT_MS,
    fetch: createNicoFetch(),
  })
}

let cached: { session: string | undefined; client: NiconicoClient } | null = null

export function getNiconicoClient(session?: string | undefined): NiconicoClient {
  const normalized = session !== undefined && session.length > 0 ? session : undefined

  if (cached !== null && cached.session === normalized) {
    return cached.client
  }

  const client = createNiconicoClient(normalized)
  cached = { session: normalized, client }

  return client
}

export function resetNiconicoClient(): void {
  cached = null
}
