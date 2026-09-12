import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NICO_EMBED_ORIGIN, NicoEmbedPlayer } from './nicoEmbedPlayer'

const PLAYER_CONNECTOR = 0
const CONTROLLER_CONNECTOR = 1

interface Harness {
  player: NicoEmbedPlayer
  postMessage: ReturnType<typeof vi.fn>
  playerWindow: object
  emit: (eventName: string, data: unknown, overrides?: Record<string, unknown>) => void
  dispatch: (options: { origin?: string; data: unknown; source?: unknown }) => void
}

function createHarness(): Harness {
  const postMessage = vi.fn()
  const playerWindow = { postMessage }
  const iframe = { contentWindow: playerWindow } as unknown as HTMLIFrameElement
  const player = new NicoEmbedPlayer(iframe)

  const dispatch = (options: { origin?: string; data: unknown; source?: unknown }) => {
    const event = new MessageEvent('message', {
      origin: options.origin ?? NICO_EMBED_ORIGIN,
      data: options.data,
    })

    Object.defineProperty(event, 'source', {
      value: 'source' in options ? options.source : playerWindow,
    })

    window.dispatchEvent(event)
  }

  const emit = (eventName: string, data: unknown, overrides: Record<string, unknown> = {}) => {
    dispatch({
      data: { sourceConnectorType: PLAYER_CONNECTOR, playerId: '1', eventName, data, ...overrides },
    })
  }

  return { player, postMessage, playerWindow, emit, dispatch }
}

let harness: Harness

beforeEach(() => {
  harness = createHarness()
})

describe('commands', () => {
  it('addresses the player with the controller connector id', () => {
    harness.player.play()

    expect(harness.postMessage).toHaveBeenCalledWith(
      { sourceConnectorType: CONTROLLER_CONNECTOR, playerId: '1', eventName: 'play' },
      NICO_EMBED_ORIGIN,
    )
  })

  it('seeks in milliseconds and never to a negative position', () => {
    harness.player.seek(42_500.7)
    harness.player.seek(-1)

    expect(harness.postMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ eventName: 'seek', data: { time: 42_500 } }),
      NICO_EMBED_ORIGIN,
    )
    expect(harness.postMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ eventName: 'seek', data: { time: 0 } }),
      NICO_EMBED_ORIGIN,
    )
  })

  it('pauses', () => {
    harness.player.pause()

    expect(harness.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'pause' }),
      NICO_EMBED_ORIGIN,
    )
  })

  it('stays quiet once destroyed', () => {
    harness.player.destroy()
    harness.player.play()

    expect(harness.postMessage).not.toHaveBeenCalled()
  })

  it('survives an iframe that has already gone away', () => {
    const player = new NicoEmbedPlayer({ contentWindow: null } as unknown as HTMLIFrameElement)

    expect(() => player.play()).not.toThrow()

    player.destroy()
  })
})

describe('playback events', () => {
  it('tracks the reported position and duration', () => {
    const seen: number[] = []
    harness.player.onStatus((status) => seen.push(status.currentTimeMs))

    harness.emit('playerMetadataChange', { currentTime: 1500, duration: 320_000 })

    expect(harness.player.status).toEqual({ currentTimeMs: 1500, durationMs: 320_000 })
    expect(harness.player.currentTimeMs).toBe(1500)
    expect(seen).toEqual([1500])
  })

  it('keeps the last known duration when an update omits it', () => {
    harness.emit('playerMetadataChange', { currentTime: 1000, duration: 320_000 })
    harness.emit('playerMetadataChange', { currentTime: 2000 })

    expect(harness.player.status).toEqual({ currentTimeMs: 2000, durationMs: 320_000 })
  })

  it('follows the playing state and reports the end of the video', () => {
    const ended = vi.fn()
    harness.player.onEnded(ended)

    harness.emit('playerStatusChange', { playerStatus: 2 })
    expect(harness.player.isPlaying).toBe(true)

    harness.emit('playerStatusChange', { playerStatus: 4 })
    expect(harness.player.isPlaying).toBe(false)
    expect(ended).toHaveBeenCalledTimes(1)
  })

  it('fires the ready callback once metadata is loaded', () => {
    const ready = vi.fn()
    harness.player.onReady(ready)

    harness.emit('playerMetadataChange', { currentTime: 0, isVideoMetaDataLoaded: false })
    expect(ready).not.toHaveBeenCalled()
    expect(harness.player.isReady).toBe(false)

    harness.emit('playerMetadataChange', { currentTime: 0, isVideoMetaDataLoaded: true })
    harness.emit('playerMetadataChange', { currentTime: 100, isVideoMetaDataLoaded: true })

    expect(ready).toHaveBeenCalledTimes(1)
    expect(harness.player.isReady).toBe(true)
  })

  it('runs a late ready listener immediately', () => {
    harness.emit('playerMetadataChange', { currentTime: 0, isVideoMetaDataLoaded: true })

    const ready = vi.fn()
    harness.player.onReady(ready)

    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('stops listeners that were unsubscribed', () => {
    const listener = vi.fn()
    const unsubscribe = harness.player.onStatus(listener)

    unsubscribe()
    harness.emit('playerMetadataChange', { currentTime: 1000 })

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('message filtering', () => {
  it('ignores messages from another origin', () => {
    const listener = vi.fn()
    harness.player.onStatus(listener)

    harness.dispatch({
      origin: 'https://evil.test',
      data: { sourceConnectorType: PLAYER_CONNECTOR, playerId: '1', eventName: 'playerMetadataChange', data: { currentTime: 5 } },
    })

    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores an embed that is not the one it owns', () => {
    const listener = vi.fn()
    harness.player.onStatus(listener)

    harness.dispatch({
      source: { postMessage: vi.fn() },
      data: { sourceConnectorType: PLAYER_CONNECTOR, playerId: '1', eventName: 'playerMetadataChange', data: { currentTime: 5 } },
    })

    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores every message once the iframe has no window', () => {
    const player = new NicoEmbedPlayer({ contentWindow: null } as unknown as HTMLIFrameElement)
    const listener = vi.fn()
    player.onStatus(listener)

    const event = new MessageEvent('message', {
      origin: NICO_EMBED_ORIGIN,
      data: { sourceConnectorType: PLAYER_CONNECTOR, playerId: '1', eventName: 'playerMetadataChange', data: { currentTime: 5 } },
    })
    Object.defineProperty(event, 'source', { value: null })
    window.dispatchEvent(event)

    expect(listener).not.toHaveBeenCalled()
    player.destroy()
  })

  it('ignores another embed on the same page', () => {
    const listener = vi.fn()
    harness.player.onStatus(listener)

    harness.emit('playerMetadataChange', { currentTime: 5 }, { playerId: '2' })

    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores messages that did not come from the player', () => {
    const listener = vi.fn()
    harness.player.onStatus(listener)

    harness.emit('playerMetadataChange', { currentTime: 5 }, { sourceConnectorType: CONTROLLER_CONNECTOR })

    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores payloads that are not player messages', () => {
    const listener = vi.fn()
    harness.player.onStatus(listener)

    harness.dispatch({ data: null })
    harness.dispatch({ data: 'hello' })
    harness.emit('playerMetadataChange', 'not-an-object')

    expect(listener).not.toHaveBeenCalled()
  })

  it('detaches its window listener on destroy', () => {
    const listener = vi.fn()
    harness.player.onStatus(listener)

    harness.player.destroy()
    harness.emit('playerMetadataChange', { currentTime: 5 })

    expect(listener).not.toHaveBeenCalled()
  })
})
