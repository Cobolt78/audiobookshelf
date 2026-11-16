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
          if (!res?.data?.products) return []
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
   * Normalize a series title by stripping common series suffixes ("Series", "Trilogy", "Saga", etc.)
   * before alphanumeric normalization so "24690 Series" matches "24690".
   * @param {string} str
   * @returns {string}
   */
  normalizedSeriesTitle(str) {
    if (!str || typeof str !== 'string') return ''
    const core = str.replace(/\b(series|trilogy|saga|chronicles|chronicle|duology|quartet)\b/gi, '').trim()
    return this.normalizedTitle(core || str)
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

        // 3. Strip leading series prefix, e.g. "The Series Name: Book Title" or "Series Name, Book 2: Book Title"
        const prefixRe = new RegExp(`^(?:the\\s+)?${escaped}(?:\\s*[,:\\-–—]?\\s*(?:book|bk\\.?|vol\\.?|volume|part|#)\\s*[a-z0-9.]+)?\\s*[:\\-–—]\\s*`, 'i')
        const withoutPrefix = s.replace(prefixRe, '').trim()
        if (withoutPrefix.length >= 2) s = withoutPrefix
      }
    }

    // Strip standalone trailing book number tags, e.g. "(Book 3)" or ", Book 3"
    const withoutBookTag = s
      .replace(/\s*[\(\[](?:book|bk\.?|vol\.?|volume|part)\s*#?\s*[a-z0-9.]+[\)\]]\s*$/i, '')
      .replace(/\s*[,:\-–—]\s*(?:book|bk\.?|vol\.?|volume|part)\s*#?\s*\d+(?:\.\d+)?\s*$/i, '')
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
    // Never reduce a multi-part title down to just the series name
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
   * Extract individual author strings from an array of author objects/strings or delimited string
   * @param {Array<{name?: string}|string>|string} input
   * @returns {Array<string>}
   */
  extractAuthorList(input) {
    if (!input) return []
    const rawItems = Array.isArray(input) ? input : [input]
    const result = []

    for (const item of rawItems) {
      const nameStr = typeof item === 'string' ? item : item?.name
      if (!nameStr || typeof nameStr !== 'string') continue

      // Split on explicit multi-author delimiters first (&, ;, " and ")
      const primaryParts = nameStr.split(/\s*(?:&|;|\band\b)\s*/i).filter(Boolean)
      for (const part of primaryParts) {
        const commaSegments = part.split(',').map((s) => s.trim()).filter(Boolean)
        if (commaSegments.length <= 1) {
          result.push(part.trim())
        } else if (commaSegments.length === 2) {
          // Distinguish "Last, First" (after comma is 1 token or initial(s)) vs "Author One, Author Two"
          const afterCommaTokens = commaSegments[1]
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
          const beforeCommaTokens = commaSegments[0]
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
          const looksLikeLastFirst =
            afterCommaTokens.length === 1 ||
            (beforeCommaTokens.length === 1 && afterCommaTokens.length <= 2 && afterCommaTokens.some((t) => t.length === 1))
          if (looksLikeLastFirst) {
            result.push(part.trim())
          } else {
            result.push(...commaSegments)
          }
        } else {
          result.push(...commaSegments)
        }
      }
    }

    return result.filter(Boolean)
  }

  /**
   * Parse an author name into surname, ordered given-name/initial tokens, and normalized form,
   * preserving single-letter initials (e.g., "A. A. Dark" / "A.A. Dark" -> surname: "dark", givenTokens: ["a", "a"]).
   * @param {string} rawName
   * @returns {{ surname: string, givenTokens: Array<string>, allTokens: Array<string>, normFull: string }|null}
   */
  parseAuthorName(rawName) {
    if (!rawName || typeof rawName !== 'string') return null
    const suffixes = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'phd', 'md', 'esq'])

    let surname = ''
    let givenTokens = []
    let allTokens = []

    if (rawName.includes(',')) {
      const [lastPart, firstPart] = rawName.toLowerCase().split(',', 2)
      const lastTokens = lastPart
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t && !suffixes.has(t))
      const firstTokens = (firstPart || '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t && !suffixes.has(t))
      if (!lastTokens.length && !firstTokens.length) return null
      surname = lastTokens[lastTokens.length - 1] || ''
      givenTokens = [...firstTokens, ...lastTokens.slice(0, -1)]
      allTokens = [...givenTokens, ...(surname ? [surname] : [])]
    } else {
      const tokens = rawName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t && !suffixes.has(t))
      if (!tokens.length) return null
      allTokens = tokens
      if (tokens.length === 1) {
        surname = tokens[0]
        givenTokens = []
      } else {
        surname = tokens[tokens.length - 1]
        givenTokens = tokens.slice(0, -1)
      }
    }

    const normFull = allTokens.join('')
    return { surname, givenTokens, allTokens, normFull }
  }

  /**
   * Check whether two author lists share at least one matching author while preserving initials
   * (so "A. A. Dark" matches "A A Dark" / "A.A. Dark", but NOT "Dannika Dark" or "Alice Dark").
   * @param {Array<{name?: string}|string>|string} listA
   * @param {Array<{name?: string}|string>|string} listB
   * @returns {boolean}
   */
  authorsMatch(listA, listB) {
    const parsedA = this.extractAuthorList(listA)
      .map((name) => this.parseAuthorName(name))
      .filter(Boolean)
    const parsedB = this.extractAuthorList(listB)
      .map((name) => this.parseAuthorName(name))
      .filter(Boolean)

    if (!parsedA.length || !parsedB.length) return false

    const tokenMatches = (t1, t2) => {
      if (!t1 || !t2) return false
      if (t1 === t2) return true
      if (t1.length === 1 && t2.startsWith(t1)) return true
      if (t2.length === 1 && t1.startsWith(t2)) return true
      return false
    }

    for (const a of parsedA) {
      for (const b of parsedB) {
        if (a.normFull && b.normFull && a.normFull === b.normFull) {
          return true
        }
        if (a.allTokens.length === 1 && b.allTokens.length === 1) {
          if (a.allTokens[0] === b.allTokens[0]) return true
          continue
        }
        if (!a.surname || !b.surname || a.surname !== b.surname) continue
        if (!a.givenTokens.length || !b.givenTokens.length) continue

        // If one side uses multi-initial pen name (all initials, >=2 given tokens like "A. A.")
        // and the other side only has a single non-initial full word ("Alice"), reject to avoid ambiguity.
        const aIsMultiInitial = a.givenTokens.length >= 2 && a.givenTokens.every((t) => t.length === 1)
        const bIsMultiInitial = b.givenTokens.length >= 2 && b.givenTokens.every((t) => t.length === 1)
        if ((aIsMultiInitial && b.givenTokens.length === 1 && b.givenTokens[0].length > 1) ||
            (bIsMultiInitial && a.givenTokens.length === 1 && a.givenTokens[0].length > 1)) {
          continue
        }

        if (!tokenMatches(a.givenTokens[0], b.givenTokens[0])) continue

        if (a.givenTokens.length >= 2 && b.givenTokens.length >= 2) {
          if (!tokenMatches(a.givenTokens[1], b.givenTokens[1])) continue
        }

        return true
      }
    }

    return false
  }

  /**
   * Check if a product record from Audible is an unreleased, dummy, or delisted placeholder
   * @param {object} p
   * @returns {boolean}
   */
  isPlaceholder(p) {
    if (!p) return false
    if (typeof p.sku === 'string' && p.sku.startsWith('PL_HLDR')) return true
    if (typeof p.sku_lite === 'string' && p.sku_lite.startsWith('PL_HLDR')) return true
    if (typeof p.release_date === 'string' && p.release_date.startsWith('2200')) return true
    if (typeof p.publication_datetime === 'string' && p.publication_datetime.startsWith('2200')) return true
    if (!p.runtime_length_min && !p.price) {
      if (!p.release_date || p.release_date.startsWith('2200')) return true
    }
    return false
  }

  /**
   * Resolve an active, published edition for a placeholder entry
   * @param {string} seriesName
   * @param {object} placeholderProduct
   * @param {string|null} rawSeq
   * @param {string} region
   * @param {string|null} [expectedSeriesAsin=null]
   * @param {Array<string>} [seriesAuthors=[]]
   * @returns {Promise<object|null>}
   */
  async resolveLiveEdition(seriesName, placeholderProduct, rawSeq, region = 'us', expectedSeriesAsin = null, seriesAuthors = []) {
    const tld = this.audibleTld(region)
    const placeholderAuthors = Array.isArray(placeholderProduct.authors) ? placeholderProduct.authors.map((a) => a.name).filter(Boolean) : []
    const expectedAuthors = placeholderAuthors.length ? placeholderAuthors : Array.isArray(seriesAuthors) ? seriesAuthors : []
    const authorQuery = expectedAuthors[0] || null
    const cleanSeq = rawSeq ? this.cleanSeriesSequence(seriesName, rawSeq) : null

    const targetSeriesNorm = this.normalizedTitle(seriesName)
    const targetCoreSeriesNorm = this.normalizedSeriesTitle(seriesName)
    const cleanSeriesNorm = this.cleanTitle(seriesName)
    const expectedSeriesAsinUpper = expectedSeriesAsin ? expectedSeriesAsin.toUpperCase() : null

    const normPlaceholder = this.normalizedTitle(placeholderProduct.title)
    const cleanPlaceholder = this.cleanTitle(placeholderProduct.title, seriesName)
    const basePlaceholder = this.extractSafeBaseTitle(placeholderProduct.title, seriesName)

    const queries = []
    if (cleanSeq) {
      queries.push(`${seriesName} ${cleanSeq}`)
    }
    const titleBeforeColon = placeholderProduct.title?.split(/[:\-–—]/)[0]?.trim()
    if (titleBeforeColon && !queries.includes(titleBeforeColon)) {
      queries.push(titleBeforeColon)
    }

    for (const q of queries) {
      try {
        let url = `https://api.audible${tld}/1.0/catalog/products?title=${encodeURIComponent(q)}&response_groups=contributors,series,product_attrs,rating,media,price&image_sizes=500&num_results=10`
        if (authorQuery) {
          url += `&author=${encodeURIComponent(authorQuery)}`
        }
        const data = await this.requestAudible(url)
        const candidates = data?.products || []
        for (const cand of candidates) {
          if (!cand.asin || !cand.title) continue
          if (this.isPlaceholder(cand)) continue
          if (cand.is_purchasability_suppressed === true) continue
          if (!cand.price && !cand.runtime_length_min) continue

          // 1. Author validation: must match placeholder/series authors when known
          if (expectedAuthors.length > 0 && !this.authorsMatch(cand.authors, expectedAuthors)) {
            Logger.debug(`[Audible] Rejected live edition candidate "${cand.title}" (${cand.asin}) due to author mismatch (expected: ${expectedAuthors.join(', ')})`)
            continue
          }

          // 2. Series validation: if candidate carries series metadata, reject if it belongs strictly to a different series
          const candSeriesList = Array.isArray(cand.series) ? cand.series : []
          const matchedSeries = candSeriesList.find(
            (s) =>
              (expectedSeriesAsinUpper && s.asin && s.asin.toUpperCase() === expectedSeriesAsinUpper) ||
              (s.title &&
                (this.normalizedTitle(s.title) === targetSeriesNorm ||
                  (targetCoreSeriesNorm.length >= 2 && this.normalizedSeriesTitle(s.title) === targetCoreSeriesNorm) ||
                  (cleanSeriesNorm.length >= 3 && this.cleanTitle(s.title) === cleanSeriesNorm)))
          )
          if (candSeriesList.length > 0 && !matchedSeries) {
            Logger.debug(`[Audible] Rejected live edition candidate "${cand.title}" (${cand.asin}) due to series mismatch`)
            continue
          }

          // 3. Title & sequence validation
          const normCand = this.normalizedTitle(cand.title)
          const cleanCand = this.cleanTitle(cand.title, seriesName)
          const baseCand = this.extractSafeBaseTitle(cand.title, seriesName)
          const titleMatches = Boolean(
            (normCand && normCand === normPlaceholder) ||
              (cleanCand && cleanPlaceholder && cleanCand === cleanPlaceholder) ||
              (baseCand && basePlaceholder && baseCand === basePlaceholder)
          )

          const candSeq = matchedSeries?.sequence ? this.cleanSeriesSequence(seriesName, matchedSeries.sequence) : null
          const seqMatches = Boolean(cleanSeq && candSeq && candSeq === cleanSeq)

          if (candSeq && cleanSeq && candSeq !== cleanSeq && !titleMatches) {
            Logger.debug(`[Audible] Rejected live edition candidate "${cand.title}" (${cand.asin}) due to sequence mismatch (${candSeq} !== ${cleanSeq})`)
            continue
          }

          if (!titleMatches && !(matchedSeries && seqMatches)) {
            Logger.debug(`[Audible] Rejected live edition candidate "${cand.title}" (${cand.asin}) due to title/series mismatch against "${placeholderProduct.title}"`)
            continue
          }

          Logger.info(`[Audible] Resolved live edition for placeholder "${placeholderProduct.title}" (${placeholderProduct.asin}) -> "${cand.title}" (${cand.asin})`)
          return cand
        }
      } catch (err) {
        if (err.rateLimited) throw err
        Logger.debug(`[Audible] Error searching live edition for query "${q}": ${err.message}`)
      }
    }
    return null
  }

  /**
   * Check if a candidate product is already owned in library using ASIN, sequence, or title
   * @param {object} candidate
   * @param {Array<object>} ownedBooks
   * @param {Set<string>} ownedAsinSet
   * @param {Set<string>} ownedTitleSet
   * @param {string} seriesName
   * @returns {boolean}
   */
  isBookOwned(candidate, ownedBooks = [], ownedAsinSet, ownedTitleSet, seriesName) {
    if (candidate.asin && ownedAsinSet.has(candidate.asin.toUpperCase())) {
      return true
    }

    const normCandTitle = this.normalizedTitle(candidate.title)
    if (normCandTitle && ownedTitleSet.has(normCandTitle)) {
      return true
    }

    const normCandBase = this.extractSafeBaseTitle(candidate.title, seriesName)
    if (normCandBase && normCandBase !== normCandTitle && ownedTitleSet.has(normCandBase)) {
      return true
    }

    const candClean = this.cleanTitle(candidate.title, seriesName)
    const normSeries = seriesName ? this.normalizedTitle(seriesName) : ''

    for (const owned of ownedBooks) {
      if (candidate.posNum !== null && owned.sequence !== null && owned.sequence !== undefined) {
        const ownedSeqNum = parseFloat(owned.sequence)
        if (!isNaN(ownedSeqNum) && ownedSeqNum === candidate.posNum) {
          return true
        }
      }

      if (owned.title) {
        const ownedClean = this.cleanTitle(owned.title, seriesName)
        if (candClean && ownedClean && candClean === ownedClean) {
          return true
        }

        const normOwnedBase = this.extractSafeBaseTitle(owned.title, seriesName)
        if (normOwnedBase && (normOwnedBase === normCandTitle || normOwnedBase === candClean || (normCandBase && normOwnedBase === normCandBase))) {
          return true
        }

        // Only allow substring containment when neither side is just the eponymous series title
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
   * @param {Array<{asin?: string, title?: string, authors?: Array<string>}>} ownedBooks
   * @param {string} region
   * @param {Array<string>} [seriesAuthors=[]]
   * @returns {Promise<{ seriesAsin: string, matchedName: string }|null>}
   */
  async resolveSeriesAsin(seriesName, ownedBooks = [], region = 'us', seriesAuthors = []) {
    const tld = this.audibleTld(region)
    const targetNorm = this.normalizedTitle(seriesName)
    const targetCoreNorm = this.normalizedSeriesTitle(seriesName)
    const effectiveAuthors = Array.from(
      new Set([...(Array.isArray(seriesAuthors) ? seriesAuthors : []), ...ownedBooks.flatMap((b) => b.authors || [])].filter(Boolean))
    )

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
          const match =
            seriesList.find(
              (s) =>
                s.asin &&
                (this.normalizedTitle(s.title) === targetNorm || (targetCoreNorm.length >= 2 && this.normalizedSeriesTitle(s.title) === targetCoreNorm))
            ) || seriesList.find((s) => s.asin)
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
      const searchUrl = `https://api.audible${tld}/1.0/catalog/products?title=${encodeURIComponent(seriesName)}&products_sort_by=Relevance&response_groups=contributors,series&num_results=10`
      const searchData = await this.requestAudible(searchUrl)
      const products = searchData?.products
      if (Array.isArray(products)) {
        for (const product of products) {
          if (effectiveAuthors.length > 0 && !this.authorsMatch(product.authors, effectiveAuthors)) {
            continue
          }
          const seriesList = product.series
          if (Array.isArray(seriesList)) {
            const match = seriesList.find(
              (s) =>
                s.asin &&
                (this.normalizedTitle(s.title) === targetNorm || (targetCoreNorm.length >= 2 && this.normalizedSeriesTitle(s.title) === targetCoreNorm))
            )
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
   * @param {Array<{asin?: string, title?: string, authors?: Array<string>}>} [ownedBooks=[]]
   * @param {string} [region='us']
   * @param {Function|null} [onProgress=null]
   * @param {Array<string>} [seriesAuthors=[]]
   * @returns {Promise<{ upcoming: Array, missing: Array, seriesAsin: string|null, skipped: boolean, reason?: string }>}
   */
  async fetchSeriesProviderEntries(seriesName, ownedBooks = [], region = 'us', onProgress = null, seriesAuthors = []) {
    if (!seriesName) {
      return { upcoming: [], missing: [], seriesAsin: null, skipped: true, reason: 'Empty series name' }
    }

    if (Array.isArray(onProgress)) {
      seriesAuthors = onProgress
      onProgress = null
    }

    const effectiveAuthors = Array.from(
      new Set([...(Array.isArray(seriesAuthors) ? seriesAuthors : []), ...ownedBooks.flatMap((b) => b.authors || [])].filter(Boolean))
    )

    const tld = this.audibleTld(region)
    const resolved = await this.resolveSeriesAsin(seriesName, ownedBooks, region, effectiveAuthors)
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
      const productsUrl = `https://api.audible${tld}/1.0/catalog/products?asins=${chunk.join(',')}&response_groups=contributors,product_attrs,rating,media,price&image_sizes=500`
      const batchData = await this.requestAudible(productsUrl)
      if (Array.isArray(batchData?.products)) {
        hydratedProducts.push(...batchData.products)
      }
    }

    // 3. Filter available products (resolve placeholders or discard unreleased/delisted)
    const availableProducts = []
    for (const p of hydratedProducts) {
      if (!p.asin || !p.title) continue
      if (p.is_listenable === false) continue
      if (p.is_purchasability_suppressed === true) continue

      if (this.isPlaceholder(p)) {
        const rawSeq = sequencesByAsin[p.asin.toUpperCase()]
        const liveCand = await this.resolveLiveEdition(seriesName, p, rawSeq, region, seriesAsin, effectiveAuthors)
        if (liveCand) {
          sequencesByAsin[liveCand.asin.toUpperCase()] = rawSeq
          availableProducts.push(liveCand)
        } else {
          Logger.info(`[Audible] Filtered out unreleased/delisted placeholder "${p.title}" (${p.asin}) in series "${seriesName}"`)
        }
        continue
      }

      availableProducts.push(p)
    }

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
      const author = Array.isArray(p.authors) ? p.authors.map((a) => a.name).filter(Boolean).join(', ') || null : null
      const narrator = Array.isArray(p.narrators) ? p.narrators.map((n) => n.name).filter(Boolean).join(', ') || null : null

      return {
        asin,
        title: p.title.trim(),
        author,
        narrator,
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
      const isOwned = this.isBookOwned(candidate, ownedBooks, ownedAsinSet, ownedTitleSet, seriesName)

      if (isOwned) {
        continue
      }

      const isUpcoming = candidate.releaseDate && candidate.releaseDate > todayIso

      const entry = {
        title: candidate.title,
        author: candidate.author || null,
        narrator: candidate.narrator || null,
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
