import {
  CORS_HEADERS,
  PENDING_FILE,
  PRIMARY_HOST,
  PRIMARY_INSTANCE,
  apiBase,
  expectStored,
  loggedInAuth,
  makeVideo,
  pendingUploadKey,
  pendingUploadState,
  stubEmbed,
  stubLogin,
  stubThumbnails,
  stubUploadChunk,
  stubUploadInit,
  stubVideoDetail,
  stubVideoList,
  videoListBody,
} from '../support/helpers'

const RESUMABLE_URL = `${apiBase(PRIMARY_HOST)}/videos/upload-resumable`

function loginInput(index: number) {
  return cy.get('ion-content ion-list ion-input').eq(index).find('input')
}

function fillLoginForm(host = PRIMARY_HOST) {
  loginInput(0).clear().type(host)
  loginInput(1).type('e2euser')
  loginInput(2).type('s3cret')
}

function nameInput() {
  return cy.contains('ion-item', '動画タイトル').find('ion-input input')
}

function selectVideoFile(fileName = PENDING_FILE.fileName, fill = 1) {
  cy.get('input[data-testid="file-input"]').selectFile({
    contents: Cypress.Buffer.from(new Uint8Array(PENDING_FILE.fileSize).fill(fill)),
    fileName,
    mimeType: 'video/mp4',
    lastModified: PENDING_FILE.fileLastModified,
  })
}

function toBytes(body: unknown): number[] {
  if (typeof body === 'string') {
    return Array.from(body, (character) => character.charCodeAt(0))
  }
  if (ArrayBuffer.isView(body)) {
    return Array.from(new Uint8Array((body as ArrayBufferView).buffer))
  }

  return Array.from(new Uint8Array(body as ArrayBuffer))
}

function byteSummary(body: unknown) {
  const bytes = toBytes(body)

  return { length: bytes.length, distinct: [...new Set(bytes)] }
}

function stubDiscard(statusCode: number) {
  return cy
    .intercept('DELETE', `${RESUMABLE_URL}*`, { statusCode, headers: CORS_HEADERS, body: {} })
    .as('cancelUpload')
}

describe('tab6 upload', () => {
  beforeEach(() => {
    stubThumbnails(PRIMARY_HOST)
  })

  describe('signing in', () => {
    it('shows the login form when no session is stored', () => {
      cy.visitApp('/tabs/tab6')

      cy.contains('ion-title', '動画をアップロード').should('be.visible')
      cy.get('ion-content ion-list ion-input').should('have.length', 4)
      cy.ariaButton('login').should('exist')
      cy.get('button[aria-label="logout"]').should('not.exist')
    })

    it('prefills the host with the instance that is currently selected', () => {
      stubVideoList(videoListBody([]), PRIMARY_HOST, 'videos')

      cy.visitApp('/tabs/tab1', { instances: [PRIMARY_INSTANCE] })
      cy.contains('ion-item', 'E2E Instance').click()
      cy.wait('@videos')

      cy.tabButton('tab6').click()

      loginInput(0).should('have.value', PRIMARY_HOST)
    })

    it('prefills the host with the built-in default while no instance is selected', () => {
      cy.visitApp('/tabs/tab6', { instances: [PRIMARY_INSTANCE] })

      loginInput(0).should('have.value', '810video.com')
    })

    it('signs in and reveals the upload form', () => {
      stubLogin(PRIMARY_HOST)
      cy.visitApp('/tabs/tab6')

      fillLoginForm()
      cy.clickAria('login')

      cy.wait('@oauthClient')
      cy.wait('@token').then((interception) => {
        const body = new URLSearchParams(String(interception.request.body))
        expect(Object.fromEntries(body)).to.deep.equal({
          client_id: 'e2e-client-id',
          client_secret: 'e2e-client-secret',
          grant_type: 'password',
          username: 'e2euser',
          password: 's3cret',
        })
      })
      cy.wait('@me').its('request.headers').should('have.property', 'authorization', 'Bearer e2e-access-token')

      cy.contains('.logged-in-as', 'e2euser としてログイン中').should('be.visible')
      cy.get('input[data-testid="file-input"]').should('exist')
      cy.ariaButton('start-upload').should('exist')
      expectStored('auth', (value) => {
        expect(value).to.include({ accessToken: 'e2e-access-token', host: PRIMARY_HOST })
      })
    })

    it('sends the two-factor code as a header when one is entered', () => {
      stubLogin(PRIMARY_HOST)
      cy.visitApp('/tabs/tab6')

      fillLoginForm()
      loginInput(3).type('123456')
      cy.clickAria('login')

      cy.wait('@token')
        .its('request.headers')
        .should('have.property', 'x-peertube-otp', '123456')
      cy.contains('.logged-in-as', 'e2euser としてログイン中').should('be.visible')
    })

    it('normalizes a host entered with a scheme and a trailing slash', () => {
      stubLogin(PRIMARY_HOST)
      cy.visitApp('/tabs/tab6')

      loginInput(0).clear().type(`https://${PRIMARY_HOST}/`)
      loginInput(1).type('e2euser')
      loginInput(2).type('s3cret')
      cy.clickAria('login')

      cy.wait('@me')
      expectStored('auth', (value) => {
        expect(value).to.include({ host: PRIMARY_HOST })
      })
    })

    it('reports wrong credentials', () => {
      stubLogin(PRIMARY_HOST, { statusCode: 400, body: { error: 'invalid_grant' } })
      cy.visitApp('/tabs/tab6')

      fillLoginForm()
      cy.clickAria('login')

      cy.wait('@token')
      cy.contains('.login-error', 'ユーザー名またはパスワードが正しくありません').should(
        'be.visible',
      )
      cy.ariaButton('login').should('exist')
    })

    it('asks for the two-factor code when the instance requires it', () => {
      stubLogin(PRIMARY_HOST, { statusCode: 400, body: { code: 'missing_two_factor' } })
      cy.visitApp('/tabs/tab6')

      fillLoginForm()
      cy.clickAria('login')

      cy.wait('@token')
      cy.contains('.login-error', '二段階認証コードが必要です').should('be.visible')
    })

    it('reports an incorrect two-factor code', () => {
      stubLogin(PRIMARY_HOST, { statusCode: 400, body: { code: 'invalid_two_factor' } })
      cy.visitApp('/tabs/tab6')

      fillLoginForm()
      loginInput(3).type('000000')
      cy.clickAria('login')

      cy.wait('@token')
      cy.contains('.login-error', '二段階認証コードが正しくありません').should('be.visible')
    })

    it('reports a network failure while signing in', () => {
      cy.intercept('GET', `${apiBase(PRIMARY_HOST)}/oauth-clients/local`, {
        statusCode: 200,
        headers: { 'access-control-allow-origin': 'https://blocked.invalid' },
        body: {},
      }).as('oauthClient')
      cy.visitApp('/tabs/tab6')

      fillLoginForm()
      cy.clickAria('login')

      cy.wait('@oauthClient')
      cy.contains('.login-error', 'ネットワークエラー: サーバーに接続できません').should(
        'be.visible',
      )
    })

    it('disables the login button while the request is in flight', () => {
      stubLogin(PRIMARY_HOST, { delay: 1500 })
      cy.visitApp('/tabs/tab6')

      fillLoginForm()
      cy.clickAria('login')

      cy.ariaButton('login').should('be.disabled')
      cy.wait('@token')
      cy.contains('.logged-in-as', 'e2euser としてログイン中').should('be.visible')
    })

    it('restores a persisted session after a reload', () => {
      cy.visitApp('/tabs/tab6', { auth: loggedInAuth() })
      cy.contains('.logged-in-as', 'e2euser としてログイン中').should('be.visible')

      cy.reload()

      cy.contains('.logged-in-as', 'e2euser としてログイン中').should('be.visible')
      cy.ariaButton('start-upload').should('exist')
    })

    it('signs out and returns to the login form', () => {
      cy.visitApp('/tabs/tab6', { auth: loggedInAuth() })

      cy.clickAria('logout')

      cy.ariaButton('login').should('exist')
      cy.contains('e2euser としてログイン中').should('not.exist')
      expectStored('auth', (value) => {
        expect(value).to.include({ accessToken: null, host: null })
      })
    })
  })

  describe('form validation', () => {
    beforeEach(() => {
      cy.visitApp('/tabs/tab6', { auth: loggedInAuth() })
    })

    it('requires a file to be chosen', () => {
      cy.clickAria('start-upload')

      cy.contains('.upload-error', '先にファイルを選択してください').should('be.visible')
    })

    it('fills the title from the chosen file name', () => {
      selectVideoFile('my-movie.mp4')

      nameInput().should('have.value', 'my-movie')
    })

    it('requires a title', () => {
      selectVideoFile()
      nameInput().clear()
      cy.clickAria('start-upload')

      cy.contains('.upload-error', '動画タイトルを入力してください').should('be.visible')
    })

    it('rejects a title shorter than three characters', () => {
      selectVideoFile()
      nameInput().clear().type('ab')
      cy.clickAria('start-upload')

      cy.contains('.upload-error', '動画タイトルは3〜120文字で入力してください').should('be.visible')
    })

    it('rejects a title longer than one hundred and twenty characters', () => {
      selectVideoFile()
      nameInput().clear().type('a'.repeat(121), { delay: 0 })
      cy.clickAria('start-upload')

      cy.contains('.upload-error', '動画タイトルは3〜120文字で入力してください').should('be.visible')
    })

    it('rejects a description shorter than three characters', () => {
      selectVideoFile()
      cy.get('ion-textarea textarea').type('ab')
      cy.clickAria('start-upload')

      cy.contains('.upload-error', '説明は3〜10000文字で入力してください').should('be.visible')
    })

    it('blocks the upload when the account owns no channel', () => {
      cy.visitApp('/tabs/tab6', { auth: loggedInAuth({ channels: [] }) })

      cy.contains('利用可能なチャンネルがありません').should('be.visible')
      cy.ariaButton('start-upload').should('be.disabled')
    })
  })

  describe('uploading', () => {
    beforeEach(() => {
      cy.visitApp('/tabs/tab6', { auth: loggedInAuth() })
    })

    it('uploads the chosen file and offers to watch it', () => {
      stubUploadInit(PRIMARY_HOST)
      stubUploadChunk(PRIMARY_HOST, 'uploaded-uuid')
      stubVideoDetail(makeVideo({ uuid: 'uploaded-uuid', name: 'clip' }))
      stubEmbed(PRIMARY_HOST)

      selectVideoFile()
      cy.clickAria('start-upload')

      cy.wait('@uploadInit')
        .its('request.headers')
        .should('have.property', 'authorization', 'Bearer e2e-access-token')
      cy.wait('@uploadChunk').then((interception) => {
        expect(interception.request.headers['content-range']).to.eq(
          `bytes 0-${PENDING_FILE.fileSize - 1}/${PENDING_FILE.fileSize}`,
        )
        expect(byteSummary(interception.request.body)).to.deep.equal({
          length: PENDING_FILE.fileSize,
          distinct: [1],
        })
      })

      cy.contains('.upload-success', 'アップロードが完了しました').should('be.visible')

      cy.clickAria('view-video')
      cy.location('pathname').should('eq', '/tabs/video/uploaded-uuid')
      cy.wait('@videoDetail')
    })

    it('sends the entered metadata to the init request', () => {
      stubUploadInit(PRIMARY_HOST)
      stubUploadChunk(PRIMARY_HOST, 'uploaded-uuid')

      selectVideoFile()
      nameInput().clear().type('Named Upload')
      cy.get('ion-textarea textarea').type('a valid description')
      cy.clickAria('start-upload')

      cy.wait('@uploadInit')
        .its('request.body')
        .should('deep.include', {
          filename: PENDING_FILE.fileName,
          name: 'Named Upload',
          channelId: 7,
          privacy: 1,
          description: 'a valid description',
        })
      cy.contains('.upload-success', 'アップロードが完了しました').should('be.visible')
    })

    it('leaves the description out of the init request when it is blank', () => {
      stubUploadInit(PRIMARY_HOST)
      stubUploadChunk(PRIMARY_HOST, 'uploaded-uuid')

      selectVideoFile()
      cy.clickAria('start-upload')

      cy.wait('@uploadInit').its('request.body').should('not.have.property', 'description')
      cy.contains('.upload-success', 'アップロードが完了しました').should('be.visible')
    })

    it('uploads to the channel picked in the select', () => {
      cy.visitApp('/tabs/tab6', {
        auth: loggedInAuth({
          channels: [
            { id: 7, name: 'e2e-channel', displayName: 'E2E Channel' },
            { id: 9, name: 'second-channel', displayName: 'Second Channel' },
          ],
        }),
      })
      stubUploadInit(PRIMARY_HOST)
      stubUploadChunk(PRIMARY_HOST, 'uploaded-uuid')

      cy.contains('ion-item', 'チャンネルを選択').find('ion-select').click()
      cy.chooseAlertOption('Second Channel')

      selectVideoFile()
      cy.clickAria('start-upload')

      cy.wait('@uploadInit').its('request.body').should('deep.include', { channelId: 9 })
    })

    it('uploads a private video and hides the watch button', () => {
      stubUploadInit(PRIMARY_HOST)
      stubUploadChunk(PRIMARY_HOST, 'private-uuid')

      cy.contains('ion-item', '公開設定').find('ion-select').click()
      cy.chooseAlertOption('非公開')

      selectVideoFile()
      cy.clickAria('start-upload')

      cy.wait('@uploadInit').its('request.body').should('deep.include', { privacy: 3 })
      cy.contains('.upload-success', 'アップロードが完了しました').should('be.visible')
      cy.get('button[aria-label="view-video"]').should('not.exist')
    })

    it('uploads an unlisted video and still offers the watch button', () => {
      stubUploadInit(PRIMARY_HOST)
      stubUploadChunk(PRIMARY_HOST, 'unlisted-uuid')

      cy.contains('ion-item', '公開設定').find('ion-select').click()
      cy.chooseAlertOption('限定公開')

      selectVideoFile()
      cy.clickAria('start-upload')

      cy.wait('@uploadInit').its('request.body').should('deep.include', { privacy: 2 })
      cy.contains('.upload-success', 'アップロードが完了しました').should('be.visible')
      cy.ariaButton('view-video').should('exist')
    })

    it('shows the progress bar and blocks a second start while uploading', () => {
      stubUploadInit(PRIMARY_HOST)
      cy.intercept('PUT', `${RESUMABLE_URL}*`, {
        statusCode: 200,
        delay: 1500,
        headers: CORS_HEADERS,
        body: { video: { uuid: 'slow-uuid' } },
      }).as('uploadChunk')

      selectVideoFile()
      cy.clickAria('start-upload')

      cy.get('ion-progress-bar').should('exist')
      cy.ariaButton('start-upload').should('be.disabled')
      cy.ariaButton('cancel-upload').should('exist')

      cy.wait('@uploadChunk')
      cy.contains('.upload-success', 'アップロードが完了しました').should('be.visible')
      cy.get('ion-progress-bar').should('not.exist')
    })

    it('reports a failure when the init request is rejected', () => {
      cy.intercept('POST', RESUMABLE_URL, {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: {},
      }).as('uploadInit')

      selectVideoFile()
      cy.clickAria('start-upload')

      cy.wait('@uploadInit')
      cy.contains('.upload-error', 'アップロードに失敗しました').should('be.visible')
    })

    it('keeps a resumable record when a chunk fails midway', () => {
      stubUploadInit(PRIMARY_HOST)
      cy.intercept('PUT', `${RESUMABLE_URL}*`, {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: {},
      }).as('uploadChunk')

      selectVideoFile()
      cy.clickAria('start-upload')

      cy.wait('@uploadChunk')
      cy.contains('.upload-error', 'アップロードに失敗しました').should('exist')
      cy.contains('.resume-banner', '中断されたアップロード').should('be.visible')
      expectStored('upload', (value) => {
        const pending = (value as { pending: Record<string, unknown> }).pending
        expect(pending).to.have.property(pendingUploadKey(PRIMARY_HOST, 'e2euser'))
      })
    })

    it('cancels an upload in flight and deletes the server-side session', () => {
      stubUploadInit(PRIMARY_HOST)
      cy.intercept('PUT', `${RESUMABLE_URL}*`, {
        statusCode: 200,
        delay: 20000,
        headers: CORS_HEADERS,
        body: { video: { uuid: 'never-uuid' } },
      })
      stubDiscard(204)

      selectVideoFile()
      cy.clickAria('start-upload')
      cy.wait('@uploadInit')

      cy.clickAria('cancel-upload')

      cy.wait('@cancelUpload').its('request.url').should('contain', 'upload_id=up-1')
      cy.contains('.upload-error', 'アップロードに失敗しました').should('exist')
      cy.get('ion-progress-bar').should('not.exist')
      cy.get('.upload-success').should('not.exist')
      expectStored('upload', (value) => {
        expect((value as { pending: Record<string, unknown> }).pending).to.deep.equal({})
      })
      cy.get('.resume-banner').should('not.exist')
    })

    it('keeps the stored offset of the chunks that made it through', () => {
      const chunkSize = 1024 * 1024
      const fileSize = chunkSize + 512 * 1024
      const ranges: string[] = []

      stubUploadInit(PRIMARY_HOST)
      cy.intercept('PUT', `${RESUMABLE_URL}*`, (req) => {
        const range = String(req.headers['content-range'] ?? '')
        ranges.push(range)

        if (ranges.length === 1) {
          req.reply({
            statusCode: 308,
            headers: { ...CORS_HEADERS, range: `bytes=0-${chunkSize - 1}` },
            body: {},
          })
        } else {
          req.reply({ statusCode: 500, headers: CORS_HEADERS, body: {} })
        }
      }).as('uploadChunk')

      cy.get('input[data-testid="file-input"]').selectFile({
        contents: Cypress.Buffer.from(new Uint8Array(fileSize).fill(1)),
        fileName: 'large.mp4',
        mimeType: 'video/mp4',
        lastModified: PENDING_FILE.fileLastModified,
      })
      cy.clickAria('start-upload')

      cy.contains('.upload-error', 'アップロードに失敗しました').should('exist')
      cy.wrap(null).should(() => {
        expect(ranges).to.deep.equal([
          `bytes 0-${chunkSize - 1}/${fileSize}`,
          `bytes ${chunkSize}-${fileSize - 1}/${fileSize}`,
        ])
      })
      expectStored('upload', (value) => {
        const pending = (value as { pending: Record<string, { uploadedBytes: number; fileSize: number }> })
          .pending[pendingUploadKey(PRIMARY_HOST, 'e2euser')]
        expect(pending).to.include({ uploadedBytes: chunkSize, fileSize })
      })
    })
  })

  describe('token refresh', () => {
    it('refreshes an expired access token before uploading', () => {
      cy.intercept('POST', `${apiBase(PRIMARY_HOST)}/users/token`, {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: {
          access_token: 'refreshed-token',
          refresh_token: 'refreshed-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      }).as('refresh')
      stubUploadInit(PRIMARY_HOST)
      stubUploadChunk(PRIMARY_HOST, 'refreshed-uuid')

      cy.visitApp('/tabs/tab6', { auth: loggedInAuth({ expiresAt: Date.now() - 60000 }) })
      selectVideoFile()
      cy.clickAria('start-upload')

      cy.wait('@refresh').its('request.body').should('contain', 'grant_type=refresh_token')
      cy.wait('@uploadInit')
        .its('request.headers')
        .should('have.property', 'authorization', 'Bearer refreshed-token')
      cy.contains('.upload-success', 'アップロードが完了しました').should('be.visible')
    })

    it('asks for a new sign-in when the refresh is rejected', () => {
      cy.intercept('POST', `${apiBase(PRIMARY_HOST)}/users/token`, {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: { error: 'invalid_grant' },
      }).as('refresh')

      cy.visitApp('/tabs/tab6', { auth: loggedInAuth({ expiresAt: Date.now() - 60000 }) })
      selectVideoFile()
      cy.clickAria('start-upload')

      cy.wait('@refresh')
      cy.ariaButton('login').should('exist')
      cy.contains('.login-error', 'セッションの有効期限が切れました').should('be.visible')
    })
  })

  describe('interrupted upload', () => {
    it('offers to resume or discard a pending upload', () => {
      cy.visitApp('/tabs/tab6', { auth: loggedInAuth(), upload: pendingUploadState() })

      cy.contains('.resume-banner', '中断されたアップロード「Pending Video」があります').should(
        'be.visible',
      )
      cy.ariaButton('resume-upload').should('exist')
      cy.ariaButton('discard-upload').should('exist')
      cy.ariaButton('start-upload').should('be.disabled')
      nameInput().should('have.value', 'Pending Video')
    })

    it('keeps resume disabled until the very same file is chosen again', () => {
      cy.visitApp('/tabs/tab6', { auth: loggedInAuth(), upload: pendingUploadState() })

      cy.ariaButton('resume-upload').should('be.disabled')

      cy.get('input[data-testid="file-input"]').selectFile({
        contents: Cypress.Buffer.from(new Uint8Array(PENDING_FILE.fileSize).fill(9)),
        fileName: 'different.mp4',
        mimeType: 'video/mp4',
        lastModified: PENDING_FILE.fileLastModified,
      })
      cy.ariaButton('resume-upload').should('be.disabled')

      selectVideoFile()
      cy.ariaButton('resume-upload').should('not.be.disabled')
    })

    it('continues from the byte offset the server reports', () => {
      const ranges: string[] = []
      cy.intercept('PUT', `${RESUMABLE_URL}*`, (req) => {
        const range = String(req.headers['content-range'] ?? '')
        ranges.push(range)
        if (range.startsWith('bytes */')) {
          req.reply({
            statusCode: 308,
            headers: { ...CORS_HEADERS, range: 'bytes=0-1023' },
            body: {},
          })
        } else {
          req.reply({
            statusCode: 200,
            headers: CORS_HEADERS,
            body: { video: { uuid: 'resumed-uuid' } },
          })
        }
      }).as('resumePut')

      cy.visitApp('/tabs/tab6', { auth: loggedInAuth(), upload: pendingUploadState() })
      selectVideoFile()
      cy.clickAria('resume-upload')

      cy.contains('.upload-success', 'アップロードが完了しました').should('be.visible')
      cy.wrap(null).should(() => {
        expect(ranges).to.deep.equal(['bytes */2048', 'bytes 1024-2047/2048'])
      })
      cy.get('.resume-banner').should('not.exist')
      expectStored('upload', (value) => {
        expect((value as { pending: Record<string, unknown> }).pending).to.deep.equal({})
      })
    })

    it('finishes right away when the server already holds the whole file', () => {
      cy.intercept('PUT', `${RESUMABLE_URL}*`, {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: { video: { uuid: 'already-done-uuid' } },
      }).as('resumePut')

      cy.visitApp('/tabs/tab6', { auth: loggedInAuth(), upload: pendingUploadState() })
      selectVideoFile()
      cy.clickAria('resume-upload')

      cy.contains('.upload-success', 'アップロードが完了しました').should('be.visible')
      cy.get('@resumePut.all').should('have.length', 1)
    })

    it('restarts from the first byte when the server reports no offset', () => {
      const ranges: string[] = []
      cy.intercept('PUT', `${RESUMABLE_URL}*`, (req) => {
        const range = String(req.headers['content-range'] ?? '')
        ranges.push(range)
        if (range.startsWith('bytes */')) {
          req.reply({ statusCode: 308, headers: CORS_HEADERS, body: {} })
        } else {
          req.reply({
            statusCode: 200,
            headers: CORS_HEADERS,
            body: { video: { uuid: 'restarted-uuid' } },
          })
        }
      }).as('resumePut')

      cy.visitApp('/tabs/tab6', { auth: loggedInAuth(), upload: pendingUploadState() })
      selectVideoFile()
      cy.clickAria('resume-upload')

      cy.contains('.upload-success', 'アップロードが完了しました').should('be.visible')
      cy.wrap(null).should(() => {
        expect(ranges).to.deep.equal(['bytes */2048', 'bytes 0-2047/2048'])
      })
    })

    it('discards a pending upload once the server confirms the deletion', () => {
      stubDiscard(204)

      cy.visitApp('/tabs/tab6', { auth: loggedInAuth(), upload: pendingUploadState() })
      cy.clickAria('discard-upload')

      cy.wait('@cancelUpload').its('request.url').should('contain', 'upload_id=up-pending')
      cy.get('.resume-banner').should('not.exist')
      cy.ariaButton('start-upload').should('not.be.disabled')
      expectStored('upload', (value) => {
        expect((value as { pending: Record<string, unknown> }).pending).to.deep.equal({})
      })
    })

    it('drops the record when the server says the upload is already gone', () => {
      stubDiscard(404)

      cy.visitApp('/tabs/tab6', { auth: loggedInAuth(), upload: pendingUploadState() })
      cy.clickAria('discard-upload')

      cy.wait('@cancelUpload')
      cy.get('.resume-banner').should('not.exist')
      expectStored('upload', (value) => {
        expect((value as { pending: Record<string, unknown> }).pending).to.deep.equal({})
      })
    })

    it('keeps the record when the server refuses the deletion', () => {
      stubDiscard(500)

      cy.visitApp('/tabs/tab6', { auth: loggedInAuth(), upload: pendingUploadState() })
      cy.clickAria('discard-upload')

      cy.wait('@cancelUpload')
      cy.contains('.upload-error', 'アップロードに失敗しました').should('exist')
      cy.contains('.resume-banner', '中断されたアップロード').should('be.visible')
      expectStored('upload', (value) => {
        const pending = (value as { pending: Record<string, unknown> }).pending
        expect(pending).to.have.property(pendingUploadKey(PRIMARY_HOST, 'e2euser'))
      })
    })

    it('asks for a new sign-in when the refresh fails while discarding', () => {
      cy.intercept('POST', `${apiBase(PRIMARY_HOST)}/users/token`, {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: { error: 'invalid_grant' },
      }).as('refresh')

      cy.visitApp('/tabs/tab6', {
        auth: loggedInAuth({ expiresAt: Date.now() - 60000 }),
        upload: pendingUploadState(),
      })
      cy.clickAria('discard-upload')

      cy.wait('@refresh')
      cy.ariaButton('login').should('exist')
      cy.contains('.login-error', 'セッションの有効期限が切れました').should('be.visible')
    })

    it('never shows a pending upload that belongs to another account', () => {
      cy.visitApp('/tabs/tab6', {
        auth: loggedInAuth(),
        upload: pendingUploadState({ username: 'otheruser' }),
      })

      cy.contains('.logged-in-as', 'e2euser としてログイン中').should('be.visible')
      cy.get('.resume-banner').should('not.exist')
      cy.ariaButton('start-upload').should('not.be.disabled')
    })
  })
})
