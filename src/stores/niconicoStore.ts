import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { extractUserSession, nicoErrorKey } from '@/api/niconico'
import { getNiconicoClient, resetNiconicoClient } from '@/api/niconicoClient'

export interface NicoUser {
  userId: number
  nickname: string
  isPremium: boolean
  iconUrl: string | null
}

export const useNiconicoStore = defineStore('niconico', () => {
  const session = ref<string | null>(null)
  const user = ref<NicoUser | null>(null)
  const errorKey = ref<string | null>(null)
  const isVerifying = ref(false)

  const isLoggedIn = computed(() => session.value !== null && user.value !== null)

  const client = computed(() => getNiconicoClient(session.value ?? undefined))

  const clearSession = () => {
    session.value = null
    user.value = null
    resetNiconicoClient()
  }

  const login = async (rawCookie: string): Promise<boolean> => {
    const extracted = extractUserSession(rawCookie)

    if (extracted === undefined) {
      errorKey.value = 'nico.errors.invalidSession'
      return false
    }

    isVerifying.value = true

    try {
      const verified = await getNiconicoClient(extracted).auth.verifySession()

      session.value = extracted
      user.value = {
        userId: verified.userId,
        nickname: verified.nickname,
        isPremium: verified.isPremium,
        iconUrl: verified.iconUrl ?? null,
      }
      errorKey.value = null

      return true
    } catch (error) {
      clearSession()
      errorKey.value = nicoErrorKey(error)

      return false
    } finally {
      isVerifying.value = false
    }
  }

  const verify = async (): Promise<boolean> => {
    if (session.value === null) {
      return false
    }

    isVerifying.value = true

    try {
      const verified = await getNiconicoClient(session.value).auth.verifySession()

      user.value = {
        userId: verified.userId,
        nickname: verified.nickname,
        isPremium: verified.isPremium,
        iconUrl: verified.iconUrl ?? null,
      }
      errorKey.value = null

      return true
    } catch (error) {
      const key = nicoErrorKey(error)

      if (key === 'nico.errors.unauthorized') {
        clearSession()
      }

      errorKey.value = key

      return false
    } finally {
      isVerifying.value = false
    }
  }

  const logout = () => {
    clearSession()
    errorKey.value = null
  }

  return {
    session,
    user,
    errorKey,
    isVerifying,
    isLoggedIn,
    client,
    login,
    verify,
    logout,
  }
}, {
  persist: {
    pick: ['session', 'user'],
  },
})
