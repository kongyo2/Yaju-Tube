import {
  ariaButton,
  clickAlertButton,
  clickAriaButton,
  clickSlidingDelete,
  readLocalStorage,
  readSessionStorage,
  visitApp,
} from '../support/commands'

const seededPlaylist = [
  {
    videoId: 'p-0001',
    videoName: 'Saved Video One',
    thumbnailPath: '/t1.jpg',
    channelName: 'Chan One',
    instanceUrl: 'e2e.example',
    addedAt: 1700000001000,
  },
  {
    videoId: 'p-0002',
    videoName: 'Saved Video Two',
    thumbnailPath: '',
    channelName: 'Chan Two',
    instanceUrl: 'other.example',
    addedAt: 1700000000000,
  },
]

describe('tab5 playlist', () => {
  beforeEach(() => {
    cy.intercept('GET', 'https://e2e.example/api/v1/videos/*', {
      statusCode: 200,
      fixture: 'video.json',
    }).as('videoDetail')
  })

  it('shows the empty state without items', () => {
    visitApp('/tabs/tab5')
    cy.contains('マイリストはありません').should('be.visible')
    ariaButton('export-playlist').should('not.exist')
    ariaButton('clear-playlist').should('not.exist')
  })

  it('lists saved items with their instance url', () => {
    visitApp('/tabs/tab5', { playlist: seededPlaylist })

    cy.get('ion-item-sliding').should('have.length', 2)
    cy.contains('ion-item', 'Saved Video One').should('be.visible')
    cy.contains('ion-item', 'Saved Video One').contains('e2e.example')
    cy.contains('ion-item', 'Saved Video Two').should('be.visible')
  })

  it('renders a thumbnail fallback for items without a thumbnail path', () => {
    visitApp('/tabs/tab5', { playlist: seededPlaylist })

    cy.contains('ion-item', 'Saved Video Two')
      .find('.thumbnail-fallback')
      .should('exist')
  })

  it('removes a single item via the sliding option', () => {
    visitApp('/tabs/tab5', { playlist: seededPlaylist })

    clickSlidingDelete('Saved Video One')
    cy.contains('ion-item', 'Saved Video One').should('not.exist')

    readLocalStorage('playlist').its('playlist').should('have.length', 1)
  })

  it('keeps items when clear-all is cancelled', () => {
    visitApp('/tabs/tab5', { playlist: seededPlaylist })

    clickAriaButton('clear-playlist')
    cy.get('ion-alert').should('be.visible')
    clickAlertButton('キャンセル')

    cy.get('ion-item-sliding').should('have.length', 2)
  })

  it('clears all items after confirming', () => {
    visitApp('/tabs/tab5', { playlist: seededPlaylist })

    clickAriaButton('clear-playlist')
    cy.get('ion-alert').should('be.visible')
    clickAlertButton('削除')

    cy.contains('マイリストはありません').should('be.visible')
    readLocalStorage('playlist').its('playlist').should('have.length', 0)
  })

  it('opens the export dialog with the serialized playlist', () => {
    visitApp('/tabs/tab5', { playlist: seededPlaylist })

    clickAriaButton('export-playlist')
    cy.get('ion-alert').should('be.visible')
    cy.get('ion-alert').contains('マイリストをエクスポート')

    cy.get('ion-alert textarea')
      .invoke('val')
      .should('contain', '"version": 1')
      .and('contain', 'Saved Video One')
      .and('contain', '"displayMode": "list"')

    clickAlertButton('キャンセル')
  })

  it('imports a valid playlist export and applies its settings', () => {
    visitApp('/tabs/tab5')

    cy.fixture('playlist-export.json').then((payload) => {
      clickAriaButton('import-playlist')
      cy.get('ion-alert').should('be.visible')
      cy.get('ion-alert textarea').invoke(
        'val',
        JSON.stringify(payload),
      )
      cy.get('ion-alert textarea').type(' ', { force: true })
      clickAlertButton('インポート')
    })

    cy.contains('ion-item', 'Imported Video').should('be.visible')
    cy.document().its('body').should('have.attr', 'data-theme', 'dark')
    readLocalStorage('settings').its('displayMode').should('eq', 'grid')
    readLocalStorage('playlist').its('playlist').should('have.length', 1)
  })

  it('shows an error when the import payload is invalid', () => {
    visitApp('/tabs/tab5')

    clickAriaButton('import-playlist')
    cy.get('ion-alert').should('be.visible')
    cy.get('ion-alert textarea').type('this is not json', { force: true })
    clickAlertButton('インポート')

    cy.contains('マイリストを読み込めませんでした').should('be.visible')
  })

  it('navigates to the video page and stores the instance url', () => {
    visitApp('/tabs/tab5', { playlist: seededPlaylist })

    cy.contains('ion-item', 'Saved Video One').click()

    cy.location('pathname').should('eq', '/tabs/video/p-0001')
    cy.wait('@videoDetail')
      .its('request.url')
      .should('contain', 'e2e.example')
    readSessionStorage('tempInstanceUrl').should('be.null')
  })
})
