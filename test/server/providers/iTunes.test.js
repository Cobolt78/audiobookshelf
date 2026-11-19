const { expect } = require('chai')
const sinon = require('sinon')
const axios = require('axios')
const iTunes = require('../../../server/providers/iTunes')

describe('iTunes Series Provider', () => {
  let itunes

  beforeEach(() => {
    itunes = new iTunes()
  })

  afterEach(() => {
    sinon.restore()
  })

  describe('matchesAuthor', () => {
    it('accepts candidate when seriesAuthors is empty', () => {
      expect(itunes.matchesAuthor('Any Author', [])).to.be.true
      expect(itunes.matchesAuthor('Any Author', null)).to.be.true
    })

    it('accepts exact or substring author match', () => {
      expect(itunes.matchesAuthor('Brandon Sanderson', ['Brandon Sanderson'])).to.be.true
      expect(itunes.matchesAuthor('Brandon Sanderson, Michael Whelan', ['Brandon Sanderson'])).to.be.true
      expect(itunes.matchesAuthor('Brandon Sanderson & Kate Reading', ['Brandon Sanderson'])).to.be.true
    })

    it('accepts surname and initial author match', () => {
      expect(itunes.matchesAuthor('B. Sanderson', ['Brandon Sanderson'])).to.be.true
      expect(itunes.matchesAuthor('Sanderson, B.', ['Brandon Sanderson'])).to.be.true
    })

    it('rejects candidate when author does not match series authors', () => {
      expect(itunes.matchesAuthor('Stephen King', ['Brandon Sanderson'])).to.be.false
      expect(itunes.matchesAuthor('Joe Abercrombie', ['Brandon Sanderson', 'Robert Jordan'])).to.be.false
      expect(itunes.matchesAuthor('Stephen Fry', ['Stephen King'])).to.be.false
      expect(itunes.matchesAuthor('Stanley King', ['Stephen King'])).to.be.false
    })
  })

  describe('matchesSeries', () => {
    it('matches when collectionName contains normalized series name', () => {
      expect(itunes.matchesSeries('The Way of Kings: The Stormlight Archive, Book 1 (Unabridged)', 'The Stormlight Archive')).to.be.true
      expect(itunes.matchesSeries('Words of Radiance (Stormlight Archive, Book 2)', 'The Stormlight Archive')).to.be.true
    })

    it('matches series name without suffix like trilogy or chronicles', () => {
      expect(itunes.matchesSeries('The Name of the Wind: Kingkiller, Book 1', 'The Kingkiller Chronicle')).to.be.true
    })

    it('rejects unrelated series or standalone titles', () => {
      expect(itunes.matchesSeries('Elantris (Unabridged)', 'The Stormlight Archive')).to.be.false
      expect(itunes.matchesSeries('Warbreaker', 'Mistborn')).to.be.false
      expect(itunes.matchesSeries('Aftermath of War', 'Aftermath', false)).to.be.false
    })
  })

  describe('extractPosition', () => {
    it('extracts sequence numbers from iTunes collection titles', () => {
      expect(itunes.extractPosition('Words of Radiance: The Stormlight Archive, Book 2 (Unabridged)')).to.equal('2')
      expect(itunes.extractPosition('Edgedancer: From Arcanum Unbounded, Book 2.5')).to.equal('2.5')
      expect(itunes.extractPosition('Rhythm of War: Book 4')).to.equal('4')
      expect(itunes.extractPosition('Dawnshard #3.5')).to.equal('3.5')
      expect(itunes.extractPosition('The Dragons of Dorcastle (Pillars of Reality, Book One)')).to.equal('1')
      expect(itunes.extractPosition('Standalone Novel')).to.be.null
    })
  })

  describe('isBookOwned', () => {
    it('identifies owned books by title or sequence without eponymous series false-positives', () => {
      const ownedBooks = [
        { title: 'The Way of Kings', sequence: '1' },
        { title: 'Words of Radiance', sequence: '2' }
      ]

      expect(itunes.isBookOwned({ collectionName: 'The Way of Kings: The Stormlight Archive, Book 1' }, ownedBooks, 'The Stormlight Archive')).to.be.true
      expect(itunes.isBookOwned({ collectionName: 'The Stormlight Archive: Book 2' }, ownedBooks, 'The Stormlight Archive')).to.be.true
      expect(itunes.isBookOwned({ collectionName: 'Oathbringer: The Stormlight Archive, Book 3' }, ownedBooks, 'The Stormlight Archive')).to.be.false
      expect(itunes.isBookOwned({ collectionName: 'Foundation and Empire (Foundation, Book 2)' }, [{ title: 'Foundation', sequence: '1' }], 'Foundation')).to.be.false
    })
  })

  describe('fetchSeriesProviderEntries', () => {
    it('returns skipped when seriesName is empty', async () => {
      const res = await itunes.fetchSeriesProviderEntries('')
      expect(res.skipped).to.be.true
      expect(res.provider).to.equal('itunes')
    })

    it('queries iTunes and categorizes into missing and upcoming with strict validation', async () => {
      const axiosGetStub = sinon.stub(axios, 'get').resolves({
        data: {
          results: [
            // Owned book (Book 1)
            {
              collectionName: 'The Way of Kings: The Stormlight Archive, Book 1',
              artistName: 'Brandon Sanderson',
              releaseDate: '2010-08-31T07:00:00Z',
              collectionViewUrl: 'https://books.apple.com/audiobook/way-of-kings/id123',
              artworkUrl100: 'https://example.com/cover1-100x100bb.jpg',
              description: 'Epic fantasy novel.'
            },
            // Missing book (Book 3)
            {
              collectionName: 'Oathbringer: The Stormlight Archive, Book 3',
              artistName: 'Brandon Sanderson',
              releaseDate: '2017-11-14T07:00:00Z',
              collectionViewUrl: 'https://books.apple.com/audiobook/oathbringer/id456',
              artworkUrl100: 'https://example.com/cover3-100x100bb.jpg',
              description: 'Third book in series.'
            },
            // Upcoming book (Book 5)
            {
              collectionName: 'Wind and Truth: The Stormlight Archive, Book 5',
              artistName: 'Brandon Sanderson',
              releaseDate: '2028-12-06T07:00:00Z',
              collectionViewUrl: 'https://books.apple.com/audiobook/wind-and-truth/id789',
              artworkUrl100: 'https://example.com/cover5-100x100bb.jpg',
              description: 'Fifth book in series.'
            },
            // False positive hit (different author / different series)
            {
              collectionName: 'Stormlight Legends: Book 1',
              artistName: 'Completely Different Author',
              releaseDate: '2020-01-01T07:00:00Z',
              collectionViewUrl: 'https://books.apple.com/audiobook/junk/id000'
            }
          ]
        }
      })

      const ownedBooks = [
        { title: 'The Way of Kings', sequence: '1' }
      ]
      const seriesAuthors = ['Brandon Sanderson']

      const result = await itunes.fetchSeriesProviderEntries('The Stormlight Archive', ownedBooks, seriesAuthors, 'us')

      expect(result.skipped).to.be.false
      expect(result.provider).to.equal('itunes')

      // Missing should have Book 3
      expect(result.missing).to.have.lengthOf(1)
      expect(result.missing[0].title).to.equal('Oathbringer: The Stormlight Archive, Book 3')
      expect(result.missing[0].position).to.equal('3')
      expect(result.missing[0].author).to.equal('Brandon Sanderson')
      expect(result.missing[0].narrator).to.be.null
      expect(result.missing[0].asin).to.be.null
      expect(result.missing[0].provider).to.equal('itunes')
      expect(result.missing[0].entryType).to.equal('missing')
      expect(result.missing[0].isReleased).to.be.true
      expect(result.missing[0].releaseDate).to.equal('2017-11-14')

      // Upcoming should have Book 5
      expect(result.upcoming).to.have.lengthOf(1)
      expect(result.upcoming[0].title).to.equal('Wind and Truth: The Stormlight Archive, Book 5')
      expect(result.upcoming[0].position).to.equal('5')
      expect(result.upcoming[0].author).to.equal('Brandon Sanderson')
      expect(result.upcoming[0].narrator).to.be.null
      expect(result.upcoming[0].asin).to.be.null
      expect(result.upcoming[0].provider).to.equal('itunes')
      expect(result.upcoming[0].entryType).to.equal('upcoming')
      expect(result.upcoming[0].isReleased).to.be.false
      expect(result.upcoming[0].releaseDate).to.equal('2028-12-06')
    })
  })
})

describe('iTunes', () => {
  let itunes

  beforeEach(() => {
    itunes = new iTunes()
  })

  describe('cleanAudiobook', () => {
    function authorFrom(artistName) {
      return itunes.cleanAudiobook({ artistName }).author
    }

    it('should return an empty string if artistName is missing', () => {
      expect(authorFrom()).to.equal('')
      expect(authorFrom('')).to.equal('')
    })

    it('should keep a single author without commas', () => {
      expect(authorFrom('Joy Fielding')).to.equal('Joy Fielding')
    })

    it('should strip commas from a single author with a credential', () => {
      expect(authorFrom('Rick Hanson, PhD')).to.equal('Rick Hanson PhD')
    })

    it('should split two authors joined by an ampersand', () => {
      expect(authorFrom('Name1 & Name2')).to.equal('Name1, Name2')
    })

    it('should split three authors using commas and an ampersand', () => {
      expect(authorFrom('Keltie Knight, Becca Tobin & Jac Vanek')).to.equal('Keltie Knight, Becca Tobin, Jac Vanek')
    })

    it('should glue a one-word credential onto the previous author before the ampersand', () => {
      expect(authorFrom('Rick Hanson, PhD & Jane Doe')).to.equal('Rick Hanson PhD, Jane Doe')
    })

    it('should glue several one-word credentials in a row', () => {
      expect(authorFrom('Rick Hanson, PhD, MD & Jane Doe')).to.equal('Rick Hanson PhD MD, Jane Doe')
    })

    it('should strip commas from the last author', () => {
      expect(authorFrom('Rick Hanson & Jane Doe, PhD')).to.equal('Rick Hanson, Jane Doe PhD')
    })

    it('should glue credentials before the ampersand and strip commas from the last author', () => {
      expect(authorFrom('Rick Hanson, PhD & Jane Doe, PhD')).to.equal('Rick Hanson PhD, Jane Doe PhD')
    })
  })
})
