const { expect } = require('chai')
const sinon = require('sinon')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')
const seriesFilters = require('../../../server/utils/queries/seriesFilters')
const LibraryController = require('../../../server/controllers/LibraryController')
const SeriesController = require('../../../server/controllers/SeriesController')
const SeriesProviderManager = require('../../../server/managers/SeriesProviderManager')

describe('Series Provider Endpoints & Completion Filters', () => {
  let sequelize
  let library
  let user
  let series1 // Has missing books
  let series2 // Complete (has entries, 0 missing)
  let series3 // Has upcoming releases

  beforeEach(async () => {
    global.ServerSettings = {}
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    Database.sequelize = sequelize
    await Database.buildModels()

    user = await Database.userModel.create({
      username: 'admin',
      type: 'root',
      isActive: true,
      permissions: Database.userModel.getDefaultPermissionsForUserType('root')
    })

    library = await Database.libraryModel.create({
      name: 'Audiobooks',
      mediaType: 'book',
      settings: Database.libraryModel.getDefaultLibrarySettingsForMediaType('book')
    })
    const libraryFolder = await Database.libraryFolderModel.create({ path: '/test-lib', libraryId: library.id })

    // Series 1: The Stormlight Archive
    series1 = await Database.seriesModel.create({
      name: 'The Stormlight Archive',
      libraryId: library.id
    })
    const book1 = await Database.bookModel.create({
      title: 'The Way of Kings',
      explicit: false,
      audioFiles: [],
      tags: [],
      narrators: [],
      genres: [],
      chapters: []
    })
    await Database.libraryItemModel.create({
      path: '/test-lib/book1',
      isFile: false,
      libraryFiles: [],
      mediaId: book1.id,
      mediaType: 'book',
      libraryId: library.id,
      libraryFolderId: libraryFolder.id
    })
    await series1.addBook(book1)

    // Add missing book to Series 1
    await Database.seriesProviderEntryModel.create({
      libraryId: library.id,
      seriesId: series1.id,
      seriesName: series1.name,
      title: 'Words of Radiance',
      position: '2',
      releaseDate: '2014-03-04',
      asin: 'B00HQ8XW5W',
      entryType: 'missing',
      isReleased: true,
      lastScannedAt: Date.now()
    })

    // Series 2: The Lord of the Rings (Complete: 0 missing books, only owned entry)
    series2 = await Database.seriesModel.create({
      name: 'The Lord of the Rings',
      libraryId: library.id
    })
    const book2 = await Database.bookModel.create({
      title: 'The Fellowship of the Ring',
      explicit: false,
      audioFiles: [],
      tags: [],
      narrators: [],
      genres: [],
      chapters: []
    })
    await Database.libraryItemModel.create({
      path: '/test-lib/book2',
      isFile: false,
      libraryFiles: [],
      mediaId: book2.id,
      mediaType: 'book',
      libraryId: library.id,
      libraryFolderId: libraryFolder.id
    })
    await series2.addBook(book2)

    // Series 3: Red Rising (Has upcoming book)
    series3 = await Database.seriesModel.create({
      name: 'Red Rising',
      libraryId: library.id
    })
    const book3 = await Database.bookModel.create({
      title: 'Red Rising',
      explicit: false,
      audioFiles: [],
      tags: [],
      narrators: [],
      genres: [],
      chapters: []
    })
    await Database.libraryItemModel.create({
      path: '/test-lib/book3',
      isFile: false,
      libraryFiles: [],
      mediaId: book3.id,
      mediaType: 'book',
      libraryId: library.id,
      libraryFolderId: libraryFolder.id
    })
    await series3.addBook(book3)

    // Add upcoming release to Series 3
    await Database.seriesProviderEntryModel.create({
      libraryId: library.id,
      seriesId: series3.id,
      seriesName: series3.name,
      title: 'Red God',
      position: '7',
      releaseDate: '2027-05-01',
      asin: 'B0XYZ99999',
      entryType: 'upcoming',
      isReleased: false,
      lastScannedAt: Date.now()
    })
  })

  afterEach(async () => {
    sinon.restore()
    if (sequelize) {
      await sequelize.close()
    }
  })

  describe('seriesFilters completion filtering', () => {
    it('filters series with missing books using completion.has-missing', async () => {
      const result = await seriesFilters.getFilteredSeries(
        library,
        user,
        'completion.has-missing',
        'name',
        false,
        [],
        10,
        0
      )

      expect(result.series).to.have.lengthOf(1)
      expect(result.series[0].name).to.equal('The Stormlight Archive')
    })

    it('filters series with upcoming releases using completion.has-upcoming', async () => {
      const result = await seriesFilters.getFilteredSeries(
        library,
        user,
        'completion.has-upcoming',
        'name',
        false,
        [],
        10,
        0
      )

      expect(result.series).to.have.lengthOf(1)
      expect(result.series[0].name).to.equal('Red Rising')
    })

    it('filters series with missing books using missing-books.missing-count', async () => {
      const result = await seriesFilters.getFilteredSeries(
        library,
        user,
        'missing-books.missing-count',
        null,
        null,
        [],
        10,
        0
      )

      expect(result.series).to.have.lengthOf(1)
      expect(result.series[0].name).to.equal('The Stormlight Archive')
    })

    it('sorts series by missingBooks count descending', async () => {
      const result = await seriesFilters.getFilteredSeries(
        library,
        user,
        null,
        'missingBooks',
        true, // sortDesc
        [],
        10,
        0
      )

      expect(result.series).to.have.lengthOf(3)
      // Stormlight Archive has 1 missing book, others have 0
      expect(result.series[0].name).to.equal('The Stormlight Archive')
    })
  })

  describe('LibraryController endpoints', () => {
    it('scanSeriesProvider initiates scan and returns 200', async () => {
      const scanStub = sinon.stub(SeriesProviderManager, 'scanLibrary').resolves({ success: true })
      sinon.stub(SeriesProviderManager, 'getScanStatus').returns({ isScanning: false })

      const req = {
        user: { canUpdate: true },
        library: { id: library.id, isBook: true }
      }
      const res = {
        json: sinon.spy(),
        status: sinon.stub().returns({ json: sinon.spy() }),
        sendStatus: sinon.spy()
      }

      await LibraryController.scanSeriesProvider(req, res)
      expect(res.json.calledOnce).to.be.true
      expect(res.json.firstCall.args[0].success).to.be.true
      expect(scanStub.calledWith(library.id)).to.be.true
    })

    it('scanSeriesProvider initiates single series scan when seriesId provided', async () => {
      const singleScanStub = sinon.stub(SeriesProviderManager, 'scanSingleSeries').resolves({ success: true })
      sinon.stub(SeriesProviderManager, 'getScanStatus').returns({ isScanning: false })

      const req = {
        user: { canUpdate: true },
        library: { id: library.id, isBook: true },
        body: { seriesId: 'test-series-id' }
      }
      const res = {
        json: sinon.spy(),
        status: sinon.stub().returns({ json: sinon.spy() }),
        sendStatus: sinon.spy()
      }

      await LibraryController.scanSeriesProvider(req, res)
      expect(res.json.calledOnce).to.be.true
      expect(res.json.firstCall.args[0].success).to.be.true
      expect(res.json.firstCall.args[0].seriesId).to.equal('test-series-id')
      expect(singleScanStub.calledWith(library.id, 'test-series-id')).to.be.true
    })

    it('cancelSeriesProviderScan cancels active scan', async () => {
      const cancelStub = sinon.stub(SeriesProviderManager, 'cancelScan').returns(true)

      const req = {
        user: { canUpdate: true },
        library: { id: library.id, isBook: true }
      }
      const res = {
        json: sinon.spy(),
        sendStatus: sinon.spy()
      }

      await LibraryController.cancelSeriesProviderScan(req, res)
      expect(res.json.calledWith({ success: true })).to.be.true
      expect(cancelStub.calledWith(library.id)).to.be.true
    })

    it('getUpcomingReleases returns upcoming releases feed and scan status', async () => {
      const req = {
        library
      }
      const res = {
        json: sinon.spy()
      }

      await LibraryController.getUpcomingReleases(req, res)
      expect(res.json.calledOnce).to.be.true
      const data = res.json.firstCall.args[0]
      expect(data.upcomingReleases).to.have.lengthOf(1)
      expect(data.upcomingReleases[0].title).to.equal('Red God')
      expect(data.total).to.equal(1)
      expect(data.scanStatus).to.exist
    })

    it('getMissingBooks returns missing books feed and scan status', async () => {
      const req = {
        library
      }
      const res = {
        json: sinon.spy()
      }

      await LibraryController.getMissingBooks(req, res)
      expect(res.json.calledOnce).to.be.true
      const data = res.json.firstCall.args[0]
      expect(data.missingBooks).to.have.lengthOf(1)
      expect(data.missingBooks[0].title).to.equal('Words of Radiance')
      expect(data.total).to.equal(1)
      expect(data.scanStatus).to.exist
    })
  })

  describe('SeriesController.getProviderEntries', () => {
    it('returns all provider entries for a specific series', async () => {
      const req = {
        series: series1
      }
      const res = {
        json: sinon.spy()
      }

      await SeriesController.getProviderEntries(req, res)
      expect(res.json.calledOnce).to.be.true
      const data = res.json.firstCall.args[0]
      expect(data.seriesId).to.equal(series1.id)
      expect(data.seriesName).to.equal('The Stormlight Archive')
      expect(data.entries).to.have.lengthOf(1)
      expect(data.entries[0].title).to.equal('Words of Radiance')
    })
  })
})
