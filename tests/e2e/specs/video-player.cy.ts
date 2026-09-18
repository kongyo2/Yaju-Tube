import {
  ariaButton,
  clickAriaButton,
  readLocalStorage,
  visitApp,
} from '../support/commands'

const now = Date.now()

function mockVideoDetail(host = 'e2e.example', body: object | string = 'fixture') {
  if (body === 'fixture') {
    return cy
      .intercept('GET', `https://${host}/api/v1/videos/vid-0001`, {
        statusCode: 200,
        fixture: 'video.json',
      })
      .as('videoDetail')
  }
  return cy
    .intercept('GET', `https://${host}/api/v1/videos/vid-0001`, body)
    .as('videoDetail')
}

describe('video player page', () => {
  it('loads video info, embed iframe and markdown description', () => {
    mockVideoDetail()
    visitApp('/tabs/video/vid-0001', {
      session: { tempInstanceUrl: 'e2e.example' },
    })

    cy.wait('@videoDetail')
    cy.contains('ion-title', 'First E2E Video').should('be.visible')

    cy.get('iframe')
      .should('have.attr', 'src')
      .and('contain', 'e2e.example/videos/embed/vid-0001')
      .and('contain', 'api=1')

    cy.get('.description strong').should('contain', 'Bold')
    cy.get('.description').should('contain', 'Second line')
  })

  it('adds the watched video to history', () => {
    mockVideoDetail()
    visitApp('/tabs/video/vid-0001', {
      session: { tempInstanceUrl: 'e2e.example' },
    })
    cy.wait('@videoDetail')
    cy.window().should((win) => {
      expect(win.localStorage.getItem('history')).to.not.eq(null)
    })

    readLocalStorage('history')
      .its('history.0')
      .should('deep.include', {
        videoId: 'vid-0001',
        videoName: 'First E2E Video',
        channelName: 'E2E Channel',
        instanceUrl: 'e2e.example',
      })
  })

  it('resumes from the saved position via the embed start param', () => {
    mockVideoDetail()
    visitApp('/tabs/video/vid-0001', {
      session: { tempInstanceUrl: 'e2e.example' },
      history: [
        {
          videoId: 'vid-0001',
          videoName: 'First E2E Video',
          thumbnailPath: '/t.jpg',
          channelName: 'E2E Channel',
          instanceUrl: 'e2e.example',
          watchedAt: now,
          progress: 120.7,
          duration: 600,
        },
      ],
    })
    cy.wait('@videoDetail')

    cy.get('iframe')
      .should('have.attr', 'src')
      .and('contain', 'start=120')
  })

  it('does not resume when the video is nearly finished', () => {
    mockVideoDetail()
    visitApp('/tabs/video/vid-0001', {
      session: { tempInstanceUrl: 'e2e.example' },
      history: [
        {
          videoId: 'vid-0001',
          videoName: 'First E2E Video',
          thumbnailPath: '/t.jpg',
          channelName: 'E2E Channel',
          instanceUrl: 'e2e.example',
          watchedAt: now,
          progress: 595,
          duration: 600,
        },
      ],
    })
    cy.wait('@videoDetail')

    cy.get('iframe')
      .should('have.attr', 'src')
      .and('not.contain', 'start=')
  })

  it('adds and removes the video from the playlist', () => {
    mockVideoDetail()
    visitApp('/tabs/video/vid-0001', {
      session: { tempInstanceUrl: 'e2e.example' },
    })
    cy.wait('@videoDetail')

    clickAriaButton('マイリストに追加')
    ariaButton('マイリストから削除').should('exist')

    readLocalStorage('playlist')
      .its('playlist.0')
      .should('deep.include', {
        videoId: 'vid-0001',
        videoName: 'First E2E Video',
        instanceUrl: 'e2e.example',
      })

    clickAriaButton('マイリストから削除')
    ariaButton('マイリストに追加').should('exist')
    readLocalStorage('playlist').its('playlist').should('have.length', 0)
  })

  it('toggles loop playback aria state', () => {
    mockVideoDetail()
    visitApp('/tabs/video/vid-0001', {
      session: { tempInstanceUrl: 'e2e.example' },
    })
    cy.wait('@videoDetail')

    clickAriaButton('ループ再生を有効にする')
    ariaButton('ループ再生を無効にする').should('exist')
    clickAriaButton('ループ再生を無効にする')
    ariaButton('ループ再生を有効にする').should('exist')
  })

  it('shows an error when the video request fails', () => {
    cy.intercept('GET', 'https://e2e.example/api/v1/videos/vid-0001', {
      statusCode: 404,
      body: {},
    }).as('videoDetail')

    visitApp('/tabs/video/vid-0001', {
      session: { tempInstanceUrl: 'e2e.example' },
    })
    cy.wait('@videoDetail')
    cy.contains('エラー 404: Not Found').should('be.visible')
    cy.get('iframe').should('not.exist')
  })

  it('shows a network error when the instance is unreachable', () => {
    cy.intercept('GET', 'https://e2e.example/api/v1/videos/vid-0001', {
      forceNetworkError: true,
    }).as('videoDetail')

    visitApp('/tabs/video/vid-0001', {
      session: { tempInstanceUrl: 'e2e.example' },
    })
    cy.wait('@videoDetail')
    cy.contains('ネットワークエラー: サーバーに接続できません').should(
      'be.visible',
    )
  })

  it('embeds from the temporary instance url when set', () => {
    mockVideoDetail('other.example')
    visitApp('/tabs/video/vid-0001', {
      session: { tempInstanceUrl: 'other.example' },
    })
    cy.wait('@videoDetail')

    cy.get('iframe')
      .should('have.attr', 'src')
      .and('contain', 'other.example/videos/embed/vid-0001')

    cy.window()
      .its('sessionStorage')
      .invoke('getItem', 'tempInstanceUrl')
      .should('eq', null)
  })

  it('navigates back to the video list via the back button', () => {
    mockVideoDetail()
    cy.intercept('GET', 'https://810video.com/api/v1/videos*', {
      statusCode: 200,
      body: { total: 0, data: [] },
    }).as('videos')

    visitApp('/tabs/video/vid-0001', {
      session: { tempInstanceUrl: 'e2e.example' },
    })
    cy.wait('@videoDetail')

    cy.get('ion-back-button').click()
    cy.location('pathname').should('eq', '/tabs/tab2')
  })
})
