/// <reference types="cypress" />

import { seedAppState, type AppState } from './helpers'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      visitApp(path: string, state?: AppState): Chainable<AUTWindow>
      tabButton(tab: string): Chainable<JQuery<HTMLElement>>
      ariaButton(label: string): Chainable<JQuery<HTMLElement>>
      clickAria(label: string): Chainable<JQuery<HTMLElement>>
      slidingOption(itemText: string, optionText: string): Chainable<JQuery<HTMLElement>>
      visibleAlert(): Chainable<JQuery<HTMLElement>>
      alertButton(text: string): Chainable<JQuery<HTMLElement>>
      chooseAlertOption(optionText: string): Chainable<JQuery<HTMLElement>>
      choosePopoverOption(optionText: string): Chainable<JQuery<HTMLElement>>
      settingsItem(label: string): Chainable<JQuery<HTMLElement>>
    }
  }
}

Cypress.Commands.add('visitApp', (path: string, state: AppState = {}) =>
  cy.visit(path, {
    onBeforeLoad(win) {
      seedAppState(win, state)
    },
  }),
)

Cypress.Commands.add('tabButton', (tab: string) => cy.get(`#tab-button-${tab}`))

Cypress.Commands.add('ariaButton', (label: string) => cy.get(`button[aria-label="${label}"]`))

Cypress.Commands.add('clickAria', (label: string) =>
  cy.ariaButton(label).parents('ion-button').first().click(),
)

Cypress.Commands.add('slidingOption', (itemText: string, optionText: string) => {
  cy.contains('ion-item-sliding', itemText).then(($sliding) => {
    const element = $sliding.get(0) as HTMLElement & { open(side: string): Promise<void> }

    return element.open('end')
  })

  return cy
    .contains('ion-item-sliding', itemText)
    .contains('ion-item-option', optionText)
    .click({ force: true })
})

Cypress.Commands.add('visibleAlert', () => cy.get('ion-alert:visible'))

Cypress.Commands.add('alertButton', (text: string) =>
  cy.visibleAlert().contains('.alert-button', text),
)

Cypress.Commands.add('chooseAlertOption', (optionText: string) => {
  cy.visibleAlert().contains('.alert-radio-button', optionText).click()

  return cy.alertButton('OK').click()
})

Cypress.Commands.add('choosePopoverOption', (optionText: string) => {
  cy.get('ion-select-popover').should('be.visible')
  cy.contains('ion-select-popover ion-item', optionText).click()

  return cy.get('ion-select-popover').should('not.exist')
})

Cypress.Commands.add('settingsItem', (label: string) => cy.contains('ion-content ion-item', label))

export {}
