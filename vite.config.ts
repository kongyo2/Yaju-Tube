/// <reference types="vitest" />

import vue from '@vitejs/plugin-vue'
import path from 'path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig } from 'vite'
import type { Plugin, TransformResult } from 'vite'
import { configDefaults } from 'vitest/config'
import {
  NICO_PROXY_PREFIX,
  resolveNicoRedirectTarget,
  toNicoUpstreamUrl,
  toUpstreamHeaders,
} from './src/api/niconicoProxy'

const missingVendorSourcemapEntries = [
  '/node_modules/@ionic/vue/dist/index.js',
  '/node_modules/@ionic/vue-router/dist/index.js',
] as const

// Rollup/Vite hand module ids using the host OS's path separator; normalize to
// forward slashes so the path matching below behaves identically on Windows.
function toPosixPath(id: string): string {
  return id.replaceAll(path.sep, '/')
}

export function shouldSuppressMissingVendorSourcemap(id: string): boolean {
  const normalizedId = toPosixPath(id)

  return missingVendorSourcemapEntries.some((entry) => normalizedId.endsWith(entry))
}

export function stripMissingVendorSourcemap(code: string, id: string): TransformResult | null {
  if (!shouldSuppressMissingVendorSourcemap(id)) {
    return null
  }

  return {
    code: code.replace(/\r?\n?\/\/# sourceMappingURL=.*$/u, ''),
    map: {
      version: 3,
      sources: [],
      names: [],
      mappings: '',
    },
  }
}

export function suppressMissingVendorSourcemaps(): Plugin {
  return {
    name: 'suppress-missing-vendor-sourcemaps',
    enforce: 'post',
    transform: stripMissingVendorSourcemap,
  }
}

export function createNiconicoProxyMiddleware(fetchImpl: typeof fetch = fetch) {
  return async function niconicoProxy(
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> {
    const requestUrl = req.url ?? ''

    if (!requestUrl.startsWith(NICO_PROXY_PREFIX)) {
      next()
      return
    }

    const upstreamUrl = toNicoUpstreamUrl(requestUrl)

    if (upstreamUrl === null) {
      res.statusCode = 400
      res.end('Only niconico hosts can be proxied')
      return
    }

    const method = (req.method ?? 'GET').toUpperCase()
    const abort = new AbortController()
    const cancel = () => abort.abort()

    req.on('aborted', cancel)

    try {
      const body = method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(req)
      const upstream = await followNicoRedirects(fetchImpl, upstreamUrl, {
        method,
        headers: toUpstreamHeaders(req.headers),
        ...(body === undefined || body.length === 0 ? {} : { body }),
        signal: abort.signal,
      })
      const text = await upstream.text()
      const contentType = upstream.headers.get('content-type')

      res.statusCode = upstream.status

      if (contentType !== null) {
        res.setHeader('content-type', contentType)
      }

      res.end(text)
    } catch (error) {
      res.statusCode = 502
      res.end(`niconico proxy request failed: ${String(error)}`)
    } finally {
      req.off('aborted', cancel)
    }
  }
}

const NICO_PROXY_MAX_REDIRECTS = 5
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

async function followNicoRedirects(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit & { method: string },
): Promise<Response> {
  let target = url
  let request: RequestInit & { method: string } = init

  for (let redirects = 0; redirects <= NICO_PROXY_MAX_REDIRECTS; redirects += 1) {
    const response = await fetchImpl(target, { ...request, redirect: 'manual' })

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response
    }

    const location = response.headers.get('location')
    const next = location === null ? null : resolveNicoRedirectTarget(target, location)

    if (next === null) {
      throw new Error(`refused to follow a redirect to ${location ?? 'nowhere'}`)
    }

    target = next

    if (response.status !== 307 && response.status !== 308) {
      const rest = { ...request }
      delete rest.body
      request = { ...rest, method: 'GET' }
    }
  }

  throw new Error(`too many redirects from ${url}`)
}

function readRequestBody(req: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []

    req.on('data', (chunk: Uint8Array) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export function niconicoProxyPlugin(): Plugin {
  return {
    name: 'niconico-api-proxy',
    configureServer(server) {
      server.middlewares.use(createNiconicoProxyMiddleware())
    },
    configurePreviewServer(server) {
      server.middlewares.use(createNiconicoProxyMiddleware())
    },
  }
}

export function manualChunks(id: string): string | undefined {
  const normalizedId = toPosixPath(id)
  const nodeModulesIndex = normalizedId.lastIndexOf('/node_modules/')

  if (nodeModulesIndex === -1) {
    return undefined
  }

  const packagePath = normalizedId.slice(nodeModulesIndex + '/node_modules/'.length)

  if (packagePath.startsWith('@ionic/core/components/')) {
    const componentPath = packagePath.slice('@ionic/core/components/'.length)

    if (/^p-[\w-]+\.js$/.test(componentPath)) {
      return 'ionic-core'
    }

    if (/^(ion-input|ion-searchbar|ion-select|ion-segment|ion-toggle|ion-checkbox|ion-radio|ion-range|ion-textarea)/.test(componentPath)) {
      return 'ionic-forms'
    }

    if (/^(ion-alert|ion-modal|ion-popover|ion-action-sheet|ion-toast|ion-loading|ion-picker|select-modal|select-popover)/.test(componentPath)) {
      return 'ionic-overlays'
    }

    if (/^(ion-router|ion-route|ion-nav|ion-tab|ion-tabs|ion-back-button|ion-menu|ion-split-pane)/.test(componentPath)) {
      return 'ionic-navigation'
    }

    if (/^(ion-card|ion-list|ion-item|ion-label|ion-thumbnail|ion-content|ion-header|ion-footer|ion-toolbar|ion-title|ion-buttons)/.test(componentPath)) {
      return 'ionic-layout'
    }

    return 'ionic-components'
  }

  if (packagePath.startsWith('@ionic/core/dist/')) {
    return 'ionic-runtime'
  }

  if (packagePath.startsWith('@ionic/vue-router/')) {
    return 'ionic-vue-router'
  }

  if (packagePath.startsWith('@ionic/vue/')) {
    return 'ionic-vue'
  }

  if (packagePath.startsWith('ionicons/')) {
    return 'ionicons'
  }

  if (
    packagePath.startsWith('@vue/')
    || packagePath.startsWith('vue/')
    || packagePath.startsWith('vue-router/')
    || packagePath.startsWith('pinia/')
    || packagePath.startsWith('pinia-plugin-persistedstate/')
  ) {
    return 'vue-vendor'
  }

  if (packagePath.startsWith('@capacitor/')) {
    return 'capacitor'
  }

  if (
    packagePath.startsWith('axios/')
    || packagePath.startsWith('dompurify/')
    || packagePath.startsWith('jschannel/')
    || packagePath.startsWith('marked/')
  ) {
    return 'player-vendor'
  }

  if (packagePath.startsWith('@kongyo2/niconicojs/')) {
    return 'niconico-vendor'
  }

  return undefined
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    suppressMissingVendorSourcemaps(),
    niconicoProxyPlugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      exclude: [
        ...(configDefaults.coverage.exclude ?? []),
        'android/**',
        'ios/**',
        'src/types/**',
      ],
    },
  }
})
