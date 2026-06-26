import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { useInstanceStore } from '@/stores/instanceStore'
import type { AuthSession } from '@/types/peertube'
import Tab6Page from './Tab6Page.vue'

vi.mock('@/services/peertubeAuth', () => {
  class PeerTubeAuthError extends Error {
    code: string
    constructor(code: string) {
      super(code)
      this.code = code
    }
  }
  return {
    login: vi.fn(),
    refreshAccessToken: vi.fn(),
    revokeToken: vi.fn().mockResolvedValue(undefined),
    PeerTubeAuthError,
  }
})

vi.mock('@/services/peertubeUpload', () => {
  class UploadAbortedError extends Error {}
  return {
    initResumableUpload: vi.fn(),
    uploadResumable: vi.fn(),
    cancelResumableUpload: vi.fn().mockResolvedValue(undefined),
    UploadAbortedError,
  }
})

import {
  login,
  revokeToken,
} from '@/services/peertubeAuth'
import {
  initResumableUpload,
  uploadResumable,
} from '@/services/peertubeUpload'

const ionicStubs = {
  IonPage: { template: '<main><slot /></main>' },
  IonHeader: { template: '<header><slot /></header>' },
  IonToolbar: { template: '<div><slot /></div>' },
  IonTitle: { template: '<h1><slot /></h1>' },
  IonContent: { template: '<section><slot /></section>' },
  IonList: { template: '<div><slot /></div>' },
  IonItem: { template: '<div><slot /></div>' },
  IonLabel: { template: '<span><slot /></span>' },
  IonNote: { template: '<small><slot /></small>' },
  IonIcon: { template: '<i />' },
  IonProgressBar: {
    name: 'IonProgressBar',
    props: ['value'],
    template: '<progress :value="value" />',
  },
  IonInput: {
    name: 'IonInput',
    props: ['modelValue', 'label', 'ariaLabel', 'type', 'placeholder'],
    emits: ['update:modelValue'],
    template:
      '<input :aria-label="ariaLabel || label" :type="type || \'text\'" :value="modelValue" @input="$emit(\'update:modelValue\', ($event.target).value)" />',
  },
  IonTextarea: {
    name: 'IonTextarea',
    props: ['modelValue', 'label'],
    emits: ['update:modelValue'],
    template:
      '<textarea :aria-label="label" :value="modelValue" @input="$emit(\'update:modelValue\', ($event.target).value)" />',
  },
  IonToggle: {
    name: 'IonToggle',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', ($event.target).checked)" />',
  },
  IonSelect: {
    name: 'IonSelect',
    props: ['modelValue', 'label'],
    emits: ['update:modelValue'],
    template: '<div :aria-label="label"><slot /></div>',
  },
  IonSelectOption: { template: '<option><slot /></option>' },
  IonButton: {
    name: 'IonButton',
    props: ['ariaLabel', 'disabled'],
    emits: ['click'],
    template:
      '<button :aria-label="ariaLabel" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  },
}

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    host: '810video.com',
    username: 'yaju',
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    tokenType: 'Bearer',
    clientId: 'client-1',
    clientSecret: 'secret-1',
    account: { id: 1, name: 'yaju', displayName: 'Yaju Senpai' },
    channels: [{ id: 10, name: 'main', displayName: 'Main Channel' }],
    ...overrides,
  }
}

function mountPage() {
  const wrapper = mount(Tab6Page, {
    global: {
      plugins: [i18n],
      stubs: ionicStubs,
    },
  })
  return wrapper
}

function t(key: string) {
  return i18n.global.t(key)
}

describe('Tab6Page', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    i18n.global.locale.value = 'en'
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows the login form when logged out, prefilled with the selected instance', () => {
    const instanceStore = useInstanceStore()
    instanceStore.selectedInstanceUrl = 'my.instance'

    const wrapper = mountPage()

    expect(wrapper.text()).toContain(t('auth.loginIntro'))
    const host = wrapper.get(`[aria-label="${t('auth.host')}"]`)
    expect((host.element as HTMLInputElement).value).toBe('my.instance')
    expect(wrapper.find('[aria-label="start-upload"]').exists()).toBe(false)
  })

  it('logs in, stores the session and switches to the upload form', async () => {
    const session = makeSession()
    vi.mocked(login).mockResolvedValue(session)

    const wrapper = mountPage()

    await wrapper.get(`[aria-label="${t('auth.host')}"]`).setValue('810video.com')
    await wrapper.get(`[aria-label="${t('auth.username')}"]`).setValue('yaju')
    await wrapper.get(`[aria-label="${t('auth.password')}"]`).setValue('secret')
    await wrapper.get('[aria-label="login-submit"]').trigger('click')
    await flushPromises()

    expect(login).toHaveBeenCalledWith('810video.com', 'yaju', 'secret', undefined)

    const auth = useAuthStore()
    expect(auth.isLoggedIn).toBe(true)
    expect(auth.host).toBe('810video.com')
    expect(wrapper.text()).toContain('Yaju Senpai')
    expect(wrapper.get('[aria-label="start-upload"]')).toBeTruthy()
  })

  it('reveals the OTP field when two-factor is required', async () => {
    const { PeerTubeAuthError } = await import('@/services/peertubeAuth')
    vi.mocked(login).mockRejectedValue(new PeerTubeAuthError('missing_two_factor'))

    const wrapper = mountPage()
    await wrapper.get(`[aria-label="${t('auth.host')}"]`).setValue('810video.com')
    await wrapper.get(`[aria-label="${t('auth.username')}"]`).setValue('yaju')
    await wrapper.get(`[aria-label="${t('auth.password')}"]`).setValue('secret')
    await wrapper.get('[aria-label="login-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.find(`[aria-label="${t('auth.otp')}"]`).exists()).toBe(true)
    expect(wrapper.text()).toContain(t('auth.errors.needOtp'))
  })

  it('shows an error message for invalid credentials', async () => {
    const { PeerTubeAuthError } = await import('@/services/peertubeAuth')
    vi.mocked(login).mockRejectedValue(new PeerTubeAuthError('invalid_credentials'))

    const wrapper = mountPage()
    await wrapper.get(`[aria-label="${t('auth.host')}"]`).setValue('810video.com')
    await wrapper.get(`[aria-label="${t('auth.username')}"]`).setValue('yaju')
    await wrapper.get(`[aria-label="${t('auth.password')}"]`).setValue('nope')
    await wrapper.get('[aria-label="login-submit"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain(t('auth.errors.invalidCredentials'))
  })

  it('logs out and returns to the login form', async () => {
    const auth = useAuthStore()
    auth.setSession(makeSession())

    const wrapper = mountPage()
    expect(wrapper.get('[aria-label="start-upload"]')).toBeTruthy()

    await wrapper.get('[aria-label="logout"]').trigger('click')
    await flushPromises()

    expect(revokeToken).toHaveBeenCalledWith('810video.com', 'access-1', 'Bearer')
    expect(auth.isLoggedIn).toBe(false)
    expect(wrapper.text()).toContain(t('auth.loginIntro'))
  })

  it('uploads a selected file and shows the resulting video link', async () => {
    const auth = useAuthStore()
    auth.setSession(makeSession())
    vi.mocked(initResumableUpload).mockResolvedValue('upload-1')
    vi.mocked(uploadResumable).mockResolvedValue({ id: 99, uuid: 'new-video-uuid' })

    const wrapper = mountPage()

    const fileInput = wrapper.get('[aria-label="video-file"]')
    const file = new File([new Uint8Array(2048)], 'clip.mp4', { type: 'video/mp4' })
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      configurable: true,
    })
    await fileInput.trigger('change')

    // タイトルがファイル名から自動補完される
    expect((wrapper.get(`[aria-label="${t('upload.name')}"]`).element as HTMLInputElement).value).toBe('clip')

    await wrapper.get('[aria-label="start-upload"]').trigger('click')
    await flushPromises()

    expect(initResumableUpload).toHaveBeenCalledOnce()
    const metaArg = vi.mocked(initResumableUpload).mock.calls[0]?.[3]
    expect(metaArg).toMatchObject({ name: 'clip', channelId: 10, privacy: 1 })
    expect(uploadResumable).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain(t('upload.success'))
    expect(wrapper.html()).toContain('https://810video.com/w/new-video-uuid')
  })

  it('reports a failure when the upload throws', async () => {
    const auth = useAuthStore()
    auth.setSession(makeSession())
    vi.mocked(initResumableUpload).mockResolvedValue('upload-1')
    vi.mocked(uploadResumable).mockRejectedValue(new Error('boom'))

    const wrapper = mountPage()

    const fileInput = wrapper.get('[aria-label="video-file"]')
    const file = new File([new Uint8Array(2048)], 'clip.mp4', { type: 'video/mp4' })
    Object.defineProperty(fileInput.element, 'files', {
      value: [file],
      configurable: true,
    })
    await fileInput.trigger('change')
    await wrapper.get('[aria-label="start-upload"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain(t('upload.errors.failed'))
  })
})
