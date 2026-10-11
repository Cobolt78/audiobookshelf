<template>
  <div class="w-full">
    <!-- Notice if tracking is disabled -->
    <div v-if="!isTrackingEnabled" class="bg-warning/20 border border-warning/50 rounded-md p-4 mb-6 flex items-center justify-between">
      <div class="flex items-center">
        <span class="material-symbols text-warning text-3xl mr-3">warning</span>
        <div>
          <p class="font-semibold text-warning">Bandwidth Tracking is Currently Disabled</p>
          <p class="text-xs text-gray-300">Data usage is not actively being recorded. You can enable it in Server Settings.</p>
        </div>
      </div>
      <ui-btn to="/config" color="bg-warning text-black" class="text-xs font-semibold">Go to Settings</ui-btn>
    </div>

    <app-settings-content header-text="Bandwidth & Data Usage">
      <!-- KPI Summary Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <div class="bg-primary/20 border border-white/5 rounded-lg p-3 flex flex-col justify-between">
          <p class="text-xs uppercase font-semibold text-gray-400 mb-1">Today</p>
          <p class="text-2xl font-bold font-mono text-emerald-400">{{ $bytesPretty(summary.today.total) }}</p>
          <div class="text-[11px] text-gray-300 mt-2 space-y-0.5 border-t border-white/5 pt-1.5">
            <p class="truncate flex items-center justify-between">
              <span class="text-sky-300 font-medium flex items-center"><span class="material-symbols text-[13px] mr-1">public</span>Internet:</span>
              <span class="font-mono">{{ $bytesPretty(summary.today.internet) }}</span>
            </p>
            <p class="truncate flex items-center justify-between">
              <span class="text-amber-300 font-medium flex items-center"><span class="material-symbols text-[13px] mr-1">home</span>Local:</span>
              <span class="font-mono">{{ $bytesPretty(summary.today.local) }}</span>
            </p>
          </div>
        </div>

        <div class="bg-primary/20 border border-white/5 rounded-lg p-3 flex flex-col justify-between">
          <p class="text-xs uppercase font-semibold text-gray-400 mb-1">Last 7 Days</p>
          <p class="text-2xl font-bold font-mono text-emerald-400">{{ $bytesPretty(summary.last7Days.total) }}</p>
          <div class="text-[11px] text-gray-300 mt-2 space-y-0.5 border-t border-white/5 pt-1.5">
            <p class="truncate flex items-center justify-between">
              <span class="text-sky-300 font-medium flex items-center"><span class="material-symbols text-[13px] mr-1">public</span>Internet:</span>
              <span class="font-mono">{{ $bytesPretty(summary.last7Days.internet) }}</span>
            </p>
            <p class="truncate flex items-center justify-between">
              <span class="text-amber-300 font-medium flex items-center"><span class="material-symbols text-[13px] mr-1">home</span>Local:</span>
              <span class="font-mono">{{ $bytesPretty(summary.last7Days.local) }}</span>
            </p>
          </div>
        </div>

        <div class="bg-primary/20 border border-white/5 rounded-lg p-3 flex flex-col justify-between">
          <p class="text-xs uppercase font-semibold text-gray-400 mb-1">This Month</p>
          <p class="text-2xl font-bold font-mono text-emerald-400">{{ $bytesPretty(summary.thisMonth.total) }}</p>
          <div class="text-[11px] text-gray-300 mt-2 space-y-0.5 border-t border-white/5 pt-1.5">
            <p class="truncate flex items-center justify-between">
              <span class="text-sky-300 font-medium flex items-center"><span class="material-symbols text-[13px] mr-1">public</span>Internet:</span>
              <span class="font-mono">{{ $bytesPretty(summary.thisMonth.internet) }}</span>
            </p>
            <p class="truncate flex items-center justify-between">
              <span class="text-amber-300 font-medium flex items-center"><span class="material-symbols text-[13px] mr-1">home</span>Local:</span>
              <span class="font-mono">{{ $bytesPretty(summary.thisMonth.local) }}</span>
            </p>
          </div>
        </div>

        <div class="bg-primary/20 border border-white/5 rounded-lg p-3 flex flex-col justify-between">
          <p class="text-xs uppercase font-semibold text-gray-400 mb-1">This Year</p>
          <p class="text-2xl font-bold font-mono text-emerald-400">{{ $bytesPretty(summary.thisYear.total) }}</p>
          <div class="text-[11px] text-gray-300 mt-2 space-y-0.5 border-t border-white/5 pt-1.5">
            <p class="truncate flex items-center justify-between">
              <span class="text-sky-300 font-medium flex items-center"><span class="material-symbols text-[13px] mr-1">public</span>Internet:</span>
              <span class="font-mono">{{ $bytesPretty(summary.thisYear.internet) }}</span>
            </p>
            <p class="truncate flex items-center justify-between">
              <span class="text-amber-300 font-medium flex items-center"><span class="material-symbols text-[13px] mr-1">home</span>Local:</span>
              <span class="font-mono">{{ $bytesPretty(summary.thisYear.local) }}</span>
            </p>
          </div>
        </div>

        <div class="bg-primary/20 border border-white/5 rounded-lg p-3 flex flex-col justify-between col-span-2 sm:col-span-1">
          <p class="text-xs uppercase font-semibold text-gray-400 mb-1">All Time Total</p>
          <p class="text-2xl font-bold font-mono text-cyan-400">{{ $bytesPretty(summary.allTime.total) }}</p>
          <div class="text-[11px] text-gray-300 mt-2 space-y-0.5 border-t border-white/5 pt-1.5">
            <p class="truncate flex items-center justify-between">
              <span class="text-sky-300 font-medium flex items-center"><span class="material-symbols text-[13px] mr-1">public</span>Internet:</span>
              <span class="font-mono">{{ $bytesPretty(summary.allTime.internet) }}</span>
            </p>
            <p class="truncate flex items-center justify-between">
              <span class="text-amber-300 font-medium flex items-center"><span class="material-symbols text-[13px] mr-1">home</span>Local:</span>
              <span class="font-mono">{{ $bytesPretty(summary.allTime.local) }}</span>
            </p>
          </div>
        </div>
      </div>

      <!-- Filters & Toolbar (Stacking context relative z-30 prevents chart clipping) -->
      <div class="relative z-30 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4 mb-6">
        <div class="flex flex-wrap items-center gap-2">
          <!-- Range Buttons -->
          <div class="inline-flex rounded-md shadow-sm bg-black/40 p-1 border border-white/10">
            <button v-for="r in rangeOptions" :key="r.value" type="button" @click="selectRange(r.value)" class="px-3 py-1 text-xs font-medium rounded transition-colors" :class="selectedRange === r.value ? 'bg-primary text-white shadow' : 'text-gray-400 hover:text-white'">
              {{ r.label }}
            </button>
          </div>

          <!-- Traffic Type Filter (All / Internet WAN / Local LAN) -->
          <div class="inline-flex rounded-md shadow-sm bg-black/40 p-1 border border-white/10">
            <button v-for="t in trafficTypeOptions" :key="t.value" type="button" @click="selectTrafficType(t.value)" class="px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1" :class="selectedTrafficType === t.value ? 'bg-primary text-white shadow' : 'text-gray-400 hover:text-white'">
              <span class="material-symbols text-[14px]">{{ t.icon }}</span>
              <span>{{ t.label }}</span>
            </button>
          </div>
        </div>

        <!-- Controls: User Dropdown (no top label so button is vertically aligned) + Refresh + Clear -->
        <div class="flex items-center gap-2 relative z-40">
          <!-- User Filter Dropdown -->
          <div class="w-48 relative">
            <ui-dropdown v-model="selectedUserId" small :items="userDropdownItems" @input="loadStats" />
          </div>

          <!-- Refresh Button -->
          <ui-btn color="bg-primary" small :loading="loading" @click="loadStats">
            <span class="material-symbols text-sm mr-1">refresh</span>
            Refresh
          </ui-btn>

          <!-- Clear Stats Button -->
          <ui-btn color="bg-error" small @click="showConfirmClear = true">
            <span class="material-symbols text-sm mr-1">delete</span>
            Clear
          </ui-btn>
        </div>
      </div>

      <!-- Timeline Chart Section -->
      <div class="mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h2 class="text-lg font-semibold flex items-center">
            <span class="material-symbols mr-2 text-primary">show_chart</span>
            Daily Transfer Timeline
            <span v-if="filteredTotalBytes" class="ml-2 text-xs font-mono font-normal text-gray-400"> (Range Total: {{ $bytesPretty(filteredTotalBytes) }}) </span>
          </h2>
          <!-- Legend -->
          <div class="flex items-center gap-4 text-xs">
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-emerald-500 mr-1.5" /> Streaming</div>
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-purple-500 mr-1.5" /> Downloads</div>
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-blue-500 mr-1.5" /> Other / API</div>
          </div>
        </div>

        <div v-if="loading" class="h-64 flex items-center justify-center bg-black/20 rounded-lg border border-white/5">
          <ui-loading-indicator />
        </div>

        <div v-else-if="!dailyChartData.length" class="h-64 flex flex-col items-center justify-center bg-black/20 rounded-lg border border-white/5 text-gray-400">
          <span class="material-symbols text-4xl mb-2 text-gray-500">query_stats</span>
          <p class="text-sm">No transfer records found for this period</p>
        </div>

        <!-- Responsive Bar Chart -->
        <div v-else class="bg-black/30 rounded-lg border border-white/5 p-4 overflow-x-auto">
          <div class="relative h-64 flex items-end pt-8 pb-6 min-w-[500px]">
            <!-- Grid Lines -->
            <div class="absolute inset-x-0 top-8 bottom-6 flex flex-col justify-between pointer-events-none opacity-20">
              <div class="border-b border-white" />
              <div class="border-b border-white" />
              <div class="border-b border-white" />
              <div class="border-b border-white" />
            </div>

            <!-- Top Y-Axis Label -->
            <div class="absolute top-2 left-2 text-[10px] font-mono text-gray-400 bg-black/60 px-1 rounded pointer-events-none">Max: {{ $bytesPretty(chartMaxBytes) }}</div>

            <!-- Chart Bars -->
            <div class="w-full h-full flex items-end justify-between gap-1 z-10 px-2">
              <div v-for="item in dailyChartData" :key="item.date" class="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer min-w-[12px]">
                <!-- Tooltip on Hover -->
                <div class="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-gray-900 border border-white/20 text-white rounded p-2 text-xs shadow-xl pointer-events-none z-50 whitespace-nowrap">
                  <p class="font-bold text-gray-200 border-b border-white/10 pb-1 mb-1">{{ item.date }}</p>
                  <p class="text-emerald-400">Stream: {{ $bytesPretty(item.bytesStream) }}</p>
                  <p class="text-purple-400">Download: {{ $bytesPretty(item.bytesDownload) }}</p>
                  <p class="text-blue-400">Other: {{ $bytesPretty(item.bytesOther) }}</p>
                  <div class="border-t border-white/10 pt-1 mt-1 space-y-0.5">
                    <p class="text-sky-300">🌐 Internet (WAN): {{ $bytesPretty(item.bytesInternet) }}</p>
                    <p class="text-amber-300">🏠 Local (LAN): {{ $bytesPretty(item.bytesLocal) }}</p>
                    <p class="font-bold text-white pt-0.5">Total: {{ $bytesPretty(item.bytesTotal) }}</p>
                  </div>
                  <p class="text-[10px] text-gray-400 pt-0.5">Requests: {{ item.requests }}</p>
                </div>

                <!-- Stacked Bar (Adjusted by selected traffic type if filtered) -->
                <div class="w-full max-w-[28px] rounded-t flex flex-col-reverse overflow-hidden transition-all duration-150 group-hover:brightness-125" :style="{ height: `${Math.max(2, (getBarHeightBytes(item) / chartMaxBytes) * 100)}%` }">
                  <div class="w-full bg-emerald-500" :style="{ height: `${(item.bytesStream / (item.bytesTotal || 1)) * 100}%` }" />
                  <div class="w-full bg-purple-500" :style="{ height: `${(item.bytesDownload / (item.bytesTotal || 1)) * 100}%` }" />
                  <div class="w-full bg-blue-500" :style="{ height: `${(item.bytesOther / (item.bytesTotal || 1)) * 100}%` }" />
                </div>

                <!-- X Axis Date Label -->
                <p class="text-[10px] text-gray-400 mt-2 truncate w-full text-center">
                  {{ formatShortDate(item.date) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- User Breakdown Table -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-semibold flex items-center">
            <span class="material-symbols mr-2 text-primary">group</span>
            Data Usage Breakdown by User
          </h2>
          <p class="text-xs text-gray-400">{{ userBreakdown.length }} Users</p>
        </div>

        <div class="bg-black/20 rounded-lg border border-white/5 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-white/5 text-xs uppercase text-gray-400 font-semibold border-b border-white/10">
              <tr>
                <th class="py-3 px-4">User</th>
                <th class="py-3 px-4 text-right">Internet (WAN)</th>
                <th class="py-3 px-4 text-right">Local (LAN)</th>
                <th class="py-3 px-4 text-right hidden sm:table-cell">Streaming</th>
                <th class="py-3 px-4 text-right hidden sm:table-cell">Downloads</th>
                <th class="py-3 px-4 text-right font-bold text-white">Total</th>
                <th class="py-3 px-4 w-36">% of Total</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              <tr v-if="!userBreakdown.length">
                <td colspan="7" class="text-center py-8 text-gray-400 text-sm">No user data recorded for this time frame.</td>
              </tr>
              <tr v-for="user in userBreakdown" :key="user.userId" class="hover:bg-white/5 transition-colors">
                <td class="py-3 px-4">
                  <div class="flex items-center">
                    <span class="material-symbols text-xl mr-2" :class="user.userId === 'anonymous' ? 'text-gray-400' : 'text-primary'">
                      {{ user.userId === 'anonymous' ? 'public' : 'person' }}
                    </span>
                    <div>
                      <p class="font-medium text-white">{{ user.username }}</p>
                      <p v-if="user.userId !== 'anonymous'" class="text-[10px] text-gray-500 font-mono">{{ user.userId }}</p>
                    </div>
                  </div>
                </td>
                <td class="py-3 px-4 text-right font-mono text-sky-400 font-medium">{{ $bytesPretty(user.bytesInternet) }}</td>
                <td class="py-3 px-4 text-right font-mono text-amber-300 font-medium">{{ $bytesPretty(user.bytesLocal) }}</td>
                <td class="py-3 px-4 text-right font-mono text-emerald-400 hidden sm:table-cell">{{ $bytesPretty(user.bytesStream) }}</td>
                <td class="py-3 px-4 text-right font-mono text-purple-400 hidden sm:table-cell">{{ $bytesPretty(user.bytesDownload) }}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-white">{{ $bytesPretty(user.bytesTotal) }}</td>
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2">
                    <div class="grow bg-white/10 rounded-full h-2 overflow-hidden">
                      <div class="bg-primary h-full rounded-full transition-all duration-300" :style="{ width: `${user.percentOfTotal}%` }" />
                    </div>
                    <span class="text-xs font-mono w-10 text-right text-gray-300">{{ user.percentOfTotal }}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </app-settings-content>

    <!-- Confirm Clear Stats Modal -->
    <prompt-dialog v-model="showConfirmClear" :width="500">
      <div class="px-6 py-6 rounded-lg bg-bg shadow-xl border border-white/10">
        <h2 class="text-lg font-semibold text-error mb-2 flex items-center">
          <span class="material-symbols mr-2">delete_forever</span>
          Clear All Bandwidth Records?
        </h2>
        <p class="text-sm text-gray-300 mb-6">This will permanently erase all accumulated bandwidth and data transfer statistics across all users. This action cannot be undone.</p>
        <div class="flex justify-end gap-3">
          <ui-btn color="bg-primary" @click="showConfirmClear = false">Cancel</ui-btn>
          <ui-btn color="bg-error" :loading="clearing" @click="clearStats">Yes, Clear Stats</ui-btn>
        </div>
      </div>
    </prompt-dialog>
  </div>
</template>

<script>
export default {
  asyncData({ store, redirect }) {
    if (!store.getters['user/getIsAdminOrUp']) {
      redirect('/')
    }
  },
  data() {
    return {
      loading: false,
      clearing: false,
      showConfirmClear: false,
      selectedRange: 'last7Days',
      selectedTrafficType: 'all',
      selectedUserId: '',
      rangeOptions: [
        { label: 'Today', value: 'today' },
        { label: 'Last 7 Days', value: 'last7Days' },
        { label: 'Last 30 Days', value: 'last30Days' },
        { label: 'This Year', value: 'thisYear' },
        { label: 'All Time', value: 'all' }
      ],
      trafficTypeOptions: [
        { label: 'All Traffic', value: 'all', icon: 'traffic' },
        { label: 'Internet', value: 'internet', icon: 'public' },
        { label: 'Local LAN', value: 'local', icon: 'home' }
      ],
      summary: {
        today: { total: 0, stream: 0, download: 0, other: 0, local: 0, internet: 0, requests: 0 },
        last7Days: { total: 0, stream: 0, download: 0, other: 0, local: 0, internet: 0, requests: 0 },
        thisMonth: { total: 0, stream: 0, download: 0, other: 0, local: 0, internet: 0, requests: 0 },
        thisYear: { total: 0, stream: 0, download: 0, other: 0, local: 0, internet: 0, requests: 0 },
        allTime: { total: 0, stream: 0, download: 0, other: 0, local: 0, internet: 0, requests: 0 }
      },
      dailyChartData: [],
      userBreakdown: [],
      filteredTotalBytes: 0,
      allUsers: []
    }
  },
  computed: {
    serverSettings() {
      return this.$store.state.serverSettings || {}
    },
    isTrackingEnabled() {
      return !!this.serverSettings.enableBandwidthTracking
    },
    userDropdownItems() {
      const items = [{ text: 'All Users', value: '' }]
      if (this.allUsers?.length) {
        this.allUsers.forEach((u) => {
          items.push({ text: u.username, value: u.id })
        })
      }
      items.push({ text: 'Anonymous / Public', value: 'anonymous' })
      return items
    },
    chartMaxBytes() {
      if (!this.dailyChartData.length) return 1
      const max = Math.max(...this.dailyChartData.map((d) => this.getBarHeightBytes(d)))
      return max > 0 ? max : 1
    }
  },
  methods: {
    selectRange(range) {
      this.selectedRange = range
      this.loadStats()
    },
    selectTrafficType(type) {
      this.selectedTrafficType = type
      this.loadStats()
    },
    getBarHeightBytes(item) {
      if (this.selectedTrafficType === 'internet') {
        return item.bytesInternet || 0
      } else if (this.selectedTrafficType === 'local') {
        return item.bytesLocal || 0
      }
      return item.bytesTotal || 0
    },
    formatShortDate(dateStr) {
      if (!dateStr) return ''
      const parts = dateStr.split('-')
      if (parts.length === 3) {
        return `${parts[1]}/${parts[2]}`
      }
      return dateStr
    },
    async loadStats() {
      this.loading = true
      try {
        let url = `/api/stats/bandwidth?range=${this.selectedRange}`
        if (this.selectedUserId) {
          url += `&userId=${this.selectedUserId}`
        }
        if (this.selectedTrafficType && this.selectedTrafficType !== 'all') {
          url += `&trafficType=${this.selectedTrafficType}`
        }
        const data = await this.$axios.$get(url)
        if (data) {
          this.summary = data.summary || this.summary
          this.dailyChartData = data.daily || []
          this.userBreakdown = data.userBreakdown || []
          this.filteredTotalBytes = data.rangeTotalBytes || 0
        }
      } catch (err) {
        console.error('Failed to load bandwidth stats:', err)
        this.$toast.error('Failed to load bandwidth stats')
      } finally {
        this.loading = false
      }
    },
    async loadUsers() {
      try {
        const users = await this.$axios.$get('/api/users')
        this.allUsers = users?.users || users || []
      } catch (err) {
        console.error('Failed to load users for filter:', err)
      }
    },
    async clearStats() {
      this.clearing = true
      try {
        await this.$axios.$delete('/api/stats/bandwidth')
        this.$toast.success('Bandwidth statistics cleared')
        this.showConfirmClear = false
        await this.loadStats()
      } catch (err) {
        console.error('Failed to clear bandwidth stats:', err)
        this.$toast.error('Failed to clear bandwidth stats')
      } finally {
        this.clearing = false
      }
    }
  },
  mounted() {
    this.loadUsers()
    this.loadStats()
  }
}
</script>
