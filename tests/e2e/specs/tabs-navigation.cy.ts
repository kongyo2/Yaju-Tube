import { visitApp } from '../support/commands'

describe('tabs navigation', () => {
  beforeEach(() => {
    cy.intercept('GET', 'https://810video.com/api/v1/videos*', {
      statusCode: 200,
      body: { total: 0, data: [] },
    }).as('videos')
  })

  it('redirects / to the video list tab', () => {
    visitApp('/')
    cy.location('pathname').should('eq', '/tabs/tab2')
    cy.contains('ion-title', '動画一覧').should('be.visible')
  })

  it('navigates to every tab via the tab bar', () => {
    visitApp('/tabs/tab1')

    cy.contains('ion-title', 'インスタンス一覧').should('be.visible')

    cy.get('#tab-button-tab2').click()
    cy.location('pathname').should('eq', '/tabs/tab2')
    cy.contains('ion-title', '動画一覧').should('be.visible')

    cy.get('#tab-button-tab6').click()
    cy.location('pathname').should('eq', '/tabs/tab6')
    cy.contains('ion-title', '動画をアップロード').should('be.visible')

    cy.get('#tab-button-tab4').click()
    cy.location('pathname').should('eq', '/tabs/tab4')
    cy.contains('ion-title', '視聴履歴').should('be.visible')

    cy.get('#tab-button-tab5').click()
    cy.location('pathname').should('eq', '/tabs/tab5')
    cy.contains('ion-title', 'マイリスト').should('be.visible')

    cy.get('#tab-button-tab3').click()
    cy.location('pathname').should('eq', '/tabs/tab3')
    cy.contains('ion-title', '設定').should('be.visible')

    cy.get('#tab-button-tab1').click()
    cy.location('pathname').should('eq', '/tabs/tab1')
    cy.contains('ion-title', 'インスタンス一覧').should('be.visible')
  })

  it('marks the active tab button as selected', () => {
    visitApp('/tabs/tab3')
    cy.get('#tab-button-tab3').should('have.class', 'tab-selected')
  })
})
