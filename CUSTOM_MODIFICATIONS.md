# Audiobookshelf Custom Modifications (`v2.37.1-custom`)

This document tracks all custom features, fixes, and architectural modifications made to Audiobookshelf in the `Cobolt78/audiobookshelf` repository.

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
      - **24-Hour Time-of-Day (Hourly) Breakdown**:
        - Added `BandwidthHourlyStat` model and `bandwidthHourlyStats` table tracking hourly egress (`date`, `hour`, `bytesStream`, `bytesDownload`, `bytesOther`, `bytesLocal`, `bytesInternet`, `bytesTotal`, `requests`).
        - When a single date is selected or filtered, an interactive 24-hour histogram (`00:00` to `23:00`) is rendered showing the exact hours of traffic spikes, request volume, and category distribution.
      - **Rolling 48-Hour High-Resolution 10-Minute Area Waveform**:
        - Added `BandwidthTimeStat` model and `bandwidthTimeStats` table capturing 10-minute intervals (`bucketTime`, `timeLabel`, `date`, `hour`, `minute`).
        - **Automatic 48-Hour Pruning**: Prunes rows older than 48 hours on every periodic flush to cap table size at ~1,440 rows (~200 KB in SQLite) preventing long-term database bloat.
        - **Smooth SVG Area/Line Waveform**: Built a lightweight native SVG area and line waveform covering 288 contiguous time buckets over 48 hours. Zero DOM overhead or heavy chart dependencies.
        - **Interactive Crosshair HUD**: Moving mouse across the waveform displays a vertical crosshair guide and floating telemetry HUD pill showing exact time bucket, ~Mbps burst rate, MB transferred, WAN vs LAN, and category breakdown.
  12. **Accurate Item Activity Categorization & Multi-Activity Attribution**:
      - Aggregation dynamically designates the primary activity (`stream`, `download`, or `other`) according to the highest transfer volume.
      - Secondary activity indicators (e.g. `+27.29 KB other`) with detailed breakdown tooltips on the Book & Media Activity table.
  13. **Expanded Full-Width Responsive Dashboard Layout**:
      - Replaced the constrained 900px form wrapper with an expanded responsive layout for the Bandwidth Stats dashboard (`configContentWide`).
  14. **Hairpin NAT Auto-Detection, Local Interface Enumeration & Classification**:
      - Auto-detects server public WAN IP with a 6-hour refresh schedule to classify hairpin NAT loopback traffic as Local (LAN).
      - Enumerates host adapter addresses (`os.networkInterfaces()`) and supports Carrier-Grade NAT (`100.64.0.0/10`) for Tailscale / NetBird.
      - Added `bandwidthLocalSubnets` in Server Settings with CIDR bitmask evaluation and configuration input in **Settings > General**.

### Modified Files:
* `server/models/BandwidthStat.js`
* `server/models/BandwidthItemStat.js`
* `server/models/BandwidthHourlyStat.js`
* `server/models/BandwidthTimeStat.js`
* `server/managers/BandwidthManager.js`
* `server/Database.js`
* `server/Server.js`
* `server/objects/settings/ServerSettings.js`
* `server/controllers/StatsController.js`
* `server/routers/ApiRouter.js`
* `client/pages/config/index.vue`
* `client/components/app/ConfigSideNav.vue`
* `client/pages/config.vue`
* `client/pages/config/bandwidth.vue`
* `client/pages/config/users/_id/index.vue`

---

## 3. Audible Series Scraper & External Metadata Engine

### Summary
* **Problem**: Upstream Audiobookshelf has no visibility into missing books within a series or upcoming audiobook releases. Users had no way to know if new entries in their active series were releasing soon on Audible or if books were missing between existing volumes.
* **Feature**:
  1. **Audible Metadata Provider Integration (`server/providers/Audible.js`)**:
     - Queries Audible search and series catalog APIs across configurable regions (`us`, `uk`, `de`, `fr`, `jp`, etc.).
     - Parses series structure, volume numbering, release dates, ASINs, and covers.
     - Categorizes books into `owned` (already in library), `missing` (released books missing from library), and `upcoming` (future release dates).
  2. **SeriesProviderEntry Model & Migration (`server/models/SeriesProviderEntry.js`)**:
     - Database table `seriesProviderEntries` persists entries with `libraryId`, `seriesId`, `seriesName`, `title`, `position`, `releaseDate`, `asin`, `coverUrl`, `summary`, and `entryType` (`upcoming` vs `missing`).
  3. **SeriesProviderManager (`server/managers/SeriesProviderManager.js`)**:
     - Manages background scan execution, cancellation, live rate limiting protection, and real-time WebSocket progress broadcasts (`series_provider_scan_progress`, `series_provider_scan_completed`, `series_provider_scan_cancelled`, `series_provider_scan_failed`).
     - Exposes REST endpoints `/api/libraries/:id/series-provider/scan`, `/cancel`, `/status`, and `/api/libraries/:id/upcoming-releases`.

### Modified Files:
* `server/providers/Audible.js`
* `server/models/SeriesProviderEntry.js`
* `server/migrations/v2.37.1-create-series-provider-entries.js`
* `server/managers/SeriesProviderManager.js`
* `server/controllers/LibraryController.js`
* `server/controllers/SeriesController.js`

---

## 4. Automated Scheduling & Quick vs Full Audible Scan

### Summary
* **Feature**:
  1. **Configurable Background Sync (`CronManager.js`)**:
     - Added dedicated scheduled cron task in `CronManager.js` for Audible series synchronization.
     - Configurable via server/library settings (`seriesScraperSchedule`), defaulting to every 7 days on Monday at 3:00 AM (`0 3 * * 1`).
     - Added dedicated GUI configuration in **Settings > Libraries > Edit Library > Scanner Settings**.
  2. **Audible Quick Scan vs Full Scan**:
     - **Quick Scan (`quick: true`)**: Filters series pool to only new series added since the last scan or series with modified books, avoiding redundant Audible API queries and minimizing memory/CPU usage.
     - **Full Scan (`quick: false`)**: Re-scans all series across the entire library.
     - Accessible via split button dropdown in Series view and library action menus.

### Modified Files:
* `server/managers/CronManager.js`
* `server/models/Library.js`
* `client/components/modals/libraries/ScheduleScan.vue`
* `client/components/tables/library/LibrariesTable.vue`

---

## 5. Series Completion & Upcoming Releases Web UI

### Summary
* **Feature**:
  1. **Series Completion Filters (`server/utils/queries/seriesFilters.js`)**:
     - Added Completion filters to the Series page filter dropdown:
       - `Has Missing Books`: Series with one or more missing books detected.
       - `Complete Series`: Series with all published books present in the library.
       - `Has Upcoming Releases`: Series with confirmed future audiobook release dates on Audible.
     - Added sorting options by upcoming release date (`upcomingDate`) and missing books count (`missingBooks`).
  2. **Series Cards Badges & Progress Display (`LazySeriesCard.vue`)**:
     - Added clear read progress indicator (e.g. `5/8 Read`) replacing ambiguous percentages.
     - Added missing books indicator (e.g. `2 Missing`) and upcoming release badge (`Upcoming Release`).
     - Added series book number badge `#X` on individual book covers.
  3. **External Series Tracking Panel (`SeriesProviderEntries.vue`)**:
     - Dedicated section on series details page (`/library/:library/series/:id`) displaying:
       - Upcoming Releases grid with cover art, series position badge, release date, summary, and direct Audible pre-order link.
       - Missing Books from Library grid with position numbers and Audible store links.
       - Instant "Re-check Audible" button to refresh data for that series.
  4. **Home Shelf "Upcoming in Series"**:
     - Added a dedicated personalized home shelf displaying books in series that have upcoming releases.

### Modified Files:
* `client/components/cards/LazySeriesCard.vue`
* `client/components/widgets/SeriesProviderEntries.vue`
* `client/pages/library/_library/series/_id.vue`
* `server/utils/queries/seriesFilters.js`
* `server/utils/queries/libraryFilters.js`

---

## 6. Interactive Home Shelf Navigation & Subfilter Resolution

### Summary
* **Problem**: Upstream Audiobookshelf home shelves (Continue Listening, Continue Series, Recently Added, etc.) had non-interactive placarded headers. When navigation was initially added, clicking a shelf header routed to the library page showing all books sorted newest to oldest because unencoded filter IDs (`progress.in-progress`) produced binary garbage when passed through Base64 decoders.
* **Fix**:
  1. **Clickable Shelf Placards**:
     - Both standard bookshelf view ([`BookShelfRow.vue`](file:///c:/Audiobookshelf%20Project/My%20Versions/audiobookshelf-core-2.37.1/client/components/app/BookShelfRow.vue)) and detail slider view ([`BookShelfCategorized.vue`](file:///c:/Audiobookshelf%20Project/My%20Versions/audiobookshelf-core-2.37.1/client/components/app/BookShelfCategorized.vue)) feature interactive headers with hover states and chevron indicators.
     - **Continue Listening**: Routes to library filtered to `in-progress` books sorted by most recent progress (`filter=progress.<encoded 'in-progress'>&sort=progress&desc=1`).
     - **Continue Series**: Routes to library filtered to `continue-series` items (`filter=progress.<encoded 'continue-series'>`).
     - **Listen Again / Read Again**: Routes to library filtered to `finished` books sorted by completion date (`filter=progress.<encoded 'finished'>&sort=progress.finishedAt&desc=1`).
     - **Recently Added / Recent Episodes**: Clears prior filters and sorts by `addedAt` descending (`filter=all&sort=addedAt&desc=1`).
     - **Recent Series**: Routes to Series page sorted by `addedAt` descending (`/series?filter=all&sort=addedAt&desc=1`).
     - **Upcoming Series**: Routes to Series page filtered to `completion.has-upcoming` (`/series?filter=completion.<encoded 'has-upcoming'>`).
     - **Newest Authors**: Routes to `/authors?sort=addedAt&desc=1`.
     - **Discover Shelf**: Includes dedicated re-roll button (`refresh`) allowing users to instantly generate fresh recommendations.
  2. **Dual Base64 / Plain-Text Filter Decoding**:
     - Updated `decode(text)` in [`libraryFilters.js`](file:///c:/Audiobookshelf%20Project/My%20Versions/audiobookshelf-core-2.37.1/server/utils/queries/libraryFilters.js), [`seriesFilters.js`](file:///c:/Audiobookshelf%20Project/My%20Versions/audiobookshelf-core-2.37.1/server/utils/queries/seriesFilters.js), and [`init.client.js`](file:///c:/Audiobookshelf%20Project/My%20Versions/audiobookshelf-core-2.37.1/client/plugins/init.client.js) to verify Base64 re-encoding integrity and gracefully fall back to plain text, eliminating corrupted query strings.
  3. **Subfilter Selection Checkmarks & Header Sync**:
     - Updated [`LibraryFilterSelect.vue`](file:///c:/Audiobookshelf%20Project/My%20Versions/audiobookshelf-core-2.37.1/client/components/controls/LibraryFilterSelect.vue) so subfilters (`In Progress`, `Continue Series`, `Finished`, `Has Upcoming Releases`) correctly display highlighted yellow text and checkmarks in the dropdown menu.
     - Added `isItemActive(item)` to keep parent categories highlighted when viewing top-level filter categories.

### Modified Files:
* `client/components/app/BookShelfCategorized.vue`
* `client/components/app/BookShelfRow.vue`
* `client/components/controls/LibraryFilterSelect.vue`
* `client/plugins/init.client.js`
* `server/utils/queries/libraryFilters.js`
* `server/utils/queries/seriesFilters.js`

---

## 7. Library Tooltips & Audible Scan Progress Bar

### Summary
* **Feature**:
  1. **Comprehensive Library Tooltips**:
     - Added explicit tooltips in Settings > Libraries explaining exactly what each scan option does and does not do:
       - **Scan**: Discovers new, moved, or deleted audio files and rescans embedded metadata. Does not query external providers or overwrite manual changes.
       - **Match Books**: Searches the configured metadata provider for unmatched books and fills empty details. Does not overwrite existing details.
       - **Audible Scan**: Queries Audible for series structure, upcoming releases, and missing books. Does not modify audio files or book metadata.
  2. **Audible Series Scan Progress Widget**:
     - Replaced the opaque `<ui-btn :loading="true">` with a custom toolbar progress pill in [`BookShelfToolbar.vue`](file:///c:/Audiobookshelf%20Project/My%20Versions/audiobookshelf-core-2.37.1/client/components/app/BookShelfToolbar.vue).
     - Displays fully visible, crisp progress text: **`100 of 3,000 series scanned (3%)`**.
     - Features an active progress bar fill track underneath that smoothly animates from 0% to 100%.
     - Displays the currently queried series name in an informative hover tooltip without causing button jitter.
     - Includes an integrated `✕` cancel button on the right to abort scans on demand.

### Modified Files:
* `client/components/app/BookShelfToolbar.vue`
* `client/components/tables/library/LibrariesTable.vue`
* `server/managers/SeriesProviderManager.js`
* `client/strings/en-us.json`

---

## 8. Build & Packaging Instructions

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

### Local Deployment & Verification:
```powershell
Stop-Process -Name "audiobookshelf", "AudiobookshelfTray" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Copy-Item -Path ".\dist\win\audiobookshelf.exe" -Destination "C:\Users\David\AppData\Local\Programs\Audiobookshelf\audiobookshelf.exe" -Force
Start-Process "C:\Users\David\AppData\Local\Programs\Audiobookshelf\AudiobookshelfTray.exe"
# Verify server health:
curl.exe http://127.0.0.1:13381/audiobookshelf/ping
```

### Git & Patch Synchronization:
```powershell
# Regenerate patch against upstream baseline
git diff v2.37.1 > custom_changes.patch
```

---

## 9. Modified Files Inventory

| File Path | Description |
| :--- | :--- |
| `CUSTOM_MODIFICATIONS.md` | Comprehensive documentation of all custom features and modifications |
| `GEMINI.md` | Antigravity paired-programming invariants and upgrade retention protocol |
| `custom_changes.patch` | Unified Git diff against upstream `v2.37.1` baseline |
| `client/components/app/BookShelfCategorized.vue` | Interactive shelf header clicks, discover re-roll, and encoded filter routing |
| `client/components/app/BookShelfRow.vue` | Interactive shelf header clicks, placards, and discover refresh button |
| `client/components/app/BookShelfToolbar.vue` | Audible scan progress bar, quick/full scan menu, cancel listener, and status sync |
| `client/components/app/ConfigSideNav.vue` | Sidebar navigation link to Bandwidth Stats |
| `client/components/cards/LazySeriesCard.vue` | Series read badges (X/Y Read), missing books count, and upcoming release indicators |
| `client/components/controls/LibraryFilterSelect.vue` | Subfilter selection checkmarks, parent category highlight, and Base64 label resolution |
| `client/components/modals/libraries/ScheduleScan.vue` | Audible series scan automated schedule configuration |
| `client/components/tables/library/LibrariesTable.vue` | Action tooltips for Scan, Match Books, and Audible Scan |
| `client/components/tables/library/LibraryItem.vue` | Context menu triggers for Audible quick & full scan |
| `client/components/widgets/SeriesProviderEntries.vue` | Series upcoming releases and missing books cards with Audible links |
| `client/pages/config.vue` | Route title mapper & full-width layout for bandwidth dashboard |
| `client/pages/config/bandwidth.vue` | Responsive Bandwidth Stats dashboard with 48h SVG waveform, 24h hourly breakdown, item breakdown, and date filters |
| `client/pages/config/index.vue` | Bandwidth tracking toggle and custom local LAN subnets/IPs input in Settings > General |
| `client/pages/config/users/_id/index.vue` | Data transferred stat on user profile card |
| `client/pages/library/_library/series/_id.vue` | Mounts external series tracking panel on series details page |
| `client/plugins/init.client.js` | Resilient Base64 decode fallback to plain text |
| `client/strings/en-us.json` | English string localizations for scan actions, series badges, and tooltips |
| `server/Database.js` | Registered Bandwidth and SeriesProviderEntry models and schema sync |
| `server/Server.js` | Global middleware hook and shutdown flush for BandwidthManager |
| `server/controllers/LibraryController.js` | Series provider scan, cancel, status, and upcoming releases endpoints |
| `server/controllers/SeriesController.js` | Series detail response extended with provider tracking data |
| `server/controllers/StatsController.js` | REST controller methods for bandwidth stats with trafficType and date params |
| `server/managers/BandwidthManager.js` | In-memory buffering, request categorization, 10m/hourly buckets, auto-pruning, public WAN IP detection, and CIDR evaluation |
| `server/managers/CronManager.js` | Scheduled cron job for automated Audible series scraper sync |
| `server/managers/SeriesProviderManager.js` | Background scan execution, quick scan delta logic, rate limiting, and WebSocket events |
| `server/migrations/v2.37.1-create-series-provider-entries.js` | Sequelize database migration creating `seriesProviderEntries` table |
| `server/models/BandwidthHourlyStat.js` | Sequelize model and table definition for 24-hour hourly bandwidth stats |
| `server/models/BandwidthItemStat.js` | Sequelize model and table definition for per-item/book bandwidth stats |
| `server/models/BandwidthStat.js` | Sequelize model and table definition for user bandwidth stats |
| `server/models/BandwidthTimeStat.js` | Sequelize model and table definition for rolling 48-hour 10-minute bandwidth stats |
| `server/models/Library.js` | Added `seriesScraperSchedule` and `seriesScraperLastScan` settings |
| `server/models/SeriesProviderEntry.js` | Model definition for upcoming and missing series entries |
| `server/objects/settings/ServerSettings.js` | `enableBandwidthTracking` and `bandwidthLocalSubnets` settings |
| `server/providers/Audible.js` | Audible series catalog scraper, hierarchy parser, and release categorization |
| `server/routers/ApiRouter.js` | Route definitions for `/stats/bandwidth` and series-provider endpoints |
| `server/utils/queries/libraryFilters.js` | Series upcoming home shelf feed, and dual Base64/plain-text decoder |
| `server/utils/queries/libraryItemsBookFilters.js` | Series discovery filtering & removed single-item limit |
| `server/utils/queries/seriesFilters.js` | Series completion filters (Has Missing, Complete, Has Upcoming) and sorting |
