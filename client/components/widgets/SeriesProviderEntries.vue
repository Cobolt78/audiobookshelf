<template>
  <div v-if="hasEntries || loading" class="w-full px-4 sm:px-8 py-4 mb-8">
    <!-- Header with Toggle / Scan button -->
    <div class="flex items-center justify-between border-b border-white/10 pb-3 mb-6">
      <div class="flex items-center space-x-3">
        <span class="material-symbols text-2xl text-warning">auto_stories</span>
        <h2 class="text-xl font-semibold text-gray-100">{{ $strings.HeaderSeriesProviderEntries || 'External Series Tracking' }}</h2>
        <span v-if="totalCount > 0" class="text-xs bg-black/40 px-2.5 py-0.5 rounded-full text-gray-300 font-mono">
          {{ totalCount }} items
        </span>
      </div>
      <div class="flex items-center space-x-3">
        <!-- Progress bar when scanning -->
        <div v-if="isAudibleScanning || scanning" class="relative inline-flex items-center">
          <ui-tooltip :text="audibleScanTooltip" direction="bottom">
            <div class="h-7.5 relative flex items-center bg-gray-900 border border-amber-500/70 rounded-l-md overflow-hidden shadow-xs select-none">
              <!-- Progress bar fill -->
              <div
                class="absolute left-0 top-0 bottom-0 bg-amber-600/50 transition-all duration-300"
                :style="{ width: `${audibleScanPercent}%` }"
              />

              <!-- Text & Spinner -->
              <div class="relative z-10 flex items-center px-3 space-x-2 text-xs font-medium text-white whitespace-nowrap">
                <span class="material-symbols text-sm text-amber-400 animate-spin shrink-0">progress_activity</span>
                <span>{{ audibleScanProgressLabel }}</span>
                <span v-if="audibleScanTotal > 0" class="text-amber-300 font-mono text-[11px] font-semibold">({{ audibleScanPercent }}%)</span>
              </div>
            </div>
          </ui-tooltip>

          <ui-tooltip text="Cancel Audible Scan" direction="bottom">
            <button
              type="button"
              class="h-7.5 w-7 bg-amber-600/80 hover:bg-red-600 text-white rounded-r-md border border-l-0 border-amber-500/70 flex items-center justify-center focus:outline-hidden cursor-pointer shadow-xs transition-colors shrink-0"
              aria-label="Cancel Audible Scan"
              @click.stop.prevent="cancelAudibleScan"
            >
              <span class="material-symbols text-base">close</span>
            </button>
          </ui-tooltip>
        </div>

        <!-- Normal Re-check button when not scanning -->
        <ui-btn v-else small color="bg-primary/80" class="text-xs flex items-center" @click="scanSeries">
          <span class="material-symbols text-sm mr-1">sync</span>
          Re-check Audible
        </ui-btn>
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-8">
      <widgets-loading-spinner />
    </div>

    <div v-else class="space-y-8">
      <!-- Section 1: Upcoming Releases -->
      <div v-if="upcomingReleases.length" class="space-y-4">
        <div class="flex items-center space-x-2">
          <span class="material-symbols text-lg text-amber-400">calendar_month</span>
          <h3 class="text-lg font-medium text-amber-300">
            {{ $strings.LabelUpcomingReleasesForSeries || 'Upcoming Releases' }} ({{ upcomingReleases.length }})
          </h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div v-for="entry in upcomingReleases" :key="entry.id" class="bg-primary/40 border border-amber-500/30 rounded-lg p-3 flex space-x-3 relative overflow-hidden shadow-lg hover:border-amber-400/60 transition-all">
            <!-- Cover image -->
            <div class="w-20 min-w-20 h-28 bg-black/40 rounded overflow-hidden flex items-center justify-center relative shadow-md">
              <img v-if="entry.coverUrl" :src="entry.coverUrl" :alt="entry.title" class="w-full h-full object-cover" />
              <span v-else class="material-symbols text-3xl text-gray-500">menu_book</span>
              <span v-if="entry.position" class="absolute bottom-1 right-1 bg-black/80 text-amber-300 font-mono text-[10px] px-1 rounded">
                #{{ entry.position }}
              </span>
            </div>

            <!-- Content info -->
            <div class="flex flex-col justify-between flex-grow min-w-0">
              <div>
                <p class="font-semibold text-sm text-gray-100 truncate" :title="entry.title">{{ entry.title }}</p>
                <p v-if="entry.releaseDate" class="text-xs text-amber-400/90 mt-0.5 flex items-center">
                  <span class="material-symbols text-xs mr-1">schedule</span>
                  Release: {{ entry.releaseDate }}
                </p>
                <p v-if="entry.summary" class="text-xs text-gray-400 mt-1.5 line-clamp-2" :title="entry.summary">
                  {{ entry.summary }}
                </p>
              </div>

              <div class="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                <span class="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Audible</span>
                <a :href="getAudibleUrl(entry)" target="_blank" rel="noopener noreferrer" class="text-xs bg-amber-600/80 hover:bg-amber-500 text-white px-2.5 py-1 rounded inline-flex items-center shadow-xs">
                  <span>{{ $strings.ButtonPreOrderOnAudible || 'Pre-order ↗' }}</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2: Missing Books -->
      <div v-if="missingBooks.length" class="space-y-4">
        <div class="flex items-center space-x-2">
          <span class="material-symbols text-lg text-red-400">error_outline</span>
          <h3 class="text-lg font-medium text-red-300">
            {{ $strings.LabelMissingBooksFromSeries || 'Missing Books from Library' }} ({{ missingBooks.length }})
          </h3>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div v-for="entry in missingBooks" :key="entry.id" class="bg-primary/40 border border-red-500/30 rounded-lg p-3 flex space-x-3 relative overflow-hidden shadow-lg hover:border-red-400/60 transition-all">
            <!-- Cover image -->
            <div class="w-20 min-w-20 h-28 bg-black/40 rounded overflow-hidden flex items-center justify-center relative shadow-md">
              <img v-if="entry.coverUrl" :src="entry.coverUrl" :alt="entry.title" class="w-full h-full object-cover" />
              <span v-else class="material-symbols text-3xl text-gray-500">menu_book</span>
              <span v-if="entry.position" class="absolute bottom-1 right-1 bg-black/80 text-red-300 font-mono text-[10px] px-1 rounded">
                #{{ entry.position }}
              </span>
            </div>

            <!-- Content info -->
            <div class="flex flex-col justify-between flex-grow min-w-0">
              <div>
                <p class="font-semibold text-sm text-gray-100 truncate" :title="entry.title">{{ entry.title }}</p>
                <p v-if="entry.releaseDate" class="text-xs text-gray-400 mt-0.5 flex items-center">
                  <span class="material-symbols text-xs mr-1">event</span>
                  Released: {{ entry.releaseDate }}
                </p>
                <p v-if="entry.summary" class="text-xs text-gray-400 mt-1.5 line-clamp-2" :title="entry.summary">
                  {{ entry.summary }}
                </p>
              </div>

              <div class="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                <span class="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Audible</span>
                <a :href="getAudibleUrl(entry)" target="_blank" rel="noopener noreferrer" class="text-xs bg-primary hover:bg-primary/80 text-white px-2.5 py-1 rounded inline-flex items-center shadow-xs">
                  <span>{{ $strings.ButtonViewOnAudible || 'View on Audible ↗' }}</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    seriesId: {
      type: String,
      required: true
    },
    seriesName: {
      type: String,
      default: ''
    },
    libraryId: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      loading: true,
      scanning: false,
      isAudibleScanning: false,
      audibleScanCurrent: 0,
      audibleScanTotal: 0,
      audibleScanSeriesName: '',
      startingAudibleScan: false,
      entries: []
    }
  },
  computed: {
    upcomingReleases() {
      return this.entries.filter((e) => e.entryType === 'upcoming')
    },
    missingBooks() {
      return this.entries.filter((e) => e.entryType === 'missing')
    },
    hasEntries() {
      return this.entries.length > 0
    },
    totalCount() {
      return this.entries.length
    },
    audibleScanPercent() {
      if (!this.audibleScanTotal || this.audibleScanTotal <= 0) return 0
      const pct = Math.round((this.audibleScanCurrent / this.audibleScanTotal) * 100)
      return Math.min(100, Math.max(0, pct))
    },
    audibleScanProgressLabel() {
      if (this.audibleScanTotal > 0) {
        const cur = this.$formatNumber ? this.$formatNumber(this.audibleScanCurrent) : this.audibleScanCurrent
        const tot = this.$formatNumber ? this.$formatNumber(this.audibleScanTotal) : this.audibleScanTotal
        return `${cur} of ${tot} scanned`
      }
      return this.startingAudibleScan ? 'Starting Audible scan...' : 'Scanning Audible...'
    },
    audibleScanTooltip() {
      if (this.audibleScanTotal > 0) {
        const cur = this.$formatNumber ? this.$formatNumber(this.audibleScanCurrent) : this.audibleScanCurrent
        const tot = this.$formatNumber ? this.$formatNumber(this.audibleScanTotal) : this.audibleScanTotal
        const namePart = this.audibleScanSeriesName ? ` • "${this.audibleScanSeriesName}"` : ''
        return `Scanning ${cur} of ${tot} (${this.audibleScanPercent}%)${namePart}. Click ✕ to cancel.`
      }
      return 'Audible scan in progress. Click ✕ to cancel.'
    }
  },
  methods: {
    async fetchEntries() {
      if (!this.seriesId) return
      this.loading = true
      try {
        const res = await this.$axios.$get(`/api/series/${this.seriesId}/provider-entries`)
        this.entries = res?.entries || []
      } catch (err) {
        console.error('Failed to load series provider entries', err)
      } finally {
        this.loading = false
      }
    },
    async scanSeries() {
      const libId = this.libraryId || this.$store.state.libraries.currentLibraryId
      if (!libId) return
      this.startingAudibleScan = true
      this.isAudibleScanning = true
      this.audibleScanCurrent = 0
      this.audibleScanTotal = 0
      try {
        await this.$axios.$post(`/api/libraries/${libId}/series-provider/scan`, {
          seriesId: this.seriesId
        })
        this.$toast.info('Audible check started for series')
      } catch (err) {
        console.error('Failed to start series scan', err)
        this.$toast.error('Failed to start Audible scan')
        this.isAudibleScanning = false
      } finally {
        this.startingAudibleScan = false
      }
    },
    async cancelAudibleScan() {
      const libId = this.libraryId || this.$store.state.libraries.currentLibraryId
      if (!libId) return
      try {
        await this.$axios.$post(`/api/libraries/${libId}/series-provider/cancel`)
        this.$toast.info('Audible scan cancelled')
      } catch (err) {
        console.error('Failed to cancel Audible scan', err)
      }
    },
    getAudibleUrl(entry) {
      if (entry.providerUrl) return entry.providerUrl
      if (entry.asin) return `https://www.audible.com/pd/${entry.asin}`
      return `https://www.audible.com/search?keywords=${encodeURIComponent(entry.title)}`
    },
    onScanStarted(data) {
      const libId = this.libraryId || this.$store.state.libraries.currentLibraryId
      if (data?.libraryId === libId) {
        this.isAudibleScanning = true
        this.audibleScanCurrent = 0
        this.audibleScanTotal = 0
        this.audibleScanSeriesName = data.seriesName || ''
      }
    },
    onScanProgress(data) {
      const libId = this.libraryId || this.$store.state.libraries.currentLibraryId
      if (data?.libraryId === libId) {
        this.isAudibleScanning = true
        this.audibleScanCurrent = data.current || 0
        this.audibleScanTotal = data.total || 0
        this.audibleScanSeriesName = data.seriesName || ''
      }
    },
    onScanCompleted(data) {
      const libId = this.libraryId || this.$store.state.libraries.currentLibraryId
      if (data?.libraryId === libId) {
        this.isAudibleScanning = false
        this.scanning = false
        this.audibleScanCurrent = 0
        this.audibleScanTotal = 0
        this.fetchEntries()
      }
    },
    async checkCurrentScanStatus() {
      const libId = this.libraryId || this.$store.state.libraries.currentLibraryId
      if (!libId) return
      try {
        const res = await this.$axios.$get(`/api/libraries/${libId}/series-provider/status`)
        if (res?.isScanning) {
          this.isAudibleScanning = true
          this.audibleScanCurrent = res.current || 0
          this.audibleScanTotal = res.total || 0
          this.audibleScanSeriesName = res.seriesName || ''
        }
      } catch (err) {
        console.error('Failed to check scan status', err)
      }
    }
  },
  mounted() {
    this.fetchEntries()
    this.checkCurrentScanStatus()
    if (this.$root.socket) {
      this.$root.socket.on('series_provider_scan_started', this.onScanStarted)
      this.$root.socket.on('series_provider_scan_progress', this.onScanProgress)
      this.$root.socket.on('series_provider_scan_completed', this.onScanCompleted)
    }
  },
  beforeDestroy() {
    if (this.$root.socket) {
      this.$root.socket.off('series_provider_scan_started', this.onScanStarted)
      this.$root.socket.off('series_provider_scan_progress', this.onScanProgress)
      this.$root.socket.off('series_provider_scan_completed', this.onScanCompleted)
    }
  }
}
</script>
