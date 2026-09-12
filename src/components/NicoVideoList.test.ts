import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { NicoVideoCard } from '@/api/niconico'
import NicoVideoList from './NicoVideoList.vue'

const ionicStubs = {
  IonCard: { template: '<div><slot /></div>' },
  IonCardHeader: { template: '<div><slot /></div>' },
  IonCardSubtitle: { template: '<p><slot /></p>' },
  IonCardTitle: { template: '<h2><slot /></h2>' },
  IonItem: {
    name: 'IonItem',
    emits: ['click'],
    template: '<div role="button" @click="$emit(\'click\', $event)"><slot /></div>',
  },
  IonItemOption: {
    name: 'IonItemOption',
    emits: ['click'],
    template: '<button @click="$emit(\'click\', $event)"><slot /></button>',
  },
  IonItemOptions: { template: '<div><slot /></div>' },
  IonItemSliding: { template: '<div><slot /></div>' },
  IonLabel: { template: '<span><slot /></span>' },
  IonList: { template: '<div><slot /></div>' },
  IonThumbnail: { template: '<div><slot /></div>' },
}

function card(overrides: Partial<NicoVideoCard> = {}): NicoVideoCard {
  return {
    videoId: 'sm9',
    title: 'レッツゴー！陰陽師',
    thumbnailUrl: 'https://example.test/9.M',
    ownerName: '中の',
    ownerId: '4',
    viewCount: 23_070_228,
    commentCount: 5_691_606,
    mylistCount: 183_198,
    likeCount: 45_398,
    durationSeconds: 320,
    registeredAt: '2007-03-06T00:33:00+09:00',
    isChannelVideo: false,
    ...overrides,
  }
}

interface ListProps {
  items: NicoVideoCard[]
  mode?: 'list' | 'grid'
  emptyText?: string
  removeLabel?: string
}

function mountList(props: ListProps) {
  return mount(NicoVideoList, {
    props,
    global: { plugins: [i18n], stubs: ionicStubs },
  })
}

describe('NicoVideoList', () => {
  it('renders a row per video with its duration and counts', () => {
    const wrapper = mountList({ items: [card()] })

    expect(wrapper.text()).toContain('レッツゴー！陰陽師')
    expect(wrapper.text()).toContain('中の')
    expect(wrapper.text()).toContain('5:20')
    expect(wrapper.text()).toContain('23,070,228')
    expect(wrapper.get('img').attributes('src')).toBe('https://example.test/9.M')
  })

  it('emits the tapped video id', async () => {
    const wrapper = mountList({ items: [card()] })

    await wrapper.get('[role="button"]').trigger('click')

    expect(wrapper.emitted('select')).toEqual([['sm9']])
  })

  it('shows the empty message when there is nothing to list', () => {
    expect(mountList({ items: [] }).text()).toContain(i18n.global.t('nico.empty'))
    expect(mountList({ items: [], emptyText: 'とくにありません' }).text()).toContain('とくにありません')
  })

  it('offers a remove action only when the parent asks for one', async () => {
    expect(mountList({ items: [card()] }).findAll('button')).toHaveLength(0)

    const wrapper = mountList({ items: [card()], removeLabel: '削除' })
    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('remove')?.[0]?.[0]).toMatchObject({ videoId: 'sm9' })
  })

  it('renders cards in grid mode', () => {
    const wrapper = mountList({ items: [card()], mode: 'grid' })

    expect(wrapper.find('.nico-grid').exists()).toBe(true)
    expect(wrapper.find('.nico-card').exists()).toBe(true)
  })

  it('shows the placeholder when the payload carries no thumbnail', () => {
    expect(mountList({ items: [card({ thumbnailUrl: '' })] }).get('img').attributes('src')).toBe('/placeholder.png')
  })

  it('swaps a thumbnail that fails to load for the placeholder', async () => {
    const wrapper = mountList({ items: [card({ thumbnailUrl: 'https://example.test/missing.jpg' })] })

    await wrapper.get('img').trigger('error')

    expect(wrapper.get('img').attributes('src')).toBe('/placeholder.png')
    expect(wrapper.get('img').attributes('alt')).toBe(i18n.global.t('aria.thumbnailNotAvailable'))

    await wrapper.get('img').trigger('error')

    expect(wrapper.get('img').attributes('alt')).toBe(i18n.global.t('aria.thumbnailNotAvailable'))
  })
})
