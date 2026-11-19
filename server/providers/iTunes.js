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

/**
 * Split a list of authors on commas. A piece with no space is a credential and is glued onto the previous name.
 *
 * @param {string} text
 * @returns {string[]}
 */
function parseAuthorPieces(text) {
  const authors = []
  for (const piece of (text || '').split(',')) {
    const name = piece.trim()
    if (!name) continue
    if (!name.includes(' ') && authors.length) {
      authors[authors.length - 1] = `${authors[authors.length - 1]} ${name}`
    } else {
      authors.push(name)
    }
  }
  return authors
}

function stripCommasFromName(name) {
  return (name || '').replace(/,/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Apple lists authors as "Name1, Name2 & Name3", but a comma can also sit inside one name ("Rick Hanson, PhD").
 * A comma-separated piece with no space is treated as a credential and glued onto the previous name.
 * The text after the last " & " is a single author, so commas there are removed.
 * @see https://github.com/advplyr/audiobookshelf/issues/1022
 * @see https://github.com/advplyr/audiobookshelf/issues/2661
 *
 * @param {string} artistName
 * @returns {string}
 */
function cleanAuthor(artistName) {
  const raw = (artistName || '').trim()
  if (!raw) return ''

  const lastAmpIndex = raw.lastIndexOf(' & ')
  if (lastAmpIndex === -1) {
    return stripCommasFromName(raw)
  }

  const authors = parseAuthorPieces(raw.slice(0, lastAmpIndex))
  const lastAuthor = stripCommasFromName(raw.slice(lastAmpIndex + 3))
  if (lastAuthor) authors.push(lastAuthor)
  return authors.join(', ')
}

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
    return {
      id: data.collectionId,
      artistId: data.artistId,
      title: data.collectionName,
      author: cleanAuthor(data.artistName),
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
   * Strip series name prefixes/suffixes, book number tags, and audio format markers
   * while preserving the book's actual distinctive title.
   * @param {string} title
   * @param {string} [seriesName]
   * @returns {string}
   */
  stripSeriesAndBookTags(title, seriesName) {
    if (!title || typeof title !== 'string') return ''
    let s = title.trim()

    // Remove parenthetical/bracketed format markers
    s = s.replace(/\s*[\(\[](?:unabridged|abridged|audiobook|dramatized[^)\]]*)[\)\]]/gi, '').trim()

    if (seriesName && typeof seriesName === 'string') {
      const rawVariants = new Set([
        seriesName.trim(),
        seriesName.replace(/^the\s+/i, '').trim(),
        seriesName.replace(/\b(series|trilogy|saga|chronicles|chronicle|duology|quartet)\b/gi, '').trim(),
        seriesName
          .replace(/^the\s+/i, '')
          .replace(/\b(series|trilogy|saga|chronicles|chronicle|duology|quartet)\b/gi, '')
          .trim()
      ])

      for (const variant of rawVariants) {
        if (!variant || variant.length < 2) continue
        const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

        // 1. Strip trailing parenthetical series tag, e.g. "Title (The Series Name, Book 3)"
        const parenSuffixRe = new RegExp(`\\s*[\\(\\[](?:the\\s+)?${escaped}(?:\\s*[,:\\-–—]?\\s*(?:book|bk\\.?|vol\\.?|volume|part|#)?\\s*[a-z0-9.]+)?[\\)\\]]\\s*$`, 'i')
        const withoutParen = s.replace(parenSuffixRe, '').trim()
        if (withoutParen.length >= 2) s = withoutParen

        // 2. Strip trailing colon/dash series tag, e.g. "Title: The Series Name, Book 3"
        const colonSuffixRe = new RegExp(`\\s*[:\\-–—,]\\s*(?:the\\s+)?${escaped}(?:\\s*[,:\\-–—]?\\s*(?:book|bk\\.?|vol\\.?|volume|part|#)\\s*[a-z0-9.]+)?\\s*$`, 'i')
        const withoutColonSuffix = s.replace(colonSuffixRe, '').trim()
        if (withoutColonSuffix.length >= 2) s = withoutColonSuffix

        // 3. Strip leading series prefix, e.g. "The Series Name: Book Title"
        const prefixRe = new RegExp(`^(?:the\\s+)?${escaped}(?:\\s*[,:\\-–—]?\\s*(?:book|bk\\.?|vol\\.?|volume|part|#)\\s*[a-z0-9.]+)?\\s*[:\\-–—]\\s*`, 'i')
        const withoutPrefix = s.replace(prefixRe, '').trim()
        if (withoutPrefix.length >= 2) s = withoutPrefix
      }
    }

    // Strip standalone trailing book number tags, e.g. "(Book 3)" or ", Book 3"
    const withoutBookTag = s
      .replace(/\s*[\(\[](?:book|bk\.?|vol\.?|volume|part)\s*#?\s*[a-z0-9.]+[\)\]]\s*$/i, '')
      .replace(/\s*[,:\-–—]\s*(?:book|bk\.?|vol\.?|volume|part)\s*#?\s*[a-z0-9.]+\s*$/i, '')
      .trim()
    if (withoutBookTag.length >= 2) s = withoutBookTag

    return s
  }

  /**
   * Extract normalized base title (before subtitle separator) after stripping series/book tags.
   * Returns empty string if the base title is just the series name itself while the full title is longer.
   * @param {string} title
   * @param {string} [seriesName]
   * @returns {string}
   */
  extractSafeBaseTitle(title, seriesName) {
    const stripped = this.stripSeriesAndBookTags(title, seriesName)
    if (!stripped) return ''
    const basePart = stripped.split(/[:\-–—]/)[0].trim()
    const normBase = this.normalizedTitle(basePart)
    const normFull = this.normalizedTitle(stripped)
    const normSeries = seriesName ? this.normalizedTitle(seriesName) : ''

    if (!normBase || normBase.length < 3) return ''
    if (normSeries && normBase === normSeries && normFull !== normSeries) {
      return ''
    }
    return normBase
  }

  /**
   * Clean a title by removing series prefix/suffix and common audio format tags
   * @param {string} title
   * @param {string} [seriesName]
   * @returns {string}
   */
  cleanTitle(title, seriesName) {
    if (!title || typeof title !== 'string') return ''
    let s = this.stripSeriesAndBookTags(title, seriesName).toLowerCase()
    s = s.replace(/\b(short story|novella|audiobook|unabridged|abridged)\b/gi, '')
    return s.replace(/[^a-z0-9]/g, '').replace(/^the/, '')
  }

  /**
   * Clean redundant "(Unabridged)" / "[Unabridged]" markers from iTunes display title
   * @param {string} rawTitle
   * @returns {string}
   */
  formatDisplayTitle(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return ''
    return rawTitle
      .replace(/\s*[\(\[]unabridged[\)\]]\s*/gi, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  }

  /**
   * Score an iTunes audiobook edition so Unabridged editions with rich metadata win deduplication
   * @param {object} data
   * @returns {number}
   */
  editionScore(data) {
    if (!data) return 0
    const rawTitle = data.collectionName || ''
    let score = 0
    if (/\bunabridged\b/i.test(rawTitle)) score += 10
    if (/\babridged\b/i.test(rawTitle) && !/\bunabridged\b/i.test(rawTitle)) score -= 20
    if (/\b(dramatized|sampler|excerpt|preview)\b/i.test(rawTitle)) score -= 15
    if (data.artworkUrl100) score += 2
    if (data.description) score += 2
    if (data.trackTimeMillis) score += data.trackTimeMillis / 1000000
    return score
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

    const wordNumbers = {
      one: '1',
      two: '2',
      three: '3',
      four: '4',
      five: '5',
      six: '6',
      seven: '7',
      eight: '8',
      nine: '9',
      ten: '10',
      eleven: '11',
      twelve: '12',
      thirteen: '13',
      fourteen: '14',
      fifteen: '15',
      sixteen: '16',
      seventeen: '17',
      eighteen: '18',
      nineteen: '19',
      twenty: '20'
    }
    const wordMatch = collectionName.match(/\b(?:book|bk\.?|volume|vol\.?|part)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i)
    if (wordMatch && wordMatch[1]) {
      return wordNumbers[wordMatch[1].toLowerCase()] || null
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

    const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'esq'])
    const cleanArtist = artistName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const artistTokens = cleanArtist.split(' ').filter((t) => t && !suffixes.has(t))
    if (!artistTokens.length) return false

    for (const author of seriesAuthors) {
      if (!author || typeof author !== 'string') continue
      const cleanAuthor = author
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      if (!cleanAuthor) continue

      // Direct full-name containment check
      if (cleanArtist.includes(cleanAuthor) || (cleanArtist.length >= 4 && cleanAuthor.includes(cleanArtist))) {
        return true
      }

      let surname = ''
      let firstToken = ''

      if (author.includes(',')) {
        // "Last, First Middle" format
        const [lastPart, firstPart] = author.toLowerCase().split(',', 2)
        const lastTokens = lastPart
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((t) => t && !suffixes.has(t))
        const firstTokens = (firstPart || '')
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((t) => t && !suffixes.has(t))
        surname = lastTokens[lastTokens.length - 1] || ''
        firstToken = firstTokens[0] || ''
      } else {
        // "First Middle Last" format
        const authorTokens = cleanAuthor.split(' ').filter((t) => t && !suffixes.has(t))
        if (!authorTokens.length) continue
        if (authorTokens.length === 1) {
          if (artistTokens.includes(authorTokens[0])) return true
          continue
        }
        firstToken = authorTokens[0]
        surname = authorTokens[authorTokens.length - 1]
      }

      if (!surname) continue

      // Require artistTokens to match surname AND a separate token matching firstToken (or initial when one side is an initial)
      for (let sIdx = 0; sIdx < artistTokens.length; sIdx++) {
        if (artistTokens[sIdx] !== surname) continue
        const hasDistinctFirstMatch = artistTokens.some((t, fIdx) => {
          if (fIdx === sIdx) return false
          if (t === firstToken) return true
          if (firstToken.length === 1 && t.startsWith(firstToken)) return true
          if (t.length === 1 && firstToken.startsWith(t)) return true
          return false
        })
        if (hasDistinctFirstMatch) return true
      }
    }

    return false
  }

  /**
   * Check if collectionName explicitly contains the normalized seriesName
   * @param {string} collectionName
   * @param {string} seriesName
   * @param {boolean} [hasKnownAuthors=true]
   * @returns {boolean}
   */
  matchesSeries(collectionName, seriesName, hasKnownAuthors = true) {
    if (!collectionName || !seriesName) return false
    const normCollection = this.normalizedTitle(collectionName)
    const normSeries = this.normalizedTitle(seriesName)
    if (!normSeries) return false

    // When a series in ABS has no author metadata and a short single-word title,
    // require an explicit book/sequence indicator to avoid unrelated keyword hits.
    if (!hasKnownAuthors && normSeries.length < 10) {
      const hasPos = this.extractPosition(collectionName, seriesName) !== null
      if (!hasPos) return false
    }

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
    const normCandBase = this.extractSafeBaseTitle(candTitle, seriesName)
    const candClean = this.cleanTitle(candTitle, seriesName)
    const candPos = this.extractPosition(candTitle, seriesName)
    const candPosNum = candPos ? parseFloat(candPos) : null
    const normSeries = seriesName ? this.normalizedTitle(seriesName) : ''

    for (const owned of ownedBooks) {
      if (!owned) continue
      if (candPosNum !== null && !isNaN(candPosNum) && owned.sequence !== null && owned.sequence !== undefined) {
        const ownedSeqNum = parseFloat(owned.sequence)
        if (!isNaN(ownedSeqNum) && ownedSeqNum === candPosNum) {
          return true
        }
      }
      if (owned.title) {
        const normOwned = this.normalizedTitle(owned.title)
        if (normOwned && (normOwned === normCandTitle || (normCandBase && normOwned === normCandBase))) {
          return true
        }
        const ownedClean = this.cleanTitle(owned.title, seriesName)
        if (candClean && ownedClean && candClean === ownedClean) {
          return true
        }
        const normOwnedBase = this.extractSafeBaseTitle(owned.title, seriesName)
        if (normOwnedBase && (normOwnedBase === normCandTitle || normOwnedBase === candClean || (normCandBase && normOwnedBase === normCandBase))) {
          return true
        }
        // Only allow prefix containment when neither side is just the eponymous series title
        if (candClean && ownedClean && candClean !== normSeries && ownedClean !== normSeries && candClean.length >= 6 && ownedClean.length >= 6) {
          if (candClean.startsWith(ownedClean) || ownedClean.startsWith(candClean)) {
            return true
          }
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
    const hasKnownAuthors = Boolean(seriesAuthors && seriesAuthors.length > 0)
    const validCandidates = []
    for (const item of results) {
      if (!item.collectionName) continue

      // 1. Author check
      if (hasKnownAuthors && !this.matchesAuthor(item.artistName, seriesAuthors)) {
        continue
      }

      // 2. Series match check
      if (!this.matchesSeries(item.collectionName, seriesName, hasKnownAuthors)) {
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
      const author = cleanAuthor(data.artistName) || null
      const coverUrl = this.getCoverArtwork(data) || null
      const summary = data.description ? htmlSanitizer.stripAllTags(data.description) : null
      const isUpcoming = Boolean(releaseDate && releaseDate > todayIso)

      return {
        title: this.formatDisplayTitle(data.collectionName),
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
        score: this.editionScore(data)
      }
    })

    // Deduplicate: If multiple editions exist for the same sequence position or cleaned title, keep highest-scored edition
    const numberedGrouped = new Map()
    const unnumberedGrouped = new Map()

    for (const c of parsedCandidates) {
      if (c.posNum !== null) {
        const existing = numberedGrouped.get(c.posNum)
        if (!existing || c.score > existing.score) {
          numberedGrouped.set(c.posNum, c)
        }
      } else {
        const cleanKey = this.cleanTitle(c.title, seriesName) || this.normalizedTitle(c.title)
        const existing = unnumberedGrouped.get(cleanKey)
        if (!existing || c.score > existing.score) {
          unnumberedGrouped.set(cleanKey, c)
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
