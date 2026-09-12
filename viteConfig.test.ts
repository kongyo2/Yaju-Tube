// @vitest-environment node

import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import config, {
  createNiconicoProxyMiddleware,
  manualChunks,
  shouldSuppressMissingVendorSourcemap,
  stripMissingVendorSourcemap,
} from './vite.config'

describe('vite config', () => {
  it('excludes generated native project output from coverage', () => {
    const coverageExclude = config.test?.coverage?.exclude ?? []

    expect(coverageExclude).toContain('android/**')
    expect(coverageExclude).toContain('ios/**')
    expect(coverageExclude).toContain('dist/**')
    expect(coverageExclude).toContain('src/types/**')
  })

  it('splits large vendor families into stable manual chunks', () => {
    expect(manualChunks('/repo/node_modules/@ionic/core/components/ion-input.js')).toBe('ionic-forms')
    expect(manualChunks('/repo/node_modules/@ionic/core/components/ion-modal.js')).toBe('ionic-overlays')
    expect(manualChunks('/repo/node_modules/@ionic/core/components/ion-router-outlet.js')).toBe('ionic-navigation')
    expect(manualChunks('/repo/node_modules/@ionic/core/components/ion-card.js')).toBe('ionic-layout')
    expect(manualChunks('/repo/node_modules/@ionic/core/components/ion-icon.js')).toBe('ionic-components')
    expect(manualChunks('/repo/node_modules/@ionic/core/components/index.js')).toBe('ionic-components')
    expect(manualChunks('/repo/node_modules/@ionic/core/components/p-BJoMtgfR.js')).toBe('ionic-core')
    expect(manualChunks('/repo/node_modules/@ionic/core/components/p-Csw8xuz4.js')).toBe('ionic-core')
    expect(manualChunks('/repo/node_modules/@ionic/core/components/p-DUqnmRFi.js')).toBe('ionic-core')
    expect(manualChunks('/repo/node_modules/@ionic/core/dist/index.js')).toBe('ionic-runtime')
    expect(manualChunks('/repo/node_modules/@ionic/vue/dist/index.js')).toBe('ionic-vue')
    expect(manualChunks('/repo/node_modules/@ionic/vue-router/dist/index.js')).toBe('ionic-vue-router')
    expect(manualChunks('/repo/node_modules/ionicons/icons/index.js')).toBe('ionicons')
    expect(manualChunks('/repo/node_modules/vue/dist/vue.runtime.esm-bundler.js')).toBe('vue-vendor')
    expect(manualChunks('/repo/node_modules/vue-router/dist/vue-router.mjs')).toBe('vue-vendor')
    expect(manualChunks('/repo/node_modules/pinia/dist/pinia.mjs')).toBe('vue-vendor')
    expect(manualChunks('/repo/node_modules/@capacitor/core/dist/index.js')).toBe('capacitor')
    expect(manualChunks('/repo/node_modules/marked/lib/marked.esm.js')).toBe('player-vendor')
    expect(manualChunks('/repo/node_modules/some-package/index.js')).toBeUndefined()
    expect(manualChunks('/repo/src/main.ts')).toBeUndefined()
  })

  it('suppresses sourcemaps for Ionic package entries with missing sources', () => {
    const ionicVueId = '/repo/node_modules/@ionic/vue/dist/index.js'
    const ionicRouterId = '/repo/node_modules/@ionic/vue-router/dist/index.js'
    const appId = '/repo/src/main.ts'

    expect(shouldSuppressMissingVendorSourcemap(ionicVueId)).toBe(true)
    expect(shouldSuppressMissingVendorSourcemap(ionicRouterId)).toBe(true)
    expect(shouldSuppressMissingVendorSourcemap(appId)).toBe(false)
    expect(config.plugins).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'suppress-missing-vendor-sourcemaps' }),
      ]),
    )
    expect(stripMissingVendorSourcemap('export {}\n//# sourceMappingURL=index.js.map', ionicVueId)).toEqual({
      code: 'export {}',
      map: {
        version: 3,
        sources: [],
        names: [],
        mappings: '',
      },
    })
    expect(stripMissingVendorSourcemap('export {}', appId)).toBeNull()
  })
})

interface ProxyResponseStub {
  statusCode: number
  headers: Record<string, string>
  body: string
  setHeader(name: string, value: string): void
  end(chunk?: string): void
}

function responseStub(): ProxyResponseStub {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(chunk = '') {
      this.body = chunk
    },
  }
}

function requestStub(url: string, method = 'GET', headers: Record<string, string> = {}, body?: string): IncomingMessage {
  const request = new EventEmitter() as IncomingMessage & EventEmitter

  Object.assign(request, { url, method, headers })

  if (body !== undefined) {
    queueMicrotask(() => {
      request.emit('data', Buffer.from(body))
      request.emit('end')
    })
  } else {
    queueMicrotask(() => request.emit('end'))
  }

  return request
}

describe('niconico dev proxy', () => {
  it('is installed in the dev and preview servers', () => {
    expect(config.plugins).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'niconico-api-proxy' })]),
    )
  })

  it('passes anything outside the prefix to the next middleware', async () => {
    const next = vi.fn()
    const fetchImpl = vi.fn()
    const response = responseStub()

    await createNiconicoProxyMiddleware(fetchImpl as unknown as typeof fetch)(
      requestStub('/src/main.ts'),
      response as unknown as ServerResponse,
      next,
    )

    expect(next).toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('forwards a request upstream with the restored headers', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"meta":{"status":200}}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const response = responseStub()

    await createNiconicoProxyMiddleware(fetchImpl as unknown as typeof fetch)(
      requestStub('/nicoapi/nvapi.nicovideo.jp/v1/users/me/mylists?sampleItemCount=1', 'GET', {
        host: '127.0.0.1:5173',
        origin: 'http://127.0.0.1:5173',
        'x-frontend-id': '6',
        'x-nico-fwd-cookie': 'user_session=abc',
      }),
      response as unknown as ServerResponse,
      vi.fn(),
    )

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]

    expect(url).toBe('https://nvapi.nicovideo.jp/v1/users/me/mylists?sampleItemCount=1')
    expect(init.headers).toEqual({ 'x-frontend-id': '6', cookie: 'user_session=abc' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toBe('application/json')
    expect(response.body).toBe('{"meta":{"status":200}}')
  })

  it('sends the request body along for a write', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }))
    const response = responseStub()

    await createNiconicoProxyMiddleware(fetchImpl as unknown as typeof fetch)(
      requestStub('/nicoapi/public.nvcomment.nicovideo.jp/v1/threads', 'POST', {}, '{"threadKey":"k"}'),
      response as unknown as ServerResponse,
      vi.fn(),
    )

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]

    expect(init.method).toBe('POST')
    expect(Buffer.from(init.body as Uint8Array).toString()).toBe('{"threadKey":"k"}')
  })

  it('refuses a target outside niconico', async () => {
    const fetchImpl = vi.fn()
    const response = responseStub()

    await createNiconicoProxyMiddleware(fetchImpl as unknown as typeof fetch)(
      requestStub('/nicoapi/example.com/steal'),
      response as unknown as ServerResponse,
      vi.fn(),
    )

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(response.statusCode).toBe(400)
  })

  it('reports an upstream failure as a gateway error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('upstream is down')
    })
    const response = responseStub()

    await createNiconicoProxyMiddleware(fetchImpl as unknown as typeof fetch)(
      requestStub('/nicoapi/nvapi.nicovideo.jp/v1/genres'),
      response as unknown as ServerResponse,
      vi.fn(),
    )

    expect(response.statusCode).toBe(502)
    expect(response.body).toContain('upstream is down')
  })
})
