import {
  PRIMARY_HOST,
  expectSessionItem,
  expectStored,
  makeHistoryItem,
  makeVideo,
  stubEmbed,
  stubThumbnails,
  stubVideoDetail,
} from '../support/helpers'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function seededHistory() {
  const now = Date.now()

  return [
    makeHistoryItem({ videoId: 'h-today', videoName: 'Today Video', watchedAt: now }),
    makeHistoryItem({
      videoId: 'h-yesterday',
      videoName: 'Yesterday Video',
      watchedAt: now - 26 * HOUR,
    }),
    makeHistoryItem({
      videoId: 'h-week',
      videoName: 'Week Video',
      watchedAt: now - 3 * DAY,
      progress: 60,
      duration: 120,
    }),
    makeHistoryItem({ videoId: 'h-month', videoName: 'Month Video', watchedAt: now - 10 * DAY }),
    makeHistoryItem({ videoId: 'h-old', videoName: 'Old Video', watchedAt: now - 40 * DAY }),
  ]
}

describe('tab4 watch history', () => {
  beforeEach(() => {
    stubThumbnails(PRIMARY_HOST)
  })

  it('shows the empty state and hides the clear action', () => {
    cy.visitApp('/tabs/tab4')

    cy.contains('ion-title', '視聴履歴').should('be.visible')
    cy.contains('視聴履歴はありません').should('be.visible')
    cy.get('ion-header ion-button').should('not.exist')
    cy.get('ion-item-sliding').should('not.exist')
  })

  it('groups the entries into the expected date buckets', () => {
    cy.visitApp('/tabs/tab4', { history: seededHistory() })

    cy.get('ion-list-header').should(($headers) => {
      const texts = $headers.toArray().map((element) => element.textContent?.trim())
      expect(texts).to.deep.equal(['今日', '昨日', '今週', '今月', 'それ以前'])
    })

    cy.contains('ion-item', 'Today Video').should('be.visible')
    cy.contains('ion-item', 'Yesterday Video').should('exist')
    cy.contains('ion-item', 'Week Video').should('exist')
    cy.contains('ion-item', 'Month Video').should('exist')
    cy.contains('ion-item', 'Old Video').should('exist')
  })

  it('renders only the buckets that actually hold an entry', () => {
    cy.visitApp('/tabs/tab4', {
      history: [makeHistoryItem({ videoId: 'h-only', videoName: 'Only Video' })],
    })

    cy.get('ion-list-header').should('have.length', 1)
    cy.contains('ion-list-header', '今日').should('be.visible')
    cy.contains('ion-list-header', '昨日').should('not.exist')
    cy.contains('ion-list-header', 'それ以前').should('not.exist')
  })

  it('labels recent entries with a relative timestamp', () => {
    const now = Date.now()

    cy.visitApp('/tabs/tab4', {
      history: [
        makeHistoryItem({ videoId: 'h-now', videoName: 'Just Now Video', watchedAt: now }),
        makeHistoryItem({
          videoId: 'h-minutes',
          videoName: 'Minutes Video',
          watchedAt: now - 5 * MINUTE,
        }),
        makeHistoryItem({
          videoId: 'h-hours',
          videoName: 'Hours Video',
          watchedAt: now - 3 * HOUR,
        }),
      ],
    })

    cy.contains('ion-item', 'Just Now Video').should('contain', 'たった今')
    cy.contains('ion-item', 'Minutes Video').should('contain', '5分前')
    cy.contains('ion-item', 'Hours Video').should('contain', '3時間前')
  })

  it('falls back to a calendar date for entries older than a day', () => {
    cy.visitApp('/tabs/tab4', { history: seededHistory() })

    cy.contains('ion-item', 'Week Video')
      .find('.time-ago')
      .invoke('text')
      .should('match', /\d{4}/)
  })

  it('draws the playback progress bar for a partially watched entry', () => {
    cy.visitApp('/tabs/tab4', { history: seededHistory() })

    cy.contains('ion-item', 'Week Video')
      .find('.progress-fill')
      .should('have.attr', 'style')
      .and('contain', 'width: 50%')
  })

  it('omits the progress bar when no progress was stored', () => {
    cy.visitApp('/tabs/tab4', {
      history: [makeHistoryItem({ videoId: 'h-plain', videoName: 'No Progress Video' })],
    })

    cy.contains('ion-item', 'No Progress Video').find('.progress-fill').should('not.exist')
  })

  it('builds the thumbnail url from the instance the entry was watched on', () => {
    cy.visitApp('/tabs/tab4', {
      history: [makeHistoryItem({ videoId: 'h-thumb', videoName: 'Thumb Video' })],
    })

    cy.contains('ion-item', 'Thumb Video')
      .find('img')
      .should('have.attr', 'src', `https://${PRIMARY_HOST}/static/thumbnails/vid-0001.jpg`)
  })

  it('deletes a single entry through the sliding option', () => {
    cy.visitApp('/tabs/tab4', { history: seededHistory() })

    cy.slidingOption('Today Video', '削除')

    cy.contains('ion-item', 'Today Video').should('not.exist')
    cy.contains('ion-list-header', '今日').should('not.exist')
    expectStored('history', (value) => {
      expect((value as { history: unknown[] }).history).to.have.length(4)
    })
  })

  it('keeps the history when the clear-all dialog is cancelled', () => {
    cy.visitApp('/tabs/tab4', { history: seededHistory() })

    cy.get('ion-header ion-button').click()
    cy.visibleAlert().should('contain', 'すべての視聴履歴を削除しますか？')
    cy.alertButton('キャンセル').click()

    cy.get('ion-alert').should('not.exist')
    cy.contains('ion-item', 'Today Video').should('be.visible')
    cy.get('ion-item-sliding').should('have.length', 5)
  })

  it('clears the whole history once the dialog is confirmed', () => {
    cy.visitApp('/tabs/tab4', { history: seededHistory() })

    cy.get('ion-header ion-button').click()
    cy.visibleAlert().should('be.visible')
    cy.alertButton('削除').click()

    cy.contains('視聴履歴はありません').should('be.visible')
    cy.get('ion-header ion-button').should('not.exist')
    expectStored('history', (value) => {
      expect((value as { history: unknown[] }).history).to.have.length(0)
    })
  })

  it('opens the entry on the instance it was watched on', () => {
    stubVideoDetail(makeVideo({ uuid: 'h-today', name: 'Today Video' }))
    stubEmbed()

    cy.visitApp('/tabs/tab4', { history: seededHistory() })

    cy.contains('ion-item', 'Today Video').click()

    cy.location('pathname').should('eq', '/tabs/video/h-today')
    cy.wait('@videoDetail').its('request.url').should('contain', PRIMARY_HOST)
    cy.get('iframe')
      .should('have.attr', 'src')
      .and('contain', `https://${PRIMARY_HOST}/videos/embed/h-today`)
    expectSessionItem('tempInstanceUrl', null)
  })

  it('keeps at most one hundred entries when a new video is watched', () => {
    const now = Date.now()
    const full = Array.from({ length: 105 }, (_, index) =>
      makeHistoryItem({
        videoId: `h-cap-${index}`,
        videoName: `Cap Video ${index}`,
        watchedAt: now - index * MINUTE,
      }),
    )

    stubVideoDetail(makeVideo())
    stubEmbed()

    cy.visitApp('/tabs/video/vid-0001', {
      history: full,
      session: { tempInstanceUrl: PRIMARY_HOST },
    })
    cy.wait('@videoDetail')

    expectStored('history', (value) => {
      const stored = (value as { history: { videoId: string }[] }).history
      expect(stored).to.have.length(100)
      expect(stored[0]?.videoId).to.eq('vid-0001')
    })
  })
})
