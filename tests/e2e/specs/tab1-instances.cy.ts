import {
  clickSlidingDelete,
  readLocalStorage,
  visitApp,
} from '../support/commands'

const seedInstances = [
  { name: 'E2E Instance', url: 'e2e.example' },
  { name: 'Second Instance', url: 'second.example' },
]

describe('tab1 instance list', () => {
  beforeEach(() => {
    cy.intercept('GET', 'https://e2e.example/api/v1/videos*', {
      statusCode: 200,
      body: { total: 0, data: [] },
    }).as('videos')
    cy.intercept('GET', 'https://810video.com/api/v1/videos*', {
      statusCode: 200,
      body: { total: 0, data: [] },
    }).as('defaultVideos')
  })

  it('lists every saved instance', () => {
    visitApp('/tabs/tab1', { instances: seedInstances })

    cy.contains('ion-title', 'インスタンス一覧').should('be.visible')
    cy.get('ion-item-sliding').should('have.length', 2)
    cy.contains('ion-item', 'E2E Instance').should('be.visible')
    cy.contains('ion-item', 'Second Instance').should('be.visible')
  })

  it('shows an empty list when no instances are saved', () => {
    visitApp('/tabs/tab1')
    cy.get('ion-item-sliding').should('not.exist')
  })

  it('selecting an instance navigates to the video list and queries that host', () => {
    visitApp('/tabs/tab1', { instances: seedInstances })

    cy.contains('ion-item', 'E2E Instance').click()
    cy.location('pathname').should('eq', '/tabs/tab2')
    cy.wait('@videos').its('request.query').should('deep.include', {
      sort: '-publishedAt',
      start: '0',
      count: '20',
    })
    cy.contains('ion-title', '動画一覧').should('be.visible')
  })

  it('deletes an instance via the sliding option and persists the removal', () => {
    visitApp('/tabs/tab1', { instances: seedInstances })

    clickSlidingDelete('Second Instance')

    cy.get('ion-item-sliding').should('have.length', 1)
    cy.contains('ion-item', 'Second Instance').should('not.exist')

    readLocalStorage('instances').should('deep.equal', [
      { name: 'E2E Instance', url: 'e2e.example' },
    ])
  })

  it('keeps other instances untouched when one is deleted', () => {
    visitApp('/tabs/tab1', { instances: seedInstances })

    clickSlidingDelete('E2E Instance')

    cy.contains('ion-item', 'Second Instance').should('be.visible')
    readLocalStorage('instances').should('deep.equal', [
      { name: 'Second Instance', url: 'second.example' },
    ])
  })
})
