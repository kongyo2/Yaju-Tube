import './commands'

beforeEach(() => {
  cy.intercept({ url: 'https://**' }, { statusCode: 503, body: { error: 'e2e-network-blocked' } })
})
