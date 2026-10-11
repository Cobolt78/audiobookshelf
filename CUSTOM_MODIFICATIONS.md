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

### Modified Files:
* `server/models/BandwidthStat.js` (New Sequelize model for `bandwidthStats` table)
* `server/managers/BandwidthManager.js` (New manager for measurement, in-memory buffering, flushing, and querying)
* `server/Database.js` (Registered `BandwidthStat` model in `buildModels` and added `bandwidthStatModel` getter)
* `server/Server.js` (Instantiated and mounted `BandwidthManager` middleware; flushed on stop)
* `server/objects/settings/ServerSettings.js` (Added `enableBandwidthTracking` setting, patchable key, and serialization)
* `server/controllers/StatsController.js` (Added `getBandwidthStats` and `clearBandwidthStats` endpoints)
* `server/routers/ApiRouter.js` (Mounted `/stats/bandwidth` GET and DELETE routes)
* `client/pages/config/index.vue` (Added "Track Bandwidth & Data Usage" toggle switch under General Settings)
* `client/components/app/ConfigSideNav.vue` (Added "Bandwidth Stats" navigation link)
* `client/pages/config.vue` (Mapped bandwidth page route title)
* `client/pages/config/bandwidth.vue` (New admin Bandwidth Stats dashboard page)
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
| `server/models/BandwidthStat.js` | Sequelize model and table definition for bandwidth stats |
| `server/managers/BandwidthManager.js` | In-memory buffering, request categorization, and stats querying |
| `server/Database.js` | Registered BandwidthStat model and schema sync |
| `server/Server.js` | Global middleware hook and shutdown flush for BandwidthManager |
| `server/objects/settings/ServerSettings.js` | `enableBandwidthTracking` toggle setting |
| `server/controllers/StatsController.js` | REST controller methods for bandwidth stats |
| `server/routers/ApiRouter.js` | Route definitions for `/stats/bandwidth` |
| `client/pages/config/index.vue` | UI toggle in Settings > General |
| `client/components/app/ConfigSideNav.vue` | Sidebar navigation link to Bandwidth Stats |
| `client/pages/config.vue` | Route title mapper |
| `client/pages/config/bandwidth.vue` | Full responsive Bandwidth Stats dashboard |
| `client/pages/config/users/_id/index.vue` | Data transferred stat on user profile card |
| `custom_changes.patch` | Unified Git diff against upstream `v2.37.1` |
