const axios = require('axios')
const Logger = require('../Logger')
const htmlSanitizer = require('../utils/htmlSanitizer')

/**
 * @typedef iTunesSearchParams
 * @property {string} term
 * @property {string} country
 * @property {string} media
 * @property {string} entity
 * @property {number} limit
 */

/**
 * @typedef iTunesPodcastSearchResult
 * @property {string} id
 * @property {string} artistId
 * @property {string} title
 * @property {string} artistName
 * @property {string} description
 * @property {string} descriptionPlain
 * @property {string} releaseDate
 * @property {string[]} genres
 * @property {string} cover
 * @property {string} feedUrl
 * @property {string} pageUrl
 * @property {boolean} explicit
 */

class iTunes {
  #responseTimeout = 10000
  #lastRequestTime = 0
  #minRequestInterval = 300

  constructor() {}

  /**
   * @see https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/Searching.html
   *
   * @param {iTunesSearchParams} options
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<Object[]>}
   */
  search(options, timeout = this.#responseTimeout) {
    if (!options.term) {
      Logger.error('[iTunes] Invalid search options - no term')
      return []
    }
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    const query = {
      term: options.term,
      media: options.media,
      entity: options.entity,
      lang: options.lang,
      limit: options.limit,
      country: options.country
    }
    return axios
      .get('https://itunes.apple.com/search', {
        params: query,
        timeout
      })
      .then((response) => {
        return response.data.results || []
      })
      .catch((error) => {
        Logger.error(`[iTunes] search request error`, error.message)
        return []
      })
  }

  // Example cover art: https://is1-ssl.mzstatic.com/image/thumb/Music118/v4/cb/ea/73/cbea739b-ff3b-11c4-fb93-7889fbec7390/9781598874983_cover.jpg/100x100bb.jpg
  // 100x100bb can be replaced by other values https://github.com/bendodson/itunes-artwork-finder
  // Target size 600 or larger
  getCoverArtwork(data) {
    if (data.artworkUrl600) {
      return data.artworkUrl600
    }
    // Should already be sorted from small to large
    var artworkSizes = Object.keys(data)
      .filter((key) => key.startsWith('artworkUrl'))
      .map((key) => {
        return {
          url: data[key],
          size: Number(key.replace('artworkUrl', ''))
        }
      })
    if (!artworkSizes.length) return null

    // Return next biggest size > 600
    var nextBestSize = artworkSizes.find((size) => size.size > 600)
    if (nextBestSize) return nextBestSize.url

    // Find square artwork
    var squareArtwork = artworkSizes.find((size) => size.url.includes(`${size.size}x${size.size}bb`))

    // Square cover replace with 600x600bb
    if (squareArtwork) {
      return squareArtwork.url.replace(`${squareArtwork.size}x${squareArtwork.size}bb`, '600x600bb')
    }

    // Last resort just return biggest size
    return artworkSizes[artworkSizes.length - 1].url
  }

  cleanAudiobook(data) {
    // artistName can be "Name1, Name2 & Name3" so we refactor this to "Name1, Name2, Name3"
    //  see: https://github.com/advplyr/audiobookshelf/issues/1022
    const author = (data.artistName || '').split(' & ').join(', ')

    return {
      id: data.collectionId,
      artistId: data.artistId,
      title: data.collectionName,
      author,
      description: data.description || null,
      publishedYear: data.releaseDate ? data.releaseDate.split('-')[0] : null,
      genres: data.primaryGenreName ? [data.primaryGenreName] : null,
      cover: this.getCoverArtwork(data)
    }
  }

  /**
   *
   * @param {string} term
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<Object[]>}
   */
  searchAudiobooks(term, timeout = this.#responseTimeout) {
    return this.search({ term, entity: 'audiobook', media: 'audiobook' }, timeout).then((results) => {
      return results.map(this.cleanAudiobook.bind(this))
    })
  }

  /**
   *
   * @param {Object} data
   * @returns {iTunesPodcastSearchResult}
   */
  cleanPodcast(data) {
    return {
      id: data.collectionId,
      artistId: data.artistId || null,
      title: data.collectionName,
      artistName: data.artistName,
      description: htmlSanitizer.sanitize(data.description || ''),
      descriptionPlain: htmlSanitizer.stripAllTags(data.description || ''),
      releaseDate: data.releaseDate,
      genres: data.genres || [],
      cover: this.getCoverArtwork(data),
      trackCount: data.trackCount,
      feedUrl: data.feedUrl,
      pageUrl: data.collectionViewUrl,
      explicit: data.trackExplicitness === 'explicit'
    }
  }

  /**
   *
   * @param {string} term
   * @param {{country:string}} options
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<iTunesPodcastSearchResult[]>}
   */
  searchPodcasts(term, options = {}, timeout = this.#responseTimeout) {
    return this.search({ term, entity: 'podcast', media: 'podcast', ...options }, timeout).then((results) => {
      return results.map(this.cleanPodcast.bind(this))
    })
  }

  /**
   * Normalize a title for comparison (case-insensitive, alphanumeric only, strip leading "the")
   * @param {string} str
   * @returns {string}
   */
  normalizedTitle(str) {
    if (!str || typeof str !== 'string') return ''
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/^the/, '')
  }

  /**
   * Clean a title by removing series prefix and common audio format tags
   * @param {string} title
   * @param {string} [seriesName]
   * @returns {string}
   */
  cleanTitle(title, seriesName) {
    if (!title || typeof title !== 'string') return ''
    let s = title.toLowerCase()
    if (seriesName) {
      const escaped = seriesName.replace(/[^a-z0-9]/gi, '\\$&')
      s = s.replace(new RegExp('^' + escaped + '[:\\s-]*', 'i'), '')
    }
    s = s.replace(/\b(short story|novella|audiobook|unabridged|abridged)\b/gi, '')
    return s.replace(/[^a-z0-9]/g, '')
  }

  /**
   * Extract book position/sequence number from iTunes collection title
   * @param {string} collectionName
   * @param {string} [seriesName]
   * @returns {string|null}
   */
  extractPosition(collectionName, seriesName) {
    if (!collectionName || typeof collectionName !== 'string') return null
    const patterns = [
      /(?:book|bk\.?|volume|vol\.?|part)\s*#?\s*(\d+(?:\.\d+)?)/i,
      /#\s*(\d+(?:\.\d+)?)/,
      /\b(\d+(?:\.\d+)?)\s*(?:st|nd|rd|th)?\s*installment\b/i
    ]
    for (const pat of patterns) {
      const match = collectionName.match(pat)
      if (match && match[1]) {
        return match[1]
      }
    }
    return null
  }

  /**
   * Check if iTunes artistName matches at least one known series author cleanly
   * @param {string} artistName
   * @param {Array<string>} seriesAuthors
   * @returns {boolean}
   */
  matchesAuthor(artistName, seriesAuthors = []) {
    if (!seriesAuthors || !seriesAuthors.length) return true
    if (!artistName || typeof artistName !== 'string') return false

    const cleanArtist = artistName.toLowerCase().replace(/[^a-z0-9\s,]/g, ' ')
    const artistTokens = cleanArtist.split(/[\s,]+/).filter(Boolean)

    for (const author of seriesAuthors) {
      if (!author || typeof author !== 'string') continue
      const cleanAuthor = author.toLowerCase().replace(/[^a-z0-9\s,]/g, ' ')

      // Substring match
      if (cleanArtist.includes(cleanAuthor) || cleanAuthor.includes(cleanArtist)) {
        return true
      }

      const authorTokens = cleanAuthor.split(/[\s,]+/).filter(Boolean)
      if (!authorTokens.length) continue

      // Identify surname (longest token) and first initial
      const surname = authorTokens.reduce((longest, t) => (t.length > longest.length ? t : longest), '')
      const firstToken = authorTokens[0]
      const firstInitial = firstToken[0]

      if (surname && artistTokens.includes(surname)) {
        const hasInitialOrFirst = artistTokens.some((t) => t === firstToken || t.startsWith(firstInitial))
        if (hasInitialOrFirst) return true
      }
    }

    return false
  }

  /**
   * Check if collectionName explicitly contains the normalized seriesName
   * @param {string} collectionName
   * @param {string} seriesName
   * @returns {boolean}
   */
  matchesSeries(collectionName, seriesName) {
    if (!collectionName || !seriesName) return false
    const normCollection = this.normalizedTitle(collectionName)
    const normSeries = this.normalizedTitle(seriesName)
    if (!normSeries) return false

    if (normCollection.includes(normSeries)) {
      return true
    }

    // Try stripping common series suffixes ("series", "trilogy", "saga", "chronicles", "chronicle")
    const coreSeries = seriesName.replace(/\b(series|trilogy|saga|chronicles|chronicle|duology|quartet)\b/gi, '').trim()
    const normCore = this.normalizedTitle(coreSeries)
    if (normCore && normCore.length >= 3 && normCollection.includes(normCore)) {
      return true
    }

    return false
  }

  /**
   * Check if candidate product is already owned in library using title or sequence
   * @param {object} candidate
   * @param {Array<object>} ownedBooks
   * @param {string} seriesName
   * @returns {boolean}
   */
  isBookOwned(candidate, ownedBooks = [], seriesName) {
    const candTitle = candidate.collectionName || ''
    const normCandTitle = this.normalizedTitle(candTitle)
    const candBase = candTitle.split(/[:\-–—]/)[0].trim()
    const normCandBase = this.normalizedTitle(candBase)
    const candClean = this.cleanTitle(candTitle, seriesName)
    const candPos = this.extractPosition(candTitle, seriesName)
    const candPosNum = candPos ? parseFloat(candPos) : null

    for (const owned of ownedBooks) {
      if (!owned) continue
      if (owned.title) {
        const normOwned = this.normalizedTitle(owned.title)
        if (normOwned && (normOwned === normCandTitle || normOwned === normCandBase)) {
          return true
        }
        const ownedBase = owned.title.split(/[:\-–—]/)[0].trim()
        const normOwnedBase = this.normalizedTitle(ownedBase)
        if (normOwnedBase && (normOwnedBase === normCandTitle || normOwnedBase === normCandBase)) {
          return true
        }
        const ownedClean = this.cleanTitle(owned.title, seriesName)
        if (candClean && ownedClean && (candClean === ownedClean || candClean.includes(ownedClean) || ownedClean.includes(candClean))) {
          return true
        }
      }
      if (candPosNum !== null && !isNaN(candPosNum) && owned.sequence !== null && owned.sequence !== undefined) {
        const ownedSeqNum = parseFloat(owned.sequence)
        if (!isNaN(ownedSeqNum) && ownedSeqNum === candPosNum) {
          return true
        }
      }
    }
    return false
  }

  /**
   * Fetch upcoming and missing series provider entries from iTunes
   * @param {string} seriesName
   * @param {Array<object>} [ownedBooks]
   * @param {Array<string>} [seriesAuthors]
   * @param {string} [region]
   * @returns {Promise<{ upcoming: Array, missing: Array, skipped: boolean, reason?: string, provider: string }>}
   */
  async fetchSeriesProviderEntries(seriesName, ownedBooks = [], seriesAuthors = [], region = 'us') {
    if (!seriesName) {
      return { upcoming: [], missing: [], skipped: true, reason: 'Empty series name', provider: 'itunes' }
    }

    // Polite rate pacing to avoid triggering iTunes 429 limits (~20 req/min)
    const now = Date.now()
    const elapsed = now - this.#lastRequestTime
    if (elapsed < this.#minRequestInterval) {
      await new Promise((resolve) => setTimeout(resolve, this.#minRequestInterval - elapsed))
    }
    this.#lastRequestTime = Date.now()

    let results = []
    const query = {
      term: seriesName,
      media: 'audiobook',
      entity: 'audiobook',
      country: region || 'us',
      limit: 50
    }

    try {
      const res = await axios.get('https://itunes.apple.com/search', {
        params: query,
        timeout: this.#responseTimeout
      })
      results = res.data?.results || []
    } catch (err) {
      if (err.response?.status === 429) {
        Logger.warn(`[iTunes] Rate limited (429) searching series "${seriesName}", backing off 2s`)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        try {
          const resRetry = await axios.get('https://itunes.apple.com/search', {
            params: query,
            timeout: this.#responseTimeout
          })
          results = resRetry.data?.results || []
        } catch (retryErr) {
          Logger.error(`[iTunes] Rate limited again searching series "${seriesName}": ${retryErr.message}`)
          return { upcoming: [], missing: [], skipped: true, reason: 'iTunes rate limited (429)', provider: 'itunes' }
        }
      } else {
        Logger.error(`[iTunes] Search error for series "${seriesName}": ${err.message}`)
        return { upcoming: [], missing: [], skipped: true, reason: err.message, provider: 'itunes' }
      }
    }

    if (!results.length) {
      return { upcoming: [], missing: [], skipped: true, reason: 'No results found on iTunes', provider: 'itunes' }
    }

    // Strict anti-false-positive filtering
    const validCandidates = []
    for (const item of results) {
      if (!item.collectionName) continue

      // 1. Author check
      if (seriesAuthors && seriesAuthors.length > 0 && !this.matchesAuthor(item.artistName, seriesAuthors)) {
        continue
      }

      // 2. Series match check
      if (!this.matchesSeries(item.collectionName, seriesName)) {
        continue
      }

      // 3. Not already owned check
      if (this.isBookOwned(item, ownedBooks, seriesName)) {
        continue
      }

      validCandidates.push(item)
    }

    if (!validCandidates.length) {
      return { upcoming: [], missing: [], skipped: true, reason: 'No matching unowned series entries on iTunes', provider: 'itunes' }
    }

    const todayIso = new Date().toISOString().substring(0, 10)
    const parsedCandidates = validCandidates.map((data) => {
      const position = this.extractPosition(data.collectionName, seriesName)
      const posNum = position ? parseFloat(position) : null
      const releaseDate = data.releaseDate ? data.releaseDate.substring(0, 10) : null
      const author = (data.artistName || '').split(' & ').join(', ') || null
      const coverUrl = this.getCoverArtwork(data) || null
      const summary = data.description ? htmlSanitizer.stripAllTags(data.description) : null
      const isUpcoming = Boolean(releaseDate && releaseDate > todayIso)

      return {
        title: data.collectionName.trim(),
        author,
        narrator: null,
        position: !isNaN(posNum) && posNum !== null ? position : null,
        posNum: !isNaN(posNum) ? posNum : null,
        releaseDate: releaseDate || null,
        asin: null,
        coverUrl,
        providerUrl: data.collectionViewUrl || null,
        summary,
        provider: 'itunes',
        entryType: isUpcoming ? 'upcoming' : 'missing',
        isReleased: !isUpcoming,
        trackTimeMillis: data.trackTimeMillis || 0
      }
    })

    // Deduplicate: If multiple editions exist for the same sequence position, pick one with longest track time
    const numberedGrouped = new Map()
    const unnumberedGrouped = new Map()

    for (const c of parsedCandidates) {
      if (c.posNum !== null) {
        const existing = numberedGrouped.get(c.posNum)
        if (!existing || c.trackTimeMillis > existing.trackTimeMillis) {
          numberedGrouped.set(c.posNum, c)
        }
      } else {
        const normTitle = this.normalizedTitle(c.title)
        const existing = unnumberedGrouped.get(normTitle)
        if (!existing || c.trackTimeMillis > existing.trackTimeMillis) {
          unnumberedGrouped.set(normTitle, c)
        }
      }
    }

    const uniqueCandidates = [
      ...Array.from(numberedGrouped.values()).sort((a, b) => (a.posNum || 0) - (b.posNum || 0)),
      ...Array.from(unnumberedGrouped.values()).sort((a, b) => (a.releaseDate || '').localeCompare(b.releaseDate || ''))
    ]

    const upcoming = []
    const missing = []

    for (const c of uniqueCandidates) {
      const entry = {
        title: c.title,
        author: c.author,
        narrator: c.narrator,
        position: c.position,
        releaseDate: c.releaseDate,
        asin: c.asin,
        coverUrl: c.coverUrl,
        providerUrl: c.providerUrl,
        summary: c.summary,
        provider: 'itunes',
        entryType: c.entryType,
        isReleased: c.isReleased
      }
      if (c.entryType === 'upcoming') {
        upcoming.push(entry)
      } else {
        missing.push(entry)
      }
    }

    return {
      upcoming,
      missing,
      skipped: false,
      provider: 'itunes'
    }
  }
}
module.exports = iTunes
