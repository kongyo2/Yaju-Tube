import {
  choosePopoverOption,
  readLocalStorage,
  visitApp,
} from '../support/commands'

function settingsItem(label: string) {
  return cy.contains('ion-content ion-item', label)
}

describe('tab3 settings', () => {
  it('changes items per page and persists it', () => {
    visitApp('/tabs/tab3')

    settingsItem('表示項目').find('ion-select').click()
    choosePopoverOption('10')

    readLocalStorage('settings')
      .its('itemsPerPage')
      .should('eq', 10)
  })

  it('applies the items-per-page choice to video list requests', () => {
    cy.intercept('GET', 'https://e2e.example/api/v1/videos*', {
      statusCode: 200,
      body: { total: 0, data: [] },
    }).as('videos')

    visitApp('/tabs/tab3')
    settingsItem('表示項目').find('ion-select').click()
    choosePopoverOption('10')

    visitApp('/tabs/tab1', {
      instances: [{ name: 'E2E Instance', url: 'e2e.example' }],
    })
    cy.contains('ion-item', 'E2E Instance').click()
    cy.wait('@videos').its('request.query.count').should('eq', '10')
  })

  it('changes the theme and applies it to the document', () => {
    visitApp('/tabs/tab3')

    settingsItem('テーマ').find('ion-select').click()
    choosePopoverOption('dark')

    cy.document().its('body').should('have.attr', 'data-theme', 'dark')
    readLocalStorage('settings').its('theme').should('eq', 'dark')
  })

  it('toggles notifications off and persists the choice', () => {
    visitApp('/tabs/tab3')

    settingsItem('通知').find('ion-toggle').click()

    readLocalStorage('settings')
      .its('notificationsEnabled')
      .should('eq', false)
  })

  it('adds an instance through the modal', () => {
    visitApp('/tabs/tab3')

    settingsItem('インスタンスを追加する').click()
    cy.get('ion-modal').should('be.visible')
    cy.contains('ion-modal ion-title', 'インスタンスを追加')

    cy.get('ion-modal ion-input input').eq(0).type('My New Instance')
    cy.get('ion-modal ion-input input').eq(1).type('https://new.example/')
    cy.contains('ion-modal ion-button', '保存').click()

    cy.get('ion-modal').should('not.be.visible')

    readLocalStorage('instances').should('deep.equal', [
      { name: 'My New Instance', url: 'new.example' },
    ])

    visitApp('/tabs/tab1')
    cy.contains('ion-item', 'My New Instance').should('be.visible')
  })

  it('uses the url as the name when the name field is empty', () => {
    visitApp('/tabs/tab3')

    settingsItem('インスタンスを追加する').click()
    cy.get('ion-modal ion-input input').eq(1).type('nameless.example')
    cy.contains('ion-modal ion-button', '保存').click()

    readLocalStorage('instances').should('deep.equal', [
      { name: 'nameless.example', url: 'nameless.example' },
    ])
  })

  it('does not add a duplicate instance url', () => {
    visitApp('/tabs/tab3', {
      instances: [{ name: 'E2E Instance', url: 'e2e.example' }],
    })

    settingsItem('インスタンスを追加する').click()
    cy.get('ion-modal ion-input input').eq(1).type('e2e.example')
    cy.contains('ion-modal ion-button', '保存').click()

    readLocalStorage('instances').should('deep.equal', [
      { name: 'E2E Instance', url: 'e2e.example' },
    ])
  })

  it('sets the default instance url through the modal', () => {
    visitApp('/tabs/tab3')

    settingsItem('デフォルトインスタンスURLを設定').click()
    cy.get('ion-modal').should('be.visible')
    cy.contains('ion-modal ion-title', 'デフォルトインスタンスを設定')

    cy.get('ion-modal ion-input input').eq(0).type('https://default.example//')
    cy.contains('ion-modal ion-button', '保存').click()

    readLocalStorage('settings')
      .its('defaultInstanceUrl')
      .should('eq', 'default.example')
  })

  it('closes the modal without saving via the close button', () => {
    visitApp('/tabs/tab3')

    settingsItem('インスタンスを追加する').click()
    cy.get('ion-modal').should('be.visible')
    cy.contains('ion-modal ion-button', 'Close').click()
    cy.get('ion-modal').should('not.be.visible')
    readLocalStorage('instances').should('eq', null)
  })

  it('switches the UI language to English', () => {
    visitApp('/tabs/tab3')

    settingsItem('言語設定').find('ion-select').click()
    choosePopoverOption('English')

    cy.contains('ion-title', 'Settings').should('be.visible')
    cy.window().its('localStorage').invoke('getItem', 'locale').should('eq', 'en')
  })

  it('switches the UI language to German', () => {
    visitApp('/tabs/tab3')

    settingsItem('言語設定').find('ion-select').click()
    choosePopoverOption('Deutsch')

    cy.contains('ion-title', 'Einstellungen').should('be.visible')
    cy.window().its('localStorage').invoke('getItem', 'locale').should('eq', 'de')
  })

  it('shows the about alert', () => {
    visitApp('/tabs/tab3')

    settingsItem('このアプリについて').click()
    cy.get('ion-alert').should('be.visible')
    cy.get('ion-alert').contains('Yaju-Tube')
    cy.get('ion-alert ion-backdrop').click({ force: true })
    cy.get('ion-alert').should('not.be.visible')
  })
})
