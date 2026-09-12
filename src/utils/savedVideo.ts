import type { SavedVideoRef } from '@/types/video'

export function isNiconicoRef(item: Pick<SavedVideoRef, 'source'>): boolean {
  return item.source === 'niconico'
}

export function savedVideoThumbnailUrl(path: string, instanceUrl: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path
  }

  return `https://${instanceUrl}${path}`
}

export function savedVideoRoutePath(item: Pick<SavedVideoRef, 'source' | 'videoId'>): string {
  return isNiconicoRef(item) ? `/tabs/nico/${item.videoId}` : `/tabs/video/${item.videoId}`
}
