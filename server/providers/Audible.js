const axios = require('axios').default
const Logger = require('../Logger')
const { isValidASIN } = require('../utils/index')

class Audible {
  #responseTimeout = 10000

  constructor() {
    this.regionMap = {
      us: '.com',
      ca: '.ca',
      uk: '.co.uk',
      au: '.com.au',
      fr: '.fr',
      de: '.de',
      jp: '.co.jp',
      it: '.it',
      in: '.in',
      es: '.es'
    }
  }

  /**
   * Audible will sometimes send sequences with "Book 1" or "2, Dramatized Adaptation"
   * @see https://github.com/advplyr/audiobookshelf/issues/2380
   * @see https://github.com/advplyr/audiobookshelf/issues/1339
   *
   * @param {string} seriesName
   * @param {string} sequence
   * @returns {string}
   */
  cleanSeriesSequence(seriesName, sequence) {
    if (!sequence) return ''
    // match any number with optional decimal (e.g, 1 or 1.5 or .5)
    let numberFound = sequence.match(/\.\d+|\d+(?:\.\d+)?/)
    let updatedSequence = numberFound ? numberFound[0] : sequence
    if (sequence !== updatedSequence) {
      Logger.debug(`[Audible] Series "${seriesName}" sequence was cleaned from "${sequence}" to "${updatedSequence}"`)
    }
    return updatedSequence
  }

  cleanResult(item) {
    const { title, subtitle, asin, authors, narrators, publisherName, summary, releaseDate, image, genres, seriesPrimary, seriesSecondary, language, runtimeLengthMin, formatType, isbn } = item

    const series = []
    if (seriesPrimary) {
      series.push({
        series: seriesPrimary.name,
        sequence: this.cleanSeriesSequence(seriesPrimary.name, seriesPrimary.position || '')
      })
    }
    if (seriesSecondary) {
      series.push({
        series: seriesSecondary.name,
        sequence: this.cleanSeriesSequence(seriesSecondary.name, seriesSecondary.position || '')
      })
    }

    let genresCleaned = []
    let tagsCleaned = []

    if (genres && Array.isArray(genres)) {
      genresCleaned = [...new Set(genres.filter((g) => g.type == 'genre').map((g) => g.name))]
      tagsCleaned = [...new Set(genres.filter((g) => g.type == 'tag').map((g) => g.name))]
    }

    return {
      title,
      subtitle: subtitle || null,
      author: authors ? authors.map(({ name }) => name).join(', ') : null,
      narrator: narrators ? narrators.map(({ name }) => name).join(', ') : null,
      publisher: publisherName,
      publishedYear: releaseDate ? releaseDate.split('-')[0] : null,
      description: summary || null,
      cover: image,
      asin,
      isbn,
      genres: genresCleaned.length ? genresCleaned : null,
      tags: tagsCleaned.length ? tagsCleaned : null,
      series: series.length ? series : null,
      language: language ? language.charAt(0).toUpperCase() + language.slice(1) : null,
      duration: runtimeLengthMin && !isNaN(runtimeLengthMin) ? Number(runtimeLengthMin) : 0,
      region: item.region || null,
      rating: item.rating || null,
      abridged: formatType === 'abridged',
      explicit: !!item.isAdult
    }
  }

  /**
   *
   * @param {string} asin
   * @param {string} region
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<Object>}
   */
  asinSearch(asin, region, timeout = this.#responseTimeout) {
    if (!asin) return null
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    asin = encodeURIComponent(asin.toUpperCase())
    var regionQuery = region ? `?region=${region}` : ''
    var url = `https://api.audnex.us/books/${asin}${regionQuery}`
    Logger.debug(`[Audible] ASIN url: ${url}`)
    return axios
      .get(url, {
        timeout
      })
      .then((res) => {
        if (!res?.data?.asin) return null
        return res.data
      })
      .catch((error) => {
        Logger.error('[Audible] ASIN search error', error.message)
        return null
      })
  }

  /**
   *
   * @param {string} title
   * @param {string} author
   * @param {string} asin
   * @param {string} region
   * @param {number} [timeout] response timeout in ms
   * @returns {Promise<Object[]>}
   */
  async search(title, author, asin, region, timeout = this.#responseTimeout) {
    if (region && !this.regionMap[region]) {
      Logger.error(`[Audible] search: Invalid region ${region}`)
      region = ''
    }
    if (!timeout || isNaN(timeout)) timeout = this.#responseTimeout

    let items = []
    if (asin && isValidASIN(asin.toUpperCase())) {
      const item = await this.asinSearch(asin, region, timeout)
      if (item) items.push(item)
    }

    if (!items.length && isValidASIN(title.toUpperCase())) {
      const item = await this.asinSearch(title, region, timeout)
      if (item) items.push(item)
    }

    if (!items.length) {
      const queryObj = {
        num_results: '10',
        products_sort_by: 'Relevance',
        title: title
      }
      if (author) queryObj.author = author
      const queryString = new URLSearchParams(queryObj).toString()
      const tld = region ? this.regionMap[region] : '.com'
      const url = `https://api.audible${tld}/1.0/catalog/products?${queryString}`
      Logger.debug(`[Audible] Search url: ${url}`)
      items = await axios
        .get(url, {
          timeout
        })
        .then((res) => {
          if (!res?.data?.products) return null
          return Promise.all(res.data.products.map((result) => this.asinSearch(result.asin, region, timeout)))
        })
        .catch((error) => {
          Logger.error('[Audible] query search error', error.message)
          return []
        })
    }
    return items.filter(Boolean).map((item) => this.cleanResult(item)) || []
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
   * Filter out placeholder dates (e.g. 2200-01-01) from Audible
   * @param {string} releaseDate
   * @returns {string|null}
   */
  realReleaseDate(releaseDate) {
    if (!releaseDate || typeof releaseDate !== 'string') return null
    const dateStr = releaseDate.substring(0, 10).trim()
    const year = parseInt(dateStr.substring(0, 4), 10)
    if (isNaN(year)) return null
    const currentYear = new Date().getFullYear()
    if (year > currentYear + 5) return null
    return dateStr
  }

  /**
   * Get TLD for region
   * @param {string} region
   * @returns {string}
   */
  audibleTld(region) {
    return (region && this.regionMap[region]) || '.com'
  }

  /**
   * Execute an Audible API request with error handling and rate-limit extraction
   * @param {string} url
   * @param {number} [timeout]
   * @returns {Promise<any>}
   */
  async requestAudible(url, timeout = this.#responseTimeout) {
    try {
      const res = await axios.get(url, {
        timeout,
        headers: {
          'User-Agent': 'Audiobookshelf/2.37.1'
        }
      })
      return res.data
    } catch (error) {
      if (error.response?.status === 429) {
        const retryAfter = parseInt(error.response.headers['retry-after'], 10) || 60
        Logger.warn(`[Audible] Rate limit (429) encountered at ${url}. Retry-After: ${retryAfter}s`)
        const rateLimitErr = new Error(`Audible rate limit (429)`)
        rateLimitErr.rateLimited = true
        rateLimitErr.retryAfter = retryAfter
        throw rateLimitErr
      }
      if (error.response?.status === 404 || error.response?.status === 400) {
        return null
      }
      Logger.error(`[Audible] Request error at ${url}: ${error.message}`)
      throw error
    }
  }

  /**
   * Resolve an Audible series ASIN using owned books or series title search
   * @param {string} seriesName
   * @param {Array<{asin?: string, title?: string}>} ownedBooks
   * @param {string} region
   * @returns {Promise<{ seriesAsin: string, matchedName: string }|null>}
   */
  async resolveSeriesAsin(seriesName, ownedBooks = [], region = 'us') {
    const tld = this.audibleTld(region)
    const targetNorm = this.normalizedTitle(seriesName)

    // Strategy 1: Check series membership via owned book ASINs
    const asinsToCheck = ownedBooks
      .map((b) => b.asin?.toUpperCase()?.trim())
      .filter((asin) => asin && isValidASIN(asin))
      .slice(0, 3)

    for (const asin of asinsToCheck) {
      try {
        const url = `https://api.audible${tld}/1.0/catalog/products/${asin}?response_groups=series`
        const data = await this.requestAudible(url)
        const seriesList = data?.product?.series
        if (Array.isArray(seriesList) && seriesList.length > 0) {
          const match = seriesList.find((s) => s.asin && this.normalizedTitle(s.title) === targetNorm) || seriesList.find((s) => s.asin)
          if (match?.asin) {
            Logger.debug(`[Audible] Resolved series "${seriesName}" -> ASIN ${match.asin} via owned book ASIN ${asin}`)
            return { seriesAsin: match.asin, matchedName: match.title || seriesName }
          }
        }
      } catch (err) {
        if (err.rateLimited) throw err
        Logger.debug(`[Audible] Failed to check series for book ASIN ${asin}: ${err.message}`)
      }
    }

    // Strategy 2: Search Audible catalog by series name
    try {
      const searchUrl = `https://api.audible${tld}/1.0/catalog/products?title=${encodeURIComponent(seriesName)}&products_sort_by=Relevance&response_groups=series&num_results=5`
      const searchData = await this.requestAudible(searchUrl)
      const products = searchData?.products
      if (Array.isArray(products)) {
        for (const product of products) {
          const seriesList = product.series
          if (Array.isArray(seriesList)) {
            const match = seriesList.find((s) => s.asin && this.normalizedTitle(s.title) === targetNorm)
            if (match?.asin) {
              Logger.debug(`[Audible] Resolved series "${seriesName}" -> ASIN ${match.asin} via catalog search`)
              return { seriesAsin: match.asin, matchedName: match.title || seriesName }
            }
          }
        }
      }
    } catch (err) {
      if (err.rateLimited) throw err
      Logger.debug(`[Audible] Failed catalog search for series "${seriesName}": ${err.message}`)
    }

    return null
  }

  /**
   * Fetch all books in a series from Audible, categorizing into missing vs upcoming.
   *
   * @param {string} seriesName
   * @param {Array<{asin?: string, title?: string}>} [ownedBooks=[]]
   * @param {string} [region='us']
   * @returns {Promise<{ upcoming: Array, missing: Array, seriesAsin: string|null, skipped: boolean, reason?: string }>}
   */
  async fetchSeriesProviderEntries(seriesName, ownedBooks = [], region = 'us', onProgress = null) {
    if (!seriesName) {
      return { upcoming: [], missing: [], seriesAsin: null, skipped: true, reason: 'Empty series name' }
    }

    const tld = this.audibleTld(region)
    const resolved = await this.resolveSeriesAsin(seriesName, ownedBooks, region)
    if (!resolved?.seriesAsin) {
      Logger.info(`[Audible] Skipping series "${seriesName}": No matching Audible series found`)
      return { upcoming: [], missing: [], seriesAsin: null, skipped: true, reason: 'Series not found on Audible' }
    }

    const { seriesAsin } = resolved

    // 1. Fetch series hierarchy parent to get child book relationships and sequence numbers
    const parentUrl = `https://api.audible${tld}/1.0/catalog/products/${seriesAsin}?response_groups=relationships,product_attrs`
    const parentData = await this.requestAudible(parentUrl)
    const relationships = parentData?.product?.relationships || []
    const children = relationships.filter(
      (r) => r.relationship_type === 'series' && r.relationship_to_product === 'child' && r.asin
    )

    if (!children.length) {
      Logger.info(`[Audible] Series "${seriesName}" (ASIN: ${seriesAsin}) has no child entries on Audible`)
      return { upcoming: [], missing: [], seriesAsin, skipped: true, reason: 'No child books found in Audible series' }
    }

    // Map each child ASIN to its Audible sequence position
    const sequencesByAsin = {}
    for (const child of children) {
      if (child.asin) {
        sequencesByAsin[child.asin.toUpperCase()] = child.sequence || null
      }
    }

    const childAsins = Object.keys(sequencesByAsin)

    // 2. Hydrate children products in batches of up to 50 ASINs
    const batchSize = 50
    const hydratedProducts = []

    for (let i = 0; i < childAsins.length; i += batchSize) {
      const chunk = childAsins.slice(i, i + batchSize)
      const productsUrl = `https://api.audible${tld}/1.0/catalog/products?asins=${chunk.join(',')}&response_groups=product_attrs,rating,media&image_sizes=500`
      const batchData = await this.requestAudible(productsUrl)
      if (Array.isArray(batchData?.products)) {
        hydratedProducts.push(...batchData.products)
      }
    }

    // 3. Filter available products (not suppressed, listenable)
    const availableProducts = hydratedProducts.filter((p) => {
      if (!p.asin || !p.title) return false
      if (p.is_listenable === false) return false
      if (p.is_purchasability_suppressed === true) return false
      return true
    })

    // 4. Parse candidates, clean sequences, and deduplicate
    const parsedCandidates = availableProducts.map((p) => {
      const asin = p.asin.toUpperCase()
      const rawSeq = sequencesByAsin[asin]
      const position = rawSeq ? this.cleanSeriesSequence(seriesName, rawSeq) : null
      const posNum = position ? parseFloat(position) : null
      const releaseDate = this.realReleaseDate(p.release_date)
      const numRatings = p.rating?.overall_distribution?.numRatings || p.rating?.overall_distribution?.num_ratings || 0
      const coverUrl = p.product_images?.['500'] || (p.product_images && Object.values(p.product_images)[0]) || null
      const summary = p.publisher_summary || p.merchandising_summary || p.summary || null

      return {
        asin,
        title: p.title.trim(),
        position: !isNaN(posNum) && posNum !== null ? position : null,
        posNum: !isNaN(posNum) ? posNum : null,
        releaseDate,
        numRatings,
        coverUrl,
        summary,
        providerUrl: `https://www.audible${tld}/pd/${asin}`
      }
    })

    // Deduplicate: If multiple editions exist for the same sequence position, pick the one with most ratings
    const numberedGrouped = new Map()
    const unnumberedGrouped = new Map()

    for (const c of parsedCandidates) {
      if (c.posNum !== null) {
        const existing = numberedGrouped.get(c.posNum)
        if (!existing || c.numRatings > existing.numRatings) {
          numberedGrouped.set(c.posNum, c)
        }
      } else {
        const normTitle = this.normalizedTitle(c.title)
        const existing = unnumberedGrouped.get(normTitle)
        if (!existing || c.numRatings > existing.numRatings) {
          unnumberedGrouped.set(normTitle, c)
        }
      }
    }

    const uniqueCandidates = [
      ...Array.from(numberedGrouped.values()).sort((a, b) => (a.posNum || 0) - (b.posNum || 0)),
      ...Array.from(unnumberedGrouped.values()).sort((a, b) => (a.releaseDate || '').localeCompare(b.releaseDate || ''))
    ]

    // 5. Match against owned books in library
    const ownedAsinSet = new Set(
      ownedBooks
        .map((b) => b.asin?.toUpperCase()?.trim())
        .filter(Boolean)
    )
    const ownedTitleSet = new Set(
      ownedBooks
        .map((b) => this.normalizedTitle(b.title))
        .filter(Boolean)
    )

    const todayIso = new Date().toISOString().substring(0, 10)
    const upcoming = []
    const missing = []

    for (let idx = 0; idx < uniqueCandidates.length; idx++) {
      const candidate = uniqueCandidates[idx]
      if (onProgress) {
        onProgress({ current: idx + 1, total: uniqueCandidates.length })
        await new Promise((resolve) => setTimeout(resolve, 80))
      }
      const isOwned =
        ownedAsinSet.has(candidate.asin) ||
        ownedTitleSet.has(this.normalizedTitle(candidate.title))

      if (isOwned) {
        continue
      }

      const isUpcoming = candidate.releaseDate && candidate.releaseDate > todayIso

      const entry = {
        title: candidate.title,
        position: candidate.position,
        releaseDate: candidate.releaseDate,
        asin: candidate.asin,
        coverUrl: candidate.coverUrl,
        providerUrl: candidate.providerUrl,
        summary: candidate.summary,
        provider: 'audible',
        entryType: isUpcoming ? 'upcoming' : 'missing',
        isReleased: !isUpcoming
      }

      if (isUpcoming) {
        upcoming.push(entry)
      } else {
        missing.push(entry)
      }
    }

    return {
      upcoming,
      missing,
      seriesAsin,
      skipped: false
    }
  }
}

module.exports = Audible
