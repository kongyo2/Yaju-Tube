import {
  PRIMARY_HOST,
  PRIMARY_INSTANCE,
  expectStored,
  makePlaylistItem,
  stubVideoList,
  videoListBody,
} from '../support/helpers'

function modalInput(label: string) {
  return cy.contains('ion-modal ion-item', label).find('input')
}

describe('tab3 settings', () => {
  describe('display preferences', () => {
    it('changes the page size and persists it', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('表示項目').find('ion-select').click()
      cy.choosePopoverOption('10')

      expectStored('settings', (value) => {
        expect(value).to.have.property('itemsPerPage', 10)
      })
    })

    it('shows the persisted page size in the select', () => {
      cy.visitApp('/tabs/tab3', { settings: { itemsPerPage: 30 } })

      cy.settingsItem('表示項目')
        .find('ion-select')
        .shadow()
        .find('.select-text')
        .should('contain', '30')
    })

    it('applies the chosen page size to the video list request', () => {
      stubVideoList(videoListBody([]), PRIMARY_HOST, 'videos')

      cy.visitApp('/tabs/tab3', { instances: [PRIMARY_INSTANCE] })
      cy.settingsItem('表示項目').find('ion-select').click()
      cy.choosePopoverOption('30')

      cy.tabButton('tab1').click()
      cy.contains('ion-item', 'E2E Instance').click()

      cy.wait('@videos').its('request.query.count').should('eq', '30')
    })

    it('applies a chosen theme to the document and persists it', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('テーマ').find('ion-select').click()
      cy.choosePopoverOption('dark')

      cy.document().its('body').should('have.attr', 'data-theme', 'dark')
      expectStored('settings', (value) => {
        expect(value).to.have.property('theme', 'dark')
      })
    })

    it('restores the persisted theme after a reload', () => {
      cy.visitApp('/tabs/tab3', { settings: { theme: 'sepia' } })
      cy.document().its('body').should('have.attr', 'data-theme', 'sepia')

      cy.reload()

      cy.contains('ion-title', '設定').should('be.visible')
      cy.document().its('body').should('have.attr', 'data-theme', 'sepia')
    })

    it('offers every bundled theme', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('テーマ').find('ion-select').click()
      cy.get('ion-select-popover').should('be.visible')
      for (const theme of ['light', 'dark', 'sepia', 'grape', 'yajuu']) {
        cy.contains('ion-select-popover ion-item', theme).should('exist')
      }
      cy.choosePopoverOption('grape')
      cy.document().its('body').should('have.attr', 'data-theme', 'grape')
    })

    it('turns notifications off and persists the choice', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('通知').find('ion-toggle').click()

      expectStored('settings', (value) => {
        expect(value).to.have.property('notificationsEnabled', false)
      })
    })

    it('turns notifications back on when they were persisted as off', () => {
      cy.visitApp('/tabs/tab3', { settings: { notificationsEnabled: false } })

      cy.settingsItem('通知').find('ion-toggle').click()

      expectStored('settings', (value) => {
        expect(value).to.have.property('notificationsEnabled', true)
      })
    })
  })

  describe('instance management', () => {
    it('adds an instance through the modal', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('インスタンスを追加する').click()
      cy.get('ion-modal').should('be.visible')
      cy.contains('ion-modal ion-title', 'インスタンスを追加').should('be.visible')

      modalInput('名前').type('My New Instance')
      modalInput('インスタンスURLを入力').type('new.example')
      cy.contains('ion-modal ion-button', '保存').click()

      cy.get('ion-modal').should('not.be.visible')
      expectStored('instances', (value) => {
        expect(value).to.deep.equal([{ name: 'My New Instance', url: 'new.example' }])
      })

      cy.tabButton('tab1').click()
      cy.contains('ion-item', 'My New Instance').should('be.visible')
    })

    it('strips the scheme and trailing slashes from the entered url', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('インスタンスを追加する').click()
      modalInput('名前').type('Protocol Instance')
      modalInput('インスタンスURLを入力').type('https://proto.example///')
      cy.contains('ion-modal ion-button', '保存').click()

      expectStored('instances', (value) => {
        expect(value).to.deep.equal([{ name: 'Protocol Instance', url: 'proto.example' }])
      })
    })

    it('uses the url as the name when the name field is left empty', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('インスタンスを追加する').click()
      modalInput('インスタンスURLを入力').type('nameless.example')
      cy.contains('ion-modal ion-button', '保存').click()

      expectStored('instances', (value) => {
        expect(value).to.deep.equal([{ name: 'nameless.example', url: 'nameless.example' }])
      })
    })

    it('does not add the same instance url twice', () => {
      cy.visitApp('/tabs/tab3', { instances: [PRIMARY_INSTANCE] })

      cy.settingsItem('インスタンスを追加する').click()
      modalInput('名前').type('Duplicate')
      modalInput('インスタンスURLを入力').type(PRIMARY_HOST)
      cy.contains('ion-modal ion-button', '保存').click()

      cy.get('ion-modal').should('not.be.visible')
      expectStored('instances', (value) => {
        expect(value).to.deep.equal([PRIMARY_INSTANCE])
      })
    })

    it('discards the input when the modal is closed', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('インスタンスを追加する').click()
      cy.get('ion-modal').should('be.visible')
      modalInput('インスタンスURLを入力').type('discarded.example')
      cy.contains('ion-modal ion-button', 'Close').click()

      cy.get('ion-modal').should('not.be.visible')
      expectStored('instances', (value) => {
        expect(value).to.eq(null)
      })
    })

    it('clears the fields when the modal is reopened', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('インスタンスを追加する').click()
      modalInput('名前').type('Leftover')
      cy.contains('ion-modal ion-button', 'Close').click()
      cy.get('ion-modal').should('not.be.visible')

      cy.settingsItem('インスタンスを追加する').click()
      cy.get('ion-modal').should('be.visible')
      modalInput('名前').should('have.value', '')
    })

    it('stores the default instance url through its own modal', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('デフォルトインスタンスURLを設定').click()
      cy.get('ion-modal').should('be.visible')
      cy.contains('ion-modal ion-title', 'デフォルトインスタンスを設定').should('be.visible')

      cy.get('ion-modal ion-input input').should('have.length', 1)
      modalInput('デフォルトインスタンスURLを入力').type('https://default.example/')
      cy.contains('ion-modal ion-button', '保存').click()

      expectStored('settings', (value) => {
        expect(value).to.have.property('defaultInstanceUrl', 'default.example')
      })
      expectStored('instances', (value) => {
        expect(value).to.eq(null)
      })
    })

    it('hands the saved default instance url to the playlist export', () => {
      cy.visitApp('/tabs/tab3', { playlist: [makePlaylistItem()] })

      cy.settingsItem('デフォルトインスタンスURLを設定').click()
      modalInput('デフォルトインスタンスURLを入力').type('https://default.example/')
      cy.contains('ion-modal ion-button', '保存').click()
      cy.get('ion-modal').should('not.be.visible')

      cy.tabButton('tab5').click()
      cy.clickAria('export-playlist')
      cy.visibleAlert().should('contain', 'マイリストをエクスポート')

      cy.get('ion-alert textarea')
        .invoke('val')
        .then((raw) => {
          expect(JSON.parse(String(raw)).settings.defaultInstanceUrl).to.eq('default.example')
        })
    })
  })

  describe('language', () => {
    it('switches the interface to English', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('言語設定').find('ion-select').click()
      cy.choosePopoverOption('English')

      cy.contains('ion-title', 'Settings').should('be.visible')
      cy.window().its('localStorage').invoke('getItem', 'locale').should('eq', 'en')
      expectStored('settings', (value) => {
        expect(value).to.have.property('locale', 'en')
      })
    })

    it('switches the interface to German', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('言語設定').find('ion-select').click()
      cy.choosePopoverOption('Deutsch')

      cy.contains('ion-title', 'Einstellungen').should('be.visible')
      cy.window().its('localStorage').invoke('getItem', 'locale').should('eq', 'de')
    })

    it('translates the other tabs too', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('言語設定').find('ion-select').click()
      cy.choosePopoverOption('English')
      cy.contains('ion-title', 'Settings').should('be.visible')

      cy.tabButton('tab1').click()
      cy.contains('ion-title', 'Instances').should('be.visible')
      cy.tabButton('tab5').click()
      cy.contains('ion-title', 'Playlist').should('be.visible')
    })

    it('keeps the chosen language after a reload', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('言語設定').find('ion-select').click()
      cy.choosePopoverOption('English')
      cy.contains('ion-title', 'Settings').should('be.visible')

      cy.reload()

      cy.contains('ion-title', 'Settings').should('be.visible')
    })

    it('starts in the persisted language', () => {
      cy.visitApp('/tabs/tab3', { locale: 'en', settings: { locale: 'en' } })

      cy.contains('ion-title', 'Settings').should('be.visible')
    })
  })

  describe('about dialog', () => {
    it('shows the app information and closes again', () => {
      cy.visitApp('/tabs/tab3')

      cy.settingsItem('このアプリについて').click()

      cy.visibleAlert().should('contain', 'Yaju-Tube')
      cy.visibleAlert().find('.alert-message').should('contain', 'PYU224')
      cy.visibleAlert().find('.alert-message').should('contain', 'MIT License')

      cy.get('ion-alert ion-backdrop').click({ force: true })
      cy.get('ion-alert:visible').should('not.exist')
    })
  })
})
