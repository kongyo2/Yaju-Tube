import {
  DEFAULT_HOST,
  PRIMARY_HOST,
  SECOND_HOST,
  expectSessionItem,
  expectStored,
  makeHistoryItem,
  makePlaylistItem,
  makeVideo,
  stubEmbed,
  stubThumbnails,
  stubUnreachable,
  stubVideoDetail,
  stubVideoList,
  videoListBody,
  videosUrl,
} from '../support/helpers'

function openPlayer(state: Parameters<typeof cy.visitApp>[1] = {}) {
  cy.visitApp('/tabs/video/vid-0001', {
    session: { tempInstanceUrl: PRIMARY_HOST },
    ...state,
  })
}

describe('video player page', () => {
  beforeEach(() => {
    stubThumbnails(PRIMARY_HOST)
    stubEmbed(PRIMARY_HOST)
  })

  describe('loading the video', () => {
    it('renders the title, the embed player and the description', () => {
      cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}/vid-0001`, {
        statusCode: 200,
        fixture: 'video.json',
      }).as('videoDetail')

      openPlayer()
      cy.wait('@videoDetail')

      cy.contains('ion-title', 'First E2E Video').should('be.visible')
      cy.get('iframe').should(
        'have.attr',
        'src',
        `https://${PRIMARY_HOST}/videos/embed/vid-0001?api=1`,
      )
      cy.get('.description strong').should('have.text', 'Bold')
      cy.get('.description').should('contain', 'Second line')
    })

    it('shows a loading notice until the video information arrives', () => {
      cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}/vid-0001`, {
        statusCode: 200,
        delay: 1200,
        fixture: 'video.json',
      }).as('videoDetail')

      openPlayer()

      cy.contains('.notion', '動画情報を取得中...').should('be.visible')
      cy.wait('@videoDetail')
      cy.contains('ion-title', 'First E2E Video').should('be.visible')
    })

    it('shows a fallback line when the video has no description', () => {
      stubVideoDetail(makeVideo({ description: '' }))

      openPlayer()
      cy.wait('@videoDetail')

      cy.get('.description em').should('have.text', '取得できる動画はありません。')
    })

    it('strips dangerous markup out of the description', () => {
      stubVideoDetail(
        makeVideo({
          description:
            'Safe body <script>window.__e2eXss = true;</script><img src="/x" onerror="window.__e2eXss2 = true">',
        }),
      )

      openPlayer()
      cy.wait('@videoDetail')

      cy.get('.description').should('contain', 'Safe body')
      cy.get('.description script').should('not.exist')
      cy.get('.description img[onerror]').should('not.exist')
      cy.window().should((win) => {
        const globals = win as unknown as Record<string, unknown>
        expect(globals['__e2eXss']).to.eq(undefined)
        expect(globals['__e2eXss2']).to.eq(undefined)
      })
    })

    it('plays from the instance carried over by the calling page', () => {
      stubVideoDetail(makeVideo({ name: 'Remote Video' }), SECOND_HOST)
      stubEmbed(SECOND_HOST)

      cy.visitApp('/tabs/video/vid-0001', { session: { tempInstanceUrl: SECOND_HOST } })
      cy.wait('@videoDetail')

      cy.contains('ion-title', 'Remote Video').should('be.visible')
      cy.get('iframe')
        .should('have.attr', 'src')
        .and('contain', `https://${SECOND_HOST}/videos/embed/vid-0001`)
      expectSessionItem('tempInstanceUrl', null)
    })

    it('falls back to the selected instance when no override was stored', () => {
      stubVideoDetail(makeVideo(), DEFAULT_HOST)
      stubEmbed(DEFAULT_HOST)

      cy.visitApp('/tabs/video/vid-0001')
      cy.wait('@videoDetail')

      cy.get('iframe')
        .should('have.attr', 'src')
        .and('contain', `https://${DEFAULT_HOST}/videos/embed/vid-0001`)
    })

    it('returns to the video list through the back button', () => {
      stubVideoDetail(makeVideo())
      stubVideoList(videoListBody([]), DEFAULT_HOST, 'defaultVideos')

      openPlayer()
      cy.wait('@videoDetail')

      cy.get('ion-back-button').click()

      cy.location('pathname').should('eq', '/tabs/tab2')
      cy.contains('ion-title', '動画一覧').should('be.visible')
    })
  })

  describe('error handling', () => {
    it('shows the http error and no player when the video is missing', () => {
      cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}/vid-0001`, {
        statusCode: 404,
        body: {},
      }).as('videoDetail')

      openPlayer()
      cy.wait('@videoDetail')

      cy.contains('.notion', 'エラー 404: Not Found').should('be.visible')
      cy.get('iframe').should('not.exist')
    })

    it('shows the network error when the instance cannot be reached', () => {
      stubUnreachable(`${videosUrl(PRIMARY_HOST)}/vid-0001`, 'videoDetail')

      openPlayer()
      cy.wait('@videoDetail')

      cy.contains('.notion', 'ネットワークエラー: サーバーに接続できません').should('be.visible')
    })

    it('shows the timeout error when the instance does not answer in time', () => {
      cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}/vid-0001`, {
        statusCode: 200,
        delay: 12000,
        fixture: 'video.json',
      }).as('videoDetail')

      openPlayer()

      cy.contains('.notion', 'リクエストがタイムアウトしました', { timeout: 20000 }).should(
        'be.visible',
      )
    })
  })

  describe('watch history', () => {
    it('records the video that is being watched', () => {
      stubVideoDetail(makeVideo())

      openPlayer()
      cy.wait('@videoDetail')

      expectStored('history', (value) => {
        const stored = (value as { history: Record<string, unknown>[] }).history
        expect(stored[0]).to.include({
          videoId: 'vid-0001',
          videoName: 'First E2E Video',
          channelName: 'E2E Channel',
          instanceUrl: PRIMARY_HOST,
        })
      })
    })

    it('stores Unknown when the video has no channel', () => {
      stubVideoDetail(makeVideo({ channel: null }))

      openPlayer()
      cy.wait('@videoDetail')

      expectStored('history', (value) => {
        const stored = (value as { history: Record<string, unknown>[] }).history
        expect(stored[0]).to.include({ videoId: 'vid-0001', channelName: 'Unknown' })
      })
    })

    it('falls back to the preview image when there is no thumbnail', () => {
      stubVideoDetail(makeVideo({ thumbnailPath: '', previewPath: '/static/previews/only.jpg' }))

      openPlayer()
      cy.wait('@videoDetail')

      expectStored('history', (value) => {
        const stored = (value as { history: Record<string, unknown>[] }).history
        expect(stored[0]).to.include({ thumbnailPath: '/static/previews/only.jpg' })
      })
    })

    it('moves a rewatched video back to the top and keeps its progress', () => {
      stubVideoDetail(makeVideo())

      openPlayer({
        history: [
          makeHistoryItem({ videoId: 'other', videoName: 'Other Video' }),
          makeHistoryItem({ progress: 42, duration: 600 }),
        ],
      })
      cy.wait('@videoDetail')

      expectStored('history', (value) => {
        const stored = (value as { history: Record<string, unknown>[] }).history
        expect(stored).to.have.length(2)
        expect(stored[0]).to.include({ videoId: 'vid-0001', progress: 42 })
      })
    })
  })

  describe('resuming playback', () => {
    it('starts from the stored position of a partially watched video', () => {
      stubVideoDetail(makeVideo({ duration: 600 }))

      openPlayer({ history: [makeHistoryItem({ progress: 120.7, duration: 600 })] })
      cy.wait('@videoDetail')

      cy.get('iframe').should(
        'have.attr',
        'src',
        `https://${PRIMARY_HOST}/videos/embed/vid-0001?api=1&start=120`,
      )
    })

    it('starts from the beginning when the video was watched to the end', () => {
      stubVideoDetail(makeVideo({ duration: 600 }))

      openPlayer({ history: [makeHistoryItem({ progress: 595, duration: 600 })] })
      cy.wait('@videoDetail')

      cy.get('iframe').should('have.attr', 'src').and('not.contain', 'start=')
    })

    it('does not resume exactly on the end threshold', () => {
      stubVideoDetail(makeVideo({ duration: 600 }))

      openPlayer({ history: [makeHistoryItem({ progress: 590, duration: 600 })] })
      cy.wait('@videoDetail')

      cy.get('iframe').should('have.attr', 'src').and('not.contain', 'start=')
    })

    it('resumes just inside the end threshold', () => {
      stubVideoDetail(makeVideo({ duration: 600 }))

      openPlayer({ history: [makeHistoryItem({ progress: 589, duration: 600 })] })
      cy.wait('@videoDetail')

      cy.get('iframe').should('have.attr', 'src').and('contain', 'start=589')
    })

    it('does not resume a video shorter than the minimum duration', () => {
      stubVideoDetail(makeVideo({ duration: 20 }))

      openPlayer({ history: [makeHistoryItem({ progress: 10, duration: 20 })] })
      cy.wait('@videoDetail')

      cy.get('iframe').should('have.attr', 'src').and('not.contain', 'start=')
    })

    it('does not resume when nothing was watched yet', () => {
      stubVideoDetail(makeVideo({ duration: 600 }))

      openPlayer({ history: [makeHistoryItem({ progress: 0, duration: 600 })] })
      cy.wait('@videoDetail')

      cy.get('iframe').should('have.attr', 'src').and('not.contain', 'start=')
    })
  })

  describe('header actions', () => {
    it('adds the video to the playlist and removes it again', () => {
      stubVideoDetail(makeVideo())

      openPlayer()
      cy.wait('@videoDetail')

      cy.clickAria('マイリストに追加')
      cy.ariaButton('マイリストから削除').should('exist')
      expectStored('playlist', (value) => {
        const stored = (value as { playlist: Record<string, unknown>[] }).playlist
        expect(stored[0]).to.include({
          videoId: 'vid-0001',
          videoName: 'First E2E Video',
          channelName: 'E2E Channel',
          instanceUrl: PRIMARY_HOST,
        })
      })

      cy.clickAria('マイリストから削除')
      cy.ariaButton('マイリストに追加').should('exist')
      expectStored('playlist', (value) => {
        expect((value as { playlist: unknown[] }).playlist).to.have.length(0)
      })
    })

    it('shows the saved state for a video that is already in the playlist', () => {
      stubVideoDetail(makeVideo())

      openPlayer({ playlist: [makePlaylistItem()] })
      cy.wait('@videoDetail')

      cy.ariaButton('マイリストから削除').should('exist')
      cy.ariaButton('マイリストから削除')
        .parents('ion-button')
        .first()
        .should('have.attr', 'color', 'primary')
    })

    it('treats the same video on another instance as a separate entry', () => {
      stubVideoDetail(makeVideo())

      openPlayer({ playlist: [makePlaylistItem({ instanceUrl: SECOND_HOST })] })
      cy.wait('@videoDetail')

      cy.ariaButton('マイリストに追加').should('exist')
    })

    it('toggles loop playback on and off', () => {
      stubVideoDetail(makeVideo())

      openPlayer()
      cy.wait('@videoDetail')

      cy.ariaButton('ループ再生を有効にする')
        .parents('ion-button')
        .first()
        .should('have.attr', 'color', 'medium')

      cy.clickAria('ループ再生を有効にする')
      cy.ariaButton('ループ再生を無効にする')
        .parents('ion-button')
        .first()
        .should('have.attr', 'color', 'primary')

      cy.clickAria('ループ再生を無効にする')
      cy.ariaButton('ループ再生を有効にする').should('exist')
    })

    it('hides the playlist action while the video info is still missing', () => {
      cy.intercept('GET', `${videosUrl(PRIMARY_HOST)}/vid-0001`, {
        statusCode: 404,
        body: {},
      }).as('videoDetail')

      openPlayer()
      cy.wait('@videoDetail')

      cy.get('button[aria-label="マイリストに追加"]').should('not.exist')
      cy.ariaButton('ループ再生を有効にする').should('exist')
    })
  })

  describe('fullscreen', () => {
    it('hides the header while the player is fullscreen', () => {
      stubVideoDetail(makeVideo())

      openPlayer()
      cy.wait('@videoDetail')
      cy.get('ion-header').should('exist')

      cy.document().then((doc) => {
        Object.defineProperty(doc, 'fullscreenElement', {
          configurable: true,
          get: () => doc.documentElement,
        })
        doc.dispatchEvent(new Event('fullscreenchange'))
      })
      cy.get('ion-header').should('not.exist')

      cy.document().then((doc) => {
        Object.defineProperty(doc, 'fullscreenElement', {
          configurable: true,
          get: () => null,
        })
        doc.dispatchEvent(new Event('fullscreenchange'))
      })
      cy.get('ion-header').should('exist')
    })
  })
})
