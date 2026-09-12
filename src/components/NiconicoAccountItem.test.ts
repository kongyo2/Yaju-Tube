import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useNiconicoStore } from '@/stores/niconicoStore'
import NiconicoAccountItem from './NiconicoAccountItem.vue'

type AlertButton = {
  text: string
  role?: string
  handler?: (data?: Record<string, unknown>) => void
}

type AlertOptions = {
  header: string
  message?: string
  inputs?: { name: string; type: string }[]
  buttons: AlertButton[]
}

const alertMocks = vi.hoisted(() => ({
  create: vi.fn(),
  latestOptions: undefined as AlertOptions | undefined,
  present: vi.fn(),
}))

vi.mock('@ionic/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/vue')>()

  return { ...actual, alertController: { create: alertMocks.create } }
})

const clientMocks = vi.hoisted(() => ({
  verifySession: vi.fn(),
  getNiconicoClient: vi.fn(),
  resetNiconicoClient: vi.fn(),
}))

vi.mock('@/api/niconicoClient', () => ({
  getNiconicoClient: clientMocks.getNiconicoClient,
  resetNiconicoClient: clientMocks.resetNiconicoClient,
}))

const ionicStubs = {
  IonButton: {
    name: 'IonButton',
    emits: ['click'],
    template: '<button @click="$emit(\'click\', $event)"><slot /></button>',
  },
  IonItem: {
    name: 'IonItem',
    emits: ['click'],
    template: '<div role="button" @click="$emit(\'click\', $event)"><slot /></div>',
  },
  IonLabel: { template: '<span><slot /></span>' },
}

async function mountItem(setup?: (store: ReturnType<typeof useNiconicoStore>) => void) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useNiconicoStore()
  setup?.(store)

  const wrapper = mount(NiconicoAccountItem, { global: { plugins: [pinia, i18n], stubs: ionicStubs } })
  await flushPromises()

  return { store, wrapper }
}

beforeEach(() => {
  vi.clearAllMocks()
  alertMocks.latestOptions = undefined
  alertMocks.present = vi.fn().mockResolvedValue(undefined)
  alertMocks.create.mockImplementation(async (options: AlertOptions) => {
    alertMocks.latestOptions = options

    return { present: alertMocks.present }
  })
  clientMocks.getNiconicoClient.mockImplementation(() => ({
    auth: { verifySession: clientMocks.verifySession },
  }))
  clientMocks.verifySession.mockResolvedValue({
    userId: 1,
    nickname: 'テストユーザー',
    isPremium: true,
    premiumType: 'premium',
    iconUrl: null,
  })
})

describe('NiconicoAccountItem', () => {
  it('offers sign-in while signed out', async () => {
    const { wrapper } = await mountItem()

    expect(wrapper.text()).toContain(i18n.global.t('nico.account.notLoggedIn'))
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('signs in with the pasted cookie', async () => {
    const { store, wrapper } = await mountItem()

    await wrapper.get('[role="button"]').trigger('click')
    await flushPromises()

    expect(alertMocks.present).toHaveBeenCalled()
    expect(alertMocks.latestOptions?.message).toBe(i18n.global.t('nico.account.sessionHelp'))

    const confirm = alertMocks.latestOptions?.buttons.find((button) => button.role === 'confirm')
    confirm?.handler?.({ session: 'user_session_1_abc' })
    await flushPromises()

    expect(store.isLoggedIn).toBe(true)
    expect(wrapper.text()).toContain('テストユーザー')
    expect(wrapper.text()).toContain(i18n.global.t('nico.account.premium'))
  })

  it('reports a cookie it cannot read without calling niconico', async () => {
    const { store, wrapper } = await mountItem()

    await wrapper.get('[role="button"]').trigger('click')
    await flushPromises()

    alertMocks.latestOptions?.buttons.find((button) => button.role === 'confirm')?.handler?.({})
    await flushPromises()

    expect(clientMocks.verifySession).not.toHaveBeenCalled()
    expect(store.errorKey).toBe('nico.errors.invalidSession')
    expect(wrapper.text()).toContain(i18n.global.t('nico.errors.invalidSession'))
  })

  it('re-checks a restored session on mount and signs out on request', async () => {
    const { store, wrapper } = await mountItem((niconicoStore) => {
      niconicoStore.session = 'user_session_1_abc'
    })

    expect(clientMocks.verifySession).toHaveBeenCalledTimes(1)
    expect(store.isLoggedIn).toBe(true)

    await wrapper.get('button').trigger('click')

    expect(store.isLoggedIn).toBe(false)
    expect(clientMocks.resetNiconicoClient).toHaveBeenCalled()
  })

  it('does not reopen the sign-in prompt while signed in', async () => {
    const { wrapper } = await mountItem((store) => {
      store.session = 'user_session_1_abc'
    })

    await wrapper.get('[role="button"]').trigger('click')
    await flushPromises()

    expect(alertMocks.create).not.toHaveBeenCalled()
  })
})
