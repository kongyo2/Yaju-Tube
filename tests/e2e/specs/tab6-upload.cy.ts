import {
  ariaButton,
  clickAriaButton,
  readLocalStorage,
  visitApp,
} from '../support/commands'

const host = 'e2e.upload.test'
const apiBase = `https://${host}/api/v1`

const authSeed = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenType: 'Bearer',
  username: 'e2euser',
  host,
  channels: [{ id: 7, name: 'e2e-chan', displayName: 'E2E Channel' }],
  clientId: 'client-id',
  clientSecret: 'client-secret',
  expiresAt: null,
}

function mockLoginFlow(tokenReply?: object) {
  cy.intercept('GET', `${apiBase}/oauth-clients/local`, {
    statusCode: 200,
    body: { client_id: 'client-id', client_secret: 'client-secret' },
  }).as('oauthClient')
  cy.intercept('POST', `${apiBase}/users/token`, {
    statusCode: 200,
    body: {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
    },
    ...(tokenReply ?? {}),
  }).as('token')
  cy.intercept('GET', `${apiBase}/users/me`, {
    statusCode: 200,
    body: {
      username: 'e2euser',
      videoChannels: [{ id: 7, name: 'e2e-chan', displayName: 'E2E Channel' }],
    },
  }).as('me')
}

function loginForm() {
  return cy.get('ion-content ion-list ion-input')
}

function fillLoginForm() {
  loginForm().eq(0).find('input').clear().type(host)
  loginForm().eq(1).find('input').type('e2euser')
  loginForm().eq(2).find('input').type('s3cret')
}

function nameInput() {
  return cy.contains('ion-item', '動画タイトル').find('ion-input input')
}

function selectVideoFile(name = 'clip.mp4') {
  cy.get('input[data-testid="file-input"]').selectFile({
    contents: Cypress.Buffer.from(new Uint8Array(100).fill(1)),
    fileName: name,
    mimeType: 'video/mp4',
    lastModified: 1700000000000,
  })
}

describe('tab6 upload', () => {
  describe('login', () => {
    it('shows the login form when logged out', () => {
      visitApp('/tabs/tab6')
      cy.contains('ion-title', '動画をアップロード').should('be.visible')
      ariaButton('login').should('exist')
      loginForm().should('have.length', 4)
    })

    it('logs in and shows the upload form', () => {
      mockLoginFlow()
      visitApp('/tabs/tab6')

      fillLoginForm()
      clickAriaButton('login')

      cy.wait('@oauthClient')
      cy.wait('@token')
      cy.wait('@me')

      cy.contains('e2euser としてログイン中').should('be.visible')
      cy.contains('ion-select-option', 'E2E Channel').should('exist')
      ariaButton('start-upload').should('exist')

      readLocalStorage('auth').its('accessToken').should('eq', 'access-token')
    })

    it('shows an error on invalid credentials', () => {
      mockLoginFlow({
        statusCode: 400,
        body: { error: 'invalid_grant' },
      })
      visitApp('/tabs/tab6')

      fillLoginForm()
      clickAriaButton('login')

      cy.wait('@token')
      cy.contains('ユーザー名またはパスワードが正しくありません').should(
        'be.visible',
      )
      ariaButton('login').should('exist')
    })

    it('asks for the two-factor code when required', () => {
      mockLoginFlow({
        statusCode: 400,
        body: { code: 'missing_two_factor' },
      })
      visitApp('/tabs/tab6')

      fillLoginForm()
      clickAriaButton('login')

      cy.wait('@token')
      cy.contains('二段階認証コードが必要です').should('be.visible')
    })

    it('flags an incorrect two-factor code', () => {
      mockLoginFlow({
        statusCode: 400,
        body: { code: 'invalid_two_factor' },
      })
      visitApp('/tabs/tab6')

      fillLoginForm()
      clickAriaButton('login')

      cy.wait('@token')
      cy.contains('二段階認証コードが正しくありません').should('be.visible')
    })

    it('shows a network error when the instance is unreachable', () => {
      cy.intercept('GET', `${apiBase}/oauth-clients/local`, {
        forceNetworkError: true,
      })
      visitApp('/tabs/tab6')

      fillLoginForm()
      clickAriaButton('login')

      cy.contains('ネットワークエラー: サーバーに接続できません').should(
        'be.visible',
      )
    })

    it('logs out and returns to the login form', () => {
      visitApp('/tabs/tab6', { auth: authSeed })

      cy.contains('e2euser としてログイン中').should('be.visible')
      clickAriaButton('logout')

      ariaButton('login').should('exist')
      cy.contains('e2euser としてログイン中').should('not.exist')
      readLocalStorage('auth').its('accessToken').should('eq', null)
    })
  })

  describe('upload form', () => {
    beforeEach(() => {
      visitApp('/tabs/tab6', { auth: authSeed })
    })

    it('requires a file before upload', () => {
      clickAriaButton('start-upload')
      cy.contains('先にファイルを選択してください').should('be.visible')
    })

    it('requires a title', () => {
      selectVideoFile()
      nameInput().clear()
      clickAriaButton('start-upload')
      cy.contains('動画タイトルを入力してください').should('be.visible')
    })

    it('rejects titles under 3 characters', () => {
      selectVideoFile()
      nameInput().clear().type('ab')
      clickAriaButton('start-upload')
      cy.contains('動画タイトルは3〜120文字で入力してください').should(
        'be.visible',
      )
    })

    it('autofills the title from the file name', () => {
      selectVideoFile('my-movie.mp4')
      nameInput().should('have.value', 'my-movie')
    })

    it('uploads a video end to end and offers a view link', () => {
      cy.intercept('POST', `${apiBase}/videos/upload-resumable`, {
        statusCode: 201,
        headers: {
          location: `${apiBase}/videos/upload-resumable?upload_id=up-1`,
        },
        body: {},
      }).as('init')
      cy.intercept('PUT', `${apiBase}/videos/upload-resumable*`, {
        statusCode: 200,
        body: { video: { uuid: 'uploaded-uuid-1' } },
      }).as('chunk')
      cy.intercept('GET', `${apiBase}/videos/uploaded-uuid-1`, {
        statusCode: 200,
        fixture: 'video.json',
      }).as('uploadedVideo')

      selectVideoFile()
      clickAriaButton('start-upload')

      cy.wait('@init')
      cy.wait('@chunk')

      cy.contains('アップロードが完了しました').should('be.visible')
      clickAriaButton('view-video')

      cy.location('pathname').should('eq', '/tabs/video/uploaded-uuid-1')
      cy.wait('@uploadedVideo')
    })

    it('sends metadata to the init endpoint', () => {
      cy.intercept('POST', `${apiBase}/videos/upload-resumable`, {
        statusCode: 201,
        headers: {
          location: `${apiBase}/videos/upload-resumable?upload_id=up-2`,
        },
        body: {},
      }).as('init')
      cy.intercept('PUT', `${apiBase}/videos/upload-resumable*`, {
        statusCode: 200,
        body: { video: { uuid: 'uploaded-uuid-2' } },
      })

      selectVideoFile()
      nameInput().clear().type('Named Upload')
      clickAriaButton('start-upload')

      cy.wait('@init')
        .its('request.body')
        .should('deep.include', {
          filename: 'clip.mp4',
          name: 'Named Upload',
          channelId: 7,
          privacy: 1,
        })
      cy.contains('アップロードが完了しました').should('be.visible')
    })

    it('cancels an in-flight upload and clears its pending record', () => {
      cy.intercept('POST', `${apiBase}/videos/upload-resumable`, {
        statusCode: 201,
        headers: {
          location: `${apiBase}/videos/upload-resumable?upload_id=up-3`,
        },
        body: {},
      })
      cy.intercept('PUT', `${apiBase}/videos/upload-resumable*`, {
        statusCode: 200,
        body: { video: { uuid: 'never-uuid' } },
        delay: 3000,
      })
      cy.intercept('DELETE', `${apiBase}/videos/upload-resumable*`, {
        statusCode: 204,
        body: {},
      }).as('cancel')

      selectVideoFile()
      clickAriaButton('start-upload')

      clickAriaButton('cancel-upload')
      cy.wait('@cancel')

      readLocalStorage('upload').its('pending').should('deep.equal', {})
    })

    it('shows an error when the upload init fails', () => {
      cy.intercept('POST', `${apiBase}/videos/upload-resumable`, {
        statusCode: 500,
        body: { error: 'boom' },
      }).as('init')

      selectVideoFile()
      clickAriaButton('start-upload')
      cy.wait('@init')

      cy.contains('アップロードに失敗しました').should('be.visible')
    })
  })

  describe('interrupted upload', () => {
    const pending = {
      [`${host}\u0000e2euser`]: {
        host,
        username: 'e2euser',
        uploadId: 'up-pending',
        name: 'clip',
        channelId: 7,
        privacy: 1,
        description: '',
        fileName: 'clip.mp4',
        fileSize: 100,
        fileLastModified: 1700000000000,
        uploadedBytes: 0,
      },
    }

    it('shows the resume banner for a pending upload', () => {
      visitApp('/tabs/tab6', { auth: authSeed, upload: { pending } })

      cy.contains('中断されたアップロード「clip」があります').should('be.visible')
      ariaButton('resume-upload').should('exist')
      ariaButton('discard-upload').should('exist')
      ariaButton('start-upload').should('be.disabled')
    })

    it('resumes a pending upload from the stored offset', () => {
      cy.intercept('PUT', `${apiBase}/videos/upload-resumable*`, (req) => {
        const range = String(req.headers['content-range'] ?? '')
        if (range.includes('*')) {
          req.reply({
            statusCode: 308,
            headers: { range: 'bytes=0-49' },
            body: '',
          })
        } else {
          req.reply({
            statusCode: 200,
            body: { video: { uuid: 'resumed-uuid' } },
          })
        }
      }).as('resumePut')

      visitApp('/tabs/tab6', { auth: authSeed, upload: { pending } })

      selectVideoFile()
      clickAriaButton('resume-upload')

      cy.wait('@resumePut').then((interception) => {
        const range =
          interception.request.headers['content-range'] ??
          interception.request.headers['Content-Range']
        expect(range).to.eq('bytes */100')
      })
      cy.wait('@resumePut').then((interception) => {
        const range =
          interception.request.headers['content-range'] ??
          interception.request.headers['Content-Range']
        expect(range).to.eq('bytes 50-99/100')
      })

      cy.contains('アップロードが完了しました').should('be.visible')
      readLocalStorage('upload').its('pending').should('deep.equal', {})
    })

    it('keeps the resume button disabled until the same file is selected', () => {
      visitApp('/tabs/tab6', { auth: authSeed, upload: { pending } })

      ariaButton('resume-upload').should('be.disabled')

      cy.get('input[data-testid="file-input"]').selectFile({
        contents: Cypress.Buffer.from(new Uint8Array(100).fill(9)),
        fileName: 'different.mp4',
        mimeType: 'video/mp4',
        lastModified: 1700000000000,
      })
      ariaButton('resume-upload').should('be.disabled')

      selectVideoFile()
      ariaButton('resume-upload').should('not.be.disabled')
    })

    it('discards a pending upload after server-side cancel', () => {
      cy.intercept('DELETE', `${apiBase}/videos/upload-resumable*`, {
        statusCode: 204,
        body: {},
      }).as('cancel')

      visitApp('/tabs/tab6', { auth: authSeed, upload: { pending } })

      clickAriaButton('discard-upload')
      cy.wait('@cancel')

      cy.contains('中断されたアップロード').should('not.exist')
      ariaButton('start-upload').should('not.be.disabled')
      readLocalStorage('upload').its('pending').should('deep.equal', {})
    })

    it('keeps the pending record when the server-side discard fails', () => {
      cy.intercept('DELETE', `${apiBase}/videos/upload-resumable*`, {
        statusCode: 500,
        body: {},
      }).as('cancel')

      visitApp('/tabs/tab6', { auth: authSeed, upload: { pending } })

      clickAriaButton('discard-upload')
      cy.wait('@cancel')

      cy.contains('.upload-error', 'アップロードに失敗しました').should('exist')
      cy.contains('中断されたアップロード「clip」があります').should('be.visible')
      readLocalStorage('upload')
        .its('pending')
        .should('have.property', `${host}\u0000e2euser`)
    })
  })

  it('forces re-login when the token refresh fails', () => {
    const expiredAuth = { ...authSeed, expiresAt: Date.now() - 1000 }
    cy.intercept('POST', `${apiBase}/users/token`, {
      statusCode: 400,
      body: { error: 'invalid_grant' },
    }).as('refresh')

    visitApp('/tabs/tab6', { auth: expiredAuth })

    selectVideoFile()
    clickAriaButton('start-upload')
    cy.wait('@refresh')

    ariaButton('login').should('exist')
    cy.contains('セッションの有効期限が切れました').should('be.visible')
  })
})
