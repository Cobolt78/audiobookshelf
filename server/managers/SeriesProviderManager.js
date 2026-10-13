const Database = require('../Database')
const Logger = require('../Logger')
const SocketAuthority = require('../SocketAuthority')
const Audible = require('../providers/Audible')

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
   * Scan a single series against external metadata provider (Audible)
   * @param {string} libraryId
   * @param {string} seriesId
   * @returns {Promise<{ success: boolean, summary?: ScanSummary, message?: string, error?: string }>}
   */
  async scanSingleSeries(libraryId, seriesId) {
    if (this.activeScans.has(libraryId)) {
      Logger.warn(`[SeriesProvider] Scan already running for library ${libraryId}`)
      return { success: false, message: 'Scan already in progress' }
    }

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
          through: { attributes: ['sequence'] }
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
        title: b.title
      }))

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

      const result = await this.audible.fetchSeriesProviderEntries(series.name, ownedBooks, region, onProgress)

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
            position: item.position || null,
            releaseDate: item.releaseDate || null,
            asin: item.asin || null,
            coverUrl: item.coverUrl || null,
            providerUrl: item.providerUrl || null,
            summary: item.summary || null,
            provider: 'audible',
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
            position: item.position || null,
            releaseDate: item.releaseDate || null,
            asin: item.asin || null,
            coverUrl: item.coverUrl || null,
            providerUrl: item.providerUrl || null,
            summary: item.summary || null,
            provider: 'audible',
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
            through: { attributes: ['sequence'] }
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
          title: b.title
        }))

        let result
        try {
          result = await this.audible.fetchSeriesProviderEntries(series.name, ownedBooks, region)
        } catch (err) {
          if (err.rateLimited) {
            throw err
          }
          Logger.error(`[SeriesProvider] Error scraping series "${series.name}": ${err.message}`)
          skippedCount++
          continue
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
}

module.exports = new SeriesProviderManager()
