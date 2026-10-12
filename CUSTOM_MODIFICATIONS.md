# Audiobookshelf Custom Modifications (`v2.37.1-custom`)

This document tracks all custom features, fixes, and architectural modifications made to Audiobookshelf.

---

## 1. Discover Shelf Series Recommendations

### Summary
* **Problem**: Upstream Audiobookshelf completely excludes series books from the "Discover" shelf if any book in that series has been started or finished. Additionally, Sequelize's `separate: true` with `limit: 1` combined with an outer limit caused a severe probability bias that resulted in only standalone (non-series) books appearing in Discover.
* **Fix**:
  1. Updated `getDiscoverLibraryItems` in `server/utils/queries/libraryItemsBookFilters.js`.
  2. Removed `limit: 1` from the separate include so all books are evaluated, and JavaScript maps to find the first unread/unstarted book for each series.
  3. Included unstarted series books in the random pool alongside standalone books.

### Modified Files:
* `server/utils/queries/libraryItemsBookFilters.js`

---

## 2. Bandwidth & Data Usage Tracking per User

### Summary
* **Problem**: Audiobookshelf natively tracks playback duration (listening sessions/minutes), but has no way to track network egress or data usage (MB/GB transferred). When users download full audiobooks or stream high-bitrate files, server bandwidth is consumed without any visibility for the administrator.
* **Feature**:
  1. **Zero-Overhead In-Memory Buffer**: Middleware captures outgoing wire/socket bytes across all HTTP requests (streaming audio, HLS chunks, item downloads, ebooks, covers, and API responses). Data is aggregated in an in-memory map and batched into SQLite every 60 seconds (and on server shutdown) via atomic UPSERT transactions.
  2. **Categorization**: Automatically classifies traffic into:
     - `Streaming`: Audio playback, HLS segment requests, session audio streams.
     - `Downloads`: Explicit item downloads, zip archives, ebook file downloads.
     - `Other`: Cover images, API JSON responses, web client assets, RSS feeds.
  3. **Attribution**: Identifies the authenticated user (`req.user.id`), attributes HLS stream segments to the active session user, and attributes unauthenticated/public traffic to `Anonymous / Public`.
  4. **Toggle Setting**: Added `enableBandwidthTracking` to Server Settings. Admins can toggle bandwidth tracking ON or OFF at any time in **Settings > General**.
  5. **Admin Dashboard (`/config/bandwidth`)**:
     - **Summary KPI Cards**: Data transferred Today, Last 7 Days, This Month, This Year, and All-Time with Internet (WAN) vs Local (LAN) breakdown.
     - **Timeline Chart**: Interactive daily transfer bar chart with hover tooltips and category breakdown.
     - **Time Range Filters**: Today, Last 7 Days, Last 30 Days, This Year, All Time.
     - **Traffic Type Filters**: All Traffic, Internet Only (WAN), and Local Only (LAN).
     - **User Breakdown Table**: Complete breakdown showing each user's username, Internet (WAN) bytes, Local (LAN) bytes, streaming bytes, download bytes, total bytes, and percentage bar of total traffic.
     - **User Filter**: Filter chart and stats by specific user or view all users combined.
     - **Clear Records**: Admin action to reset/clear historical bandwidth statistics.
     - **UI Alignment & Stacking Fixes**: Resolved vertical offset of User Filter dropdown and fixed z-index stacking context to prevent chart bars from overlaying open dropdown menu options.
  6. **Local Network vs Internet (LAN / WAN) Tracking**: Automatically detects private RFC 1918 subnets (`192.168.x.x`, `10.x.x.x`, `172.16.x.x`, loopback, IPv6 local) vs external remote WAN IPs (including Cloudflare and reverse proxy headers) to distinguish data leaving the home internet from local Wi-Fi traffic.
  7. **User Profile Integration (`/config/users/:id`)**: Displays the user's total data transferred alongside their total listening time.

   8. **Book & Media Item Activity Breakdown**:
      - Added `BandwidthItemStat` model and `bandwidthItemStats` table tracking per-user, per-day, and per-book egress (`libraryItemId`, `itemName`, `category`, `bytesLocal`, `bytesInternet`, `bytesTotal`, `requests`).
      - Identifies titles and items from `/api/items/:id/...`, active playback sessions (`/public/session/:id/track/:index`), and HLS streams (`/hls/:stream/:file`) with in-memory caching.
      - Displays dedicated "Book & Media Activity Breakdown" table when a user is selected or date is filtered.
   9. **Interactive Date Bar Filtering & Tooltip Clarity**:
      - Clicking any bar in the timeline chart filters stats and book activity specifically to that single date, with a one-click "✕ Clear Date Filter" button.
      - Fixed tooltips and summary metrics to dynamically reflect the selected traffic filter (All, Internet WAN, or Local LAN) with explicit notices for historical data recorded prior to LAN/WAN separation.
   10. **Streamlined Navigation & Clickable Users**:
      - Clicking any user in the "Data Usage Breakdown by User" table immediately selects and navigates to that user's detailed view.
      - Added a prominent "Back to All Users" button in the top toolbar and above the breakdown tables.
   11. **Hybrid High-Resolution Drill-Down Architecture**:
      - **Approach 1: 24-Hour Time-of-Day (Hourly) Breakdown**:
        - Added `BandwidthHourlyStat` model and `bandwidthHourlyStats` table tracking hourly egress (`date`, `hour`, `bytesStream`, `bytesDownload`, `bytesOther`, `bytesLocal`, `bytesInternet`, `bytesTotal`, `requests`).
        - When a single date is selected or filtered, an interactive 24-hour histogram (`00:00` to `23:00`) is rendered showing the exact hours of traffic spikes, request volume, and category distribution.
      - **Approach 2: Rolling 48-Hour High-Resolution 10-Minute Area Waveform**:
        - Added `BandwidthTimeStat` model and `bandwidthTimeStats` table capturing 10-minute intervals (`bucketTime`, `timeLabel`, `date`, `hour`, `minute`).
        - **Automatic 48-Hour Pruning**: Prunes rows older than 48 hours on every periodic flush to cap table size at ~1,440 rows (~200 KB in SQLite) preventing long-term database bloat.
        - **Smooth SVG Area/Line Waveform (Layout Option A)**: Built a lightweight native SVG area and line waveform covering 288 contiguous time buckets over 48 hours. Zero DOM overhead or heavy chart dependencies.
        - **Interactive Crosshair HUD**: Moving mouse across the waveform displays a vertical crosshair guide and floating telemetry HUD pill showing exact time bucket, ~Mbps burst rate, MB transferred, WAN vs LAN, and category breakdown.
      - **UI Contrast & Tooltip Fixes**:
        - Anchored timeline and waveform tooltips cleanly at the top of the chart container to prevent popup cut-offs.
        - Improved text contrast on interactive elements (e.g. 'Click to filter' highlighted with `text-emerald-400 bg-emerald-500/15`).
   12. **Accurate Item Activity Categorization & Multi-Activity Attribution**:
       - Fixed an aggregation issue where an item's initial minor request (e.g. 27 KB cover/metadata) caused subsequent large transfers (e.g. 317 MB streaming playback) to retain the 'other' category tag.
       - Aggregation now dynamically designates the primary activity (`stream`, `download`, or `other`) according to the highest transfer volume.
       - Added secondary activity indicators (e.g. `+27.29 KB other`) with detailed breakdown tooltips on the Book & Media Activity table so administrators can clearly distinguish streaming playback from auxiliary cover art or metadata downloads.
   13. **Expanded Full-Width Responsive Dashboard Layout**:
       - Replaced the constrained 900px form wrapper with an expanded responsive layout for the Bandwidth Stats dashboard (`configContentWide`).
       - Utilizes full available screen width to maximize horizontal resolution for the 48-hour 288-interval SVG waveform, evenly spaces the 5 KPI summary cards, and provides ample space for multi-column activity breakdown tables.

### Modified Files:
* `server/models/BandwidthStat.js` (Sequelize model for daily user bandwidth stats)
* `server/models/BandwidthItemStat.js` (Sequelize model for per-item and book bandwidth stats)
* `server/models/BandwidthHourlyStat.js` (Sequelize model for 24-hour hourly bandwidth stats)
* `server/models/BandwidthTimeStat.js` (Sequelize model for rolling 48-hour 10-minute high-resolution bandwidth stats)
* `server/managers/BandwidthManager.js` (In-memory buffering, request categorization, 10m/hourly buckets, auto-pruning, and stats querying)
* `server/Database.js` (Registered BandwidthStat, BandwidthItemStat, BandwidthHourlyStat, and BandwidthTimeStat models and schema sync)
* `server/Server.js` (Global middleware hook and shutdown flush for BandwidthManager)
* `server/objects/settings/ServerSettings.js` (Added `enableBandwidthTracking` setting, patchable key, and serialization)
* `server/controllers/StatsController.js` (Added `getBandwidthStats` and `clearBandwidthStats` endpoints with trafficType & date filtering)
* `server/routers/ApiRouter.js` (Mounted `/stats/bandwidth` GET and DELETE routes)
* `client/pages/config/index.vue` (Added "Track Bandwidth & Data Usage" toggle switch under General Settings)
* `client/components/app/ConfigSideNav.vue` (Added "Bandwidth Stats" navigation link)
* `client/pages/config.vue` (Mapped bandwidth page route title)
* `client/pages/config/bandwidth.vue` (Bandwidth dashboard with item breakdown, clickable users, back button, date bar filtering, and adaptive tooltips)
* `client/pages/config/users/_id/index.vue` (Added Data Transferred stat to user profile)

---

## 3. Build & Packaging Instructions

### Standalone Windows Executable:
```powershell
# 1. Compile Client Nuxt Assets
cd client
npm run generate
cd ..

# 2. Compile Server TypeScript
npm run build:server

# 3. Package Windows Binary (dist/win/audiobookshelf.exe)
npx pkg --config package.json -t node24-win-x64 -o ./dist/win/audiobookshelf -C GZip dist-server/index.js
```

### Git & Patch Synchronization:
```powershell
# Regenerate patch against upstream baseline
git diff v2.37.1 > custom_changes.patch
```

---

## 4. Modified Files Inventory

| File Path | Description |
| :--- | :--- |
| `server/utils/queries/libraryItemsBookFilters.js` | Fixed series discovery filtering & removed single-item limit |
| `server/models/BandwidthStat.js` | Sequelize model and table definition for user bandwidth stats |
| `server/models/BandwidthItemStat.js` | Sequelize model and table definition for per-item/book bandwidth stats |
| `server/models/BandwidthHourlyStat.js` | Sequelize model and table definition for 24-hour hourly bandwidth stats |
| `server/models/BandwidthTimeStat.js` | Sequelize model and table definition for rolling 48-hour 10-minute bandwidth stats |
| `server/managers/BandwidthManager.js` | In-memory buffering, request categorization, 10m/hourly buckets, auto-pruning, and stats querying |
| `server/Database.js` | Registered BandwidthStat, BandwidthItemStat, BandwidthHourlyStat & BandwidthTimeStat models and schema sync |
| `server/Server.js` | Global middleware hook and shutdown flush for BandwidthManager |
| `server/objects/settings/ServerSettings.js` | `enableBandwidthTracking` toggle setting |
| `server/controllers/StatsController.js` | REST controller methods for bandwidth stats with trafficType and date params |
| `server/routers/ApiRouter.js` | Route definitions for `/stats/bandwidth` |
| `client/pages/config/index.vue` | UI toggle in Settings > General |
| `client/components/app/ConfigSideNav.vue` | Sidebar navigation link to Bandwidth Stats |
| `client/pages/config.vue` | Route title mapper & full-width layout for bandwidth dashboard |
| `client/pages/config/bandwidth.vue` | Responsive Bandwidth Stats dashboard with 48h SVG waveform, 24h hourly breakdown, item breakdown, clickable users, and date filters |
| `client/pages/config/users/_id/index.vue` | Data transferred stat on user profile card |
| `custom_changes.patch` | Unified Git diff against upstream `v2.37.1` |
