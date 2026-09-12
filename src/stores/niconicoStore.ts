import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { extractUserSession, isSessionRejected, nicoErrorKey } from '@/api/niconico'
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
  const isVerified = ref(false)

  const isLoggedIn = computed(() => session.value !== null && user.value !== null)

  const client = computed(() => getNiconicoClient(session.value ?? undefined))

  const clearSession = () => {
    session.value = null
    user.value = null
    isVerified.value = false
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
      isVerified.value = true

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
      isVerified.value = true

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

  const ensureVerified = async (): Promise<boolean> => {
    if (session.value === null || isVerified.value || isVerifying.value) {
      return isVerified.value
    }

    return verify()
  }

  const dropRejectedSession = (error: unknown): boolean => {
    if (!isSessionRejected(error)) {
      return false
    }

    clearSession()
    errorKey.value = 'nico.errors.unauthorized'

    return true
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
    isVerified,
    isLoggedIn,
    client,
    login,
    verify,
    ensureVerified,
    dropRejectedSession,
    logout,
  }
}, {
  persist: {
    pick: ['session', 'user'],
  },
})
