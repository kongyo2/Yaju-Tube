import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAuthStore } from './auth'
import type { AuthSession } from '@/types/peertube'

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    host: '810video.com',
    username: 'yaju',
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    tokenType: 'Bearer',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    account: { id: 1, name: 'yaju', displayName: 'Yaju' },
    channels: [
      { id: 10, name: 'main_channel', displayName: 'Main Channel' },
    ],
    ...overrides,
  }
}

describe('authStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts without an access token', () => {
    const store = useAuthStore()

    expect(store.accessToken).toBeNull()
    expect(store.getAccessToken).toBeNull()
    expect(store.isLoggedIn).toBe(false)
  })

  it('sets and clears the access token', () => {
    const store = useAuthStore()

    store.setToken('token-123')
    expect(store.accessToken).toBe('token-123')
    expect(store.getAccessToken).toBe('token-123')

    store.clearToken()
    expect(store.accessToken).toBeNull()
    expect(store.getAccessToken).toBeNull()
  })

  it('stores a full session and reports logged-in state', () => {
    const store = useAuthStore()

    store.setSession(makeSession())

    expect(store.isLoggedIn).toBe(true)
    expect(store.host).toBe('810video.com')
    expect(store.username).toBe('yaju')
    expect(store.accessToken).toBe('access-1')
    expect(store.refreshToken).toBe('refresh-1')
    expect(store.clientId).toBe('client-1')
    expect(store.clientSecret).toBe('secret-1')
    expect(store.account?.displayName).toBe('Yaju')
    expect(store.channels).toHaveLength(1)
  })

  it('updates only the tokens without touching the rest of the session', () => {
    const store = useAuthStore()
    store.setSession(makeSession())

    store.updateTokens('access-2', 'refresh-2')

    expect(store.accessToken).toBe('access-2')
    expect(store.refreshToken).toBe('refresh-2')
    expect(store.host).toBe('810video.com')
    expect(store.clientId).toBe('client-1')
  })

  it('replaces the channel list', () => {
    const store = useAuthStore()
    store.setSession(makeSession())

    store.setChannels([
      { id: 20, name: 'second', displayName: 'Second' },
      { id: 21, name: 'third', displayName: 'Third' },
    ])

    expect(store.channels.map((c) => c.id)).toEqual([20, 21])
  })

  it('clears the whole session on logout', () => {
    const store = useAuthStore()
    store.setSession(makeSession())

    store.clearSession()

    expect(store.isLoggedIn).toBe(false)
    expect(store.accessToken).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.host).toBeNull()
    expect(store.clientId).toBeNull()
    expect(store.clientSecret).toBeNull()
    expect(store.account).toBeNull()
    expect(store.channels).toEqual([])
  })
})
