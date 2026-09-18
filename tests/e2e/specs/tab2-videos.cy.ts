import {
  ariaButton,
  chooseAlertSelectOption,
  clickAriaButton,
  expandTab2Controls,
  visitApp,
} from '../support/commands'

const seedInstances = [{ name: 'E2E Instance', url: 'e2e.example' }]

function openVideoList() {
  visitApp('/tabs/tab1', { instances: seedInstances })
  cy.contains('ion-item', 'E2E Instance').click()
  cy.location('pathname').should('eq', '/tabs/tab2')
}

describe('tab2 video list', () => {
  describe('rendering', () => {
    beforeEach(() => {
      cy.intercept('GET', 'https://e2e.example/api/v1/videos*', {
        statusCode: 200,
        fixture: 'videos.json',
      }).as('videos')
      cy.intercept('GET', 'https://e2e.example/static/thumbnails/*', {
        statusCode: 200,
        body: '',
      })
    })

    it('renders videos in list mode by default', () => {
      openVideoList()
      cy.wait('@videos')

      cy.contains('ion-title', '動画一覧').should('be.visible')
      cy.contains('ion-item.video-item', 'First E2E Video').should('be.visible')
      cy.contains('ion-item.video-item', 'Third E2E Video').should('be.visible')
    })

    it('appends @host to channels on other instances', () => {
      openVideoList()
      cy.wait('@videos')

      cy.contains('ion-item.video-item', 'Second E2E Video').contains(
        'Other Channel@remote.example',
      )
      cy.contains('ion-item.video-item', 'First E2E Video').contains(
        'E2E Channel',
      )
    })

    it('switches to grid mode and renders cards', () => {
      openVideoList()
      cy.wait('@videos')

      expandTab2Controls()
      clickAriaButton('グリッド表示に切り替え')

      cy.get('.video-grid .video-card').should('have.length', 3)
      cy.contains('.video-card', 'First E2E Video').should('be.visible')
    })

    it('persists grid display mode across reloads', () => {
      openVideoList()
      cy.wait('@videos')

      expandTab2Controls()
      clickAriaButton('グリッド表示に切り替え')
      cy.get('.video-grid .video-card').should('have.length', 3)

      visitApp('/tabs/tab1', {
        instances: seedInstances,
        settings: { displayMode: 'grid' },
      })
      cy.contains('ion-item', 'E2E Instance').click()
      cy.wait('@videos')
      cy.get('.video-grid .video-card').should('have.length', 3)
    })

    it('falls back to the placeholder when a thumbnail fails to load', () => {
      cy.intercept('GET', 'https://e2e.example/static/thumbnails/*', {
        statusCode: 404,
        body: '',
      })
      openVideoList()
      cy.wait('@videos')

      cy.contains('ion-item.video-item', 'First E2E Video')
        .find('img')
        .should('have.attr', 'src', '/placeholder.png')
        .and('have.attr', 'alt', 'サムネイル画像が利用できません')
    })

    it('navigates to the video player when a video is clicked', () => {
      cy.intercept('GET', 'https://e2e.example/api/v1/videos/vid-0001', {
        statusCode: 200,
        fixture: 'video.json',
      }).as('videoDetail')

      openVideoList()
      cy.wait('@videos')
      cy.contains('ion-item.video-item', 'First E2E Video').click()

      cy.location('pathname').should('eq', '/tabs/video/vid-0001')
      cy.wait('@videoDetail')
    })
  })

  describe('search, sort, filter', () => {
    beforeEach(() => {
      cy.intercept('GET', 'https://e2e.example/api/v1/videos*', {
        statusCode: 200,
        fixture: 'videos.json',
      }).as('videos')
      cy.intercept('GET', 'https://e2e.example/static/thumbnails/*', {
        statusCode: 200,
        body: '',
      })
    })

    it('sends the search query as a request param', () => {
      cy.intercept(
        {
          method: 'GET',
          url: 'https://e2e.example/api/v1/videos*',
          query: { search: 'keyword' },
        },
        {
          statusCode: 200,
          body: {
            total: 1,
            data: [
              {
                uuid: 'hit-0001',
                name: 'Search Hit Video',
                thumbnailPath: '/static/thumbnails/hit.jpg',
                channel: {
                  name: 'chan',
                  displayName: 'Chan',
                  host: 'e2e.example',
                },
                publishedAt: '2024-02-01T00:00:00.000Z',
              },
            ],
          },
        },
      ).as('search')

      openVideoList()
      cy.wait('@videos')

      expandTab2Controls()
      cy.get('ion-searchbar').find('input').type('keyword')

      cy.wait('@search')
      cy.contains('ion-item.video-item', 'Search Hit Video').should('be.visible')
    })

    it('sends the selected sort order', () => {
      cy.intercept(
        {
          method: 'GET',
          url: 'https://e2e.example/api/v1/videos*',
          query: { sort: '-views' },
        },
        { statusCode: 200, body: { total: 0, data: [] } },
      ).as('sorted')

      openVideoList()
      cy.wait('@videos')

      expandTab2Controls()
      cy.get('ion-select').click()
      chooseAlertSelectOption('閲覧数順')

      cy.wait('@sorted')
    })

    it('sends isLocal when the local filter is selected', () => {
      cy.intercept(
        {
          method: 'GET',
          url: 'https://e2e.example/api/v1/videos*',
          query: { isLocal: 'true' },
        },
        { statusCode: 200, body: { total: 0, data: [] } },
      ).as('localOnly')

      openVideoList()
      cy.wait('@videos')

      expandTab2Controls()
      cy.contains('ion-segment-button', 'ローカルのみ').click()

      cy.wait('@localOnly')
    })

    it('returns to the unfiltered list when the all filter is reselected', () => {
      cy.intercept(
        {
          method: 'GET',
          url: 'https://e2e.example/api/v1/videos*',
          query: { isLocal: 'true' },
        },
        { statusCode: 200, body: { total: 0, data: [] } },
      ).as('localOnly')

      openVideoList()
      cy.wait('@videos')

      expandTab2Controls()
      cy.contains('ion-segment-button', 'ローカルのみ').click()
      cy.wait('@localOnly')

      cy.contains('ion-segment-button', '全動画').click()
      cy.wait('@videos')
      cy.contains('ion-item.video-item', 'First E2E Video').should('be.visible')
    })
  })

  describe('pagination', () => {
    beforeEach(() => {
      cy.intercept('GET', 'https://e2e.example/api/v1/videos*', (req) => {
        const start = Number(req.query['start'] ?? 0)
        req.reply({
          statusCode: 200,
          body: {
            total: 45,
            data: [
              {
                uuid: `page-${start}`,
                name: `Video starting at ${start}`,
                thumbnailPath: '/static/thumbnails/p.jpg',
                channel: {
                  name: 'chan',
                  displayName: 'Chan',
                  host: 'e2e.example',
                },
                publishedAt: '2024-02-01T00:00:00.000Z',
              },
            ],
          },
        })
      }).as('videos')
      cy.intercept('GET', 'https://e2e.example/static/thumbnails/*', {
        statusCode: 200,
        body: '',
      })
    })

    it('walks forward and back through pages', () => {
      openVideoList()
      cy.wait('@videos').its('request.query').should('deep.include', {
        start: '0',
        count: '20',
      })

      ariaButton('前のページへ').should('be.disabled')
      clickAriaButton('次のページへ')
      cy.wait('@videos').its('request.query.start').should('eq', '20')
      cy.get('ion-footer ion-input input').should('have.value', '2')

      clickAriaButton('次のページへ')
      cy.wait('@videos').its('request.query.start').should('eq', '40')
      cy.get('ion-footer ion-input input').should('have.value', '3')

      clickAriaButton('前のページへ')
      cy.wait('@videos').its('request.query.start').should('eq', '20')
      cy.get('ion-footer ion-input input').should('have.value', '2')
    })

    it('jumps to a typed page number', () => {
      openVideoList()
      cy.wait('@videos')

      cy.get('ion-footer ion-input input').clear().type('3')
      cy.get('ion-footer ion-button').contains('ページ').click()

      cy.wait('@videos').its('request.query.start').should('eq', '40')
      cy.get('ion-footer ion-input input').should('have.value', '3')
    })

    it('ignores out-of-range page numbers', () => {
      openVideoList()
      cy.wait('@videos')

      cy.get('ion-footer ion-input input').clear().type('99')
      cy.get('ion-footer ion-button').contains('ページ').click()

      cy.get('@videos.all').should('have.length', 1)
    })
  })

  describe('error states', () => {
    it('shows the empty message when no videos are returned', () => {
      cy.intercept('GET', 'https://e2e.example/api/v1/videos*', {
        statusCode: 200,
        body: { total: 0, data: [] },
      }).as('videos')

      openVideoList()
      cy.wait('@videos')
      cy.contains('取得できる動画はありません。').should('be.visible')
    })

    it('shows an HTTP error message on server errors', () => {
      cy.intercept('GET', 'https://e2e.example/api/v1/videos*', {
        statusCode: 500,
        body: { error: 'boom' },
      }).as('videos')

      openVideoList()
      cy.wait('@videos')
      cy.contains('エラー 500: Internal Server Error').should('be.visible')
    })

    it('shows a network error message when the server is unreachable', () => {
      cy.intercept('GET', 'https://e2e.example/api/v1/videos*', {
        forceNetworkError: true,
      }).as('videos')

      openVideoList()
      cy.wait('@videos')
      cy.contains('ネットワークエラー: サーバーに接続できません').should(
        'be.visible',
      )
    })

    it('recovers when a retry succeeds after an error', () => {
      let calls = 0
      cy.intercept('GET', 'https://e2e.example/api/v1/videos*', (req) => {
        calls += 1
        if (calls === 1) {
          req.reply({ statusCode: 500, body: {} })
        } else {
          req.reply({ statusCode: 200, fixture: 'videos.json' })
        }
      }).as('videos')
      cy.intercept('GET', 'https://e2e.example/static/thumbnails/*', {
        statusCode: 200,
        body: '',
      })

      openVideoList()
      cy.wait('@videos')
      cy.contains('エラー 500: Internal Server Error').should('be.visible')

      expandTab2Controls()
      cy.get('ion-searchbar').find('input').type('x')

      cy.wait('@videos')
      cy.contains('ion-item.video-item', 'First E2E Video').should('be.visible')
      cy.contains('エラー 500: Internal Server Error').should('not.exist')
    })
  })
})
