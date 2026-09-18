import {
  clickAlertButton,
  clickSlidingDelete,
  readLocalStorage,
  readSessionStorage,
  visitApp,
} from '../support/commands'

const dayMs = 24 * 60 * 60 * 1000
const now = Date.now()

function historyItem(overrides: Record<string, unknown>) {
  return {
    videoId: 'vid',
    videoName: 'Video',
    thumbnailPath: '/t.jpg',
    channelName: 'Chan',
    instanceUrl: 'e2e.example',
    watchedAt: now,
    ...overrides,
  }
}

const seededHistory = [
  historyItem({ videoId: 'h-today', videoName: 'Today Video', watchedAt: now }),
  historyItem({
    videoId: 'h-yesterday',
    videoName: 'Yesterday Video',
    watchedAt: now - dayMs,
  }),
  historyItem({
    videoId: 'h-week',
    videoName: 'Week Video',
    watchedAt: now - 3 * dayMs,
    progress: 60,
    duration: 120,
  }),
  historyItem({
    videoId: 'h-month',
    videoName: 'Month Video',
    watchedAt: now - 10 * dayMs,
  }),
  historyItem({
    videoId: 'h-old',
    videoName: 'Old Video',
    watchedAt: now - 40 * dayMs,
  }),
]

describe('tab4 watch history', () => {
  beforeEach(() => {
    cy.intercept('GET', 'https://e2e.example/api/v1/videos/*', {
      statusCode: 200,
      fixture: 'video.json',
    }).as('videoDetail')
  })

  it('shows the empty state without history', () => {
    visitApp('/tabs/tab4')
    cy.contains('視聴履歴はありません').should('be.visible')
    cy.get('ion-header ion-button').should('not.exist')
  })

  it('groups entries into date buckets', () => {
    visitApp('/tabs/tab4', { history: seededHistory })

    cy.get('ion-list-header').then(($headers) => {
      const texts = $headers.toArray().map((el) => el.textContent?.trim())
      expect(texts).to.deep.equal(['今日', '昨日', '今週', '今月', 'それ以前'])
    })

    cy.contains('ion-item', 'Today Video').should('be.visible')
    cy.contains('ion-item', 'Yesterday Video').should('be.visible')
    cy.contains('ion-item', 'Week Video').should('be.visible')
    cy.contains('ion-item', 'Month Video').should('exist')
    cy.contains('ion-item', 'Old Video').should('exist')

    cy.get('ion-content').then(($content) =>
      ($content.get(0) as HTMLElement & {
        scrollToBottom(duration?: number): Promise<void>
      }).scrollToBottom(0),
    )
    cy.contains('ion-item', 'Old Video').should('be.visible')
    cy.contains('ion-list-header', 'それ以前').should('be.visible')
  })

  it('shows relative time and a progress bar when progress exists', () => {
    visitApp('/tabs/tab4', { history: seededHistory })

    cy.contains('ion-item', 'Today Video').contains('たった今')
    cy.contains('ion-item', 'Week Video')
      .find('.progress-fill')
      .invoke('attr', 'style')
      .should('contain', 'width: 50%')
  })

  it('removes a single entry via the sliding option', () => {
    visitApp('/tabs/tab4', { history: seededHistory })

    clickSlidingDelete('Today Video')
    cy.contains('ion-item', 'Today Video').should('not.exist')
    cy.contains('ion-list-header', '今日').should('not.exist')

    readLocalStorage('history')
      .its('history')
      .should('have.length', 4)
  })

  it('keeps entries when the clear-all alert is cancelled', () => {
    visitApp('/tabs/tab4', { history: seededHistory })

    cy.get('ion-header ion-button').click()
    cy.get('ion-alert').should('be.visible')
    clickAlertButton('キャンセル')

    cy.contains('ion-item', 'Today Video').should('be.visible')
    cy.get('ion-item-sliding').should('have.length', 5)
  })

  it('clears all entries after confirming the alert', () => {
    visitApp('/tabs/tab4', { history: seededHistory })

    cy.get('ion-header ion-button').click()
    cy.get('ion-alert').should('be.visible')
    clickAlertButton('削除')

    cy.contains('視聴履歴はありません').should('be.visible')
    readLocalStorage('history').its('history').should('have.length', 0)
  })

  it('navigates to the video page and stores the instance url', () => {
    visitApp('/tabs/tab4', { history: seededHistory })

    cy.contains('ion-item', 'Today Video').click()

    cy.location('pathname').should('eq', '/tabs/video/h-today')
    cy.wait('@videoDetail')
      .its('request.url')
      .should('contain', 'e2e.example')
    readSessionStorage('tempInstanceUrl').should('be.null')
  })
})
