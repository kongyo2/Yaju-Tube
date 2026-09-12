
export const NICO_EMBED_ORIGIN = 'https://embed.nicovideo.jp'

const CONNECTOR_TYPE_PLAYER = 0
const CONNECTOR_TYPE_CONTROLLER = 1

export const NICO_PLAYER_STATUS = {
  STOPPED: 1,
  PLAYING: 2,
  PAUSED: 3,
  ENDED: 4,
} as const

export interface NicoPlaybackStatus {
  currentTimeMs: number
  durationMs: number
}

export interface NicoEmbedPlayerOptions {
  playerId?: string
  origin?: string
  hostWindow?: Window
}

interface NicoEmbedMessage {
  sourceConnectorType?: unknown
  playerId?: unknown
  eventName?: unknown
  data?: unknown
}

function readNumber(source: Record<string, unknown>, key: string): number | null {
  const value = Number(source[key])

  return Number.isFinite(value) ? value : null
}

export class NicoEmbedPlayer {
  private readonly iframe: HTMLIFrameElement
  private readonly playerId: string
  private readonly origin: string
  private readonly hostWindow: Window
  private readonly listener: (event: MessageEvent) => void
  private readonly statusListeners = new Set<(status: NicoPlaybackStatus) => void>()
  private readonly endedListeners = new Set<() => void>()
  private readonly readyListeners = new Set<() => void>()
  private playback: NicoPlaybackStatus | null = null
  private playerStatus: number = NICO_PLAYER_STATUS.STOPPED
  private metadataLoaded = false
  private destroyed = false

  constructor(iframe: HTMLIFrameElement, options: NicoEmbedPlayerOptions = {}) {
    this.iframe = iframe
    this.playerId = options.playerId ?? '1'
    this.origin = options.origin ?? NICO_EMBED_ORIGIN
    this.hostWindow = options.hostWindow ?? window
    this.listener = (event: MessageEvent) => {
      this.handleMessage(event)
    }

    this.hostWindow.addEventListener('message', this.listener)
  }

  get status(): NicoPlaybackStatus | null {
    return this.playback
  }

  get currentTimeMs(): number {
    return this.playback?.currentTimeMs ?? 0
  }

  get isPlaying(): boolean {
    return this.playerStatus === NICO_PLAYER_STATUS.PLAYING
  }

  get isReady(): boolean {
    return this.metadataLoaded
  }

  onReady(listener: () => void): () => void {
    if (this.metadataLoaded) {
      listener()
      return () => undefined
    }

    this.readyListeners.add(listener)

    return () => {
      this.readyListeners.delete(listener)
    }
  }

  onStatus(listener: (status: NicoPlaybackStatus) => void): () => void {
    this.statusListeners.add(listener)

    return () => {
      this.statusListeners.delete(listener)
    }
  }

  onEnded(listener: () => void): () => void {
    this.endedListeners.add(listener)

    return () => {
      this.endedListeners.delete(listener)
    }
  }

  play(): void {
    this.post('play')
  }

  pause(): void {
    this.post('pause')
  }

  seek(milliseconds: number): void {
    this.post('seek', { time: Math.max(0, Math.floor(milliseconds)) })
  }

  destroy(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.hostWindow.removeEventListener('message', this.listener)
    this.statusListeners.clear()
    this.endedListeners.clear()
    this.readyListeners.clear()
  }

  private post(eventName: string, data?: Record<string, unknown>): void {
    if (this.destroyed) {
      return
    }

    const target = this.iframe.contentWindow

    if (!target) {
      return
    }

    try {
      target.postMessage(
        {
          sourceConnectorType: CONNECTOR_TYPE_CONTROLLER,
          playerId: this.playerId,
          eventName,
          ...(data === undefined ? {} : { data }),
        },
        this.origin,
      )
    } catch (e) {
      console.debug('Posting to the niconico embed failed:', e)
    }
  }

  private handleMessage(event: MessageEvent): void {
    const playerWindow = this.iframe.contentWindow

    if (
      this.destroyed
      || playerWindow === null
      || event.origin !== this.origin
      || event.source !== playerWindow
    ) {
      return
    }

    const message = event.data as NicoEmbedMessage | null

    if (message === null || typeof message !== 'object') {
      return
    }

    if (message.sourceConnectorType !== CONNECTOR_TYPE_PLAYER) {
      return
    }

    if (message.playerId !== undefined && String(message.playerId) !== this.playerId) {
      return
    }

    const payload = typeof message.data === 'object' && message.data !== null
      ? (message.data as Record<string, unknown>)
      : {}

    if (message.eventName === 'playerMetadataChange') {
      this.updatePlayback(payload)
      return
    }

    if (message.eventName === 'playerStatusChange') {
      const status = readNumber(payload, 'playerStatus')

      if (status !== null) {
        this.playerStatus = status

        if (status === NICO_PLAYER_STATUS.ENDED) {
          for (const listener of this.endedListeners) {
            listener()
          }
        }
      }
    }
  }

  private updatePlayback(payload: Record<string, unknown>): void {
    if (payload['isVideoMetaDataLoaded'] === true && !this.metadataLoaded) {
      this.metadataLoaded = true

      for (const listener of [...this.readyListeners]) {
        listener()
      }

      this.readyListeners.clear()
    }

    const currentTimeMs = readNumber(payload, 'currentTime')

    if (currentTimeMs === null) {
      return
    }

    const durationMs = readNumber(payload, 'duration')

    this.playback = {
      currentTimeMs,
      durationMs: durationMs ?? this.playback?.durationMs ?? 0,
    }

    for (const listener of this.statusListeners) {
      listener(this.playback)
    }
  }
}
