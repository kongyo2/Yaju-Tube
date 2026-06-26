import type { AxiosRequestHeaders, AxiosResponse } from 'axios'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import API from './api'
import { useAuthStore } from './stores/auth'
import type { AuthSession } from '@/types/peertube'

async function getCapturedHeaders(url = '/videos') {
  const response = await API.get(url, {
    adapter: async (config): Promise<AxiosResponse> => ({
      config,
      data: null,
      headers: {},
      status: 200,
      statusText: 'OK',
    }),
  })

  return response.config.headers as AxiosRequestHeaders
}

function loginAs(host: string) {
  const session: AuthSession = {
    host,
    username: 'yaju',
    accessToken: 'token-123',
    refreshToken: 'refresh-1',
    tokenType: 'Bearer',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    account: { id: 1, name: 'yaju', displayName: 'Yaju' },
    channels: [],
  }
  useAuthStore().setSession(session)
}

describe('API client', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adds a bearer Authorization header when an access token is available', async () => {
    const authStore = useAuthStore()
    authStore.setToken('token-123')

    const headers = await getCapturedHeaders()

    expect(headers.Authorization).toBe('Bearer token-123')
  })

  it('does not add Authorization when no access token is available', async () => {
    const headers = await getCapturedHeaders()

    expect(headers.Authorization).toBeUndefined()
  })

  it('attaches the token to requests aimed at the authenticated host', async () => {
    loginAs('810video.com')

    const headers = await getCapturedHeaders('https://810video.com/api/v1/videos')

    expect(headers.Authorization).toBe('Bearer token-123')
  })

  it('does not leak the token to a different instance host', async () => {
    loginAs('810video.com')

    const headers = await getCapturedHeaders('https://other-instance.example/api/v1/videos')

    expect(headers.Authorization).toBeUndefined()
  })
})
