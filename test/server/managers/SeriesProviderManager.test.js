const { expect } = require('chai')
const sinon = require('sinon')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')
const SocketAuthority = require('../../../server/SocketAuthority')
const SeriesProviderManager = require('../../../server/managers/SeriesProviderManager')
const CronManager = require('../../../server/managers/CronManager')

describe('SeriesProviderManager & Cron Integration', () => {
  let sequelize
  let bookLibrary
  let podcastLibrary
  let testSeries
  let socketEmitterStub

  beforeEach(async () => {
    global.ServerSettings = {}
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    Database.sequelize = sequelize
    await Database.buildModels()

    bookLibrary = await Database.libraryModel.create({
      name: 'Audiobooks',
      mediaType: 'book',
      settings: {
        seriesScraperCron: null,
        seriesScraperRegion: 'us',
        seriesScraperLastScan: null
      }
    })

    podcastLibrary = await Database.libraryModel.create({
      name: 'Podcasts',
      mediaType: 'podcast'
    })

    testSeries = await Database.seriesModel.create({
      name: 'Mistborn',
      libraryId: bookLibrary.id
    })

    const book1 = await Database.bookModel.create({
      title: 'The Final Empire',
      asin: 'B002V0QK4C'
    })

    await testSeries.addBook(book1, { through: { sequence: '1' } })

    socketEmitterStub = sinon.stub(SocketAuthority, 'emitter')
  })

  afterEach(async () => {
    sinon.restore()
    if (sequelize) {
      await sequelize.close()
    }
  })

  it('rejects scan for non-existent library', async () => {
    const result = await SeriesProviderManager.scanLibrary('non-existent-id')
    expect(result.success).to.be.false
    expect(result.message).to.equal('Library not found')
  })

  it('rejects scan for non-book library', async () => {
    const result = await SeriesProviderManager.scanLibrary(podcastLibrary.id)
    expect(result.success).to.be.false
    expect(result.message).to.equal('Only book libraries support series provider scanning')
  })

  it('scans series, persists upcoming and missing entries, and updates lastScan metadata', async () => {
    const scraperStub = sinon.stub(SeriesProviderManager.audible, 'fetchSeriesProviderEntries').resolves({
      skipped: false,
      seriesAsin: 'B00713KV4W',
      upcoming: [
        {
          title: 'The Lost Metal',
          position: '7',
          releaseDate: '2027-11-15',
          asin: 'B09XYZ1234',
          providerUrl: 'https://audible.com/pd/B09XYZ1234',
          entryType: 'upcoming',
          isReleased: false
        }
      ],
      missing: [
        {
          title: 'The Well of Ascension',
          position: '2',
          releaseDate: '2007-08-21',
          asin: 'B002V0QKEW',
          providerUrl: 'https://audible.com/pd/B002V0QKEW',
          entryType: 'missing',
          isReleased: true
        }
      ]
    })

    const result = await SeriesProviderManager.scanLibrary(bookLibrary.id)
    expect(result.success).to.be.true
    expect(result.summary.status).to.equal('completed')
    expect(result.summary.seriesChecked).to.equal(1)
    expect(result.summary.upcomingFound).to.equal(1)
    expect(result.summary.missingFound).to.equal(1)

    // Verify database entries
    const entries = await Database.seriesProviderEntryModel.findAll({
      where: { libraryId: bookLibrary.id }
    })
    expect(entries).to.have.lengthOf(2)

    const upcoming = entries.find((e) => e.entryType === 'upcoming')
    expect(upcoming.title).to.equal('The Lost Metal')
    expect(upcoming.isReleased).to.be.false

    const missing = entries.find((e) => e.entryType === 'missing')
    expect(missing.title).to.equal('The Well of Ascension')
    expect(missing.isReleased).to.be.true

    // Verify library settings updated
    const reloadedLib = await Database.libraryModel.findByPk(bookLibrary.id)
    expect(reloadedLib.settings.seriesScraperLastScan.status).to.equal('completed')
    expect(reloadedLib.settings.seriesScraperLastScan.upcomingFound).to.equal(1)

    // Verify WebSocket events emitted
    expect(socketEmitterStub.calledWith('series_provider_scan_started')).to.be.true
    expect(socketEmitterStub.calledWith('series_provider_scan_progress')).to.be.true
    expect(socketEmitterStub.calledWith('series_provider_scan_completed')).to.be.true
  })

  it('handles rate-limited error gracefully by marking status and emitting failure', async () => {
    sinon.stub(SeriesProviderManager.audible, 'fetchSeriesProviderEntries').rejects(
      Object.assign(new Error('Rate limited'), { rateLimited: true, retryAfter: 60 })
    )

    const result = await SeriesProviderManager.scanLibrary(bookLibrary.id)
    expect(result.success).to.be.false
    expect(result.summary.status).to.equal('rate-limited')
    expect(result.summary.errorMessage).to.include('60s')

    const reloadedLib = await Database.libraryModel.findByPk(bookLibrary.id)
    expect(reloadedLib.settings.seriesScraperLastScan.status).to.equal('rate-limited')
    expect(socketEmitterStub.calledWith('series_provider_scan_failed')).to.be.true
  })

  it('manages cron lifecycle in CronManager for series provider', () => {
    const cronManager = new CronManager(null, null)

    const mockLib = {
      id: 'lib-1',
      name: 'Audiobooks',
      isBook: true,
      settings: {
        seriesScraperCron: '0 3 * * 0'
      }
    }

    cronManager.startCronForSeriesProvider(mockLib)
    expect(cronManager.seriesProviderCrons).to.have.lengthOf(1)
    expect(cronManager.seriesProviderCrons[0].libraryId).to.equal('lib-1')

    // Update with new expression
    mockLib.settings.seriesScraperCron = '0 4 * * 0'
    cronManager.updateSeriesProviderCron(mockLib)
    expect(cronManager.seriesProviderCrons).to.have.lengthOf(1)
    expect(cronManager.seriesProviderCrons[0].expression).to.equal('0 4 * * 0')

    // Remove cron
    mockLib.settings.seriesScraperCron = null
    cronManager.updateSeriesProviderCron(mockLib)
    expect(cronManager.seriesProviderCrons).to.have.lengthOf(0)
  })
})
