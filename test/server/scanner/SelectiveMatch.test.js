const { expect } = require('chai')
const sinon = require('sinon')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')
const Scanner = require('../../../server/scanner/Scanner')
const BookFinder = require('../../../server/finders/BookFinder')
const CoverManager = require('../../../server/managers/CoverManager')
const SocketAuthority = require('../../../server/SocketAuthority')

describe('Scanner Selective Match', () => {
  let sequelize
  let library
  let authorOld
  let seriesOld
  let libraryItem

  beforeEach(async () => {
    global.ServerSettings = {}
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    Database.sequelize = sequelize
    Database.serverSettings = { scannerPreferMatchedMetadata: false }
    await Database.buildModels()

    library = await Database.libraryModel.create({
      name: 'Audiobooks',
      mediaType: 'book',
      icon: 'audiobookshelf',
      displayOrder: 1,
      provider: 'audible',
      settings: {
        skipMatchingMediaWithAsin: true,
        skipMatchingMediaWithIsbn: true
      }
    })

    authorOld = await Database.authorModel.create({
      name: 'Original Author',
      lastFirst: 'Author, Original',
      libraryId: library.id
    })

    seriesOld = await Database.seriesModel.create({
      name: 'Original Series',
      nameIgnorePrefix: 'Original Series',
      libraryId: library.id
    })

    const book = await Database.bookModel.create({
      title: 'Original Title',
      subtitle: null,
      description: 'Old Description',
      narrators: ['Old Narrator'],
      publisher: 'Old Publisher',
      publishedYear: '2020',
      genres: ['Fiction'],
      tags: ['old-tag'],
      asin: 'B000000001',
      isbn: null,
      audioFiles: [],
      chapters: []
    })

    await Database.bookAuthorModel.create({
      bookId: book.id,
      authorId: authorOld.id
    })
    await Database.bookSeriesModel.create({
      bookId: book.id,
      seriesId: seriesOld.id,
      sequence: '1'
    })

    libraryItem = await Database.libraryItemModel.create({
      ino: 'ino-1',
      path: '/books/original',
      relPath: 'original',
      mediaType: 'book',
      mediaId: book.id,
      libraryId: library.id,
      libraryFiles: []
    })

    libraryItem = (await Database.libraryItemModel.findAllExpandedWhere({ id: libraryItem.id }))[0]
    libraryItem.saveMetadataFile = sinon.stub().resolves()
    sinon.stub(SocketAuthority, 'libraryItemEmitter')
    sinon.stub(SocketAuthority, 'emitter')
  })

  afterEach(async () => {
    sinon.restore()
    if (sequelize) {
      await sequelize.close()
    }
  })

  it('strictly ignores unchecked fields (even when blank) and updates only checked fields', async () => {
    sinon.stub(BookFinder, 'search').resolves([
      {
        cover: 'https://example.com/new-cover.jpg',
        title: 'New Provider Title',
        subtitle: 'New Provider Subtitle', // Currently null in DB, should stay null because unchecked
        description: 'New Provider Description',
        author: 'New Author',
        narrator: 'New Narrator',
        publisher: 'New Publisher',
        publishedYear: '2025',
        series: [{ series: 'Different Provider Series', sequence: '9' }],
        genres: ['Sci-Fi'],
        tags: ['new-tag'],
        isbn: '9781234567890'
      }
    ])
    const coverStub = sinon.stub(CoverManager, 'downloadCoverFromUrlNew').resolves({ cover: '/covers/new.jpg' })

    const apiRouterCtx = {
      checkRemoveAuthorsWithNoBooks: sinon.stub().resolves(),
      checkRemoveEmptySeries: sinon.stub().resolves()
    }

    const result = await Scanner.quickMatchLibraryItem(apiRouterCtx, libraryItem, {
      provider: 'audible',
      selectedFields: ['cover', 'description', 'author', 'narrator'],
      overrideExisting: true
    })

    expect(result.updated).to.be.true
    expect(coverStub.calledOnce).to.be.true
    expect(libraryItem.media.coverPath).to.equal('/covers/new.jpg')
    expect(libraryItem.media.description).to.equal('New Provider Description')
    expect(libraryItem.media.narrators).to.deep.equal(['New Narrator'])
    expect(libraryItem.media.authors.map((a) => a.name)).to.deep.equal(['New Author'])

    // Unchecked fields must remain untouched (including blank subtitle and isbn)
    expect(libraryItem.media.title).to.equal('Original Title')
    expect(libraryItem.media.subtitle).to.be.null
    expect(libraryItem.media.publisher).to.equal('Old Publisher')
    expect(libraryItem.media.publishedYear).to.equal('2020')
    expect(libraryItem.media.genres).to.deep.equal(['Fiction'])
    expect(libraryItem.media.tags).to.deep.equal(['old-tag'])
    expect(libraryItem.media.isbn).to.be.null
    expect(libraryItem.media.series.map((s) => s.name)).to.deep.equal(['Original Series'])
  })

  it('respects overrideExisting=false for checked fields without touching unchecked blank fields', async () => {
    sinon.stub(BookFinder, 'search').resolves([
      {
        title: 'New Provider Title',
        subtitle: 'New Provider Subtitle',
        description: 'New Provider Description',
        isbn: '9781234567890'
      }
    ])

    const apiRouterCtx = {
      checkRemoveAuthorsWithNoBooks: sinon.stub().resolves(),
      checkRemoveEmptySeries: sinon.stub().resolves()
    }

    await Scanner.quickMatchLibraryItem(apiRouterCtx, libraryItem, {
      provider: 'audible',
      selectedFields: ['title', 'subtitle', 'description'], // isbn is unchecked; subtitle is blank
      overrideExisting: false
    })

    // Checked & non-empty should NOT overwrite
    expect(libraryItem.media.title).to.equal('Original Title')
    expect(libraryItem.media.description).to.equal('Old Description')
    // Checked & blank SHOULD fill
    expect(libraryItem.media.subtitle).to.equal('New Provider Subtitle')
    // Unchecked & blank MUST stay blank
    expect(libraryItem.media.isbn).to.be.null
  })

  it('respects skipMatchingMediaWithAsin unless ignoreSkipAsinIsbn is true', async () => {
    const searchStub = sinon.stub(BookFinder, 'search').resolves([
      {
        narrator: 'Updated Narrator'
      }
    ])

    const apiRouterCtx = {
      checkRemoveAuthorsWithNoBooks: sinon.stub().resolves(),
      checkRemoveEmptySeries: sinon.stub().resolves()
    }
    const scanStub = { resultsUpdated: 0, libraryId: library.id, libraryName: library.name }

    // With ignoreSkipAsinIsbn: false -> skips because libraryItem.media.asin is set
    await Scanner.matchLibraryItemsChunk(apiRouterCtx, library, [libraryItem], scanStub, {
      provider: 'audible',
      selectedFields: ['narrator'],
      overrideExisting: true,
      ignoreSkipAsinIsbn: false
    })
    expect(searchStub.called).to.be.false
    expect(libraryItem.media.narrators).to.deep.equal(['Old Narrator'])

    // With ignoreSkipAsinIsbn: true -> re-matches and updates narrator only
    await Scanner.matchLibraryItemsChunk(apiRouterCtx, library, [libraryItem], scanStub, {
      provider: 'audible',
      selectedFields: ['narrator'],
      overrideExisting: true,
      ignoreSkipAsinIsbn: true
    })
    expect(searchStub.calledOnce).to.be.true
    expect(libraryItem.media.narrators).to.deep.equal(['Updated Narrator'])
    expect(libraryItem.media.title).to.equal('Original Title')
  })
})
