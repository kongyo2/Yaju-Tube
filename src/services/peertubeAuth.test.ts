import { AxiosError } from 'axios'
import type { AxiosInstance } from 'axios'
import { describe, expect, it, vi } from 'vitest'
import {
  fetchMe,
  fetchOAuthClient,
  login,
  normalizeHost,
  PeerTubeAuthError,
  refreshAccessToken,
  requestToken,
} from './peertubeAuth'

type GetHandler = (url: string, config?: unknown) => Promise<unknown>
type PostHandler = (url: string, body?: unknown, config?: unknown) => Promise<unknown>

function mockHttp(handlers: { get?: GetHandler; post?: PostHandler }): AxiosInstance {
  return {
    get: handlers.get ?? (async () => ({ data: {} })),
    post: handlers.post ?? (async () => ({ data: {} })),
  } as unknown as AxiosInstance
}

function axiosErrorWithCode(status: number, code?: string): AxiosError {
  return new AxiosError(
    'request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    {
      status,
      data: code ? { code } : {},
      statusText: '',
      headers: {},
      config: {} as never,
    } as never,
  )
}

const TOKEN = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  token_type: 'Bearer',
  expires_in: 86400,
}

describe('normalizeHost', () => {
  it('strips protocol and trailing slashes', () => {
    expect(normalizeHost('https://810video.com/')).toBe('810video.com')
    expect(normalizeHost('  http://peertube.example//  ')).toBe('peertube.example')
    expect(normalizeHost('video.example')).toBe('video.example')
  })
})

describe('fetchOAuthClient', () => {
  it('returns the local client credentials', async () => {
    const http = mockHttp({
      get: async (url) => {
        expect(url).toBe('https://810video.com/api/v1/oauth-clients/local')
        return { data: { client_id: 'cid', client_secret: 'csecret' } }
      },
    })

    const client = await fetchOAuthClient('810video.com', http)

    expect(client).toEqual({ client_id: 'cid', client_secret: 'csecret' })
  })
})

describe('requestToken', () => {
  it('sends a password grant and returns the token', async () => {
    const post = vi.fn(async (_url: string, body: unknown) => {
      const params = body as URLSearchParams
      expect(params.get('grant_type')).toBe('password')
      expect(params.get('client_id')).toBe('cid')
      expect(params.get('username')).toBe('yaju')
      expect(params.get('password')).toBe('secret')
      return { data: TOKEN }
    })

    const token = await requestToken(
      '810video.com',
      {
        client: { client_id: 'cid', client_secret: 'csecret' },
        username: 'yaju',
        password: 'secret',
      },
      mockHttp({ post }),
    )

    expect(token.access_token).toBe('access-1')
    expect(post).toHaveBeenCalledOnce()
  })

  it('passes the OTP header when provided', async () => {
    const post = vi.fn(async (_url: string, _body: unknown, config: unknown) => {
      const headers = (config as { headers: Record<string, string> }).headers
      expect(headers['x-peertube-otp']).toBe('123456')
      return { data: TOKEN }
    })

    await requestToken(
      '810video.com',
      {
        client: { client_id: 'cid', client_secret: 'csecret' },
        username: 'yaju',
        password: 'secret',
        otp: '123456',
      },
      mockHttp({ post }),
    )

    expect(post).toHaveBeenCalledOnce()
  })

  it.each([
    ['invalid_grant', 'invalid_credentials'],
    ['missing_two_factor', 'missing_two_factor'],
    ['invalid_two_factor', 'invalid_two_factor'],
  ])('maps server code %s to %s', async (serverCode, expected) => {
    const http = mockHttp({
      post: async () => {
        throw axiosErrorWithCode(400, serverCode)
      },
    })

    await expect(
      requestToken(
        '810video.com',
        {
          client: { client_id: 'cid', client_secret: 'csecret' },
          username: 'yaju',
          password: 'bad',
        },
        http,
      ),
    ).rejects.toMatchObject({ code: expected })
  })

  it('maps a connection failure to a network error', async () => {
    const http = mockHttp({
      post: async () => {
        throw new AxiosError('no network', 'ERR_NETWORK')
      },
    })

    await expect(
      requestToken(
        '810video.com',
        {
          client: { client_id: 'cid', client_secret: 'csecret' },
          username: 'yaju',
          password: 'secret',
        },
        http,
      ),
    ).rejects.toBeInstanceOf(PeerTubeAuthError)
  })
})

describe('fetchMe', () => {
  it('maps the account and channels, including optional host', async () => {
    const http = mockHttp({
      get: async (url, config) => {
        expect(url).toBe('https://810video.com/api/v1/users/me')
        const headers = (config as { headers: Record<string, string> }).headers
        expect(headers['Authorization']).toBe('Bearer access-1')
        return {
          data: {
            account: { id: 1, name: 'yaju', displayName: 'Yaju' },
            videoChannels: [
              { id: 10, name: 'main', displayName: 'Main', host: '810video.com' },
              { id: 11, name: 'side', displayName: 'Side' },
            ],
          },
        }
      },
    })

    const me = await fetchMe('810video.com', 'access-1', http)

    expect(me.account).toEqual({ id: 1, name: 'yaju', displayName: 'Yaju' })
    expect(me.channels).toHaveLength(2)
    expect(me.channels[0]).toEqual({
      id: 10,
      name: 'main',
      displayName: 'Main',
      host: '810video.com',
    })
    expect(me.channels[1]).toEqual({ id: 11, name: 'side', displayName: 'Side' })
  })

  it('tolerates a missing channel list', async () => {
    const http = mockHttp({
      get: async () => ({
        data: { account: { id: 1, name: 'yaju', displayName: 'Yaju' } },
      }),
    })

    const me = await fetchMe('810video.com', 'access-1', http)

    expect(me.channels).toEqual([])
  })
})

describe('login', () => {
  it('runs the full client → token → me flow and returns a session', async () => {
    const http = mockHttp({
      get: async (url) => {
        if (url.endsWith('/oauth-clients/local')) {
          return { data: { client_id: 'cid', client_secret: 'csecret' } }
        }
        if (url.endsWith('/users/me')) {
          return {
            data: {
              account: { id: 1, name: 'yaju', displayName: 'Yaju' },
              videoChannels: [{ id: 10, name: 'main', displayName: 'Main' }],
            },
          }
        }
        throw new Error(`unexpected GET ${url}`)
      },
      post: async (url) => {
        if (url.endsWith('/users/token')) return { data: TOKEN }
        throw new Error(`unexpected POST ${url}`)
      },
    })

    const session = await login('https://810video.com/', 'yaju', 'secret', undefined, http)

    expect(session).toMatchObject({
      host: '810video.com',
      username: 'yaju',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      clientId: 'cid',
      clientSecret: 'csecret',
    })
    expect(session.account.displayName).toBe('Yaju')
    expect(session.channels[0]?.id).toBe(10)
  })
})

describe('refreshAccessToken', () => {
  it('sends a refresh_token grant', async () => {
    const post = vi.fn(async (_url: string, body: unknown) => {
      const params = body as URLSearchParams
      expect(params.get('grant_type')).toBe('refresh_token')
      expect(params.get('refresh_token')).toBe('refresh-1')
      return { data: { ...TOKEN, access_token: 'access-2', refresh_token: 'refresh-2' } }
    })

    const token = await refreshAccessToken(
      '810video.com',
      { clientId: 'cid', clientSecret: 'csecret', refreshToken: 'refresh-1' },
      mockHttp({ post }),
    )

    expect(token.access_token).toBe('access-2')
    expect(token.refresh_token).toBe('refresh-2')
  })
})
