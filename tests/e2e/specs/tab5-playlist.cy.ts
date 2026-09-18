import {
  PRIMARY_HOST,
  SECOND_HOST,
  expectSessionItem,
  expectStored,
  makePlaylistItem,
  makeVideo,
  stubEmbed,
  stubThumbnails,
  stubVideoDetail,
} from '../support/helpers'

const SEEDED = [
  makePlaylistItem({
    videoId: 'p-0001',
    videoName: 'Saved Video One',
    channelName: 'Chan One',
    addedAt: 1700000001000,
  }),
  makePlaylistItem({
    videoId: 'p-0002',
    videoName: 'Saved Video Two',
    thumbnailPath: '',
    channelName: 'Chan Two',
    instanceUrl: SECOND_HOST,
    addedAt: 1700000000000,
  }),
]

function fillImportDialog(payload: unknown) {
  cy.clickAria('import-playlist')
  cy.visibleAlert().should('contain', 'マイリストをインポート')
  cy.get('ion-alert textarea').invoke('val', JSON.stringify(payload)).trigger('input')
  cy.alertButton('インポート').click()
}

describe('tab5 playlist', () => {
  beforeEach(() => {
    stubThumbnails(PRIMARY_HOST)
    stubThumbnails(SECOND_HOST)
  })

  describe('listing', () => {
    it('shows the empty state and offers only the import action', () => {
      cy.visitApp('/tabs/tab5')

      cy.contains('ion-title', 'マイリスト').should('be.visible')
      cy.contains('マイリストはありません').should('be.visible')
      cy.ariaButton('import-playlist').should('exist')
      cy.get('button[aria-label="export-playlist"]').should('not.exist')
      cy.get('button[aria-label="clear-playlist"]').should('not.exist')
    })

    it('lists the saved videos with their channel and instance', () => {
      cy.visitApp('/tabs/tab5', { playlist: SEEDED })

      cy.get('ion-item-sliding').should('have.length', 2)
      cy.contains('ion-item', 'Saved Video One').should('contain', 'Chan One')
      cy.contains('ion-item', 'Saved Video One').find('.instance-url').should('contain', PRIMARY_HOST)
      cy.contains('ion-item', 'Saved Video Two').find('.instance-url').should('contain', SECOND_HOST)
    })

    it('renders the thumbnail of an entry that has one', () => {
      cy.visitApp('/tabs/tab5', { playlist: SEEDED })

      cy.contains('ion-item', 'Saved Video One')
        .find('img')
        .should('have.attr', 'src', `https://${PRIMARY_HOST}/static/thumbnails/vid-0001.jpg`)
    })

    it('falls back to a placeholder box when the entry has no thumbnail', () => {
      cy.visitApp('/tabs/tab5', { playlist: SEEDED })

      cy.contains('ion-item', 'Saved Video Two').find('.thumbnail-fallback').should('exist')
      cy.contains('ion-item', 'Saved Video Two').find('img').should('not.exist')
    })

    it('opens the entry on the instance it was saved from', () => {
      stubVideoDetail(makeVideo({ uuid: 'p-0002', name: 'Saved Video Two' }), SECOND_HOST)
      stubEmbed(SECOND_HOST)

      cy.visitApp('/tabs/tab5', { playlist: SEEDED })

      cy.contains('ion-item', 'Saved Video Two').click()

      cy.location('pathname').should('eq', '/tabs/video/p-0002')
      cy.wait('@videoDetail').its('request.url').should('contain', SECOND_HOST)
      cy.get('iframe')
        .should('have.attr', 'src')
        .and('contain', `https://${SECOND_HOST}/videos/embed/p-0002`)
      expectSessionItem('tempInstanceUrl', null)
    })
  })

  describe('removing entries', () => {
    it('removes a single entry through the sliding option', () => {
      cy.visitApp('/tabs/tab5', { playlist: SEEDED })

      cy.slidingOption('Saved Video One', '削除')

      cy.contains('ion-item', 'Saved Video One').should('not.exist')
      cy.contains('ion-item', 'Saved Video Two').should('be.visible')
      expectStored('playlist', (value) => {
        const stored = (value as { playlist: { videoId: string }[] }).playlist
        expect(stored.map((item) => item.videoId)).to.deep.equal(['p-0002'])
      })
    })

    it('keeps the entries when the clear-all dialog is cancelled', () => {
      cy.visitApp('/tabs/tab5', { playlist: SEEDED })

      cy.clickAria('clear-playlist')
      cy.visibleAlert().should('contain', 'マイリストをすべて削除しますか？')
      cy.alertButton('キャンセル').click()

      cy.get('ion-alert').should('not.exist')
      cy.get('ion-item-sliding').should('have.length', 2)
    })

    it('clears the whole playlist once the dialog is confirmed', () => {
      cy.visitApp('/tabs/tab5', { playlist: SEEDED })

      cy.clickAria('clear-playlist')
      cy.visibleAlert().should('be.visible')
      cy.alertButton('削除').click()

      cy.contains('マイリストはありません').should('be.visible')
      cy.get('button[aria-label="clear-playlist"]').should('not.exist')
      expectStored('playlist', (value) => {
        expect((value as { playlist: unknown[] }).playlist).to.have.length(0)
      })
    })
  })

  describe('export', () => {
    it('shows the serialized playlist and settings in the export dialog', () => {
      cy.visitApp('/tabs/tab5', { playlist: SEEDED })

      cy.clickAria('export-playlist')
      cy.visibleAlert().should('contain', 'マイリストをエクスポート')

      cy.get('ion-alert textarea')
        .invoke('val')
        .then((raw) => {
          const parsed = JSON.parse(String(raw))
          expect(parsed.version).to.eq(1)
          expect(parsed.items).to.have.length(2)
          expect(parsed.items[0]).to.deep.include({
            videoId: 'p-0001',
            videoName: 'Saved Video One',
            instanceUrl: PRIMARY_HOST,
          })
          expect(parsed.settings).to.have.keys(
            'defaultInstanceUrl',
            'displayMode',
            'itemsPerPage',
            'locale',
            'theme',
          )
        })

      cy.alertButton('キャンセル').click()
      cy.get('ion-alert').should('not.exist')
    })

    it('exports the settings that are currently in effect', () => {
      cy.visitApp('/tabs/tab5', {
        playlist: SEEDED,
        settings: { theme: 'sepia', displayMode: 'grid', itemsPerPage: 30 },
      })

      cy.clickAria('export-playlist')
      cy.get('ion-alert textarea')
        .invoke('val')
        .then((raw) => {
          const parsed = JSON.parse(String(raw))
          expect(parsed.settings).to.deep.include({
            theme: 'sepia',
            displayMode: 'grid',
            itemsPerPage: 30,
          })
        })
    })
  })

  describe('import', () => {
    it('restores the items and the settings of a valid export', () => {
      cy.visitApp('/tabs/tab5')

      cy.fixture('playlist-export.json').then((payload) => {
        fillImportDialog(payload)
      })

      cy.contains('ion-item', 'Imported Video').should('be.visible')
      cy.contains('ion-title', 'Playlist').should('be.visible')
      cy.document().its('body').should('have.attr', 'data-theme', 'dark')
      expectStored('settings', (value) => {
        expect(value).to.include({
          displayMode: 'grid',
          itemsPerPage: 30,
          defaultInstanceUrl: 'imported.example',
          locale: 'en',
        })
      })
      expectStored('playlist', (value) => {
        expect((value as { playlist: unknown[] }).playlist).to.have.length(1)
      })
      cy.window().its('localStorage').invoke('getItem', 'locale').should('eq', 'en')
    })

    it('replaces the current playlist and deduplicates by instance and video', () => {
      const payload = {
        version: 1,
        exportedAt: '2024-01-05T00:00:00.000Z',
        settings: {
          defaultInstanceUrl: PRIMARY_HOST,
          displayMode: 'list',
          itemsPerPage: 20,
          locale: 'ja',
          theme: 'light',
        },
        items: [
          makePlaylistItem({
            videoId: 'dup-1',
            videoName: 'Old Duplicate',
            thumbnailPath: '',
            instanceUrl: 'dup.example',
            addedAt: 1000,
          }),
          makePlaylistItem({
            videoId: 'dup-1',
            videoName: 'New Duplicate',
            thumbnailPath: '',
            instanceUrl: 'dup.example',
            addedAt: 2000,
          }),
          makePlaylistItem({
            videoId: 'other-1',
            videoName: 'Other Video',
            thumbnailPath: '',
            instanceUrl: 'other.example',
            addedAt: 1500,
          }),
        ],
      }

      cy.visitApp('/tabs/tab5', { playlist: SEEDED })

      fillImportDialog(payload)

      cy.get('ion-item-sliding').should('have.length', 2)
      cy.contains('ion-item', 'New Duplicate').should('be.visible')
      cy.contains('ion-item', 'Old Duplicate').should('not.exist')
      cy.contains('ion-item', 'Saved Video One').should('not.exist')
      cy.contains('ion-item', 'Other Video').should('exist')
    })

    it('reports an error for a payload that is not valid json', () => {
      cy.visitApp('/tabs/tab5')

      cy.clickAria('import-playlist')
      cy.visibleAlert().should('be.visible')
      cy.get('ion-alert textarea').invoke('val', 'this is not json').trigger('input')
      cy.alertButton('インポート').click()

      cy.contains('.import-error', 'マイリストを読み込めませんでした').should('be.visible')
      cy.contains('マイリストはありません').should('be.visible')
    })

    it('reports an error when nothing was pasted at all', () => {
      cy.visitApp('/tabs/tab5')

      cy.clickAria('import-playlist')
      cy.visibleAlert().should('be.visible')
      cy.alertButton('インポート').click()

      cy.contains('.import-error', 'マイリストを読み込めませんでした').should('be.visible')
    })

    it('rejects an export whose version is not supported', () => {
      cy.visitApp('/tabs/tab5')

      cy.fixture('playlist-export.json').then((payload) => {
        fillImportDialog({ ...payload, version: 2 })
      })

      cy.contains('.import-error', 'マイリストを読み込めませんでした').should('be.visible')
      cy.contains('ion-item', 'Imported Video').should('not.exist')
    })

    it('rejects an export whose items are malformed', () => {
      cy.visitApp('/tabs/tab5')

      fillImportDialog({
        version: 1,
        exportedAt: '2024-01-05T00:00:00.000Z',
        settings: {
          defaultInstanceUrl: PRIMARY_HOST,
          displayMode: 'list',
          itemsPerPage: 20,
          locale: 'ja',
          theme: 'light',
        },
        items: [{ videoId: 'broken' }],
      })

      cy.contains('.import-error', 'マイリストを読み込めませんでした').should('be.visible')
    })

    it('keeps the existing playlist when an import fails', () => {
      cy.visitApp('/tabs/tab5', { playlist: SEEDED })

      cy.clickAria('import-playlist')
      cy.get('ion-alert textarea').invoke('val', '{ broken').trigger('input')
      cy.alertButton('インポート').click()

      cy.contains('.import-error', 'マイリストを読み込めませんでした').should('be.visible')
      cy.get('ion-item-sliding').should('have.length', 2)
    })
  })
})
