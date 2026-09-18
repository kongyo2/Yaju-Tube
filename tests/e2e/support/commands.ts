export interface InstanceSeed {
  name: string
  url: string
}

export interface SeedOptions {
  locale?: string
  instances?: InstanceSeed[]
  settings?: Record<string, unknown>
  history?: Record<string, unknown>[]
  playlist?: Record<string, unknown>[]
  auth?: Record<string, unknown>
  upload?: Record<string, unknown>
  session?: Record<string, string>
}

const defaultSettings = {
  theme: 'light',
  notificationsEnabled: true,
  itemsPerPage: 20,
  defaultInstanceUrl: '810video.com',
  locale: 'ja',
  displayMode: 'list',
}

export function applySeeds(win: Window, seeds: SeedOptions = {}): void {
  const locale = seeds.locale ?? (seeds.settings?.['locale'] as string) ?? 'ja'
  win.localStorage.setItem('locale', locale)
  if (seeds.instances) {
    win.localStorage.setItem('instances', JSON.stringify(seeds.instances))
  }
  if (seeds.settings) {
    win.localStorage.setItem(
      'settings',
      JSON.stringify({ ...defaultSettings, ...seeds.settings }),
    )
  }
  if (seeds.history) {
    win.localStorage.setItem('history', JSON.stringify({ history: seeds.history }))
  }
  if (seeds.playlist) {
    win.localStorage.setItem('playlist', JSON.stringify({ playlist: seeds.playlist }))
  }
  if (seeds.auth) {
    win.localStorage.setItem('auth', JSON.stringify(seeds.auth))
  }
  if (seeds.upload) {
    win.localStorage.setItem('upload', JSON.stringify(seeds.upload))
  }
  for (const [key, value] of Object.entries(seeds.session ?? {})) {
    win.sessionStorage.setItem(key, value)
  }
}

export function visitApp(path: string, seeds: SeedOptions = {}) {
  return cy.visit(path, {
    onBeforeLoad(win) {
      applySeeds(win, seeds)
    },
  })
}

export function readLocalStorage(key: string): Cypress.Chainable<unknown> {
  return cy.window().then((win) => {
    const raw = win.localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  })
}

export function readSessionStorage(key: string): Cypress.Chainable<string | null> {
  return cy.window().then((win) => win.sessionStorage.getItem(key))
}

export function openSlidingItem(itemText: string) {
  return cy
    .contains('ion-item-sliding ion-item', itemText)
    .parents('ion-item-sliding')
    .then(($el) => {
      const el = $el[0] as HTMLElement & {
        open?: (side: string) => Promise<void>
      }
      return el.open?.('end')
    })
}

export function clickSlidingDelete(itemText: string, deleteLabel = '削除') {
  openSlidingItem(itemText)
  return cy
    .contains('ion-item-sliding', itemText)
    .find('ion-item-option')
    .contains(deleteLabel)
    .click({ force: true })
}

export function clickAriaButton(label: string) {
  return cy
    .get(`button[aria-label="${label}"]`)
    .parents('ion-button')
    .first()
    .click({ force: true })
}

export function ariaButton(label: string) {
  return cy.get(`button[aria-label="${label}"]`)
}

export function clickAlertButton(label: string) {
  return cy.get('ion-alert').contains('.alert-button', label).click({ force: true })
}

export function chooseAlertSelectOption(optionText: string) {
  cy.get('ion-alert', { timeout: 10000 }).should('be.visible')
  cy.get('ion-alert').contains('.alert-radio-button', optionText).click({ force: true })
  clickAlertButton('OK')
}

export function chooseSelectInAlert(hostSelector: string, optionText: string) {
  cy.get(hostSelector).click()
  chooseAlertSelectOption(optionText)
}

export function choosePopoverOption(optionText: string) {
  cy.get('ion-select-popover', { timeout: 10000 }).should('be.visible')
  cy.get('ion-select-popover')
    .contains('ion-radio', optionText)
    .click({ force: true })
}

export function chooseSelectInPopover(hostSelector: string, optionText: string) {
  cy.get(hostSelector).click()
  choosePopoverOption(optionText)
}

export function expandTab2Controls() {
  cy.get('ion-accordion-group ion-item[slot="header"]').click()
  cy.get('ion-searchbar').should('be.visible')
}
