export const NICO_PROXY_PREFIX = '/nicoapi/'

export const NICO_FORWARDED_HEADER_PREFIX = 'x-nico-fwd-'

export const NICO_FORWARDED_REQUEST_HEADERS = ['cookie', 'user-agent', 'referer'] as const

const BROWSER_ONLY_HEADERS = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'cookie',
  'host',
  'keep-alive',
  'origin',
  'proxy-authorization',
  'referer',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

const NICO_DOMAINS = ['nicovideo.jp', 'nico.ms']

const HOST_PATTERN = /^[a-z0-9.-]+$/

export function isNicoProxyableHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/\.$/, '')

  if (!HOST_PATTERN.test(normalized)) {
    return false
  }

  return NICO_DOMAINS.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`))
}

export function toNicoProxyPath(url: string): string | null {
  let parsed: URL

  try {
    parsed = new URL(url)
  } catch {
    return null
  }

  if (parsed.protocol !== 'https:' || !isNicoProxyableHost(parsed.hostname)) {
    return null
  }

  return `${NICO_PROXY_PREFIX}${parsed.hostname}${parsed.pathname}${parsed.search}`
}

export class NicoProxyUnavailableError extends Error {
  constructor() {
    super('The niconico API proxy is not configured (set VITE_NICO_PROXY_BASE for this build).')
    this.name = 'NicoProxyUnavailableError'
  }
}

export function resolveNicoRedirectTarget(currentUrl: string, location: string): string | null {
  let next: URL

  try {
    next = new URL(location, currentUrl)
  } catch {
    return null
  }

  if (next.protocol !== 'https:' || !isNicoProxyableHost(next.hostname)) {
    return null
  }

  return next.toString()
}

export function toNicoUpstreamUrl(proxyPath: string): string | null {
  if (!proxyPath.startsWith(NICO_PROXY_PREFIX)) {
    return null
  }

  let parsed: URL

  try {
    parsed = new URL(proxyPath, 'http://proxy.invalid')
  } catch {
    return null
  }

  const rest = parsed.pathname.slice(NICO_PROXY_PREFIX.length)
  const separator = rest.indexOf('/')
  const host = separator === -1 ? rest : rest.slice(0, separator)
  const path = separator === -1 ? '/' : rest.slice(separator)

  if (!isNicoProxyableHost(host)) {
    return null
  }

  return `https://${host}${path}${parsed.search}`
}

export function toForwardedHeaders(headers: Record<string, string>): Record<string, string> {
  const forwarded: Record<string, string> = {}

  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase()

    if ((NICO_FORWARDED_REQUEST_HEADERS as readonly string[]).includes(lower)) {
      forwarded[`${NICO_FORWARDED_HEADER_PREFIX}${lower}`] = value
    } else {
      forwarded[lower] = value
    }
  }

  return forwarded
}

export function toUpstreamHeaders(
  incoming: Readonly<Record<string, string | string[] | undefined>>,
): Record<string, string> {
  const passedThrough: Record<string, string> = {}
  const restored: Record<string, string> = {}

  for (const [name, rawValue] of Object.entries(incoming)) {
    if (rawValue === undefined) {
      continue
    }

    const lower = name.toLowerCase()
    const value = Array.isArray(rawValue) ? rawValue.join(', ') : rawValue

    if (lower.startsWith(NICO_FORWARDED_HEADER_PREFIX)) {
      const restoredName = lower.slice(NICO_FORWARDED_HEADER_PREFIX.length)

      if ((NICO_FORWARDED_REQUEST_HEADERS as readonly string[]).includes(restoredName)) {
        restored[restoredName] = value
      }

      continue
    }

    if (BROWSER_ONLY_HEADERS.has(lower) || lower.startsWith('sec-')) {
      continue
    }

    passedThrough[lower] = value
  }

  return { ...passedThrough, ...restored }
}
