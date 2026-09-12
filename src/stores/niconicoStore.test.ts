import { NiconicoApiError, NiconicoAuthError } from '@kongyo2/niconicojs'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  verifySession: vi.fn(),
  getNiconicoClient: vi.fn(),
  resetNiconicoClient: vi.fn(),
}))

vi.mock('@/api/niconicoClient', () => ({
  getNiconicoClient: clientMocks.getNiconicoClient,
  resetNiconicoClient: clientMocks.resetNiconicoClient,
}))

const { useNiconicoStore } = await import('./niconicoStore')

const VERIFIED = {
  userId: 1234,
  nickname: 'テストユーザー',
  isPremium: false,
  premiumType: 'regular',
  iconUrl: 'https://example.test/icon.jpg',
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  clientMocks.getNiconicoClient.mockImplementation(() => ({
    auth: { verifySession: clientMocks.verifySession },
  }))
  clientMocks.verifySession.mockResolvedValue(VERIFIED)
})

describe('login', () => {
  it('accepts a bare cookie value and keeps the verified profile', async () => {
    const store = useNiconicoStore()

    await expect(store.login('user_session_1234_abc')).resolves.toBe(true)

    expect(clientMocks.getNiconicoClient).toHaveBeenCalledWith('user_session_1234_abc')
    expect(store.session).toBe('user_session_1234_abc')
    expect(store.user).toEqual({
      userId: 1234,
      nickname: 'テストユーザー',
      isPremium: false,
      iconUrl: 'https://example.test/icon.jpg',
    })
    expect(store.isLoggedIn).toBe(true)
    expect(store.errorKey).toBeNull()
  })

  it('extracts the session from a pasted cookie header', async () => {
    const store = useNiconicoStore()

    await store.login('Cookie: nicosid=1.2; user_session=user_session_1_abc; lang=ja-jp')

    expect(store.session).toBe('user_session_1_abc')
  })

  it('rejects text that carries no session cookie without calling the API', async () => {
    const store = useNiconicoStore()

    await expect(store.login('not a cookie')).resolves.toBe(false)

    expect(clientMocks.verifySession).not.toHaveBeenCalled()
    expect(store.errorKey).toBe('nico.errors.invalidSession')
    expect(store.isLoggedIn).toBe(false)
  })

  it('reports a rejected cookie and stays signed out', async () => {
    clientMocks.verifySession.mockRejectedValue(new NiconicoAuthError('rejected'))

    const store = useNiconicoStore()

    await expect(store.login('user_session_1_abc')).resolves.toBe(false)

    expect(store.session).toBeNull()
    expect(store.user).toBeNull()
    expect(store.errorKey).toBe('nico.errors.unauthorized')
    expect(clientMocks.resetNiconicoClient).toHaveBeenCalled()
  })

  it('clears the verifying flag even when verification fails', async () => {
    clientMocks.verifySession.mockRejectedValue(new Error('boom'))

    const store = useNiconicoStore()

    await store.login('user_session_1_abc')

    expect(store.isVerifying).toBe(false)
  })
})

describe('verify', () => {
  it('does nothing without a stored session', async () => {
    const store = useNiconicoStore()

    await expect(store.verify()).resolves.toBe(false)
    expect(clientMocks.verifySession).not.toHaveBeenCalled()
  })

  it('refreshes the profile of a restored session', async () => {
    const store = useNiconicoStore()
    store.session = 'user_session_1_abc'

    await expect(store.verify()).resolves.toBe(true)

    expect(store.user?.nickname).toBe('テストユーザー')
  })

  it('drops a session niconico no longer accepts', async () => {
    clientMocks.verifySession.mockRejectedValue(new NiconicoApiError('https://example.test', { status: 401 }))

    const store = useNiconicoStore()
    store.session = 'user_session_1_abc'

    await expect(store.verify()).resolves.toBe(false)

    expect(store.session).toBeNull()
    expect(store.errorKey).toBe('nico.errors.unauthorized')
  })

  it('keeps the session when verification fails for another reason', async () => {
    clientMocks.verifySession.mockRejectedValue(new Error('offline'))

    const store = useNiconicoStore()
    store.session = 'user_session_1_abc'

    await expect(store.verify()).resolves.toBe(false)

    expect(store.session).toBe('user_session_1_abc')
    expect(store.errorKey).toBe('nico.errors.unexpected')
  })
})

describe('logout', () => {
  it('clears the session, the profile and the cached client', async () => {
    const store = useNiconicoStore()
    await store.login('user_session_1_abc')

    store.logout()

    expect(store.session).toBeNull()
    expect(store.user).toBeNull()
    expect(store.errorKey).toBeNull()
    expect(store.isLoggedIn).toBe(false)
    expect(clientMocks.resetNiconicoClient).toHaveBeenCalled()
  })
})

describe('client', () => {
  it('builds a guest client until a session is stored', () => {
    const store = useNiconicoStore()

    void store.client
    expect(clientMocks.getNiconicoClient).toHaveBeenLastCalledWith(undefined)

    store.session = 'user_session_1_abc'

    void store.client
    expect(clientMocks.getNiconicoClient).toHaveBeenLastCalledWith('user_session_1_abc')
  })
})
