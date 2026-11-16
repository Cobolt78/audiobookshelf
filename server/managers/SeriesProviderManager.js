const Database = require('../Database')
const Logger = require('../Logger')
const SocketAuthority = require('../SocketAuthority')
const Audible = require('../providers/Audible')
const iTunes = require('../providers/iTunes')

/**
 * @typedef ScanSummary
 * @property {number} scannedAt
 * @property {'idle'|'running'|'completed'|'cancelled'|'failed'|'rate-limited'} status
 * @property {number} seriesChecked
 * @property {number} upcomingFound
 * @property {number} missingFound
 * @property {number} skippedCount
 * @property {string|null} errorMessage
 */

class SeriesProviderManager {
  constructor() {
    this.audible = new Audible()
    this.itunes = new iTunes()
    /** @type {Map<string, { current: number, total: number, seriesName: string, startedAt: number, cancelled: boolean }>} */
    this.activeScans = new Map()
  }

  /**
   * Get current scan status and last scan metadata for a library
   * @param {string} libraryId
   * @param {import('../models/Library')} [library]
   * @returns {{ isScanning: boolean, progress: { current: number, total: number, seriesName: string }|null, lastScan: ScanSummary|null }}
   */
  getScanStatus(libraryId, library) {
    const active = this.activeScans.get(libraryId)
    const lastScan = library?.settings?.seriesScraperLastScan || null
    return {
      isScanning: !!active,
      isRunning: !!active,
      progress: active ? { current: active.current, total: active.total, seriesName: active.seriesName } : null,
      current: active?.current || 0,
      total: active?.total || 0,
      seriesName: active?.seriesName || '',
      quick: !!active?.quick,
      singleSeriesId: active?.singleSeriesId || null,
      lastScan
    }
  }

  /**
   * Idempotently ensure optional seriesProviderEntries columns exist on legacy databases
   */
  async ensureColumns() {
    try {
      if (!Database.sequelize) return
      const queryInterface = Database.sequelize.getQueryInterface()
      if (await queryInterface.tableExists('seriesProviderEntries')) {
        const table = await queryInterface.describeTable('seriesProviderEntries')
        const DataTypes = Database.sequelize.Sequelize.DataTypes
        if (!table.author) {
          Logger.info('[SeriesProvider] Ensuring column "author" exists on seriesProviderEntries')
          await queryInterface.addColumn('seriesProviderEntries', 'author', {
            type: DataTypes.TEXT,
            allowNull: true
          })
        }
        if (!table.narrator) {
          Logger.info('[SeriesProvider] Ensuring column "narrator" exists on seriesProviderEntries')
          await queryInterface.addColumn('seriesProviderEntries', 'narrator', {
            type: DataTypes.TEXT,
            allowNull: true
          })
        }
      }
    } catch (err) {
      Logger.warn(`[SeriesProvider] ensureColumns check warning: ${err.message}`)
    }
  }

  /**
   * Scan a single series against external metadata provider (Audible with iTunes fallback)
   * @param {string} libraryId
   * @param {string} seriesId
   * @returns {Promise<{ success: boolean, summary?: ScanSummary, message?: string, error?: string }>}
   */
  async scanSingleSeries(libraryId, seriesId) {
    if (this.activeScans.has(libraryId)) {
      Logger.warn(`[SeriesProvider] Scan already running for library ${libraryId}`)
      return { success: false, message: 'Scan already in progress' }
    }

    await this.ensureColumns()

    const library = await Database.libraryModel.findByPk(libraryId)
    if (!library || library.mediaType !== 'book') {
      return { success: false, message: 'Book library required' }
    }

    const series = await Database.seriesModel.findOne({
      where: { id: seriesId, libraryId },
      include: [
        {
          model: Database.bookModel,
          attributes: ['id', 'title', 'asin', 'updatedAt', 'createdAt'],
          through: { attributes: ['sequence'] },
          include: [
            {
              model: Database.authorModel,
              attributes: ['id', 'name']
            }
          ]
        }
      ]
    })

    if (!series) {
      return { success: false, message: 'Series not found' }
    }

    const scanState = {
      current: 0,
      total: 0,
      seriesName: series.name,
      startedAt: Date.now(),
      cancelled: false,
      singleSeriesId: seriesId
    }
    this.activeScans.set(libraryId, scanState)
    SocketAuthority.emitter('series_provider_scan_started', { libraryId, seriesId, seriesName: series.name, isSingle: true })

    try {
      const region = library.settings?.seriesScraperRegion || 'us'
      const ownedBooks = (series.books || []).map((b) => ({
        asin: b.asin,
        title: b.title,
        sequence: b.bookSeries?.sequence || null,
        authors: (b.authors || []).map((a) => a.name)
      }))

      const seriesAuthors = Array.from(
        new Set(
          (series.books || [])
            .flatMap((b) => (b.authors || []).map((a) => a.name))
            .filter(Boolean)
        )
      )

      const onProgress = ({ current, total }) => {
        if (scanState.cancelled) return
        scanState.current = current
        scanState.total = total
        SocketAuthority.emitter('series_provider_scan_progress', {
          libraryId,
          seriesId,
          current,
          total,
          seriesName: series.name,
          isSingle: true
        })
      }

      let result = await this.audible.fetchSeriesProviderEntries(series.name, ownedBooks, region, onProgress, seriesAuthors)

      if (result?.skipped && !scanState.cancelled) {
        Logger.info(`[SeriesProvider] Audible skipped series "${series.name}" (${result.reason || 'No match'}). Falling back to iTunes...`)
        try {
          const itunesResult = await this.itunes.fetchSeriesProviderEntries(series.name, ownedBooks, seriesAuthors, region)
          if (itunesResult && !itunesResult.skipped) {
            result = itunesResult
          }
        } catch (itunesErr) {
          Logger.warn(`[SeriesProvider] iTunes fallback error for series "${series.name}": ${itunesErr.message}`)
        }
      }

      if (result && !result.skipped && !scanState.cancelled) {
        // Destroy old entries
        await Database.seriesProviderEntryModel.destroy({
          where: { seriesId: series.id }
        })

        // Persist upcoming
        if (result.upcoming?.length) {
          const upcomingRecords = result.upcoming.map((item) => ({
            libraryId,
            seriesId: series.id,
            seriesName: series.name,
            title: item.title,
            author: item.author || null,
            narrator: item.narrator || null,
            position: item.position || null,
            releaseDate: item.releaseDate || null,
            asin: item.asin || null,
            coverUrl: item.coverUrl || null,
            providerUrl: item.providerUrl || null,
            summary: item.summary || null,
            provider: item.provider || 'audible',
            entryType: 'upcoming',
            isReleased: false,
            lastScannedAt: Date.now()
          }))
          await Database.seriesProviderEntryModel.bulkCreate(upcomingRecords)
        }

        // Persist missing
        if (result.missing?.length) {
          const missingRecords = result.missing.map((item) => ({
            libraryId,
            seriesId: series.id,
            seriesName: series.name,
            title: item.title,
            author: item.author || null,
            narrator: item.narrator || null,
            position: item.position || null,
            releaseDate: item.releaseDate || null,
            asin: item.asin || null,
            coverUrl: item.coverUrl || null,
            providerUrl: item.providerUrl || null,
            summary: item.summary || null,
            provider: item.provider || 'audible',
            entryType: 'missing',
            isReleased: item.isReleased !== false,
            lastScannedAt: Date.now()
          }))
          await Database.seriesProviderEntryModel.bulkCreate(missingRecords)
        }
      }

      const scanSummary = {
        scannedAt: Date.now(),
        status: scanState.cancelled ? 'cancelled' : 'completed',
        seriesChecked: 1,
        upcomingFound: result?.upcoming?.length || 0,
        missingFound: result?.missing?.length || 0,
        skippedCount: result?.skipped ? 1 : 0,
        errorMessage: null
      }

      this.activeScans.delete(libraryId)
      SocketAuthority.emitter('series_provider_scan_completed', {
        libraryId,
        seriesId,
        scanSummary
      })
      return { success: true, summary: scanSummary }
    } catch (err) {
      Logger.error(`[SeriesProvider] Error checking single series "${series.name}":`, err)
      this.activeScans.delete(libraryId)
      SocketAuthority.emitter('series_provider_scan_completed', {
        libraryId,
        seriesId,
        scanSummary: {
          scannedAt: Date.now(),
          status: 'failed',
          seriesChecked: 0,
          upcomingFound: 0,
          missingFound: 0,
          skippedCount: 1,
          errorMessage: err.message
        }
      })
      return { success: false, error: err.message }
    }
  }

  /**
   * Cancel an in-progress scan for a library
   * @param {string} libraryId
   * @returns {boolean}
   */
  cancelScan(libraryId) {
    const active = this.activeScans.get(libraryId)
    if (!active) return false
    Logger.info(`[SeriesProvider] Cancelling active scan for library ${libraryId}`)
    active.cancelled = true
    return true
  }

  /**
   * Scan series in library against external metadata provider (Audible)
   * @param {string} libraryId
   * @param {{ quick?: boolean }} [options]
   * @returns {Promise<{ success: boolean, summary?: ScanSummary, message?: string, error?: string }>}
   */
  async scanLibrary(libraryId, { quick = false } = {}) {
    if (this.activeScans.has(libraryId)) {
      Logger.warn(`[SeriesProvider] Scan already running for library ${libraryId}`)
      return { success: false, message: 'Scan already in progress' }
    }

    await this.ensureColumns()

    const library = await Database.libraryModel.findByPk(libraryId)
    if (!library) {
      Logger.error(`[SeriesProvider] Library not found: ${libraryId}`)
      return { success: false, message: 'Library not found' }
    }

    if (library.mediaType !== 'book') {
      Logger.warn(`[SeriesProvider] Library ${library.name} (${libraryId}) is not a book library`)
      return { success: false, message: 'Only book libraries support series provider scanning' }
    }

    const scanState = {
      current: 0,
      total: 0,
      seriesName: '',
      startedAt: Date.now(),
      cancelled: false,
      quick: Boolean(quick)
    }
    this.activeScans.set(libraryId, scanState)
    SocketAuthority.emitter('series_provider_scan_started', { libraryId, quick: Boolean(quick) })

    let seriesChecked = 0
    let upcomingFound = 0
    let missingFound = 0
    let skippedCount = 0

    try {
      // 1. Fetch all series in this library with their associated books
      const allSeries = await Database.seriesModel.findAll({
        where: { libraryId },
        include: [
          {
            model: Database.bookModel,
            attributes: ['id', 'title', 'asin', 'updatedAt', 'createdAt'],
            through: { attributes: ['sequence'] },
            include: [
              {
                model: Database.authorModel,
                attributes: ['id', 'name']
              }
            ]
          }
        ],
        order: [['updatedAt', 'DESC']]
      })

      let targetSeries = allSeries
      if (quick) {
        const lastScanTime = library.settings?.seriesScraperLastScan?.scannedAt || 0
        const existingEntries = await Database.seriesProviderEntryModel.findAll({
          where: { libraryId },
          attributes: ['seriesId'],
          group: ['seriesId']
        })
        const scannedSeriesIdSet = new Set(existingEntries.map((e) => e.seriesId))

        targetSeries = allSeries.filter((series) => {
          if (!scannedSeriesIdSet.has(series.id)) return true
          const seriesUpdated = new Date(series.updatedAt).getTime()
          if (seriesUpdated > lastScanTime) return true
          if (series.books?.some((b) => {
            const bookAdded = new Date(b.createdAt).getTime()
            const bookUpdated = new Date(b.updatedAt).getTime()
            return bookAdded > lastScanTime || bookUpdated > lastScanTime
          })) return true
          return false
        })

        Logger.info(`[SeriesProvider] Quick scan: ${targetSeries.length} of ${allSeries.length} series require scanning for library "${library.name}"`)

        if (targetSeries.length === 0) {
          const scanSummary = {
            scannedAt: Date.now(),
            status: 'completed',
            seriesChecked: 0,
            upcomingFound: 0,
            missingFound: 0,
            skippedCount: 0,
            quick: true,
            errorMessage: null
          }
          const updatedSettings = {
            ...(library.settings || {}),
            seriesScraperLastScan: scanSummary,
            seriesScraperLastQuickScan: scanSummary
          }
          await library.update({ settings: updatedSettings })
          this.activeScans.delete(libraryId)
          SocketAuthority.emitter('series_provider_scan_completed', { libraryId, scanSummary })
          Logger.info(`[SeriesProvider] Quick scan complete: all ${allSeries.length} series already up to date for library "${library.name}"`)
          return { success: true, summary: scanSummary }
        }
      }

      scanState.total = targetSeries.length
      Logger.info(`[SeriesProvider] Starting ${quick ? 'quick ' : ''}scan of ${targetSeries.length} series for library "${library.name}"`)

      const region = library.settings?.seriesScraperRegion || 'us'

      // 2. Iterate each series and query Audible provider
      for (const series of targetSeries) {
        if (scanState.cancelled) {
          Logger.info(`[SeriesProvider] Scan cancelled by user for library ${libraryId}`)
          break
        }

        seriesChecked++
        scanState.current = seriesChecked
        scanState.seriesName = series.name

        SocketAuthority.emitter('series_provider_scan_progress', {
          libraryId,
          current: seriesChecked,
          total: targetSeries.length,
          seriesName: series.name,
          quick: Boolean(quick)
        })

        const ownedBooks = (series.books || []).map((b) => ({
          asin: b.asin,
          title: b.title,
          sequence: b.bookSeries?.sequence || null,
          authors: (b.authors || []).map((a) => a.name)
        }))

        const seriesAuthors = Array.from(
          new Set(
            (series.books || [])
              .flatMap((b) => (b.authors || []).map((a) => a.name))
              .filter(Boolean)
          )
        )

        let result
        try {
          result = await this.audible.fetchSeriesProviderEntries(series.name, ownedBooks, region, null, seriesAuthors)
        } catch (err) {
          if (err.rateLimited) {
            throw err
          }
          Logger.error(`[SeriesProvider] Error scraping series "${series.name}": ${err.message}`)
        }

        if ((!result || result.skipped) && !scanState.cancelled) {
          Logger.info(`[SeriesProvider] Audible skipped series "${series.name}". Attempting iTunes fallback...`)
          try {
            const itunesResult = await this.itunes.fetchSeriesProviderEntries(series.name, ownedBooks, seriesAuthors, region)
            if (itunesResult && !itunesResult.skipped) {
              result = itunesResult
            }
          } catch (itunesErr) {
            Logger.warn(`[SeriesProvider] iTunes fallback error for series "${series.name}": ${itunesErr.message}`)
          }
        }

        if (!result || result.skipped) {
          skippedCount++
          continue
        }

        // 3. Clear existing entries for this series
        await Database.seriesProviderEntryModel.destroy({
          where: { seriesId: series.id }
        })

        // 4. Persist upcoming releases
        if (result.upcoming && result.upcoming.length > 0) {
          upcomingFound += result.upcoming.length
          const upcomingRecords = result.upcoming.map((item) => ({
            libraryId,
            seriesId: series.id,
            seriesName: series.name,
            title: item.title,
            author: item.author || null,
            narrator: item.narrator || null,
            position: item.position || null,
            releaseDate: item.releaseDate || null,
            asin: item.asin || null,
            coverUrl: item.coverUrl || null,
            providerUrl: item.providerUrl || null,
            summary: item.summary || null,
            provider: item.provider || 'audible',
            entryType: 'upcoming',
            isReleased: false,
            lastScannedAt: Date.now()
          }))
          await Database.seriesProviderEntryModel.bulkCreate(upcomingRecords)
        }

        // 5. Persist missing books
        if (result.missing && result.missing.length > 0) {
          missingFound += result.missing.length
          const missingRecords = result.missing.map((item) => ({
            libraryId,
            seriesId: series.id,
            seriesName: series.name,
            title: item.title,
            author: item.author || null,
            narrator: item.narrator || null,
            position: item.position || null,
            releaseDate: item.releaseDate || null,
            asin: item.asin || null,
            coverUrl: item.coverUrl || null,
            providerUrl: item.providerUrl || null,
            summary: item.summary || null,
            provider: item.provider || 'audible',
            entryType: 'missing',
            isReleased: true,
            lastScannedAt: Date.now()
          }))
          await Database.seriesProviderEntryModel.bulkCreate(missingRecords)
        }

        // Gentle pause between series to prevent rate spikes
        await new Promise((resolve) => setTimeout(resolve, 250))
      }

      const finalStatus = scanState.cancelled ? 'cancelled' : 'completed'
      const scanSummary = {
        scannedAt: Date.now(),
        status: finalStatus,
        seriesChecked,
        upcomingFound,
        missingFound,
        skippedCount,
        quick: Boolean(quick),
        errorMessage: null
      }

      const updatedSettings = {
        ...(library.settings || {}),
        seriesScraperLastScan: scanSummary,
        ...(quick ? { seriesScraperLastQuickScan: scanSummary } : { seriesScraperLastFullScan: scanSummary })
      }
      await library.update({ settings: updatedSettings })

      if (scanState.cancelled) {
        SocketAuthority.emitter('series_provider_scan_cancelled', { libraryId, scanSummary })
      } else {
        SocketAuthority.emitter('series_provider_scan_completed', { libraryId, scanSummary })
      }

      Logger.info(
        `[SeriesProvider] Scan ${finalStatus} for library "${library.name}": ` +
        `${seriesChecked} series analyzed, ${upcomingFound} upcoming releases, ${missingFound} missing books, ${skippedCount} skipped.`
      )

      return { success: true, summary: scanSummary }
    } catch (err) {
      const isRateLimit = !!err.rateLimited
      const status = isRateLimit ? 'rate-limited' : 'failed'
      const errorMessage = isRateLimit
        ? `Audible rate limit encountered (retry in ${err.retryAfter || 60}s)`
        : err.message

      Logger.error(`[SeriesProvider] Scan ${status} for library ${libraryId}: ${errorMessage}`)

      const scanSummary = {
        scannedAt: Date.now(),
        status,
        seriesChecked,
        upcomingFound,
        missingFound,
        skippedCount,
        errorMessage
      }

      const updatedSettings = {
        ...(library.settings || {}),
        seriesScraperLastScan: scanSummary
      }
      await library.update({ settings: updatedSettings }).catch((saveErr) => {
        Logger.error(`[SeriesProvider] Failed to update library settings after error: ${saveErr.message}`)
      })

      SocketAuthority.emitter('series_provider_scan_failed', { libraryId, scanSummary })
      return { success: false, error: errorMessage, summary: scanSummary }
    } finally {
      this.activeScans.delete(libraryId)
    }
  }

  /**
   * Reconcile a book against seriesProviderEntries, immediately removing
   * matching provider entries from the series this book is assigned to.
   * @param {string|import('../models/Book')} bookOrId
   * @param {string} [libraryId]
   * @returns {Promise<number>} Number of deleted entries
   */
  async reconcileBookAgainstProviderEntries(bookOrId, libraryId = null) {
    if (!bookOrId) return 0
    const bookId = typeof bookOrId === 'string' ? bookOrId : bookOrId.id
    if (!bookId) return 0

    let title = typeof bookOrId === 'object' ? bookOrId.title : null
    let asin = typeof bookOrId === 'object' ? bookOrId.asin : null

    // Fetch all series assigned to this book
    const bookSeriesList = await Database.bookSeriesModel.findAll({
      where: { bookId },
      include: [
        {
          model: Database.seriesModel,
          attributes: ['id', 'name']
        }
      ]
    })

    if (!bookSeriesList || !bookSeriesList.length) {
      return 0
    }

    if (!title) {
      const bookRecord = await Database.bookModel.findByPk(bookId, { attributes: ['id', 'title', 'asin'] })
      if (bookRecord) {
        title = bookRecord.title
        if (!asin) asin = bookRecord.asin
      }
    }

    if (!title && !asin) return 0

    const normBookTitle = this.audible.normalizedTitle(title)
    const bookAsinNorm = asin ? asin.toUpperCase().trim() : null
    let totalDeleted = 0

    for (const bs of bookSeriesList) {
      const seriesId = bs.seriesId
      const seriesName = bs.series?.name || ''
      const cleanSeq = bs.sequence ? this.audible.cleanSeriesSequence(seriesName, bs.sequence) : null
      const seqNum = cleanSeq ? parseFloat(cleanSeq) : null

      const entries = await Database.seriesProviderEntryModel.findAll({
        where: { seriesId }
      })

      const idsToDelete = []

      for (const entry of entries) {
        // 1. ASIN match (case-insensitive)
        if (bookAsinNorm && entry.asin && entry.asin.toUpperCase().trim() === bookAsinNorm) {
          idsToDelete.push(entry.id)
          continue
        }

        // 2. Position match (numeric equality)
        if (seqNum !== null && !isNaN(seqNum) && entry.position) {
          const entryCleanSeq = this.audible.cleanSeriesSequence(seriesName, entry.position)
          const entryPosNum = entryCleanSeq ? parseFloat(entryCleanSeq) : null
          if (entryPosNum !== null && !isNaN(entryPosNum) && entryPosNum === seqNum) {
            idsToDelete.push(entry.id)
            continue
          }
        }

        // 3. Title match (normalized, cleaned, or safe base title after stripping series/book tags)
        if (title && entry.title) {
          const normEntryTitle = this.audible.normalizedTitle(entry.title)
          if (normBookTitle && normEntryTitle && normBookTitle === normEntryTitle) {
            idsToDelete.push(entry.id)
            continue
          }

          const cleanEntryTitle = this.audible.cleanTitle(entry.title, seriesName)
          const cleanBookWithSeries = this.audible.cleanTitle(title, seriesName)
          if (cleanEntryTitle && cleanBookWithSeries && cleanEntryTitle === cleanBookWithSeries) {
            idsToDelete.push(entry.id)
            continue
          }

          const normBaseEntry = this.audible.extractSafeBaseTitle(entry.title, seriesName)
          const normBaseBook = this.audible.extractSafeBaseTitle(title, seriesName)
          if (normBaseEntry && normBaseBook && normBaseEntry === normBaseBook) {
            idsToDelete.push(entry.id)
            continue
          }
        }
      }

      if (idsToDelete.length) {
        Logger.info(`[SeriesProvider] Reconciled book "${title}" (ID: ${bookId}) - removing ${idsToDelete.length} stale provider entries in series "${seriesName || seriesId}"`)
        await Database.seriesProviderEntryModel.destroy({
          where: { id: idsToDelete }
        })
        totalDeleted += idsToDelete.length
        SocketAuthority.emitter('series_provider_scan_completed', {
          seriesId,
          libraryId,
          reconciled: true,
          removedCount: idsToDelete.length
        })
      }
    }

    return totalDeleted
  }
}

module.exports = new SeriesProviderManager()
