const { expect } = require('chai')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')
const migration = require('../../../server/migrations/v2.37.1-create-series-provider-entries')
const migrationV2373 = require('../../../server/migrations/v2.37.3-add-author-narrator-to-series-provider-entries')

describe('SeriesProviderEntry Model & Migration', () => {
  let sequelize
  let library
  let series

  beforeEach(async () => {
    global.ServerSettings = {}
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    Database.sequelize = sequelize
    await Database.buildModels()

    library = await Database.libraryModel.create({
      name: 'Audiobooks',
      mediaType: 'book'
    })

    series = await Database.seriesModel.create({
      name: 'The Stormlight Archive',
      libraryId: library.id
    })
  })

  afterEach(async () => {
    if (sequelize) {
      await sequelize.close()
    }
  })

  it('creates upcoming release entry with valid attributes', async () => {
    const entry = await Database.seriesProviderEntryModel.create({
      libraryId: library.id,
      seriesId: series.id,
      seriesName: series.name,
      title: 'Wind and Truth',
      author: 'Brandon Sanderson',
      narrator: 'Michael Kramer, Kate Reading',
      position: '5',
      releaseDate: '2026-12-06',
      asin: 'B0D1234567',
      coverUrl: 'https://m.media-amazon.com/images/cover.jpg',
      providerUrl: 'https://www.audible.com/pd/B0D1234567',
      summary: 'The climactic fifth book.',
      provider: 'audible',
      entryType: 'upcoming',
      isReleased: false,
      lastScannedAt: Date.now()
    })

    expect(entry.id).to.be.a('string')
    expect(entry.title).to.equal('Wind and Truth')
    expect(entry.entryType).to.equal('upcoming')
    expect(entry.isReleased).to.be.false
    expect(entry.position).to.equal('5')
    expect(entry.author).to.equal('Brandon Sanderson')
    expect(entry.narrator).to.equal('Michael Kramer, Kate Reading')

    const json = entry.toJSON()
    expect(json.id).to.equal(entry.id)
    expect(json.libraryId).to.equal(library.id)
    expect(json.seriesId).to.equal(series.id)
    expect(json.title).to.equal('Wind and Truth')
    expect(json.author).to.equal('Brandon Sanderson')
    expect(json.narrator).to.equal('Michael Kramer, Kate Reading')
    expect(json.entryType).to.equal('upcoming')
    expect(json.lastScannedAt).to.be.a('number')
  })

  it('creates missing book entry with valid attributes', async () => {
    const entry = await Database.seriesProviderEntryModel.create({
      libraryId: library.id,
      seriesId: series.id,
      seriesName: series.name,
      title: 'Edgedancer',
      position: '2.5',
      releaseDate: '2017-10-17',
      asin: 'B076214567',
      provider: 'audible',
      entryType: 'missing',
      isReleased: true,
      lastScannedAt: Date.now()
    })

    expect(entry.entryType).to.equal('missing')
    expect(entry.isReleased).to.be.true
    expect(entry.position).to.equal('2.5')
  })

  it('cascades delete when series is destroyed', async () => {
    await Database.seriesProviderEntryModel.create({
      libraryId: library.id,
      seriesId: series.id,
      seriesName: series.name,
      title: 'Words of Radiance',
      position: '2',
      entryType: 'missing',
      lastScannedAt: Date.now()
    })

    const countBefore = await Database.seriesProviderEntryModel.count({ where: { seriesId: series.id } })
    expect(countBefore).to.equal(1)

    await series.destroy()

    const countAfter = await Database.seriesProviderEntryModel.count({ where: { seriesId: series.id } })
    expect(countAfter).to.equal(0)
  })

  it('cascades delete when library is destroyed', async () => {
    await Database.seriesProviderEntryModel.create({
      libraryId: library.id,
      seriesId: series.id,
      seriesName: series.name,
      title: 'Oathbringer',
      position: '3',
      entryType: 'missing',
      lastScannedAt: Date.now()
    })

    const countBefore = await Database.seriesProviderEntryModel.count({ where: { libraryId: library.id } })
    expect(countBefore).to.equal(1)

    await library.destroy()

    const countAfter = await Database.seriesProviderEntryModel.count({ where: { libraryId: library.id } })
    expect(countAfter).to.equal(0)
  })

  it('runs migration up and down successfully on raw queryInterface', async () => {
    const testSeq = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    const qi = testSeq.getQueryInterface()
    const mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {}
    }

    // 1. Create base tables that seriesProviderEntries references
    await qi.createTable('libraries', {
      id: { type: Sequelize.DataTypes.UUID, primaryKey: true }
    })
    await qi.createTable('series', {
      id: { type: Sequelize.DataTypes.UUID, primaryKey: true }
    })

    // 2. Run migration up
    await migration.up({ context: { queryInterface: qi, logger: mockLogger } })
    expect(await qi.tableExists('seriesProviderEntries')).to.be.true

    // 3. Verify indexes exist
    const indexes = await qi.showIndex('seriesProviderEntries')
    const indexNames = indexes.map((i) => i.name)
    expect(indexNames).to.include('spe_library_entrytype_date')
    expect(indexNames).to.include('spe_series_entrytype')
    expect(indexNames).to.include('spe_asin')

    // 4. Run migration down
    await migration.down({ context: { queryInterface: qi, logger: mockLogger } })
    expect(await qi.tableExists('seriesProviderEntries')).to.be.false

    await testSeq.close()
  })

  it('runs v2.37.3 migration up and down idempotently on seriesProviderEntries table', async () => {
    const testSeq = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    const qi = testSeq.getQueryInterface()
    const mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {}
    }

    // 1. Create a legacy seriesProviderEntries table without author and narrator columns
    await qi.createTable('seriesProviderEntries', {
      id: { type: Sequelize.DataTypes.UUID, primaryKey: true },
      title: { type: Sequelize.DataTypes.STRING, allowNull: false }
    })

    let table = await qi.describeTable('seriesProviderEntries')
    expect(table.author).to.be.undefined
    expect(table.narrator).to.be.undefined

    // 2. Run up migration
    await migrationV2373.up({ context: { queryInterface: qi, logger: mockLogger } })
    table = await qi.describeTable('seriesProviderEntries')
    expect(table.author).to.not.be.undefined
    expect(table.narrator).to.not.be.undefined

    // 3. Run up migration a second time (idempotency check)
    await migrationV2373.up({ context: { queryInterface: qi, logger: mockLogger } })
    table = await qi.describeTable('seriesProviderEntries')
    expect(table.author).to.not.be.undefined
    expect(table.narrator).to.not.be.undefined

    // 4. Run down migration
    await migrationV2373.down({ context: { queryInterface: qi, logger: mockLogger } })
    table = await qi.describeTable('seriesProviderEntries')
    expect(table.author).to.be.undefined
    expect(table.narrator).to.be.undefined

    await testSeq.close()
  })
})
