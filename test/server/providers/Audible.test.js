const Audible = require('../../../server/providers/Audible')
const { expect } = require('chai')
const sinon = require('sinon')

describe('Audible', () => {
  let audible;

  beforeEach(() => {
    audible = new Audible();
  });

  describe('cleanSeriesSequence', () => {
    it('should return an empty string if sequence is falsy', () => {
      const result = audible.cleanSeriesSequence('Series Name', null)
      expect(result).to.equal('')
    })

    it('should return the sequence as is if it does not contain a number', () => {
      const result = audible.cleanSeriesSequence('Series Name', 'part a')
      expect(result).to.equal('part a')
    })

    it('should return the sequence as is if contains just a number', () => {
      const result = audible.cleanSeriesSequence('Series Name', '2')
      expect(result).to.equal('2')
    })

    it('should return the sequence as is if contains just a number with decimals', () => {
      const result = audible.cleanSeriesSequence('Series Name', '2.3')
      expect(result).to.equal('2.3')
    })

    it('should extract and return the first number from the sequence', () => {
      const result = audible.cleanSeriesSequence('Series Name', 'Book 1')
      expect(result).to.equal('1')
    })

    it('should extract and return the number with decimals from the sequence', () => {
      const result = audible.cleanSeriesSequence('Series Name', 'Book 1.5')
      expect(result).to.equal('1.5')
    })
    
    it('should extract and return the number even if it has no leading zero', () => {
      const result = audible.cleanSeriesSequence('Series Name', 'Book .5')
      expect(result).to.equal('.5')
    })
  })

  describe('cleanResult', () => {
    const baseItem = {
      title: 'Some Book',
      formatType: 'unabridged'
    }

    it('should set explicit to true when isAdult is true', () => {
      const result = audible.cleanResult({ ...baseItem, isAdult: true })
      expect(result.explicit).to.equal(true)
    })

    it('should set explicit to false when isAdult is false', () => {
      const result = audible.cleanResult({ ...baseItem, isAdult: false })
      expect(result.explicit).to.equal(false)
    })

    it('should set explicit to false when isAdult is not present', () => {
      const result = audible.cleanResult({ ...baseItem })
      expect(result.explicit).to.equal(false)
    })
  })

  describe('normalizedTitle', () => {
    it('should normalize series and book titles for matching', () => {
      expect(audible.normalizedTitle('The Stormlight Archive')).to.equal('stormlightarchive')
      expect(audible.normalizedTitle('The Way of Kings: Part 1!')).to.equal('wayofkingspart1')
      expect(audible.normalizedTitle('')).to.equal('')
      expect(audible.normalizedTitle(null)).to.equal('')
    })
  })

  describe('realReleaseDate', () => {
    it('should return valid release dates', () => {
      expect(audible.realReleaseDate('2026-12-06T00:00:00Z')).to.equal('2026-12-06')
      expect(audible.realReleaseDate('2024-05-15')).to.equal('2024-05-15')
    })

    it('should filter out far-future placeholder dates', () => {
      expect(audible.realReleaseDate('2200-01-01')).to.be.null
      expect(audible.realReleaseDate('2099-12-31')).to.be.null
      expect(audible.realReleaseDate(null)).to.be.null
      expect(audible.realReleaseDate('')).to.be.null
    })
  })

  describe('audibleTld', () => {
    it('should return proper TLD for region', () => {
      expect(audible.audibleTld('us')).to.equal('.com')
      expect(audible.audibleTld('uk')).to.equal('.co.uk')
      expect(audible.audibleTld('au')).to.equal('.com.au')
      expect(audible.audibleTld('de')).to.equal('.de')
      expect(audible.audibleTld('unknown')).to.equal('.com')
    })
  })

  describe('resolveSeriesAsin', () => {
    afterEach(() => {
      sinon.restore()
    })

    it('resolves series via owned book ASIN', async () => {
      sinon.stub(audible, 'requestAudible').resolves({
        product: {
          series: [
            {
              asin: 'B00713KV4W',
              title: 'The Stormlight Archive',
              sequence: '1'
            }
          ]
        }
      })

      const result = await audible.resolveSeriesAsin(
        'The Stormlight Archive',
        [{ asin: 'B003P2WO5E', title: 'The Way of Kings' }]
      )

      expect(result).to.not.be.null
      expect(result.seriesAsin).to.equal('B00713KV4W')
      expect(result.matchedName).to.equal('The Stormlight Archive')
    })

    it('falls back to catalog search when no owned book has ASIN', async () => {
      sinon.stub(audible, 'requestAudible').resolves({
        products: [
          {
            asin: 'B003P2WO5E',
            title: 'The Way of Kings',
            series: [
              {
                asin: 'B00713KV4W',
                title: 'The Stormlight Archive',
                sequence: '1'
              }
            ]
          }
        ]
      })

      const result = await audible.resolveSeriesAsin(
        'The Stormlight Archive',
        [{ title: 'The Way of Kings' }]
      )

      expect(result).to.not.be.null
      expect(result.seriesAsin).to.equal('B00713KV4W')
    })
  })

  describe('fetchSeriesProviderEntries', () => {
    afterEach(() => {
      sinon.restore()
    })

    it('returns skipped when series cannot be resolved', async () => {
      sinon.stub(audible, 'resolveSeriesAsin').resolves(null)

      const result = await audible.fetchSeriesProviderEntries('Unknown Series', [])
      expect(result.skipped).to.be.true
      expect(result.seriesAsin).to.be.null
    })

    it('categorizes series books into owned, missing, and upcoming', async () => {
      sinon.stub(audible, 'resolveSeriesAsin').resolves({
        seriesAsin: 'B00713KV4W',
        matchedName: 'The Stormlight Archive'
      })

      const requestStub = sinon.stub(audible, 'requestAudible')

      // First call: Series hierarchy parent product
      requestStub.onFirstCall().resolves({
        product: {
          relationships: [
            { asin: 'ASIN_BOOK_1', relationship_type: 'series', relationship_to_product: 'child', sequence: '1' },
            { asin: 'ASIN_BOOK_2', relationship_type: 'series', relationship_to_product: 'child', sequence: '2' },
            { asin: 'ASIN_BOOK_3', relationship_type: 'series', relationship_to_product: 'child', sequence: '3' },
            { asin: 'ASIN_BOOK_4', relationship_type: 'series', relationship_to_product: 'child', sequence: '4' }
          ]
        }
      })

      // Second call: Batch hydrated products
      requestStub.onSecondCall().resolves({
        products: [
          {
            asin: 'ASIN_BOOK_1',
            title: 'The Way of Kings',
            release_date: '2010-08-31',
            is_listenable: true,
            is_purchasability_suppressed: false,
            product_images: { '500': 'https://example.com/cover1.jpg' }
          },
          {
            asin: 'ASIN_BOOK_2',
            title: 'Words of Radiance',
            release_date: '2014-03-04',
            is_listenable: true,
            is_purchasability_suppressed: false,
            product_images: { '500': 'https://example.com/cover2.jpg' }
          },
          {
            asin: 'ASIN_BOOK_3',
            title: 'Oathbringer',
            authors: [{ name: 'Brandon Sanderson' }],
            narrators: [{ name: 'Michael Kramer' }, { name: 'Kate Reading' }],
            release_date: '2017-11-14',
            is_listenable: true,
            is_purchasability_suppressed: false,
            product_images: { '500': 'https://example.com/cover3.jpg' }
          },
          {
            asin: 'ASIN_BOOK_4',
            title: 'Wind and Truth',
            authors: [{ name: 'Brandon Sanderson' }],
            narrators: [{ name: 'Michael Kramer' }, { name: 'Kate Reading' }],
            release_date: '2027-12-06', // Future date
            is_listenable: true,
            is_purchasability_suppressed: false,
            product_images: { '500': 'https://example.com/cover4.jpg' }
          }
        ]
      })

      // User owns Book 1 and Book 2
      const ownedBooks = [
        { asin: 'ASIN_BOOK_1', title: 'The Way of Kings' },
        { title: 'Words of Radiance' } // Matched by title
      ]

      const result = await audible.fetchSeriesProviderEntries('The Stormlight Archive', ownedBooks, 'us')

      expect(result.skipped).to.be.false
      expect(result.seriesAsin).to.equal('B00713KV4W')

      // Book 1 & 2 are owned -> should not be in missing or upcoming
      // Book 3 is past released (2017) -> missing
      expect(result.missing).to.have.lengthOf(1)
      expect(result.missing[0].title).to.equal('Oathbringer')
      expect(result.missing[0].position).to.equal('3')
      expect(result.missing[0].author).to.equal('Brandon Sanderson')
      expect(result.missing[0].narrator).to.equal('Michael Kramer, Kate Reading')
      expect(result.missing[0].entryType).to.equal('missing')
      expect(result.missing[0].isReleased).to.be.true

      // Book 4 is future released (2027) -> upcoming
      expect(result.upcoming).to.have.lengthOf(1)
      expect(result.upcoming[0].title).to.equal('Wind and Truth')
      expect(result.upcoming[0].position).to.equal('4')
      expect(result.upcoming[0].author).to.equal('Brandon Sanderson')
      expect(result.upcoming[0].narrator).to.equal('Michael Kramer, Kate Reading')
      expect(result.upcoming[0].entryType).to.equal('upcoming')
      expect(result.upcoming[0].isReleased).to.be.false
    })

    it('propagates rate-limited error with retryAfter metadata', async () => {
      sinon.stub(audible, 'resolveSeriesAsin').rejects(Object.assign(new Error('Rate limited'), { rateLimited: true, retryAfter: 60 }))

      try {
        await audible.fetchSeriesProviderEntries('Any Series', [])
        expect.fail('Should have thrown')
      } catch (err) {
        expect(err.rateLimited).to.be.true
        expect(err.retryAfter).to.equal(60)
      }
    })
  })

  describe('authorsMatch', () => {
    it('matches normalized initials without false-positive surname collisions', () => {
      expect(audible.authorsMatch([{ name: 'A.A. Dark' }], ['A A Dark'])).to.be.true
      expect(audible.authorsMatch([{ name: 'A. A. Dark' }], ['A A Dark'])).to.be.true
      expect(audible.authorsMatch([{ name: 'Dannika Dark' }], ['A A Dark'])).to.be.false
      expect(audible.authorsMatch([{ name: 'Alice Dark' }], ['A. A. Dark'])).to.be.false
      expect(audible.authorsMatch([{ name: 'A. B. Dark' }], ['A. A. Dark'])).to.be.false
      expect(audible.authorsMatch([{ name: 'B. Sanderson' }], ['Brandon Sanderson'])).to.be.true
      expect(audible.authorsMatch([{ name: 'Brandon Sanderson, Michael Whelan' }], ['Brandon Sanderson'])).to.be.true
    })
  })

  describe('resolveLiveEdition', () => {
    afterEach(() => {
      sinon.restore()
    })

    it('rejects candidates from unrelated authors or series when resolving placeholders', async () => {
      sinon.stub(audible, 'requestAudible').resolves({
        products: [
          {
            asin: '1977384684',
            title: 'Blackout',
            authors: [{ name: 'Dannika Dark' }],
            series: [{ asin: 'B0752X8P9W', title: 'Crossbreed', sequence: '5' }],
            price: { list_price: { base: 19.95 } },
            runtime_length_min: 500
          }
        ]
      })

      const placeholderProduct = {
        asin: 'B0D6NDGBHV',
        title: 'Black Out',
        sku: 'PL_HLDR_147891',
        authors: [{ name: 'A A Dark' }]
      }

      const result = await audible.resolveLiveEdition('24690 Series', placeholderProduct, '4', 'us', 'B0D6NC23Y1', ['A.A. Dark'])
      expect(result).to.be.null
    })

    it('accepts valid live edition matching author, series, and title', async () => {
      sinon.stub(audible, 'requestAudible').resolves({
        products: [
          {
            asin: '1977384684',
            title: 'Blackout',
            authors: [{ name: 'Dannika Dark' }],
            series: [{ asin: 'B0752X8P9W', title: 'Crossbreed', sequence: '5' }],
            price: { list_price: { base: 19.95 } },
            runtime_length_min: 500
          },
          {
            asin: 'B0REAL4444',
            title: 'Black Out',
            authors: [{ name: 'A.A. Dark' }],
            series: [{ asin: 'B0D6NC23Y1', title: '24690 Series', sequence: '4' }],
            price: { list_price: { base: 19.95 } },
            runtime_length_min: 480
          }
        ]
      })

      const placeholderProduct = {
        asin: 'B0D6NDGBHV',
        title: 'Black Out',
        sku: 'PL_HLDR_147891',
        authors: [{ name: 'A A Dark' }]
      }

      const result = await audible.resolveLiveEdition('24690 Series', placeholderProduct, '4', 'us', 'B0D6NC23Y1', ['A.A. Dark'])
      expect(result).to.not.be.null
      expect(result.asin).to.equal('B0REAL4444')
    })

    it('accepts re-issued edition when series suffix differs (e.g. "24690 Series" vs "24690")', async () => {
      sinon.stub(audible, 'requestAudible').resolves({
        products: [
          {
            asin: '1977384684',
            title: 'Blackout',
            authors: [{ name: 'Dannika Dark' }],
            series: [{ asin: 'B072ML7BCL', title: 'Crossbreed', sequence: '5' }],
            price: { list_price: { base: 19.95 } },
            runtime_length_min: 500
          },
          {
            asin: 'B0DYQQY8KJ',
            title: 'Black Out',
            authors: [{ name: 'A.A. Dark' }],
            series: [{ asin: 'B0DWMCS554', title: '24690', sequence: '4' }],
            price: { list_price: { base: 19.95 } },
            runtime_length_min: 480
          }
        ]
      })

      const placeholderProduct = {
        asin: 'B0D6NDGBHV',
        title: 'Black Out',
        sku: 'PL_HLDR_147891',
        authors: [{ name: 'A A Dark' }]
      }

      const result = await audible.resolveLiveEdition('24690 Series', placeholderProduct, '4', 'us', 'B0D6NC23Y1', ['A. A. Dark'])
      expect(result).to.not.be.null
      expect(result.asin).to.equal('B0DYQQY8KJ')
    })
  })

  describe('resolveSeriesAsin author filtering', () => {
    afterEach(() => {
      sinon.restore()
    })

    it('rejects catalog hits with matching series name but mismatched author in Strategy 2', async () => {
      sinon.stub(audible, 'requestAudible').resolves({
        products: [
          {
            asin: 'B0WRONG001',
            title: 'Wrong Book',
            authors: [{ name: 'Other Author' }],
            series: [{ asin: 'B0WRONGSERIES', title: 'Legacy' }]
          },
          {
            asin: 'B0RIGHT001',
            title: 'Right Book',
            authors: [{ name: 'Target Author' }],
            series: [{ asin: 'B0RIGHTSERIES', title: 'Legacy' }]
          }
        ]
      })

      const result = await audible.resolveSeriesAsin('Legacy', [{ title: 'Book 1', authors: ['Target Author'] }], 'us', ['Target Author'])
      expect(result).to.not.be.null
      expect(result.seriesAsin).to.equal('B0RIGHTSERIES')
    })
  })
})