import {
  DEFAULT_HOST,
  PRIMARY_HOST,
  PRIMARY_INSTANCE,
  makeVideo,
  stubThumbnails,
  stubUnreachable,
  stubVideoList,
  videoListBody,
  videosUrl,
} from '../support/helpers'

interface ListCall {
  request: { query: Record<string, string> }
}

function openVideoList() {
  cy.visitApp('/tabs/tab1', { instances: [PRIMARY_INSTANCE] })
  cy.contains('ion-item', 'E2E Instance').click()
  cy.location('pathname').should('eq', '/tabs/tab2')
}

function expandControls() {
  cy.contains('ion-accordion ion-item', '検索と並び替え').click()
  cy.get('ion-searchbar').should('be.visible')
}

function stubFixtureList() {
  cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}*`, {
    statusCode: 200,
    fixture: 'videos.json',
  }).as('videos')
  stubThumbnails(PRIMARY_HOST)
}

function stubQuery(query: Record<string, string>, body: unknown, alias: string) {
  cy.intercept(
    { method: 'GET', url: `${videosUrl(PRIMARY_HOST)}*`, query },
    { statusCode: 200, body: body as object },
  ).as(alias)
}

describe('tab2 video list', () => {
  describe('rendering', () => {
    beforeEach(stubFixtureList)

    it('renders the returned videos in list mode', () => {
      openVideoList()
      cy.wait('@videos')

      cy.contains('ion-title', '動画一覧').should('be.visible')
      cy.get('ion-item.video-item').should('have.length', 3)
      cy.contains('ion-item.video-item', 'First E2E Video').should('be.visible')
      cy.contains('ion-item.video-item', 'Third E2E Video').should('exist')
    })

    it('builds thumbnail urls from the selected instance', () => {
      openVideoList()
      cy.wait('@videos')

      cy.contains('ion-item.video-item', 'First E2E Video')
        .find('img')
        .should('have.attr', 'src', `https://${PRIMARY_HOST}/static/thumbnails/vid-0001.jpg`)
    })

    it('appends the host to channels living on another instance', () => {
      openVideoList()
      cy.wait('@videos')

      cy.contains('ion-item.video-item', 'Second E2E Video').should(
        'contain',
        'Other Channel@remote.example',
      )
      cy.contains('ion-item.video-item', 'First E2E Video').should('contain', 'E2E Channel')
    })

    it('falls back to the raw channel name when displayName is missing', () => {
      openVideoList()
      cy.wait('@videos')

      cy.contains('ion-item.video-item', 'Third E2E Video').should('contain', 'raw-channel')
    })

    it('swaps in the placeholder image when a thumbnail cannot be loaded', () => {
      cy.intercept('GET', `https://${PRIMARY_HOST}/static/thumbnails/*`, {
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

    it('switches to grid mode and renders one card per video', () => {
      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.clickAria('グリッド表示に切り替え')

      cy.get('.video-grid .video-card').should('have.length', 3)
      cy.contains('.video-card ion-card-title', 'First E2E Video').should('be.visible')
      cy.get('ion-item.video-item').should('not.exist')
    })

    it('switches back from grid mode to list mode', () => {
      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.clickAria('グリッド表示に切り替え')
      cy.get('.video-grid .video-card').should('have.length', 3)

      cy.clickAria('リスト表示に切り替え')
      cy.get('ion-item.video-item').should('have.length', 3)
      cy.get('.video-grid .video-card').should('not.exist')
    })

    it('highlights only the active display-mode button', () => {
      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.ariaButton('リスト表示に切り替え')
        .parents('ion-button')
        .first()
        .should('have.class', 'ion-color-primary')
      cy.ariaButton('グリッド表示に切り替え')
        .parents('ion-button')
        .first()
        .should('have.class', 'ion-color-medium')

      cy.clickAria('グリッド表示に切り替え')

      cy.ariaButton('グリッド表示に切り替え')
        .parents('ion-button')
        .first()
        .should('have.class', 'ion-color-primary')
      cy.ariaButton('リスト表示に切り替え')
        .parents('ion-button')
        .first()
        .should('have.class', 'ion-color-medium')
    })

    it('keeps the grid display mode across an app restart', () => {
      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.clickAria('グリッド表示に切り替え')
      cy.get('.video-grid .video-card').should('have.length', 3)

      openVideoList()
      cy.wait('@videos')
      cy.get('.video-grid .video-card').should('have.length', 3)
      cy.get('ion-item.video-item').should('not.exist')
    })

    it('collapses the search and sort controls again', () => {
      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.contains('ion-accordion ion-item', '検索と並び替え').click()
      cy.get('ion-searchbar').should('not.be.visible')
    })

    it('opens the player when a list row is clicked', () => {
      cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}/vid-0001`, {
        statusCode: 200,
        fixture: 'video.json',
      }).as('videoDetail')

      openVideoList()
      cy.wait('@videos')
      cy.contains('ion-item.video-item', 'First E2E Video').click()

      cy.location('pathname').should('eq', '/tabs/video/vid-0001')
      cy.wait('@videoDetail')
    })

    it('opens the player when a grid card is clicked', () => {
      cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}/vid-0002`, {
        statusCode: 200,
        body: makeVideo({ uuid: 'vid-0002', name: 'Second E2E Video' }),
      }).as('videoDetail')

      openVideoList()
      cy.wait('@videos')
      expandControls()
      cy.clickAria('グリッド表示に切り替え')

      cy.contains('.video-card', 'Second E2E Video').click()

      cy.location('pathname').should('eq', '/tabs/video/vid-0002')
      cy.wait('@videoDetail')
    })
  })

  describe('search, sort and filter', () => {
    beforeEach(stubFixtureList)

    it('sends the typed search term as a request parameter', () => {
      stubQuery(
        { search: 'keyword' },
        videoListBody([makeVideo({ uuid: 'hit-1', name: 'Search Hit Video' })]),
        'search',
      )

      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.get('ion-searchbar').find('input').type('keyword')

      cy.wait('@search')
      cy.contains('ion-item.video-item', 'Search Hit Video').should('be.visible')
    })

    it('drops the search parameter when the search is cancelled', () => {
      stubQuery({ search: 'keyword' }, videoListBody([]), 'search')

      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.get('ion-searchbar').find('input').type('keyword')
      cy.wait('@search')

      let callsBeforeCancel = 0
      cy.get('@videos.all').then((calls) => {
        callsBeforeCancel = (calls as unknown as ListCall[]).length
      })

      cy.get('ion-searchbar .searchbar-cancel-button').click({ force: true })

      cy.get('ion-searchbar').find('input').should('have.value', '')
      cy.get('@videos.all').should((calls) => {
        const requests = calls as unknown as ListCall[]
        expect(requests.length).to.be.greaterThan(callsBeforeCancel)
        expect(requests.at(-1)?.request.query).to.not.have.property('search')
      })
    })

    it('sends the sort order picked in the sort select', () => {
      stubQuery({ sort: '-views' }, videoListBody([]), 'sortedByViews')

      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.get('ion-accordion ion-select').click()
      cy.chooseAlertOption('閲覧数順')

      cy.wait('@sortedByViews')
    })

    it('supports the remaining sort orders', () => {
      stubQuery({ sort: 'hot' }, videoListBody([]), 'sortedHot')
      stubQuery({ sort: '-likes' }, videoListBody([]), 'sortedLikes')

      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.get('ion-accordion ion-select').click()
      cy.chooseAlertOption('流行順')
      cy.wait('@sortedHot')
      cy.get('ion-alert').should('not.exist')

      cy.get('ion-accordion ion-select').click()
      cy.chooseAlertOption('いいね順')
      cy.wait('@sortedLikes')
    })

    it('requests local videos only when the local segment is chosen', () => {
      stubQuery({ isLocal: 'true' }, videoListBody([]), 'localOnly')

      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.contains('ion-segment-button', 'ローカルのみ').click()

      cy.wait('@localOnly')
      cy.contains('取得できる動画はありません。').should('be.visible')
    })

    it('returns to the unfiltered list when the all segment is chosen again', () => {
      stubQuery({ isLocal: 'true' }, videoListBody([]), 'localOnly')

      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.contains('ion-segment-button', 'ローカルのみ').click()
      cy.wait('@localOnly')

      cy.contains('ion-segment-button', '全動画').click()
      cy.wait('@videos').its('request.query').should('not.have.property', 'isLocal')
      cy.contains('ion-item.video-item', 'First E2E Video').should('be.visible')
    })

    it('keeps the search term while paging through the results', () => {
      stubQuery({ search: 'kw', start: '0' }, videoListBody([], 45), 'searchPage1')
      stubQuery({ search: 'kw', start: '20' }, videoListBody([], 45), 'searchPage2')

      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.get('ion-searchbar').find('input').type('kw')
      cy.wait('@searchPage1')

      cy.clickAria('次のページへ')
      cy.wait('@searchPage2')
    })

    it('ignores a slow response that is overtaken by a newer search', () => {
      cy.intercept(
        { method: 'GET', url: `${videosUrl(PRIMARY_HOST)}*`, query: { search: 'oldterm' } },
        {
          statusCode: 200,
          delay: 2000,
          body: videoListBody([makeVideo({ uuid: 'stale-1', name: 'Stale Search Video' })]),
        },
      ).as('staleSearch')
      stubQuery(
        { search: 'newterm' },
        videoListBody([makeVideo({ uuid: 'fresh-1', name: 'Fresh Search Video' })]),
        'freshSearch',
      )

      openVideoList()
      cy.wait('@videos')

      expandControls()
      cy.get('ion-searchbar').find('input').type('oldterm')
      cy.get('ion-searchbar').find('input').clear().type('newterm')

      cy.wait('@freshSearch')
      cy.contains('ion-item.video-item', 'Fresh Search Video').should('be.visible')

      cy.wait('@staleSearch')
      cy.contains('Stale Search Video').should('not.exist')
      cy.contains('ion-item.video-item', 'Fresh Search Video').should('be.visible')
    })
  })

  describe('pagination', () => {
    beforeEach(() => {
      cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}*`, (req) => {
        const start = Number(req.query['start'] ?? 0)
        req.reply({
          statusCode: 200,
          body: videoListBody(
            [makeVideo({ uuid: `page-${start}`, name: `Video starting at ${start}` })],
            45,
          ),
        })
      }).as('videos')
      stubThumbnails(PRIMARY_HOST)
    })

    it('walks forward and backward through the pages', () => {
      openVideoList()
      cy.wait('@videos').its('request.query').should('deep.include', { start: '0', count: '20' })

      cy.clickAria('次のページへ')
      cy.wait('@videos').its('request.query.start').should('eq', '20')
      cy.get('ion-footer ion-input input').should('have.value', '2')
      cy.contains('ion-item.video-item', 'Video starting at 20').should('be.visible')

      cy.clickAria('次のページへ')
      cy.wait('@videos').its('request.query.start').should('eq', '40')
      cy.get('ion-footer ion-input input').should('have.value', '3')

      cy.clickAria('前のページへ')
      cy.wait('@videos').its('request.query.start').should('eq', '20')
      cy.get('ion-footer ion-input input').should('have.value', '2')
    })

    it('jumps straight to a typed page number', () => {
      openVideoList()
      cy.wait('@videos')

      cy.get('ion-footer ion-input input').clear().type('3')
      cy.clickAria('指定ページへ移動')

      cy.wait('@videos').its('request.query.start').should('eq', '40')
      cy.get('ion-footer ion-input input').should('have.value', '3')
    })

    it('ignores a page number outside the available range', () => {
      openVideoList()
      cy.wait('@videos')

      cy.get('ion-footer ion-input input').clear().type('99')
      cy.clickAria('指定ページへ移動')

      cy.get('ion-footer ion-input input').should('have.value', '99')
      cy.get('@videos.all').should('have.length', 1)
    })

    it('disables the previous button on the first page and the next button on the last', () => {
      openVideoList()
      cy.wait('@videos')

      cy.ariaButton('前のページへ').should('be.disabled')
      cy.ariaButton('次のページへ').should('not.be.disabled')

      cy.get('ion-footer ion-input input').clear().type('3')
      cy.clickAria('指定ページへ移動')
      cy.wait('@videos').its('request.query.start').should('eq', '40')

      cy.ariaButton('次のページへ').should('be.disabled')
      cy.ariaButton('前のページへ').should('not.be.disabled')
    })
  })

  describe('error handling', () => {
    it('shows the empty message when the instance returns no video', () => {
      stubVideoList(videoListBody([]), PRIMARY_HOST, 'videos')

      openVideoList()
      cy.wait('@videos')

      cy.contains('取得できる動画はありません。').should('be.visible')
    })

    it('shows the http error message for a failing response', () => {
      cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}*`, {
        statusCode: 500,
        body: { error: 'boom' },
      }).as('videos')

      openVideoList()
      cy.wait('@videos')

      cy.contains('.notion', 'エラー 500: Internal Server Error').should('be.visible')
    })

    it('shows the network error message when the instance is unreachable', () => {
      stubUnreachable(`${videosUrl(PRIMARY_HOST)}*`, 'videos')

      openVideoList()
      cy.wait('@videos')

      cy.contains('.notion', 'ネットワークエラー: サーバーに接続できません').should('be.visible')
    })

    it('shows the timeout message when the instance does not answer in time', () => {
      cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}*`, {
        statusCode: 200,
        delay: 12000,
        body: videoListBody([]),
      }).as('videos')

      openVideoList()

      cy.contains('.notion', 'リクエストがタイムアウトしました', { timeout: 20000 }).should(
        'be.visible',
      )
    })

    it('recovers once a later request succeeds', () => {
      let calls = 0
      cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}*`, (req) => {
        calls += 1
        if (calls === 1) {
          req.reply({ statusCode: 500, body: {} })
        } else {
          req.reply({ statusCode: 200, fixture: 'videos.json' })
        }
      }).as('videos')
      stubThumbnails(PRIMARY_HOST)

      openVideoList()
      cy.wait('@videos')
      cy.contains('.notion', 'エラー 500').should('be.visible')

      expandControls()
      cy.get('ion-searchbar').find('input').type('x')

      cy.contains('ion-item.video-item', 'First E2E Video').should('be.visible')
      cy.contains('.notion', 'エラー 500').should('not.exist')
    })
  })

  describe('interaction with the other tabs', () => {
    it('queries the built-in default instance on a direct visit', () => {
      stubVideoList(videoListBody([]), DEFAULT_HOST, 'defaultVideos')

      cy.visitApp('/tabs/tab2', { instances: [PRIMARY_INSTANCE] })

      cy.wait('@defaultVideos').its('request.url').should('contain', DEFAULT_HOST)
      cy.contains('ion-title', '動画一覧').should('be.visible')
    })

    it('reloads the list with the page size chosen in the settings tab', () => {
      stubVideoList(videoListBody([]), PRIMARY_HOST, 'videos')

      openVideoList()
      cy.wait('@videos').its('request.query').should('deep.include', { count: '20' })

      cy.tabButton('tab3').click()
      cy.settingsItem('表示項目').find('ion-select').click()
      cy.choosePopoverOption('10')

      cy.wait('@videos').its('request.query').should('deep.include', { count: '10', start: '0' })
    })
  })
})
