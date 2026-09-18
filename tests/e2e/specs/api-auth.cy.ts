import {
  PRIMARY_HOST,
  PRIMARY_INSTANCE,
  SECOND_HOST,
  loggedInAuth,
  stubVideoList,
  videoListBody,
} from '../support/helpers'

const HOUR = 60 * 60 * 1000

function openVideoList(auth?: Record<string, unknown>) {
  cy.visitApp('/tabs/tab1', {
    instances: [PRIMARY_INSTANCE],
    ...(auth ? { auth } : {}),
  })
  cy.contains('ion-item', 'E2E Instance').click()
  cy.location('pathname').should('eq', '/tabs/tab2')
}

describe('api authorization header', () => {
  beforeEach(() => {
    stubVideoList(videoListBody([]), PRIMARY_HOST, 'videos')
  })

  it('sends the bearer token to the instance the session belongs to', () => {
    openVideoList(loggedInAuth({ host: PRIMARY_HOST, expiresAt: Date.now() + HOUR }))

    cy.wait('@videos')
      .its('request.headers')
      .should('have.property', 'authorization', 'Bearer e2e-access-token')
  })

  it('sends the bearer token when the session has no expiry recorded', () => {
    openVideoList(loggedInAuth({ host: PRIMARY_HOST, expiresAt: null }))

    cy.wait('@videos')
      .its('request.headers')
      .should('have.property', 'authorization', 'Bearer e2e-access-token')
  })

  it('matches the host regardless of the scheme and casing it was stored with', () => {
    openVideoList(
      loggedInAuth({ host: `https://${PRIMARY_HOST.toUpperCase()}`, expiresAt: Date.now() + HOUR }),
    )

    cy.wait('@videos')
      .its('request.headers')
      .should('have.property', 'authorization', 'Bearer e2e-access-token')
  })

  it('never leaks the token to a different instance', () => {
    openVideoList(loggedInAuth({ host: SECOND_HOST, expiresAt: Date.now() + HOUR }))

    cy.wait('@videos').its('request.headers').should('not.have.property', 'authorization')
  })

  it('stops sending a token that has already expired', () => {
    openVideoList(loggedInAuth({ host: PRIMARY_HOST, expiresAt: Date.now() - HOUR }))

    cy.wait('@videos').its('request.headers').should('not.have.property', 'authorization')
  })

  it('sends no token at all while signed out', () => {
    openVideoList()

    cy.wait('@videos').its('request.headers').should('not.have.property', 'authorization')
  })
})
