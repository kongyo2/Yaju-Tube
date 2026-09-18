import {
  DEFAULT_HOST,
  PRIMARY_HOST,
  PRIMARY_INSTANCE,
  stubEmbed,
  stubVideoList,
  videoListBody,
} from '../support/helpers'

describe('tab navigation', () => {
  beforeEach(() => {
    stubVideoList(videoListBody([]), DEFAULT_HOST, 'defaultVideos')
  })

  it('redirects the root path to the video list tab', () => {
    cy.visitApp('/')

    cy.location('pathname').should('eq', '/tabs/tab2')
    cy.contains('ion-title', '動画一覧').should('be.visible')
  })

  it('redirects a bare /tabs path to the video list tab', () => {
    cy.visitApp('/tabs')

    cy.location('pathname').should('eq', '/tabs/tab2')
    cy.contains('ion-title', '動画一覧').should('be.visible')
  })

  it('reaches every tab through the tab bar', () => {
    cy.visitApp('/tabs/tab1')
    cy.contains('ion-title', 'インスタンス一覧').should('be.visible')

    cy.tabButton('tab2').click()
    cy.location('pathname').should('eq', '/tabs/tab2')
    cy.contains('ion-title', '動画一覧').should('be.visible')

    cy.tabButton('tab6').click()
    cy.location('pathname').should('eq', '/tabs/tab6')
    cy.contains('ion-title', '動画をアップロード').should('be.visible')

    cy.tabButton('tab4').click()
    cy.location('pathname').should('eq', '/tabs/tab4')
    cy.contains('ion-title', '視聴履歴').should('be.visible')

    cy.tabButton('tab5').click()
    cy.location('pathname').should('eq', '/tabs/tab5')
    cy.contains('ion-title', 'マイリスト').should('be.visible')

    cy.tabButton('tab3').click()
    cy.location('pathname').should('eq', '/tabs/tab3')
    cy.contains('ion-title', '設定').should('be.visible')

    cy.tabButton('tab1').click()
    cy.location('pathname').should('eq', '/tabs/tab1')
    cy.contains('ion-title', 'インスタンス一覧').should('be.visible')
  })

  it('marks the tab of the current page as selected', () => {
    cy.visitApp('/tabs/tab3')

    cy.tabButton('tab3').should('have.class', 'tab-selected')
    cy.tabButton('tab1').should('not.have.class', 'tab-selected')
  })

  it('serves every tab through a direct deep link', () => {
    cy.visitApp('/tabs/tab1')
    cy.contains('ion-title', 'インスタンス一覧').should('be.visible')

    cy.visitApp('/tabs/tab3')
    cy.contains('ion-title', '設定').should('be.visible')

    cy.visitApp('/tabs/tab4')
    cy.contains('ion-title', '視聴履歴').should('be.visible')

    cy.visitApp('/tabs/tab5')
    cy.contains('ion-title', 'マイリスト').should('be.visible')

    cy.visitApp('/tabs/tab6')
    cy.contains('ion-title', '動画をアップロード').should('be.visible')
  })

  it('keeps the tab bar usable while the video page is open', () => {
    cy.intercept('GET', `https://${PRIMARY_HOST}/api/v1/videos/vid-0001`, {
      statusCode: 200,
      fixture: 'video.json',
    }).as('videoDetail')
    stubEmbed()

    cy.visitApp('/tabs/video/vid-0001', {
      instances: [PRIMARY_INSTANCE],
      session: { tempInstanceUrl: PRIMARY_HOST },
    })
    cy.wait('@videoDetail')

    cy.get('ion-tab-bar').should('be.visible')
    cy.tabButton('tab2').click()
    cy.location('pathname').should('eq', '/tabs/tab2')
    cy.wait('@defaultVideos')
  })
})
