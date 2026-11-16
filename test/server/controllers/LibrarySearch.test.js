const { expect } = require('chai')
const sinon = require('sinon')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')
const LibraryController = require('../../../server/controllers/LibraryController')

describe('LibraryController.search limit & category filtering', () => {
  let sequelize
  let library
  let user

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
      icon: 'audiobookshelf',
      displayOrder: 1,
      settings: {}
    })

    const author = await Database.authorModel.create({
      name: 'Starlight Author',
      libraryId: library.id
    })

    for (let i = 1; i <= 15; i++) {
      const book = await Database.bookModel.create({
        title: `Starlight Chronicle ${i}`,
        narrators: ['Starlight Narrator'],
        tags: ['starlight-tag'],
        genres: ['Fantasy'],
        audioFiles: [],
        chapters: []
      })
      await Database.bookAuthorModel.create({
        bookId: book.id,
        authorId: author.id
      })
      await Database.libraryItemModel.create({
        ino: `ino-${i}`,
        path: `/books/starlight-${i}`,
        relPath: `starlight-${i}`,
        mediaType: 'book',
        mediaId: book.id,
        libraryId: library.id,
        libraryFiles: []
      })
      const series = await Database.seriesModel.create({
        name: `Starlight Saga ${i}`,
        libraryId: library.id
      })
      await Database.bookSeriesModel.create({
        bookId: book.id,
        seriesId: series.id,
        sequence: '1'
      })
    }
  })

  afterEach(async () => {
    sinon.restore()
    if (sequelize) {
      await sequelize.close()
    }
  })

  it('defaults to limit 12 when limit and category are omitted', async () => {
    const jsonSpy = sinon.spy()
    await LibraryController.search(
      {
        user,
        library,
        query: { q: 'Starlight' }
      },
      { json: jsonSpy, status: () => ({ send: sinon.spy() }) }
    )

    expect(jsonSpy.calledOnce).to.be.true
    const payload = jsonSpy.firstCall.args[0]
    expect(payload.book).to.have.lengthOf(12)
    expect(payload.series).to.have.lengthOf(12)
    expect(payload.authors).to.have.lengthOf(1)
  })

  it('returns all matching books when limit=0 and category=books', async () => {
    const jsonSpy = sinon.spy()
    await LibraryController.search(
      {
        user,
        library,
        query: { q: 'Starlight', limit: '0', category: 'books' }
      },
      { json: jsonSpy, status: () => ({ send: sinon.spy() }) }
    )

    expect(jsonSpy.calledOnce).to.be.true
    const payload = jsonSpy.firstCall.args[0]
    expect(payload.book).to.have.lengthOf(15)
    expect(payload.series).to.have.lengthOf(0)
    expect(payload.authors).to.have.lengthOf(0)
  })

  it('returns all matching series when limit=0 and category=series', async () => {
    const jsonSpy = sinon.spy()
    await LibraryController.search(
      {
        user,
        library,
        query: { q: 'Starlight', limit: '0', category: 'series' }
      },
      { json: jsonSpy, status: () => ({ send: sinon.spy() }) }
    )

    expect(jsonSpy.calledOnce).to.be.true
    const payload = jsonSpy.firstCall.args[0]
    expect(payload.series).to.have.lengthOf(15)
    expect(payload.book).to.have.lengthOf(0)
    expect(payload.authors).to.have.lengthOf(0)
  })
})
