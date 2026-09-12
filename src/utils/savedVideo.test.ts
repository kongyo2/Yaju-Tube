import { describe, expect, it } from 'vitest'
import { isNiconicoRef, savedVideoRoutePath, savedVideoThumbnailUrl } from './savedVideo'

describe('isNiconicoRef', () => {
  it('treats entries saved before niconico support as PeerTube videos', () => {
    expect(isNiconicoRef({})).toBe(false)
    expect(isNiconicoRef({ source: 'peertube' })).toBe(false)
    expect(isNiconicoRef({ source: 'niconico' })).toBe(true)
  })
})

describe('savedVideoThumbnailUrl', () => {
  it('prefixes a PeerTube path with its instance host', () => {
    expect(savedVideoThumbnailUrl('/lazy-static/thumbnails/x.jpg', '810video.com')).toBe(
      'https://810video.com/lazy-static/thumbnails/x.jpg',
    )
  })

  it('keeps an absolute thumbnail URL as it is', () => {
    expect(savedVideoThumbnailUrl('https://nicovideo.cdn.nimg.jp/thumbnails/9/9', 'www.nicovideo.jp')).toBe(
      'https://nicovideo.cdn.nimg.jp/thumbnails/9/9',
    )
  })
})

describe('savedVideoRoutePath', () => {
  it('routes each saved video to the player that can play it', () => {
    expect(savedVideoRoutePath({ videoId: 'abc', source: 'peertube' })).toBe('/tabs/video/abc')
    expect(savedVideoRoutePath({ videoId: 'abc' })).toBe('/tabs/video/abc')
    expect(savedVideoRoutePath({ videoId: 'sm9', source: 'niconico' })).toBe('/tabs/nico/sm9')
  })
})
