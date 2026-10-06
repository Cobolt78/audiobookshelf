const Database = require('../Database')
const Logger = require('../Logger')
const dateAndTime = require('../libs/dateAndTime')

class BandwidthManager {
  /**
   * @param {import('../Server')} server
   */
  constructor(server) {
    this.server = server
    /** @type {Map<string, { userId: string, date: string, bytesStream: number, bytesDownload: number, bytesOther: number, bytesTotal: number, requests: number }>} */
    this.buffer = new Map()
    this.flushInterval = null
  }

  init() {
    Logger.info('[BandwidthManager] Initialized')
    // Flush buffered stats to database every 60 seconds
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => Logger.error('[BandwidthManager] Error in periodic flush:', err))
    }, 60000)
    if (this.flushInterval.unref) {
      this.flushInterval.unref()
    }
  }

  async stop() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
    await this.flush()
  }

  /**
   * Record data transfer into in-memory buffer
   *
   * @param {string|null} userId
   * @param {'stream'|'download'|'other'} category
   * @param {number} bytes
   */
  record(userId, category, bytes) {
    if (!global.ServerSettings?.enableBandwidthTracking) return
    if (!bytes || bytes <= 0 || isNaN(bytes)) return

    const date = dateAndTime.format(new Date(), 'YYYY-MM-DD')
    const uid = userId || 'anonymous'
    const key = `${uid}_${date}`

    let entry = this.buffer.get(key)
    if (!entry) {
      entry = {
        userId: uid,
        date: date,
        bytesStream: 0,
        bytesDownload: 0,
        bytesOther: 0,
        bytesTotal: 0,
        requests: 0
      }
      this.buffer.set(key, entry)
    }

    if (category === 'stream') {
      entry.bytesStream += bytes
    } else if (category === 'download') {
      entry.bytesDownload += bytes
    } else {
      entry.bytesOther += bytes
    }
    entry.bytesTotal += bytes
    entry.requests += 1
  }

  /**
   * Determine traffic category based on request URL and query
   *
   * @param {import('express').Request} req
   * @returns {'stream'|'download'|'other'}
   */
  categorizeRequest(req) {
    const url = req.originalUrl || req.url || ''
    const path = req.path || ''

    // Download: explicit downloads, ebooks, zip archives
    if (
      url.includes('/download') ||
      url.includes('/ebook') ||
      req.query?.download === '1' ||
      req.query?.download === 'true'
    ) {
      return 'download'
    }

    // Audio streaming: HLS, direct play, active playback session audio track chunks
    if (
      path.startsWith('/hls') ||
      path.includes('/play') ||
      path.includes('/session') ||
      (path.includes('/file/') && !url.includes('/download'))
    ) {
      return 'stream'
    }

    // General: covers, API JSON, static client assets, RSS feeds
    return 'other'
  }

  /**
   * Express middleware to capture outgoing bytes on response finish/close
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  middleware(req, res, next) {
    if (!global.ServerSettings?.enableBandwidthTracking) {
      return next()
    }

    const startBytes = req.socket ? req.socket.bytesWritten : 0
    let recorded = false

    const onResponseEnd = () => {
      if (recorded) return
      recorded = true

      const endBytes = req.socket ? req.socket.bytesWritten : 0
      let bytesSent = Math.max(0, endBytes - startBytes)

      // Fallback if socket.bytesWritten was not incremented
      if (bytesSent === 0) {
        const cl = res.getHeader('content-length')
        if (cl) {
          bytesSent = parseInt(cl, 10) || 0
        }
      }

      if (bytesSent <= 0) return

      // Determine user attribution
      let userId = req.user?.id || null

      // For HLS streams, lookup userId via active stream / session
      if (!userId && req.path?.startsWith('/hls/')) {
        const parts = req.path.split('/')
        const streamId = parts[2]
        if (streamId && this.server?.playbackSessionManager) {
          const session = this.server.playbackSessionManager.getSession(streamId)
          if (session?.userId) {
            userId = session.userId
          }
        }
      }

      const category = this.categorizeRequest(req)
      this.record(userId, category, bytesSent)
    }

    res.on('finish', onResponseEnd)
    res.on('close', onResponseEnd)

    next()
  }

  /**
   * Flush in-memory buffer into SQLite database using an atomic UPSERT transaction
   */
  async flush() {
    if (this.buffer.size === 0) return
    if (!Database.sequelize) return

    const currentBuffer = this.buffer
    this.buffer = new Map()

    const entries = Array.from(currentBuffer.values())
    if (!entries.length) return

    try {
      await Database.sequelize.transaction(async (t) => {
        for (const entry of entries) {
          await Database.sequelize.query(
            `INSERT INTO bandwidthStats (userId, date, bytesStream, bytesDownload, bytesOther, bytesTotal, requests, createdAt, updatedAt)
             VALUES (:userId, :date, :bytesStream, :bytesDownload, :bytesOther, :bytesTotal, :requests, datetime('now'), datetime('now'))
             ON CONFLICT(userId, date) DO UPDATE SET
               bytesStream = bytesStream + excluded.bytesStream,
               bytesDownload = bytesDownload + excluded.bytesDownload,
               bytesOther = bytesOther + excluded.bytesOther,
               bytesTotal = bytesTotal + excluded.bytesTotal,
               requests = requests + excluded.requests,
               updatedAt = datetime('now');`,
            {
              replacements: entry,
              transaction: t
            }
          )
        }
      })
    } catch (err) {
      Logger.error('[BandwidthManager] Failed to flush bandwidth buffer to DB, restoring buffer:', err)
      // Merge entries back into buffer so data is not lost
      for (const entry of entries) {
        const key = `${entry.userId}_${entry.date}`
        const existing = this.buffer.get(key)
        if (existing) {
          existing.bytesStream += entry.bytesStream
          existing.bytesDownload += entry.bytesDownload
          existing.bytesOther += entry.bytesOther
          existing.bytesTotal += entry.bytesTotal
          existing.requests += entry.requests
        } else {
          this.buffer.set(key, entry)
        }
      }
    }
  }

  /**
   * Fetch aggregated bandwidth stats
   *
   * @param {Object} [options]
   * @param {string} [options.range] 'day' | 'week' | 'month' | 'year' | 'all'
   * @param {string} [options.userId]
   * @param {string} [options.startDate]
   * @param {string} [options.endDate]
   */
  async getStats(options = {}) {
    // Flush current buffer first for live, up-to-the-second stats
    await this.flush()

    const now = new Date()
    const todayStr = dateAndTime.format(now, 'YYYY-MM-DD')

    // Helper to format date offset
    const getPastDateStr = (daysAgo) => {
      const d = new Date()
      d.setDate(d.getDate() - daysAgo)
      return dateAndTime.format(d, 'YYYY-MM-DD')
    }

    const sevenDaysAgoStr = getPastDateStr(6)
    const thirtyDaysAgoStr = getPastDateStr(29)
    const monthStartStr = `${todayStr.substring(0, 7)}-01`
    const yearStartStr = `${todayStr.substring(0, 4)}-01-01`

    // Determine query range for time series
    let filterStart = null
    let filterEnd = options.endDate || todayStr

    if (options.startDate) {
      filterStart = options.startDate
    } else {
      switch (options.range) {
        case 'day':
        case 'today':
          filterStart = todayStr
          break
        case 'week':
        case 'last7Days':
          filterStart = sevenDaysAgoStr
          break
        case 'month':
        case 'last30Days':
          filterStart = thirtyDaysAgoStr
          break
        case 'thisMonth':
          filterStart = monthStartStr
          break
        case 'year':
        case 'thisYear':
          filterStart = yearStartStr
          break
        case 'all':
        default:
          filterStart = null
          break
      }
    }

    // Load all stats from database
    const allRecords = await Database.bandwidthStatModel.findAll({
      order: [['date', 'ASC']]
    })

    // Compute Summary KPIs (across all users or specific user)
    const summary = {
      today: { total: 0, stream: 0, download: 0, other: 0, requests: 0 },
      last7Days: { total: 0, stream: 0, download: 0, other: 0, requests: 0 },
      thisMonth: { total: 0, stream: 0, download: 0, other: 0, requests: 0 },
      thisYear: { total: 0, stream: 0, download: 0, other: 0, requests: 0 },
      allTime: { total: 0, stream: 0, download: 0, other: 0, requests: 0 }
    }

    const addRecordToBucket = (bucket, rec) => {
      bucket.total += Number(rec.bytesTotal || 0)
      bucket.stream += Number(rec.bytesStream || 0)
      bucket.download += Number(rec.bytesDownload || 0)
      bucket.other += Number(rec.bytesOther || 0)
      bucket.requests += Number(rec.requests || 0)
    }

    for (const rec of allRecords) {
      if (options.userId && rec.userId !== options.userId) continue

      addRecordToBucket(summary.allTime, rec)

      if (rec.date === todayStr) {
        addRecordToBucket(summary.today, rec)
      }
      if (rec.date >= sevenDaysAgoStr && rec.date <= todayStr) {
        addRecordToBucket(summary.last7Days, rec)
      }
      if (rec.date >= monthStartStr && rec.date <= todayStr) {
        addRecordToBucket(summary.thisMonth, rec)
      }
      if (rec.date >= yearStartStr && rec.date <= todayStr) {
        addRecordToBucket(summary.thisYear, rec)
      }
    }

    // Filter records for the selected timeline and user filter
    const filteredRecords = allRecords.filter((rec) => {
      if (options.userId && rec.userId !== options.userId) return false
      if (filterStart && rec.date < filterStart) return false
      if (filterEnd && rec.date > filterEnd) return false
      return true
    })

    // Aggregate by date (daily timeline)
    const dailyMap = new Map()
    for (const rec of filteredRecords) {
      let dailyEntry = dailyMap.get(rec.date)
      if (!dailyEntry) {
        dailyEntry = {
          date: rec.date,
          bytesStream: 0,
          bytesDownload: 0,
          bytesOther: 0,
          bytesTotal: 0,
          requests: 0
        }
        dailyMap.set(rec.date, dailyEntry)
      }
      dailyEntry.bytesStream += Number(rec.bytesStream || 0)
      dailyEntry.bytesDownload += Number(rec.bytesDownload || 0)
      dailyEntry.bytesOther += Number(rec.bytesOther || 0)
      dailyEntry.bytesTotal += Number(rec.bytesTotal || 0)
      dailyEntry.requests += Number(rec.requests || 0)
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

    // Aggregate by user (user breakdown for selected range)
    const userMap = new Map()
    let rangeTotalBytes = 0

    // Fetch user map for usernames
    const users = await Database.userModel.findAll()
    const usernameMap = new Map()
    for (const u of users) {
      usernameMap.set(u.id, u.username)
    }

    for (const rec of filteredRecords) {
      let userEntry = userMap.get(rec.userId)
      if (!userEntry) {
        userEntry = {
          userId: rec.userId,
          username: rec.userId === 'anonymous' ? 'Anonymous / Unauthenticated' : usernameMap.get(rec.userId) || 'Unknown User',
          bytesStream: 0,
          bytesDownload: 0,
          bytesOther: 0,
          bytesTotal: 0,
          requests: 0,
          percentOfTotal: 0
        }
        userMap.set(rec.userId, userEntry)
      }
      userEntry.bytesStream += Number(rec.bytesStream || 0)
      userEntry.bytesDownload += Number(rec.bytesDownload || 0)
      userEntry.bytesOther += Number(rec.bytesOther || 0)
      userEntry.bytesTotal += Number(rec.bytesTotal || 0)
      userEntry.requests += Number(rec.requests || 0)
      rangeTotalBytes += Number(rec.bytesTotal || 0)
    }

    const userBreakdown = Array.from(userMap.values())
      .map((u) => {
        u.percentOfTotal = rangeTotalBytes > 0 ? Number(((u.bytesTotal / rangeTotalBytes) * 100).toFixed(1)) : 0
        return u
      })
      .sort((a, b) => b.bytesTotal - a.bytesTotal)

    return {
      isEnabled: !!global.ServerSettings?.enableBandwidthTracking,
      range: options.range || 'all',
      startDate: filterStart,
      endDate: filterEnd,
      summary,
      daily,
      userBreakdown,
      rangeTotalBytes
    }
  }

  /**
   * Clear all bandwidth statistics
   */
  async clearStats() {
    this.buffer.clear()
    await Database.bandwidthStatModel.destroy({ where: {}, truncate: true })
    Logger.info('[BandwidthManager] All bandwidth statistics cleared by admin')
    return true
  }
}

module.exports = BandwidthManager
