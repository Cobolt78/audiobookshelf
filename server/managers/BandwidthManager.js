const { Op } = require('sequelize')
const Database = require('../Database')
const Logger = require('../Logger')
const dateAndTime = require('../libs/dateAndTime')
const requestIp = require('../libs/requestIp')

/**
 * Check if IP address belongs to a private / local network
 * @param {string} ip
 * @returns {boolean}
 */
function isLocalIp(ip) {
  if (!ip) return false
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7)
  }
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true
  // 10.0.0.0/8
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) return true
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(ip)) return true
  // 192.168.0.0/16
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip)) return true
  // 169.254.0.0/16 (link-local)
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(ip)) return true
  // IPv6 local: fc00::/7, fe80::/10
  if (/^(fc|fd|fe80)/i.test(ip)) return true
  return false
}

class BandwidthManager {
  /**
   * @param {import('../Server')} server
   */
  constructor(server) {
    this.server = server
    /** @type {Map<string, { userId: string, date: string, bytesStream: number, bytesDownload: number, bytesOther: number, bytesTotal: number, bytesLocal: number, bytesInternet: number, requests: number }>} */
    this.buffer = new Map()
    /** @type {Map<string, { userId: string, date: string, libraryItemId: string, itemName: string, category: string, bytesLocal: number, bytesInternet: number, bytesTotal: number, requests: number }>} */
    this.itemBuffer = new Map()
    /** @type {Map<string, { userId: string, date: string, hour: number, bytesStream: number, bytesDownload: number, bytesOther: number, bytesLocal: number, bytesInternet: number, bytesTotal: number, requests: number }>} */
    this.hourlyBuffer = new Map()
    /** @type {Map<string, { userId: string, bucketTime: number, timeLabel: string, date: string, hour: number, minute: number, bytesStream: number, bytesDownload: number, bytesOther: number, bytesLocal: number, bytesInternet: number, bytesTotal: number, requests: number }>} */
    this.timeBuffer = new Map()
    /** @type {Map<string, string>} */
    this.itemTitleCache = new Map()
    this.flushInterval = null
  }

  async init() {
    Logger.info('[BandwidthManager] Initialized')

    // Ensure legacy SQLite columns exist
    await this.ensureColumns()

    // Ensure models sync
    if (Database.bandwidthItemStatModel) {
      try {
        await Database.bandwidthItemStatModel.sync()
      } catch (err) {
        Logger.error('[BandwidthManager] Error syncing bandwidthItemStats table:', err)
      }
    }
    if (Database.bandwidthHourlyStatModel) {
      try {
        await Database.bandwidthHourlyStatModel.sync()
      } catch (err) {
        Logger.error('[BandwidthManager] Error syncing bandwidthHourlyStats table:', err)
      }
    }
    if (Database.bandwidthTimeStatModel) {
      try {
        await Database.bandwidthTimeStatModel.sync()
      } catch (err) {
        Logger.error('[BandwidthManager] Error syncing bandwidthTimeStats table:', err)
      }
    }

    // Flush buffered stats to database every 60 seconds
    this.flushInterval = setInterval(() => {
      this.flush().catch((err) => Logger.error('[BandwidthManager] Error in periodic flush:', err))
    }, 60000)
    if (this.flushInterval.unref) {
      this.flushInterval.unref()
    }
  }

  async ensureColumns() {
    if (!Database.sequelize) return
    try {
      await Database.sequelize.query('ALTER TABLE bandwidthStats ADD COLUMN bytesLocal BIGINT DEFAULT 0;')
    } catch {
      // Column already exists
    }
    try {
      await Database.sequelize.query('ALTER TABLE bandwidthStats ADD COLUMN bytesInternet BIGINT DEFAULT 0;')
    } catch {
      // Column already exists
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
   * Extract libraryItemId, itemName, and associated userId from request
   *
   * @param {import('express').Request} req
   * @returns {Promise<{ libraryItemId: string, itemName: string, userId?: string }>}
   */
  async extractItemInfo(req) {
    if (!req) return { libraryItemId: 'general', itemName: 'General / Web App' }

    // 1. Attached libraryItem from LibraryItemController middleware
    if (req.libraryItem) {
      const id = req.libraryItem.id
      const title = req.libraryItem.media?.title || req.libraryItem.title || 'Unknown Title'
      if (id && title) {
        this.itemTitleCache.set(id, title)
        return { libraryItemId: id, itemName: title }
      }
    }

    const path = req.path || ''
    const url = req.originalUrl || req.url || ''

    // 2. Playback Session Track Streaming: /session/:id/track/:index or /public/session/:id/track/:index
    const sessionMatch = path.match(/\/session\/([^/]+)\/track/)
    if (sessionMatch) {
      const sessionId = sessionMatch[1]
      const session = this.server?.playbackSessionManager?.getSession(sessionId)
      if (session) {
        const id = session.libraryItemId || sessionId
        const title = session.displayTitle || 'Audio Track'
        this.itemTitleCache.set(id, title)
        return { libraryItemId: id, itemName: title, userId: session.userId }
      }
    }

    // 3. HLS Streaming: /hls/:stream/:file
    if (path.startsWith('/hls/')) {
      const parts = path.split('/')
      const streamId = parts[2]
      if (streamId) {
        const session = this.server?.playbackSessionManager?.getSession(streamId)
        if (session) {
          const id = session.libraryItemId || streamId
          const title = session.displayTitle || 'HLS Stream'
          this.itemTitleCache.set(id, title)
          return { libraryItemId: id, itemName: title, userId: session.userId }
        }
      }
    }

    // 4. Library Item Routes: /api/items/:id/...
    const itemMatch = url.match(/\/api\/items\/([^/?#]+)/)
    if (itemMatch) {
      const itemId = itemMatch[1]
      if (this.itemTitleCache.has(itemId)) {
        return { libraryItemId: itemId, itemName: this.itemTitleCache.get(itemId) }
      }
      try {
        if (Database.libraryItemModel) {
          const item = await Database.libraryItemModel.findByPk(itemId, {
            attributes: ['id', 'mediaType'],
            include: [
              { model: Database.bookModel, attributes: ['title'] },
              { model: Database.podcastModel, attributes: ['title'] }
            ]
          })
          if (item) {
            const title = item.media?.title || item.book?.title || item.podcast?.title || 'Library Item'
            this.itemTitleCache.set(itemId, title)
            return { libraryItemId: itemId, itemName: title }
          }
        }
      } catch (err) {
        Logger.debug(`[BandwidthManager] Failed to resolve item title for ${itemId}: ${err.message}`)
      }
      return { libraryItemId: itemId, itemName: 'Item ' + itemId.substring(0, 8) }
    }

    // 5. Shared media links: /share/:slug or /public/share/:slug
    if (path.includes('/share/')) {
      return { libraryItemId: 'shared', itemName: 'Shared Media Link' }
    }

    // 6. Backups
    if (path.includes('/backups/')) {
      return { libraryItemId: 'backup', itemName: 'Server Backup' }
    }

    return { libraryItemId: 'general', itemName: 'General / Web App' }
  }

  /**
   * Record data transfer into in-memory buffers
   *
   * @param {string|null} userId
   * @param {'stream'|'download'|'other'} category
   * @param {number} bytes
   * @param {boolean} isLocal
   * @param {{ libraryItemId?: string, itemName?: string }|null} [itemInfo]
   */
  record(userId, category, bytes, isLocal = false, itemInfo = null) {
    if (!global.ServerSettings?.enableBandwidthTracking) return
    if (!bytes || bytes <= 0 || isNaN(bytes)) return

    const now = new Date()
    const date = dateAndTime.format(now, 'YYYY-MM-DD')
    const hour = now.getHours()
    const minute = Math.floor(now.getMinutes() / 10) * 10
    const bucketTime = Math.floor(now.getTime() / 600000) * 600000
    const timeLabel = `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    const uid = userId || 'anonymous'

    // 1. Daily User Summary Buffer
    const dailyKey = `${uid}_${date}`
    let dailyEntry = this.buffer.get(dailyKey)
    if (!dailyEntry) {
      dailyEntry = {
        userId: uid,
        date: date,
        bytesStream: 0,
        bytesDownload: 0,
        bytesOther: 0,
        bytesTotal: 0,
        bytesLocal: 0,
        bytesInternet: 0,
        requests: 0
      }
      this.buffer.set(dailyKey, dailyEntry)
    }

    if (category === 'stream') dailyEntry.bytesStream += bytes
    else if (category === 'download') dailyEntry.bytesDownload += bytes
    else dailyEntry.bytesOther += bytes

    if (isLocal) dailyEntry.bytesLocal += bytes
    else dailyEntry.bytesInternet += bytes

    dailyEntry.bytesTotal += bytes
    dailyEntry.requests += 1

    // 2. Per-Item Statistics Buffer
    const libraryItemId = itemInfo?.libraryItemId || 'general'
    const itemName = itemInfo?.itemName || (libraryItemId === 'general' ? 'General / Web App' : 'Item ' + libraryItemId.substring(0, 8))
    const itemKey = `${uid}_${date}_${libraryItemId}_${category}`

    let itemEntry = this.itemBuffer.get(itemKey)
    if (!itemEntry) {
      itemEntry = {
        userId: uid,
        date: date,
        libraryItemId: libraryItemId,
        itemName: itemName,
        category: category,
        bytesLocal: 0,
        bytesInternet: 0,
        bytesTotal: 0,
        requests: 0
      }
      this.itemBuffer.set(itemKey, itemEntry)
    }

    if (itemName && itemEntry.itemName === 'General / Web App' && itemName !== 'General / Web App') {
      itemEntry.itemName = itemName
    }

    if (isLocal) itemEntry.bytesLocal += bytes
    else itemEntry.bytesInternet += bytes
    itemEntry.bytesTotal += bytes
    itemEntry.requests += 1

    // 3. Hourly Time-of-Day Buffer (Approach 1: 00:00 - 23:00)
    const hourlyKey = `${uid}_${date}_${hour}`
    let hourlyEntry = this.hourlyBuffer.get(hourlyKey)
    if (!hourlyEntry) {
      hourlyEntry = {
        userId: uid,
        date: date,
        hour: hour,
        bytesStream: 0,
        bytesDownload: 0,
        bytesOther: 0,
        bytesLocal: 0,
        bytesInternet: 0,
        bytesTotal: 0,
        requests: 0
      }
      this.hourlyBuffer.set(hourlyKey, hourlyEntry)
    }

    if (category === 'stream') hourlyEntry.bytesStream += bytes
    else if (category === 'download') hourlyEntry.bytesDownload += bytes
    else hourlyEntry.bytesOther += bytes

    if (isLocal) hourlyEntry.bytesLocal += bytes
    else hourlyEntry.bytesInternet += bytes

    hourlyEntry.bytesTotal += bytes
    hourlyEntry.requests += 1

    // 4. Rolling 10-Minute High-Resolution Buffer (Approach 2: Last 48 Hours)
    const timeKey = `${uid}_${timeLabel}`
    let timeEntry = this.timeBuffer.get(timeKey)
    if (!timeEntry) {
      timeEntry = {
        userId: uid,
        bucketTime: bucketTime,
        timeLabel: timeLabel,
        date: date,
        hour: hour,
        minute: minute,
        bytesStream: 0,
        bytesDownload: 0,
        bytesOther: 0,
        bytesLocal: 0,
        bytesInternet: 0,
        bytesTotal: 0,
        requests: 0
      }
      this.timeBuffer.set(timeKey, timeEntry)
    }

    if (category === 'stream') timeEntry.bytesStream += bytes
    else if (category === 'download') timeEntry.bytesDownload += bytes
    else timeEntry.bytesOther += bytes

    if (isLocal) timeEntry.bytesLocal += bytes
    else timeEntry.bytesInternet += bytes

    timeEntry.bytesTotal += bytes
    timeEntry.requests += 1
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

    // Identify client IP and determine if local network or internet
    const clientIp = requestIp.getClientIp(req)
    const isLocal = isLocalIp(clientIp)

    const onResponseEnd = async () => {
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

      const itemInfo = await this.extractItemInfo(req)

      // Determine user attribution
      let userId = req.user?.id || null
      if (!userId && itemInfo.userId) {
        userId = itemInfo.userId
      }

      const category = this.categorizeRequest(req)
      this.record(userId, category, bytesSent, isLocal, itemInfo)
    }

    res.on('finish', onResponseEnd)
    res.on('close', onResponseEnd)

    next()
  }

  /**
   * Flush in-memory buffers into SQLite database using atomic UPSERT transactions
   */
  async flush() {
    if (this.buffer.size === 0 && this.itemBuffer.size === 0 && this.hourlyBuffer.size === 0 && this.timeBuffer.size === 0) return
    if (!Database.sequelize) return

    const currentBuffer = this.buffer
    const currentItemBuffer = this.itemBuffer
    const currentHourlyBuffer = this.hourlyBuffer
    const currentTimeBuffer = this.timeBuffer

    this.buffer = new Map()
    this.itemBuffer = new Map()
    this.hourlyBuffer = new Map()
    this.timeBuffer = new Map()

    const entries = Array.from(currentBuffer.values())
    const itemEntries = Array.from(currentItemBuffer.values())
    const hourlyEntries = Array.from(currentHourlyBuffer.values())
    const timeEntries = Array.from(currentTimeBuffer.values())

    try {
      await Database.sequelize.transaction(async (t) => {
        // 1. Daily User Stats UPSERT
        for (const entry of entries) {
          await Database.sequelize.query(
            `INSERT INTO bandwidthStats (userId, date, bytesStream, bytesDownload, bytesOther, bytesTotal, bytesLocal, bytesInternet, requests, createdAt, updatedAt)
             VALUES (:userId, :date, :bytesStream, :bytesDownload, :bytesOther, :bytesTotal, :bytesLocal, :bytesInternet, :requests, datetime('now'), datetime('now'))
             ON CONFLICT(userId, date) DO UPDATE SET
               bytesStream = bytesStream + excluded.bytesStream,
               bytesDownload = bytesDownload + excluded.bytesDownload,
               bytesOther = bytesOther + excluded.bytesOther,
               bytesTotal = bytesTotal + excluded.bytesTotal,
               bytesLocal = bytesLocal + excluded.bytesLocal,
               bytesInternet = bytesInternet + excluded.bytesInternet,
               requests = requests + excluded.requests,
               updatedAt = datetime('now');`,
            {
              replacements: entry,
              transaction: t
            }
          )
        }

        // 2. Per-Item Stats UPSERT
        for (const itemEntry of itemEntries) {
          await Database.sequelize.query(
            `INSERT INTO bandwidthItemStats (userId, date, libraryItemId, itemName, category, bytesLocal, bytesInternet, bytesTotal, requests, createdAt, updatedAt)
             VALUES (:userId, :date, :libraryItemId, :itemName, :category, :bytesLocal, :bytesInternet, :bytesTotal, :requests, datetime('now'), datetime('now'))
             ON CONFLICT(userId, date, libraryItemId, category) DO UPDATE SET
               bytesLocal = bytesLocal + excluded.bytesLocal,
               bytesInternet = bytesInternet + excluded.bytesInternet,
               bytesTotal = bytesTotal + excluded.bytesTotal,
               requests = requests + excluded.requests,
               itemName = COALESCE(excluded.itemName, bandwidthItemStats.itemName),
               updatedAt = datetime('now');`,
            {
              replacements: itemEntry,
              transaction: t
            }
          )
        }

        // 3. Hourly Stats UPSERT
        for (const hourlyEntry of hourlyEntries) {
          await Database.sequelize.query(
            `INSERT INTO bandwidthHourlyStats (userId, date, hour, bytesStream, bytesDownload, bytesOther, bytesLocal, bytesInternet, bytesTotal, requests, createdAt, updatedAt)
             VALUES (:userId, :date, :hour, :bytesStream, :bytesDownload, :bytesOther, :bytesLocal, :bytesInternet, :bytesTotal, :requests, datetime('now'), datetime('now'))
             ON CONFLICT(userId, date, hour) DO UPDATE SET
               bytesStream = bytesStream + excluded.bytesStream,
               bytesDownload = bytesDownload + excluded.bytesDownload,
               bytesOther = bytesOther + excluded.bytesOther,
               bytesLocal = bytesLocal + excluded.bytesLocal,
               bytesInternet = bytesInternet + excluded.bytesInternet,
               bytesTotal = bytesTotal + excluded.bytesTotal,
               requests = requests + excluded.requests,
               updatedAt = datetime('now');`,
            {
              replacements: hourlyEntry,
              transaction: t
            }
          )
        }

        // 4. 10-Minute High-Res Stats UPSERT
        for (const timeEntry of timeEntries) {
          await Database.sequelize.query(
            `INSERT INTO bandwidthTimeStats (userId, bucketTime, timeLabel, date, hour, minute, bytesStream, bytesDownload, bytesOther, bytesLocal, bytesInternet, bytesTotal, requests, createdAt, updatedAt)
             VALUES (:userId, :bucketTime, :timeLabel, :date, :hour, :minute, :bytesStream, :bytesDownload, :bytesOther, :bytesLocal, :bytesInternet, :bytesTotal, :requests, datetime('now'), datetime('now'))
             ON CONFLICT(userId, timeLabel) DO UPDATE SET
               bytesStream = bytesStream + excluded.bytesStream,
               bytesDownload = bytesDownload + excluded.bytesDownload,
               bytesOther = bytesOther + excluded.bytesOther,
               bytesLocal = bytesLocal + excluded.bytesLocal,
               bytesInternet = bytesInternet + excluded.bytesInternet,
               bytesTotal = bytesTotal + excluded.bytesTotal,
               requests = requests + excluded.requests,
               updatedAt = datetime('now');`,
            {
              replacements: timeEntry,
              transaction: t
            }
          )
        }
      })

      // 5. Automatic Pruning: Purge 10-minute records older than 48 hours to maintain a hard ceiling on SQLite size
      const cutoff48h = Date.now() - 48 * 3600 * 1000
      if (Database.bandwidthTimeStatModel) {
        await Database.bandwidthTimeStatModel.destroy({
          where: {
            bucketTime: { [Op.lt]: cutoff48h }
          }
        })
      }
    } catch (err) {
      Logger.error('[BandwidthManager] Failed to flush bandwidth buffer to DB, restoring buffers:', err)
      // Merge entries back into buffers
      for (const entry of entries) {
        const key = `${entry.userId}_${entry.date}`
        const existing = this.buffer.get(key)
        if (existing) {
          existing.bytesStream += entry.bytesStream
          existing.bytesDownload += entry.bytesDownload
          existing.bytesOther += entry.bytesOther
          existing.bytesTotal += entry.bytesTotal
          existing.bytesLocal += entry.bytesLocal
          existing.bytesInternet += entry.bytesInternet
          existing.requests += entry.requests
        } else {
          this.buffer.set(key, entry)
        }
      }

      for (const itemEntry of itemEntries) {
        const itemKey = `${itemEntry.userId}_${itemEntry.date}_${itemEntry.libraryItemId}_${itemEntry.category}`
        const existingItem = this.itemBuffer.get(itemKey)
        if (existingItem) {
          existingItem.bytesLocal += itemEntry.bytesLocal
          existingItem.bytesInternet += itemEntry.bytesInternet
          existingItem.bytesTotal += itemEntry.bytesTotal
          existingItem.requests += itemEntry.requests
        } else {
          this.itemBuffer.set(itemKey, itemEntry)
        }
      }

      for (const hourlyEntry of hourlyEntries) {
        const hourlyKey = `${hourlyEntry.userId}_${hourlyEntry.date}_${hourlyEntry.hour}`
        const existingHourly = this.hourlyBuffer.get(hourlyKey)
        if (existingHourly) {
          existingHourly.bytesStream += hourlyEntry.bytesStream
          existingHourly.bytesDownload += hourlyEntry.bytesDownload
          existingHourly.bytesOther += hourlyEntry.bytesOther
          existingHourly.bytesLocal += hourlyEntry.bytesLocal
          existingHourly.bytesInternet += hourlyEntry.bytesInternet
          existingHourly.bytesTotal += hourlyEntry.bytesTotal
          existingHourly.requests += hourlyEntry.requests
        } else {
          this.hourlyBuffer.set(hourlyKey, hourlyEntry)
        }
      }

      for (const timeEntry of timeEntries) {
        const timeKey = `${timeEntry.userId}_${timeEntry.timeLabel}`
        const existingTime = this.timeBuffer.get(timeKey)
        if (existingTime) {
          existingTime.bytesStream += timeEntry.bytesStream
          existingTime.bytesDownload += timeEntry.bytesDownload
          existingTime.bytesOther += timeEntry.bytesOther
          existingTime.bytesLocal += timeEntry.bytesLocal
          existingTime.bytesInternet += timeEntry.bytesInternet
          existingTime.bytesTotal += timeEntry.bytesTotal
          existingTime.requests += timeEntry.requests
        } else {
          this.timeBuffer.set(timeKey, timeEntry)
        }
      }
    }
  }

  /**
   * Fetch aggregated bandwidth stats
   *
   * @param {Object} [options]
   * @param {string} [options.range] 'last48Hours' | 'day' | 'week' | 'month' | 'year' | 'all'
   * @param {string} [options.userId]
   * @param {string} [options.startDate]
   * @param {string} [options.endDate]
   * @param {string} [options.trafficType] 'all' | 'internet' | 'local'
   * @param {string} [options.date]
   */
  async getStats(options = {}) {
    // Flush current buffer first for live stats
    await this.flush()

    const now = new Date()
    const todayStr = dateAndTime.format(now, 'YYYY-MM-DD')

    const getPastDateStr = (daysAgo) => {
      const d = new Date()
      d.setDate(d.getDate() - daysAgo)
      return dateAndTime.format(d, 'YYYY-MM-DD')
    }

    const twoDaysAgoStr = getPastDateStr(2)
    const sevenDaysAgoStr = getPastDateStr(6)
    const thirtyDaysAgoStr = getPastDateStr(29)
    const monthStartStr = `${todayStr.substring(0, 7)}-01`
    const yearStartStr = `${todayStr.substring(0, 4)}-01-01`

    let filterStart = null
    let filterEnd = options.endDate || todayStr

    if (options.startDate) {
      filterStart = options.startDate
    } else {
      switch (options.range) {
        case 'last48Hours':
        case 'live48h':
          filterStart = twoDaysAgoStr
          break
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

    // Compute Summary KPIs
    const summary = {
      today: { total: 0, stream: 0, download: 0, other: 0, local: 0, internet: 0, requests: 0 },
      last7Days: { total: 0, stream: 0, download: 0, other: 0, local: 0, internet: 0, requests: 0 },
      thisMonth: { total: 0, stream: 0, download: 0, other: 0, local: 0, internet: 0, requests: 0 },
      thisYear: { total: 0, stream: 0, download: 0, other: 0, local: 0, internet: 0, requests: 0 },
      allTime: { total: 0, stream: 0, download: 0, other: 0, local: 0, internet: 0, requests: 0 }
    }

    const addRecordToBucket = (bucket, rec) => {
      bucket.total += Number(rec.bytesTotal || 0)
      bucket.stream += Number(rec.bytesStream || 0)
      bucket.download += Number(rec.bytesDownload || 0)
      bucket.other += Number(rec.bytesOther || 0)
      bucket.local += Number(rec.bytesLocal || 0)
      bucket.internet += Number(rec.bytesInternet || 0)
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
          bytesLocal: 0,
          bytesInternet: 0,
          requests: 0,
          isLegacy: false
        }
        dailyMap.set(rec.date, dailyEntry)
      }
      dailyEntry.bytesStream += Number(rec.bytesStream || 0)
      dailyEntry.bytesDownload += Number(rec.bytesDownload || 0)
      dailyEntry.bytesOther += Number(rec.bytesOther || 0)
      dailyEntry.bytesTotal += Number(rec.bytesTotal || 0)
      dailyEntry.bytesLocal += Number(rec.bytesLocal || 0)
      dailyEntry.bytesInternet += Number(rec.bytesInternet || 0)
      dailyEntry.requests += Number(rec.requests || 0)

      if (dailyEntry.bytesTotal > 0 && dailyEntry.bytesLocal === 0 && dailyEntry.bytesInternet === 0) {
        dailyEntry.isLegacy = true
      }
    }

    const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

    // Aggregate by user
    const userMap = new Map()
    let rangeTotalBytes = 0

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
          bytesLocal: 0,
          bytesInternet: 0,
          requests: 0,
          percentOfTotal: 0
        }
        userMap.set(rec.userId, userEntry)
      }
      userEntry.bytesStream += Number(rec.bytesStream || 0)
      userEntry.bytesDownload += Number(rec.bytesDownload || 0)
      userEntry.bytesOther += Number(rec.bytesOther || 0)
      userEntry.bytesTotal += Number(rec.bytesTotal || 0)
      userEntry.bytesLocal += Number(rec.bytesLocal || 0)
      userEntry.bytesInternet += Number(rec.bytesInternet || 0)
      userEntry.requests += Number(rec.requests || 0)

      if (options.trafficType === 'internet') {
        rangeTotalBytes += Number(rec.bytesInternet || 0)
      } else if (options.trafficType === 'local') {
        rangeTotalBytes += Number(rec.bytesLocal || 0)
      } else {
        rangeTotalBytes += Number(rec.bytesTotal || 0)
      }
    }

    const userBreakdown = Array.from(userMap.values())
      .map((u) => {
        let userTrafficBytes = u.bytesTotal
        if (options.trafficType === 'internet') userTrafficBytes = u.bytesInternet
        else if (options.trafficType === 'local') userTrafficBytes = u.bytesLocal

        u.percentOfTotal = rangeTotalBytes > 0 ? Number(((userTrafficBytes / rangeTotalBytes) * 100).toFixed(1)) : 0
        return u
      })
      .sort((a, b) => {
        if (options.trafficType === 'internet') return b.bytesInternet - a.bytesInternet
        if (options.trafficType === 'local') return b.bytesLocal - a.bytesLocal
        return b.bytesTotal - a.bytesTotal
      })

    // Query Item Breakdown
    let itemBreakdown = []
    if (Database.bandwidthItemStatModel) {
      const itemWhere = {}
      if (options.userId) {
        itemWhere.userId = options.userId
      }
      if (options.date) {
        itemWhere.date = options.date
      } else if (filterStart && filterEnd) {
        if (filterStart === filterEnd) {
          itemWhere.date = filterStart
        } else {
          itemWhere.date = { [Op.between]: [filterStart, filterEnd] }
        }
      } else if (filterStart) {
        itemWhere.date = { [Op.gte]: filterStart }
      } else if (filterEnd) {
        itemWhere.date = { [Op.lte]: filterEnd }
      }

      const itemRecords = await Database.bandwidthItemStatModel.findAll({
        where: itemWhere
      })

      const aggregatedItems = new Map()
      let itemTotalBytes = 0

      for (const rec of itemRecords) {
        let it = aggregatedItems.get(rec.libraryItemId)
        if (!it) {
          it = {
            libraryItemId: rec.libraryItemId,
            itemName: rec.itemName || (rec.libraryItemId === 'general' ? 'General / Web App' : 'Unknown Item'),
            category: rec.category,
            bytesLocal: 0,
            bytesInternet: 0,
            bytesTotal: 0,
            bytesStream: 0,
            bytesDownload: 0,
            bytesOther: 0,
            requests: 0,
            percentOfTotal: 0
          }
          aggregatedItems.set(rec.libraryItemId, it)
        }
        it.bytesLocal += Number(rec.bytesLocal || 0)
        it.bytesInternet += Number(rec.bytesInternet || 0)
        it.bytesTotal += Number(rec.bytesTotal || 0)
        it.requests += Number(rec.requests || 0)

        const catBytes = options.trafficType === 'internet'
          ? Number(rec.bytesInternet || 0)
          : options.trafficType === 'local'
            ? Number(rec.bytesLocal || 0)
            : Number(rec.bytesTotal || 0)

        if (rec.category === 'stream') it.bytesStream += catBytes
        else if (rec.category === 'download') it.bytesDownload += catBytes
        else it.bytesOther += catBytes

        if (rec.itemName && (!it.itemName || it.itemName.startsWith('Item '))) {
          it.itemName = rec.itemName
        }

        if (options.trafficType === 'internet') {
          itemTotalBytes += Number(rec.bytesInternet || 0)
        } else if (options.trafficType === 'local') {
          itemTotalBytes += Number(rec.bytesLocal || 0)
        } else {
          itemTotalBytes += Number(rec.bytesTotal || 0)
        }
      }

      itemBreakdown = Array.from(aggregatedItems.values())
        .map((it) => {
          // Determine dominant category based on highest transfer volume
          const maxBytes = Math.max(it.bytesStream || 0, it.bytesDownload || 0, it.bytesOther || 0)
          if (maxBytes === (it.bytesStream || 0) && (it.bytesStream || 0) > 0) {
            it.category = 'stream'
          } else if (maxBytes === (it.bytesDownload || 0) && (it.bytesDownload || 0) > 0) {
            it.category = 'download'
          } else {
            it.category = 'other'
          }

          let itTrafficBytes = it.bytesTotal
          if (options.trafficType === 'internet') itTrafficBytes = it.bytesInternet
          else if (options.trafficType === 'local') itTrafficBytes = it.bytesLocal

          it.percentOfTotal = itemTotalBytes > 0 ? Number(((itTrafficBytes / itemTotalBytes) * 100).toFixed(1)) : 0
          return it
        })
        .sort((a, b) => {
          if (options.trafficType === 'internet') return b.bytesInternet - a.bytesInternet
          if (options.trafficType === 'local') return b.bytesLocal - a.bytesLocal
          return b.bytesTotal - a.bytesTotal
        })
    }

    // Approach 1: 24-Hour Time-of-Day Hourly Breakdown for Selected Date
    let hourly = []
    if (options.date && Database.bandwidthHourlyStatModel) {
      const hourlyWhere = { date: options.date }
      if (options.userId) {
        hourlyWhere.userId = options.userId
      }
      const hourlyRecords = await Database.bandwidthHourlyStatModel.findAll({
        where: hourlyWhere,
        order: [['hour', 'ASC']]
      })

      const hourlyMap = new Map()
      for (let h = 0; h < 24; h++) {
        hourlyMap.set(h, {
          hour: h,
          label: `${String(h).padStart(2, '0')}:00`,
          bytesTotal: 0,
          bytesStream: 0,
          bytesDownload: 0,
          bytesOther: 0,
          bytesLocal: 0,
          bytesInternet: 0,
          requests: 0
        })
      }

      for (const rec of hourlyRecords) {
        const entry = hourlyMap.get(rec.hour)
        if (entry) {
          entry.bytesTotal += Number(rec.bytesTotal || 0)
          entry.bytesStream += Number(rec.bytesStream || 0)
          entry.bytesDownload += Number(rec.bytesDownload || 0)
          entry.bytesOther += Number(rec.bytesOther || 0)
          entry.bytesLocal += Number(rec.bytesLocal || 0)
          entry.bytesInternet += Number(rec.bytesInternet || 0)
          entry.requests += Number(rec.requests || 0)
        }
      }

      hourly = Array.from(hourlyMap.values())
    }

    // Approach 2: Rolling 48-Hour 10-Minute Waveform
    let waveform10m = []
    let waveformPeakBytes = 0
    let waveformPeakMbps = 0

    if ((options.range === 'last48Hours' || options.range === 'live48h') && Database.bandwidthTimeStatModel) {
      const cutoff48h = Math.floor((Date.now() - 48 * 3600 * 1000) / 600000) * 600000
      const currentBucketTime = Math.floor(Date.now() / 600000) * 600000

      const timeWhere = {
        bucketTime: { [Op.gte]: cutoff48h }
      }
      if (options.userId) {
        timeWhere.userId = options.userId
      }

      const timeRecords = await Database.bandwidthTimeStatModel.findAll({
        where: timeWhere
      })

      // Aggregate records by bucketTime
      const timeBucketMap = new Map()
      for (const rec of timeRecords) {
        let b = timeBucketMap.get(Number(rec.bucketTime))
        if (!b) {
          b = {
            bytesTotal: 0,
            bytesStream: 0,
            bytesDownload: 0,
            bytesOther: 0,
            bytesLocal: 0,
            bytesInternet: 0,
            requests: 0
          }
          timeBucketMap.set(Number(rec.bucketTime), b)
        }
        b.bytesTotal += Number(rec.bytesTotal || 0)
        b.bytesStream += Number(rec.bytesStream || 0)
        b.bytesDownload += Number(rec.bytesDownload || 0)
        b.bytesOther += Number(rec.bytesOther || 0)
        b.bytesLocal += Number(rec.bytesLocal || 0)
        b.bytesInternet += Number(rec.bytesInternet || 0)
        b.requests += Number(rec.requests || 0)
      }

      // Generate continuous 10-minute buckets across 48 hours (exactly 288 data points)
      for (let t = cutoff48h; t <= currentBucketTime; t += 600000) {
        const d = new Date(t)
        const dateStr = dateAndTime.format(d, 'YYYY-MM-DD')
        const shortTime = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

        const stat = timeBucketMap.get(t) || {
          bytesTotal: 0,
          bytesStream: 0,
          bytesDownload: 0,
          bytesOther: 0,
          bytesLocal: 0,
          bytesInternet: 0,
          requests: 0
        }

        // 10 minutes = 600 seconds. Calculate average transfer speed in Mbps during this 10m window:
        // (bytes * 8) / (600 * 1,000,000)
        const mbpsRate = Number(((stat.bytesTotal * 8) / (600 * 1000 * 1000)).toFixed(2))

        if (stat.bytesTotal > waveformPeakBytes) {
          waveformPeakBytes = stat.bytesTotal
        }
        if (mbpsRate > waveformPeakMbps) {
          waveformPeakMbps = mbpsRate
        }

        waveform10m.push({
          bucketTime: t,
          date: dateStr,
          timeLabel: shortTime,
          hour: d.getHours(),
          minute: d.getMinutes(),
          bytesTotal: stat.bytesTotal,
          bytesInternet: stat.bytesInternet,
          bytesLocal: stat.bytesLocal,
          bytesStream: stat.bytesStream,
          bytesDownload: stat.bytesDownload,
          bytesOther: stat.bytesOther,
          requests: stat.requests,
          mbps: mbpsRate
        })
      }
    }

    return {
      isEnabled: !!global.ServerSettings?.enableBandwidthTracking,
      range: options.range || 'all',
      trafficType: options.trafficType || 'all',
      startDate: filterStart,
      endDate: filterEnd,
      selectedDate: options.date || null,
      summary,
      daily,
      userBreakdown,
      itemBreakdown,
      hourly,
      waveform10m,
      waveformPeakBytes,
      waveformPeakMbps,
      rangeTotalBytes
    }
  }

  /**
   * Clear all bandwidth statistics
   */
  async clearStats() {
    this.buffer.clear()
    this.itemBuffer.clear()
    this.hourlyBuffer.clear()
    this.timeBuffer.clear()

    await Database.bandwidthStatModel.destroy({ where: {}, truncate: true })
    if (Database.bandwidthItemStatModel) {
      await Database.bandwidthItemStatModel.destroy({ where: {}, truncate: true })
    }
    if (Database.bandwidthHourlyStatModel) {
      await Database.bandwidthHourlyStatModel.destroy({ where: {}, truncate: true })
    }
    if (Database.bandwidthTimeStatModel) {
      await Database.bandwidthTimeStatModel.destroy({ where: {}, truncate: true })
    }
    Logger.info('[BandwidthManager] All bandwidth statistics cleared by admin')
    return true
  }
}

module.exports = BandwidthManager
