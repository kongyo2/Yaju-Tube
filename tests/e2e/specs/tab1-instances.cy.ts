import {
  PRIMARY_HOST,
  PRIMARY_INSTANCE,
  SECOND_HOST,
  SECOND_INSTANCE,
  expectStored,
  stubVideoList,
  videoListBody,
} from '../support/helpers'

const SEEDED = [PRIMARY_INSTANCE, SECOND_INSTANCE]

describe('tab1 instance list', () => {
  beforeEach(() => {
    stubVideoList(videoListBody([]), PRIMARY_HOST, 'primaryVideos')
    stubVideoList(videoListBody([]), SECOND_HOST, 'secondVideos')
  })

  it('lists every saved instance', () => {
    cy.visitApp('/tabs/tab1', { instances: SEEDED })

    cy.contains('ion-title', 'インスタンス一覧').should('be.visible')
    cy.get('ion-item-sliding').should('have.length', 2)
    cy.contains('ion-item', 'E2E Instance').should('be.visible')
    cy.contains('ion-item', 'Second Instance').should('be.visible')
  })

  it('renders nothing when no instance has been saved', () => {
    cy.visitApp('/tabs/tab1')

    cy.contains('ion-title', 'インスタンス一覧').should('be.visible')
    cy.get('ion-item-sliding').should('not.exist')
  })

  it('opens the video list of the selected instance with the default query', () => {
    cy.visitApp('/tabs/tab1', { instances: SEEDED })

    cy.contains('ion-item', 'E2E Instance').click()

    cy.location('pathname').should('eq', '/tabs/tab2')
    cy.wait('@primaryVideos').its('request.query').should('deep.include', {
      sort: '-publishedAt',
      start: '0',
      count: '20',
    })
    cy.contains('ion-title', '動画一覧').should('be.visible')
  })

  it('queries the second instance when it is the one selected', () => {
    cy.visitApp('/tabs/tab1', { instances: SEEDED })

    cy.contains('ion-item', 'Second Instance').click()

    cy.location('pathname').should('eq', '/tabs/tab2')
    cy.wait('@secondVideos').its('request.url').should('contain', SECOND_HOST)
    cy.get('@primaryVideos.all').should('have.length', 0)
  })

  it('refetches from the new host when the instance is switched', () => {
    cy.visitApp('/tabs/tab1', { instances: SEEDED })

    cy.contains('ion-item', 'E2E Instance').click()
    cy.wait('@primaryVideos')

    cy.tabButton('tab1').click()
    cy.contains('ion-item', 'Second Instance').click()

    cy.wait('@secondVideos')
    cy.get('@primaryVideos.all').should('have.length', 1)
  })

  it('restores the saved instances after a reload', () => {
    cy.visitApp('/tabs/tab1', { instances: SEEDED })
    cy.contains('ion-item', 'E2E Instance').should('be.visible')

    cy.reload()

    cy.contains('ion-title', 'インスタンス一覧').should('be.visible')
    cy.get('ion-item-sliding').should('have.length', 2)
    cy.contains('ion-item', 'Second Instance').should('be.visible')
  })

  it('deletes an instance through the sliding option and persists the removal', () => {
    cy.visitApp('/tabs/tab1', { instances: SEEDED })

    cy.slidingOption('Second Instance', '削除')

    cy.get('ion-item-sliding').should('have.length', 1)
    cy.contains('ion-item', 'Second Instance').should('not.exist')
    expectStored('instances', (value) => {
      expect(value).to.deep.equal([PRIMARY_INSTANCE])
    })
  })

  it('leaves the other instances untouched when one is deleted', () => {
    cy.visitApp('/tabs/tab1', { instances: SEEDED })

    cy.slidingOption('E2E Instance', '削除')

    cy.contains('ion-item', 'Second Instance').should('be.visible')
    expectStored('instances', (value) => {
      expect(value).to.deep.equal([SECOND_INSTANCE])
    })
  })

  it('keeps a deleted instance gone after a reload', () => {
    cy.visitApp('/tabs/tab1', { instances: SEEDED })

    cy.slidingOption('Second Instance', '削除')
    cy.get('ion-item-sliding').should('have.length', 1)

    cy.reload()

    cy.get('ion-item-sliding').should('have.length', 1)
    cy.contains('ion-item', 'Second Instance').should('not.exist')
  })
})
