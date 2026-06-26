import { AxiosError } from 'axios'
import type { AxiosInstance } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import {
  cancelResumableUpload,
  initResumableUpload,
  parseUploadId,
  updateVideo,
  uploadResumable,
  uploadVideo,
  UploadAbortedError,
} from './peertubeUpload'
import { VideoPrivacy } from '@/types/peertube'

type Handler = (...args: any[]) => Promise<any>

function mockHttp(handlers: {
  post?: Handler
  put?: Handler
  delete?: Handler
}): AxiosInstance {
  return {
    post: handlers.post ?? (async () => ({ data: {} })),
    put: handlers.put ?? (async () => ({ data: {} })),
    delete: handlers.delete ?? (async () => ({ data: {} })),
  } as unknown as AxiosInstance
}

function videoFile(size: number, name = 'video.mp4'): File {
  return new File([new Uint8Array(size)], name, { type: 'video/mp4' })
}

function error413(): AxiosError {
  return new AxiosError('too large', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 413,
    data: {},
    statusText: '',
    headers: {},
    config: {} as never,
  } as never)
}

function rangeEnd(range: string): { end: number; total: number } {
  const match = range.match(/bytes (\d+)-(\d+)\/(\d+)/)
  return { end: Number(match?.[2]), total: Number(match?.[3]) }
}

describe('parseUploadId', () => {
  it('extracts upload_id from an absolute Location URL', () => {
    expect(
      parseUploadId('https://h/api/v1/videos/upload-resumable?upload_id=abc123'),
    ).toBe('abc123')
  })

  it('extracts upload_id regardless of param order', () => {
    expect(parseUploadId('/upload-resumable?foo=1&upload_id=xy_z&bar=2')).toBe('xy_z')
  })

  it('returns null when there is no upload_id', () => {
    expect(parseUploadId('https://h/no-id-here')).toBeNull()
  })
})

describe('initResumableUpload', () => {
  it('sends upload headers and metadata, then returns the upload id', async () => {
    let capturedBody: any
    let capturedConfig: any
    const post = vi.fn(async (_url: string, body: any, config: any) => {
      capturedBody = body
      capturedConfig = config
      return {
        status: 201,
        headers: {
          location: 'https://h/api/v1/videos/upload-resumable?upload_id=abc123',
        },
        data: {},
      }
    })

    const id = await initResumableUpload(
      'h',
      'tok',
      videoFile(10),
      { name: 'My Title', channelId: 3, privacy: VideoPrivacy.PUBLIC, description: 'desc' },
      mockHttp({ post }),
    )

    expect(id).toBe('abc123')
    expect(capturedConfig.headers['X-Upload-Content-Length']).toBe('10')
    expect(capturedConfig.headers['X-Upload-Content-Type']).toBe('video/mp4')
    expect(capturedConfig.headers.Authorization).toBe('Bearer tok')
    expect(capturedBody).toMatchObject({
      filename: 'video.mp4',
      name: 'My Title',
      channelId: 3,
      privacy: VideoPrivacy.PUBLIC,
      description: 'desc',
    })
  })

  it('reads an upper-case Location header', async () => {
    const post = vi.fn(async () => ({
      status: 201,
      headers: { Location: '/upload-resumable?upload_id=zzz' },
      data: {},
    }))

    const id = await initResumableUpload(
      'h',
      'tok',
      videoFile(10),
      { name: 'x', channelId: 1, privacy: VideoPrivacy.PRIVATE },
      mockHttp({ post }),
    )

    expect(id).toBe('zzz')
  })

  it('throws when the Location header is missing', async () => {
    const post = vi.fn(async () => ({ status: 201, headers: {}, data: {} }))

    await expect(
      initResumableUpload(
        'h',
        'tok',
        videoFile(10),
        { name: 'x', channelId: 1, privacy: VideoPrivacy.PUBLIC },
        mockHttp({ post }),
      ),
    ).rejects.toThrow(/upload_id/)
  })
})

describe('uploadResumable', () => {
  it('uploads a small file in a single chunk and reports progress', async () => {
    let capturedConfig: any
    const put = vi.fn(async (_url: string, _body: any, config: any) => {
      capturedConfig = config
      return { status: 200, data: { video: { id: 5, uuid: 'uuid-1' } }, headers: {} }
    })
    const onProgress = vi.fn()

    const video = await uploadResumable('h', 'tok', 'up1', videoFile(1000), {
      http: mockHttp({ put }),
      onProgress,
    })

    expect(video).toEqual({ id: 5, uuid: 'uuid-1' })
    expect(put).toHaveBeenCalledOnce()
    expect(capturedConfig.params).toEqual({ upload_id: 'up1' })
    expect(capturedConfig.headers['Content-Range']).toBe('bytes 0-999/1000')
    expect(capturedConfig.headers['Content-Type']).toBe('application/octet-stream')
    expect(onProgress).toHaveBeenLastCalledWith({ ratio: 1, loaded: 1000, total: 1000 })
  })

  it('splits a large file across multiple chunks (dynamic sizing grows the chunk)', async () => {
    const size = 2_500_000
    const ranges: string[] = []
    const put = vi.fn(async (_url: string, _body: any, config: any) => {
      const range = config.headers['Content-Range']
      ranges.push(range)
      const { end, total } = rangeEnd(range)
      if (end === total - 1) {
        return { status: 200, data: { video: { id: 1, uuid: 'big-uuid' } }, headers: {} }
      }
      return { status: 308, data: {}, headers: {} }
    })

    const video = await uploadResumable('h', 'tok', 'up1', videoFile(size), {
      http: mockHttp({ put }),
    })

    expect(video.uuid).toBe('big-uuid')
    expect(ranges.length).toBe(2)
    expect(ranges[0]).toBe('bytes 0-1048575/2500000')
    expect(ranges[1]).toBe('bytes 1048576-2499999/2500000')
  })

  it('halves the chunk and retries the same range on HTTP 413', async () => {
    const ranges: string[] = []
    let calls = 0
    const put = vi.fn(async (_url: string, _body: any, config: any) => {
      ranges.push(config.headers['Content-Range'])
      calls += 1
      if (calls === 1) throw error413()
      return { status: 200, data: { video: { id: 2, uuid: 'retry-uuid' } }, headers: {} }
    })

    const video = await uploadResumable('h', 'tok', 'up1', videoFile(1000), {
      http: mockHttp({ put }),
    })

    expect(video.uuid).toBe('retry-uuid')
    expect(put).toHaveBeenCalledTimes(2)
    expect(ranges[0]).toBe('bytes 0-999/1000')
    expect(ranges[1]).toBe('bytes 0-999/1000')
  })

  it('throws UploadAbortedError when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const put = vi.fn()

    await expect(
      uploadResumable('h', 'tok', 'up1', videoFile(1000), {
        http: mockHttp({ put }),
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(UploadAbortedError)
    expect(put).not.toHaveBeenCalled()
  })

  it('throws when the final chunk returns no video uuid', async () => {
    const put = vi.fn(async () => ({ status: 308, data: {}, headers: {} }))

    await expect(
      uploadResumable('h', 'tok', 'up1', videoFile(1000), { http: mockHttp({ put }) }),
    ).rejects.toThrow(/video uuid/)
  })
})

describe('cancelResumableUpload', () => {
  it('issues a DELETE with the upload_id query parameter', async () => {
    let capturedConfig: any
    const del = vi.fn(async (_url: string, config: any) => {
      capturedConfig = config
      return { status: 204, data: {}, headers: {} }
    })

    await cancelResumableUpload('h', 'tok', 'up1', mockHttp({ delete: del }))

    expect(del).toHaveBeenCalledOnce()
    expect(capturedConfig.params).toEqual({ upload_id: 'up1' })
    expect(capturedConfig.headers.Authorization).toBe('Bearer tok')
  })
})

describe('updateVideo', () => {
  it('PUTs metadata to the video endpoint', async () => {
    let capturedUrl = ''
    let capturedBody: any
    const put = vi.fn(async (url: string, body: any) => {
      capturedUrl = url
      capturedBody = body
      return { status: 204, data: {}, headers: {} }
    })

    await updateVideo('h', 'tok', 'uuid-9', { privacy: 2 }, mockHttp({ put }))

    expect(capturedUrl).toBe('https://h/api/v1/videos/uuid-9')
    expect(capturedBody).toEqual({ privacy: 2 })
  })
})

describe('uploadVideo', () => {
  it('initialises then uploads, returning the created video', async () => {
    const post = vi.fn(async () => ({
      status: 201,
      headers: { location: '/upload-resumable?upload_id=flow1' },
      data: {},
    }))
    const put = vi.fn(async () => ({
      status: 200,
      data: { video: { id: 7, uuid: 'flow-uuid' } },
      headers: {},
    }))

    const video = await uploadVideo(
      'h',
      'tok',
      videoFile(500),
      { name: 'Flow', channelId: 1, privacy: VideoPrivacy.PUBLIC },
      { http: mockHttp({ post, put }) },
    )

    expect(post).toHaveBeenCalledOnce()
    expect(put).toHaveBeenCalledOnce()
    expect(video.uuid).toBe('flow-uuid')
  })
})
