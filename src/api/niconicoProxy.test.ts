import { isNiconicoHost } from '@kongyo2/niconicojs'
import { describe, expect, it } from 'vitest'
import {
  isNicoProxyableHost,
  NICO_FORWARDED_HEADER_PREFIX,
  NICO_PROXY_PREFIX,
  toForwardedHeaders,
  toNicoProxyPath,
  toNicoUpstreamUrl,
  toUpstreamHeaders,
} from './niconicoProxy'

describe('isNicoProxyableHost', () => {
  it('accepts the niconico domains and rejects everything else', () => {
    expect(isNicoProxyableHost('nvapi.nicovideo.jp')).toBe(true)
    expect(isNicoProxyableHost('www.nicovideo.jp')).toBe(true)
    expect(isNicoProxyableHost('nicovideo.jp')).toBe(true)
    expect(isNicoProxyableHost('nico.ms')).toBe(true)
    expect(isNicoProxyableHost('NVAPI.NICOVIDEO.JP')).toBe(true)

    expect(isNicoProxyableHost('example.com')).toBe(false)
    expect(isNicoProxyableHost('nicovideo.jp.evil.test')).toBe(false)
    expect(isNicoProxyableHost('evil-nicovideo.jp')).toBe(false)
    expect(isNicoProxyableHost('nvapi.nicovideo.jp:8080')).toBe(false)
    expect(isNicoProxyableHost('user@nicovideo.jp')).toBe(false)
  })

  it('agrees with the library host check', () => {
    const urls = [
      'https://nvapi.nicovideo.jp/v1/genres',
      'https://www.nicovideo.jp/api/watch/v3/sm9',
      'https://public.nvcomment.nicovideo.jp/v1/threads',
      'https://account.nicovideo.jp/api/public/v2/user.json',
      'https://ext.nicovideo.jp/api/getthumbinfo/sm9',
      'https://nico.ms/sm9',
      'https://example.com/',
      'https://nicovideo.jp.evil.test/',
    ]

    for (const url of urls) {
      expect([url, isNicoProxyableHost(new URL(url).hostname)]).toEqual([url, isNiconicoHost(url)])
    }
  })
})

describe('toNicoProxyPath', () => {
  it('maps an https niconico URL onto the same-origin prefix', () => {
    expect(toNicoProxyPath('https://nvapi.nicovideo.jp/v1/genres')).toBe(
      `${NICO_PROXY_PREFIX}nvapi.nicovideo.jp/v1/genres`,
    )
  })

  it('keeps the query string intact', () => {
    expect(toNicoProxyPath('https://nvapi.nicovideo.jp/v2/search/video?keyword=%E9%87%8E%E7%8D%A3&page=2')).toBe(
      `${NICO_PROXY_PREFIX}nvapi.nicovideo.jp/v2/search/video?keyword=%E9%87%8E%E7%8D%A3&page=2`,
    )
  })

  it('refuses other origins, plain http and malformed input', () => {
    expect(toNicoProxyPath('https://example.com/v1/genres')).toBeNull()
    expect(toNicoProxyPath('http://nvapi.nicovideo.jp/v1/genres')).toBeNull()
    expect(toNicoProxyPath('not a url')).toBeNull()
  })
})

describe('toNicoUpstreamUrl', () => {
  it('reverses toNicoProxyPath', () => {
    const url = 'https://nvapi.nicovideo.jp/v2/search/video?keyword=a&page=2'
    const path = toNicoProxyPath(url)

    expect(path).not.toBeNull()
    expect(toNicoUpstreamUrl(path as string)).toBe(url)
  })

  it('defaults a host-only path to the root', () => {
    expect(toNicoUpstreamUrl(`${NICO_PROXY_PREFIX}www.nicovideo.jp`)).toBe('https://www.nicovideo.jp/')
  })

  it('refuses paths outside the prefix or outside niconico', () => {
    expect(toNicoUpstreamUrl('/api/v1/videos')).toBeNull()
    expect(toNicoUpstreamUrl(`${NICO_PROXY_PREFIX}example.com/steal`)).toBeNull()
    expect(toNicoUpstreamUrl(`${NICO_PROXY_PREFIX}`)).toBeNull()
  })

  it('cannot be walked out of the prefix with traversal segments', () => {
    expect(toNicoUpstreamUrl(`${NICO_PROXY_PREFIX}../example.com/`)).toBeNull()
  })
})

describe('header forwarding', () => {
  it('renames the headers a browser would drop', () => {
    const forwarded = toForwardedHeaders({
      Cookie: 'user_session=abc',
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://www.nicovideo.jp/',
      'X-Frontend-Id': '6',
    })

    expect(forwarded).toEqual({
      [`${NICO_FORWARDED_HEADER_PREFIX}cookie`]: 'user_session=abc',
      [`${NICO_FORWARDED_HEADER_PREFIX}user-agent`]: 'Mozilla/5.0',
      [`${NICO_FORWARDED_HEADER_PREFIX}referer`]: 'https://www.nicovideo.jp/',
      'x-frontend-id': '6',
    })
  })

  it('restores them upstream and drops the browser-only ones', () => {
    const upstream = toUpstreamHeaders({
      host: '127.0.0.1:5173',
      origin: 'http://127.0.0.1:5173',
      referer: 'http://127.0.0.1:5173/tabs/tab7',
      cookie: 'app-cookie=1',
      'accept-encoding': 'gzip, br, zstd',
      'sec-fetch-mode': 'cors',
      'x-frontend-id': '6',
      [`${NICO_FORWARDED_HEADER_PREFIX}cookie`]: 'user_session=abc',
      [`${NICO_FORWARDED_HEADER_PREFIX}referer`]: 'https://www.nicovideo.jp/',
    })

    expect(upstream).toEqual({
      'x-frontend-id': '6',
      cookie: 'user_session=abc',
      referer: 'https://www.nicovideo.jp/',
    })
  })

  it('joins repeated header values and skips missing ones', () => {
    expect(toUpstreamHeaders({ 'x-test': ['a', 'b'], 'x-empty': undefined })).toEqual({ 'x-test': 'a, b' })
  })
})
