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

      <!-- Filters & Toolbar (Stacking context relative z-50 prevents chart clipping) -->
      <div class="relative z-50 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/10 pb-4 mb-4">
        <div class="flex flex-wrap items-center gap-2">
          <!-- Range Buttons: Includes Live 48h (10m) high-res mode -->
          <div class="inline-flex rounded-md shadow-sm bg-black/40 p-1 border border-white/10">
            <button
              v-for="r in rangeOptions"
              :key="r.value"
              type="button"
              @click="selectRange(r.value)"
              class="px-3 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1"
              :class="selectedRange === r.value ? 'bg-primary text-white shadow' : 'text-gray-400 hover:text-white'"
            >
              <span v-if="r.value === 'last48Hours'" class="material-symbols text-[13px] text-emerald-400">show_chart</span>
              {{ r.label }}
            </button>
          </div>

          <!-- Traffic Type Filter (All / Internet WAN / Local LAN) -->
          <div class="inline-flex rounded-md shadow-sm bg-black/40 p-1 border border-white/10">
            <button
              v-for="t in trafficTypeOptions"
              :key="t.value"
              type="button"
              @click="selectTrafficType(t.value)"
              class="px-2.5 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1"
              :class="selectedTrafficType === t.value ? 'bg-primary text-white shadow' : 'text-gray-400 hover:text-white'"
            >
              <span class="material-symbols text-[14px]">{{ t.icon }}</span>
              <span>{{ t.label }}</span>
            </button>
          </div>
        </div>

        <!-- Controls: User Filter + Back Button + Refresh + Clear -->
        <div class="flex items-center gap-2 relative z-50">
          <!-- Back to All Users button -->
          <ui-btn v-if="selectedUserId" color="bg-primary/30 hover:bg-primary/50 text-sky-200 border border-primary/40" small @click="selectUser('')">
            <span class="material-symbols text-sm mr-1">arrow_back</span>
            All Users
          </ui-btn>

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

      <!-- Active Filter Banner (shows when user or date filter is applied) -->
      <div v-if="selectedUserId || selectedDate" class="flex flex-wrap items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 mb-6 text-xs">
        <span class="text-gray-400 font-medium">Active Filters:</span>

        <span v-if="selectedUserId" class="inline-flex items-center bg-primary/30 text-sky-200 border border-primary/40 px-2 py-0.5 rounded-full">
          <span class="material-symbols text-xs mr-1">person</span>
          User: <strong class="ml-1">{{ selectedUserName }}</strong>
          <button type="button" @click="selectUser('')" class="ml-1.5 text-gray-300 hover:text-white font-bold" title="Clear user filter">✕</button>
        </span>

        <span v-if="selectedDate" class="inline-flex items-center bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full">
          <span class="material-symbols text-xs mr-1">calendar_today</span>
          Date: <strong class="ml-1">{{ selectedDate }}</strong>
          <button type="button" @click="clearDateFilter" class="ml-1.5 text-gray-300 hover:text-white font-bold" title="Clear date filter">✕</button>
        </span>

        <span class="text-gray-300 ml-auto flex items-center gap-1.5 font-medium">
          <span class="material-symbols text-sm text-sky-400">info</span>
          <span>Click any bar to filter by day, or click a user to view their activity</span>
        </span>
      </div>

      <!-- SECTION A: High-Resolution 10-Minute Activity Waveform (Layout Option A) for "Live 48h (10m)" -->
      <div v-if="selectedRange === 'last48Hours'" class="mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div class="flex items-center flex-wrap gap-2">
            <h2 class="text-lg font-semibold flex items-center">
              <span class="material-symbols mr-2 text-accent">monitoring</span>
              Rolling 48-Hour Waveform (10-Minute Increments)
            </h2>
            <span v-if="waveformPeakMbps > 0" class="text-xs font-mono font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">
              Peak Burst: {{ waveformPeakMbps }} Mbps ({{ $bytesPretty(waveformPeakBytes) }} / 10m)
            </span>
          </div>
          <!-- Legend -->
          <div class="flex items-center gap-4 text-xs">
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-emerald-400 mr-1.5" /> Egress Waveform</div>
            <div class="flex items-center text-gray-400 font-mono text-[11px]">288 Intervals / 48 Hours</div>
          </div>
        </div>

        <div v-if="loading" class="h-64 flex items-center justify-center bg-black/20 rounded-lg border border-white/5">
          <ui-loading-indicator />
        </div>

        <div v-else-if="!waveform10m.length" class="h-64 flex flex-col items-center justify-center bg-black/20 rounded-lg border border-white/5 text-gray-400">
          <span class="material-symbols text-4xl mb-2 text-gray-500">query_stats</span>
          <p class="text-sm">No transfer records found in the last 48 hours</p>
        </div>

        <!-- Smooth SVG Area/Line Waveform Canvas -->
        <div v-else class="bg-black/30 rounded-lg border border-white/5 p-4 relative overflow-hidden">
          <!-- Top Y-Axis Peak Label -->
          <div class="absolute top-3 left-4 text-[10px] font-mono text-gray-400 bg-black/60 px-1.5 py-0.5 rounded border border-white/10 z-10 pointer-events-none">
            Peak: {{ waveformPeakMbps }} Mbps ({{ $bytesPretty(waveformPeakBytes) }})
          </div>

          <!-- Interactive Floating HUD Pill (Follows cursor) -->
          <div
            v-if="cursorPoint"
            class="absolute z-40 pointer-events-none bg-gray-950/95 border border-white/20 text-white rounded-lg p-2.5 text-xs shadow-2xl backdrop-blur-md transition-all duration-75 whitespace-nowrap"
            :style="{ left: `${Math.max(2, Math.min(78, (cursorPoint.x / 1000) * 100))}%`, top: '10px' }"
          >
            <div class="flex items-center justify-between border-b border-white/10 pb-1 mb-1">
              <span class="font-bold text-gray-200">{{ cursorPoint.pt.timeLabel }}</span>
              <span class="font-mono text-emerald-400 font-bold ml-2">~{{ cursorPoint.pt.mbps }} Mbps</span>
            </div>
            <p class="text-white font-semibold">10m Transfer: {{ $bytesPretty(cursorPoint.pt.bytesTotal) }}</p>
            <div class="text-[11px] text-gray-300 space-y-0.5 mt-1 border-t border-white/10 pt-1">
              <p class="text-sky-300 flex justify-between gap-3"><span>🌐 Internet:</span> <span class="font-mono">{{ $bytesPretty(cursorPoint.pt.bytesInternet) }}</span></p>
              <p class="text-amber-300 flex justify-between gap-3"><span>🏠 Local:</span> <span class="font-mono">{{ $bytesPretty(cursorPoint.pt.bytesLocal) }}</span></p>
              <p class="text-emerald-400 flex justify-between gap-3"><span>🎧 Streaming:</span> <span class="font-mono">{{ $bytesPretty(cursorPoint.pt.bytesStream) }}</span></p>
              <p class="text-purple-400 flex justify-between gap-3"><span>📥 Download:</span> <span class="font-mono">{{ $bytesPretty(cursorPoint.pt.bytesDownload) }}</span></p>
            </div>
            <p class="text-[10px] text-gray-400 pt-1 border-t border-white/10 mt-1">Requests: {{ cursorPoint.pt.requests }}</p>
          </div>

          <!-- Responsive SVG Surface -->
          <svg
            ref="svgWaveform"
            viewBox="0 0 1000 240"
            class="w-full h-56 block cursor-crosshair"
            preserveAspectRatio="none"
            @mousemove="onSvgMouseMove"
            @mouseleave="cursorPoint = null"
          >
            <defs>
              <linearGradient id="waveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="#10b981" stop-opacity="0.45" />
                <stop offset="60%" stop-color="#06b6d4" stop-opacity="0.15" />
                <stop offset="100%" stop-color="#06b6d4" stop-opacity="0.0" />
              </linearGradient>
            </defs>

            <!-- Horizontal Background Grid Lines -->
            <line x1="0" y1="25" x2="1000" y2="25" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4,4" />
            <line x1="0" y1="115" x2="1000" y2="115" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4,4" />
            <line x1="0" y1="205" x2="1000" y2="205" stroke="rgba(255,255,255,0.2)" />

            <!-- Smooth SVG Area Fill -->
            <path :d="waveformSvgAreaPath" fill="url(#waveGradient)" />

            <!-- Smooth SVG Curve Stroke -->
            <path :d="waveformSvgStrokePath" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />

            <!-- Interactive Cursor Line & Indicator Point -->
            <template v-if="cursorPoint">
              <line :x1="cursorPoint.x" y1="20" :x2="cursorPoint.x" y2="205" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="3,3" />
              <circle :cx="cursorPoint.x" :cy="cursorPoint.y" r="4.5" fill="#10b981" stroke="#ffffff" stroke-width="2" />
            </template>
          </svg>

          <!-- Time Axis Ticks (4 Ticks across 48 Hours) -->
          <div class="flex justify-between items-center text-[10px] text-gray-400 mt-2 px-1 font-mono">
            <span>-48 Hours</span>
            <span>-36 Hours</span>
            <span>-24 Hours</span>
            <span>-12 Hours</span>
            <span class="text-emerald-400 font-bold">Now (Live)</span>
          </div>
        </div>
      </div>

      <!-- SECTION B: Daily Timeline Chart (Shown for all ranges except 48h) -->
      <div v-else class="mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h2 class="text-lg font-semibold flex items-center">
            <span class="material-symbols mr-2 text-accent">show_chart</span>
            Daily Transfer Timeline
            <span v-if="filteredTotalBytes" class="ml-2 text-xs font-mono font-normal text-gray-400">
              ({{ selectedTrafficTypeLabel }} Total: {{ $bytesPretty(filteredTotalBytes) }})
            </span>
            <span v-if="selectedDate" class="ml-2 text-xs font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
              Selected Day: {{ selectedDate }}
            </span>
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
            <div class="absolute top-2 left-2 text-[10px] font-mono text-gray-400 bg-black/60 px-1 rounded pointer-events-none">
              Max: {{ $bytesPretty(chartMaxBytes) }} ({{ selectedTrafficTypeLabel }})
            </div>

            <!-- Floating Hover Tooltip: Positioned at top: 8px inside the chart container so it is NEVER clipped -->
            <div
              v-if="hoveredItem"
              class="absolute z-50 pointer-events-none flex flex-col bg-gray-950/95 border border-white/20 text-white rounded-lg p-3 text-xs shadow-2xl whitespace-nowrap min-w-[210px] backdrop-blur-md"
              :style="tooltipStyle"
            >
              <div class="flex items-center justify-between border-b border-white/10 pb-1.5 mb-1.5">
                <span class="font-bold text-gray-200 text-sm">{{ hoveredItem.date }}</span>
                <span v-if="selectedDate === hoveredItem.date" class="text-[10px] text-emerald-400 font-semibold bg-emerald-500/20 px-1.5 py-0.5 rounded">Selected</span>
              </div>

              <!-- Highlight Active Traffic Filter prominently -->
              <div v-if="selectedTrafficType === 'internet'" class="mb-1.5 pb-1.5 border-b border-white/10">
                <p class="text-sky-300 font-bold text-sm flex items-center">
                  <span class="material-symbols text-sm mr-1">public</span>
                  Internet (WAN): {{ $bytesPretty(hoveredItem.bytesInternet) }}
                </p>
                <p v-if="hoveredItem.isLegacy" class="text-amber-300 text-[10px] mt-1 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  ⚠️ Recorded prior to LAN/WAN tracking
                </p>
              </div>
              <div v-else-if="selectedTrafficType === 'local'" class="mb-1.5 pb-1.5 border-b border-white/10">
                <p class="text-amber-300 font-bold text-sm flex items-center">
                  <span class="material-symbols text-sm mr-1">home</span>
                  Local (LAN): {{ $bytesPretty(hoveredItem.bytesLocal) }}
                </p>
                <p v-if="hoveredItem.isLegacy" class="text-amber-300 text-[10px] mt-1 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded">
                  ⚠️ Recorded prior to LAN/WAN tracking
                </p>
              </div>
              <div v-else class="mb-1.5 pb-1.5 border-b border-white/10">
                <p class="text-white font-bold text-sm">
                  Total Data: {{ $bytesPretty(hoveredItem.bytesTotal) }}
                </p>
              </div>

              <!-- Category Breakdown -->
              <div class="space-y-0.5">
                <p class="text-emerald-400 flex justify-between"><span>Streaming:</span> <span class="font-mono">{{ $bytesPretty(hoveredItem.bytesStream) }}</span></p>
                <p class="text-purple-400 flex justify-between"><span>Download:</span> <span class="font-mono">{{ $bytesPretty(hoveredItem.bytesDownload) }}</span></p>
                <p class="text-blue-400 flex justify-between"><span>Other / API:</span> <span class="font-mono">{{ $bytesPretty(hoveredItem.bytesOther) }}</span></p>
              </div>

              <!-- Network breakdown -->
              <div class="border-t border-white/10 pt-1.5 mt-1.5 space-y-0.5 text-[11px]">
                <p class="text-sky-300 flex justify-between"><span>🌐 Internet:</span> <span class="font-mono">{{ $bytesPretty(hoveredItem.bytesInternet) }}</span></p>
                <p class="text-amber-300 flex justify-between"><span>🏠 Local:</span> <span class="font-mono">{{ $bytesPretty(hoveredItem.bytesLocal) }}</span></p>
                <p class="font-bold text-white flex justify-between pt-0.5"><span>All Traffic:</span> <span class="font-mono">{{ $bytesPretty(hoveredItem.bytesTotal) }}</span></p>
              </div>

              <!-- Footer: High-contrast, easily visible Requests + Click to filter -->
              <div class="border-t border-white/10 pt-1.5 mt-1.5 text-[11px] flex items-center justify-between">
                <span class="text-gray-300 font-medium">Requests: {{ hoveredItem.requests }}</span>
                <span class="inline-flex items-center gap-1 font-semibold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/40 shadow-sm">
                  <span class="material-symbols text-[13px]">touch_app</span>
                  Click to filter
                </span>
              </div>
            </div>

            <!-- Chart Bars -->
            <div class="w-full h-full flex items-end justify-between gap-1 z-10 px-2" @mouseleave="leaveItem">
              <div
                v-for="(item, index) in dailyChartData"
                :key="item.date"
                class="flex-1 h-full flex flex-col justify-end items-center cursor-pointer min-w-[12px] p-0.5 rounded transition-all duration-150"
                :class="{
                  'bg-white/10 ring-2 ring-accent ring-offset-2 ring-offset-black scale-105': selectedDate === item.date,
                  'scale-105': hoveredIndex === index
                }"
                @mouseenter="hoverItem(item, index)"
                @mouseleave="leaveItem"
                @click="selectDate(item.date)"
              >
                <!-- Stacked Bar (Height adjusted by selected traffic type) -->
                <div
                  class="w-full max-w-[28px] rounded-t flex flex-col-reverse overflow-hidden transition-all duration-150 group-hover:brightness-125"
                  :class="{ 'brightness-125': hoveredIndex === index }"
                  :style="{ height: `${Math.max(3, (getBarHeightBytes(item) / chartMaxBytes) * 100)}%` }"
                >
                  <template v-if="selectedTrafficType === 'internet'">
                    <div class="w-full h-full bg-sky-500" />
                  </template>
                  <template v-else-if="selectedTrafficType === 'local'">
                    <div class="w-full h-full bg-amber-500" />
                  </template>
                  <template v-else>
                    <div class="w-full bg-emerald-500" :style="{ height: `${(item.bytesStream / (item.bytesTotal || 1)) * 100}%` }" />
                    <div class="w-full bg-purple-500" :style="{ height: `${(item.bytesDownload / (item.bytesTotal || 1)) * 100}%` }" />
                    <div class="w-full bg-blue-500" :style="{ height: `${(item.bytesOther / (item.bytesTotal || 1)) * 100}%` }" />
                  </template>
                </div>

                <!-- X Axis Date Label -->
                <p
                  class="text-[10px] mt-2 truncate w-full text-center transition-colors"
                  :class="selectedDate === item.date ? 'text-accent font-bold' : (hoveredIndex === index ? 'text-white' : 'text-gray-400')"
                >
                  {{ formatShortDate(item.date) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- SECTION C: Approach 1: 24-Hour Time-of-Day Hourly Drill-Down (Shown when a single date is selected) -->
      <div v-if="selectedDate && hourlyData.length" class="mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <div>
            <h2 class="text-lg font-semibold flex items-center">
              <span class="material-symbols mr-2 text-accent">schedule</span>
              Time-of-Day Hourly Activity for {{ selectedDate }}
            </h2>
            <p class="text-xs text-gray-400">Hourly timeline (00:00 – 23:00) showing the exact times of day when bandwidth was used</p>
          </div>
          <!-- Legend -->
          <div class="flex items-center gap-4 text-xs">
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-emerald-500 mr-1.5" /> Streaming</div>
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-purple-500 mr-1.5" /> Downloads</div>
            <div class="flex items-center"><span class="w-3 h-3 rounded-sm bg-blue-500 mr-1.5" /> Other / API</div>
          </div>
        </div>

        <div class="bg-black/30 rounded-lg border border-white/5 p-4 overflow-x-auto">
          <div class="relative h-56 flex items-end pt-8 pb-6 min-w-[650px]">
            <!-- Grid Lines -->
            <div class="absolute inset-x-0 top-8 bottom-6 flex flex-col justify-between pointer-events-none opacity-20">
              <div class="border-b border-white" />
              <div class="border-b border-white" />
              <div class="border-b border-white" />
            </div>

            <!-- Top Y-Axis Label -->
            <div class="absolute top-2 left-2 text-[10px] font-mono text-gray-400 bg-black/60 px-1 rounded pointer-events-none">
              Peak Hour: {{ $bytesPretty(hourlyChartMaxBytes) }}
            </div>

            <!-- Floating Hover Tooltip for Hourly Chart -->
            <div
              v-if="hoveredHourlyItem"
              class="absolute z-50 pointer-events-none flex flex-col bg-gray-950/95 border border-white/20 text-white rounded-lg p-3 text-xs shadow-2xl whitespace-nowrap min-w-[200px] backdrop-blur-md"
              :style="hourlyTooltipStyle"
            >
              <div class="flex items-center justify-between border-b border-white/10 pb-1 mb-1">
                <span class="font-bold text-gray-200">{{ selectedDate }} {{ hoveredHourlyItem.label }}</span>
              </div>
              <p class="text-white font-bold text-sm">Hourly Total: {{ $bytesPretty(hoveredHourlyItem.bytesTotal) }}</p>
              <div class="text-[11px] text-gray-300 space-y-0.5 mt-1 border-t border-white/10 pt-1">
                <p class="text-sky-300 flex justify-between gap-3"><span>🌐 Internet:</span> <span class="font-mono">{{ $bytesPretty(hoveredHourlyItem.bytesInternet) }}</span></p>
                <p class="text-amber-300 flex justify-between gap-3"><span>🏠 Local:</span> <span class="font-mono">{{ $bytesPretty(hoveredHourlyItem.bytesLocal) }}</span></p>
                <p class="text-emerald-400 flex justify-between gap-3"><span>🎧 Stream:</span> <span class="font-mono">{{ $bytesPretty(hoveredHourlyItem.bytesStream) }}</span></p>
                <p class="text-purple-400 flex justify-between gap-3"><span>📥 Download:</span> <span class="font-mono">{{ $bytesPretty(hoveredHourlyItem.bytesDownload) }}</span></p>
              </div>
              <p class="text-[10px] text-gray-400 pt-1 border-t border-white/10 mt-1">Requests: {{ hoveredHourlyItem.requests }}</p>
            </div>

            <!-- Hourly Bars (24 Columns) -->
            <div class="w-full h-full flex items-end justify-between gap-1 z-10 px-1" @mouseleave="leaveHourlyItem">
              <div
                v-for="(h, idx) in hourlyData"
                :key="h.hour"
                class="flex-1 h-full flex flex-col justify-end items-center cursor-pointer min-w-[10px] p-0.5 rounded transition-transform"
                :class="{ 'scale-105': hoveredHourlyIndex === idx }"
                @mouseenter="hoverHourly(h, idx)"
                @mouseleave="leaveHourlyItem"
              >
                <!-- Stacked Hourly Bar -->
                <div
                  class="w-full max-w-[22px] rounded-t flex flex-col-reverse overflow-hidden transition-all duration-150"
                  :class="{ 'brightness-125': hoveredHourlyIndex === idx }"
                  :style="{ height: `${Math.max(3, (getBarHeightBytes(h) / hourlyChartMaxBytes) * 100)}%` }"
                >
                  <template v-if="selectedTrafficType === 'internet'">
                    <div class="w-full h-full bg-sky-500" />
                  </template>
                  <template v-else-if="selectedTrafficType === 'local'">
                    <div class="w-full h-full bg-amber-500" />
                  </template>
                  <template v-else>
                    <div class="w-full bg-emerald-500" :style="{ height: `${(h.bytesStream / (h.bytesTotal || 1)) * 100}%` }" />
                    <div class="w-full bg-purple-500" :style="{ height: `${(h.bytesDownload / (h.bytesTotal || 1)) * 100}%` }" />
                    <div class="w-full bg-blue-500" :style="{ height: `${(h.bytesOther / (h.bytesTotal || 1)) * 100}%` }" />
                  </template>
                </div>

                <!-- Hour Tick Label -->
                <p class="text-[9px] mt-2 truncate w-full text-center text-gray-400 font-mono">
                  {{ h.hour % 3 === 0 ? h.label : '' }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Item / Book Activity Breakdown Table (Shown when a user is selected OR a date is clicked) -->
      <div v-if="selectedUserId" class="mb-8">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h2 class="text-lg font-semibold flex items-center">
              <span class="material-symbols mr-2 text-accent">auto_stories</span>
              Book & Media Activity Breakdown for {{ selectedUserName }}
              <span v-if="selectedDate" class="ml-2 text-xs font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                on {{ selectedDate }}
              </span>
            </h2>
            <p class="text-xs text-gray-400">
              Showing media streamed, downloaded, and transferred
              {{ selectedDate ? 'on ' + selectedDate : 'across ' + selectedRangeLabel }}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <ui-btn v-if="selectedDate" color="bg-white/10 hover:bg-white/20" small @click="clearDateFilter">
              <span class="material-symbols text-sm mr-1">close</span>
              Clear Date Filter
            </ui-btn>
            <ui-btn color="bg-primary" small @click="selectUser('')">
              <span class="material-symbols text-sm mr-1">arrow_back</span>
              Back to All Users
            </ui-btn>
          </div>
        </div>

        <div class="bg-black/20 rounded-lg border border-white/5 overflow-hidden">
          <table class="w-full text-left text-sm">
            <thead class="bg-white/5 text-xs uppercase text-gray-400 font-semibold border-b border-white/10">
              <tr>
                <th class="py-3 px-4">Book / Media Item</th>
                <th class="py-3 px-4 text-center">Activity</th>
                <th class="py-3 px-4 text-right">Internet (WAN)</th>
                <th class="py-3 px-4 text-right">Local (LAN)</th>
                <th class="py-3 px-4 text-right font-bold text-white">Total Data</th>
                <th class="py-3 px-4 text-right hidden sm:table-cell">Requests</th>
                <th class="py-3 px-4 w-32">% of Activity</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              <tr v-if="!itemBreakdown.length">
                <td colspan="7" class="text-center py-8 text-gray-400 text-sm">
                  <span class="material-symbols text-3xl mb-1 text-gray-500 block">hourglass_empty</span>
                  No individual book activity recorded for this period yet.
                  <p class="text-xs text-gray-500 mt-1">
                    Book & item-level tracking automatically records activity as audiobooks and files are streamed or downloaded.
                  </p>
                </td>
              </tr>
              <tr v-for="item in itemBreakdown" :key="item.libraryItemId" class="hover:bg-white/5 transition-colors">
                <td class="py-3 px-4">
                  <div class="flex items-center">
                    <span class="material-symbols text-xl mr-2.5" :class="getItemIconClass(item)">
                      {{ getItemIcon(item) }}
                    </span>
                    <div>
                      <p class="font-medium text-white">{{ item.itemName }}</p>
                      <p v-if="item.libraryItemId !== 'general'" class="text-[10px] text-gray-500 font-mono">
                        ID: {{ item.libraryItemId }}
                      </p>
                    </div>
                  </div>
                </td>
                <td class="py-3 px-4 text-center">
                  <div class="inline-flex flex-col items-center">
                    <span
                      class="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider"
                      :class="getCategoryBadgeClass(item.category)"
                      :title="getActivityTooltip(item)"
                    >
                      {{ item.category }}
                    </span>
                    <span
                      v-if="hasSecondaryActivity(item)"
                      class="text-[9px] text-gray-400 font-mono mt-0.5 cursor-help"
                      :title="getActivityTooltip(item)"
                    >
                      {{ getSecondaryActivityText(item) }}
                    </span>
                  </div>
                </td>
                <td class="py-3 px-4 text-right font-mono text-sky-400 font-medium">{{ $bytesPretty(item.bytesInternet) }}</td>
                <td class="py-3 px-4 text-right font-mono text-amber-300 font-medium">{{ $bytesPretty(item.bytesLocal) }}</td>
                <td class="py-3 px-4 text-right font-mono font-bold text-white">{{ $bytesPretty(item.bytesTotal) }}</td>
                <td class="py-3 px-4 text-right font-mono text-gray-300 hidden sm:table-cell">{{ item.requests }}</td>
                <td class="py-3 px-4">
                  <div class="flex items-center gap-2">
                    <div class="grow bg-white/10 rounded-full h-2 overflow-hidden">
                      <div class="bg-primary h-full rounded-full transition-all duration-300" :style="{ width: `${item.percentOfTotal}%` }" />
                    </div>
                    <span class="text-xs font-mono w-10 text-right text-gray-300">{{ item.percentOfTotal }}%</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- User Breakdown Table (Shown on All Users view) -->
      <div v-if="!selectedUserId">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h2 class="text-lg font-semibold flex items-center">
              <span class="material-symbols mr-2 text-accent">group</span>
              Data Usage Breakdown by User
              <span v-if="selectedDate" class="ml-2 text-xs font-semibold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded">
                on {{ selectedDate }}
              </span>
            </h2>
            <p class="text-xs text-gray-400">Click any user row to view individual book & stream breakdowns</p>
          </div>
          <div class="flex items-center gap-2">
            <ui-btn v-if="selectedDate" color="bg-white/10 hover:bg-white/20" small @click="clearDateFilter">
              <span class="material-symbols text-sm mr-1">close</span>
              Clear Date Filter
            </ui-btn>
            <p class="text-xs text-gray-400">{{ userBreakdown.length }} Users</p>
          </div>
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
                <th class="py-3 px-2 w-10"></th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              <tr v-if="!userBreakdown.length">
                <td colspan="8" class="text-center py-8 text-gray-400 text-sm">No user data recorded for this time frame.</td>
              </tr>
              <tr
                v-for="user in userBreakdown"
                :key="user.userId"
                class="hover:bg-white/10 transition-colors cursor-pointer group"
                @click="selectUser(user.userId)"
                title="Click to view item & book activity for this user"
              >
                <td class="py-3 px-4">
                  <div class="flex items-center">
                    <span class="material-symbols text-xl mr-2 group-hover:scale-110 transition-transform" :class="user.userId === 'anonymous' ? 'text-gray-400' : 'text-sky-400'">
                      {{ user.userId === 'anonymous' ? 'public' : 'person' }}
                    </span>
                    <div>
                      <p class="font-medium text-white group-hover:text-sky-300 transition-colors flex items-center">
                        {{ user.username }}
                        <span class="material-symbols text-xs ml-1 opacity-0 group-hover:opacity-100 transition-opacity">open_in_new</span>
                      </p>
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
                <td class="py-3 px-2 text-center text-gray-500 group-hover:text-white">
                  <span class="material-symbols text-sm">chevron_right</span>
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
      selectedDate: null,
      hoveredItem: null,
      hoveredIndex: -1,
      hoveredHourlyItem: null,
      hoveredHourlyIndex: -1,
      cursorPoint: null,
      rangeOptions: [
        { label: 'Live 48h (10m)', value: 'last48Hours' },
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
      itemBreakdown: [],
      hourlyData: [],
      waveform10m: [],
      waveformPeakBytes: 0,
      waveformPeakMbps: 0,
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
    selectedUserName() {
      if (!this.selectedUserId) return ''
      if (this.selectedUserId === 'anonymous') return 'Anonymous / Public'
      const found = this.allUsers.find((u) => u.id === this.selectedUserId)
      return found?.username || this.selectedUserId
    },
    selectedRangeLabel() {
      const found = this.rangeOptions.find((r) => r.value === this.selectedRange)
      return found?.label || this.selectedRange
    },
    selectedTrafficTypeLabel() {
      if (this.selectedTrafficType === 'internet') return 'Internet (WAN)'
      if (this.selectedTrafficType === 'local') return 'Local (LAN)'
      return 'All Traffic'
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
    },
    hourlyChartMaxBytes() {
      if (!this.hourlyData.length) return 1
      const max = Math.max(...this.hourlyData.map((h) => this.getBarHeightBytes(h)))
      return max > 0 ? max : 1
    },
    tooltipStyle() {
      if (!this.hoveredItem || this.hoveredIndex < 0) return {}
      const total = this.dailyChartData.length || 1
      const idx = this.hoveredIndex
      const style = { top: '8px' }
      if (idx <= 1) {
        const leftPercent = Math.max(1, (idx / total) * 100)
        style.left = `${leftPercent}%`
      } else if (idx >= total - 2) {
        const rightPercent = Math.max(1, ((total - 1 - idx) / total) * 100)
        style.right = `${rightPercent}%`
        style.left = 'auto'
      } else {
        const centerPercent = ((idx + 0.5) / total) * 100
        style.left = `${centerPercent}%`
        style.transform = 'translateX(-50%)'
      }
      return style
    },
    hourlyTooltipStyle() {
      if (!this.hoveredHourlyItem || this.hoveredHourlyIndex < 0) return {}
      const total = this.hourlyData.length || 1
      const idx = this.hoveredHourlyIndex
      const style = { top: '8px' }
      if (idx <= 2) {
        style.left = `${Math.max(1, (idx / total) * 100)}%`
      } else if (idx >= total - 3) {
        style.right = `${Math.max(1, ((total - 1 - idx) / total) * 100)}%`
        style.left = 'auto'
      } else {
        style.left = `${((idx + 0.5) / total) * 100}%`
        style.transform = 'translateX(-50%)'
      }
      return style
    },
    waveformPoints() {
      if (!this.waveform10m || !this.waveform10m.length) return []
      const maxVal = this.waveformPeakBytes || 1
      const count = this.waveform10m.length
      const width = 1000
      const height = 180
      const topOffset = 25

      return this.waveform10m.map((pt, i) => {
        const x = (i / (count - 1 || 1)) * width
        let val = pt.bytesTotal
        if (this.selectedTrafficType === 'internet') val = pt.bytesInternet
        else if (this.selectedTrafficType === 'local') val = pt.bytesLocal
        const y = topOffset + height - Math.min(height, (val / maxVal) * height)
        return { x, y, pt, val }
      })
    },
    waveformSvgAreaPath() {
      if (!this.waveformPoints.length) return ''
      const pts = this.waveformPoints
      let d = `M ${pts[0].x} ${pts[0].y}`
      for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x} ${pts[i].y}`
      }
      d += ` L ${pts[pts.length - 1].x} 205 L ${pts[0].x} 205 Z`
      return d
    },
    waveformSvgStrokePath() {
      if (!this.waveformPoints.length) return ''
      const pts = this.waveformPoints
      let d = `M ${pts[0].x} ${pts[0].y}`
      for (let i = 1; i < pts.length; i++) {
        d += ` L ${pts[i].x} ${pts[i].y}`
      }
      return d
    }
  },
  methods: {
    selectRange(range) {
      this.selectedRange = range
      this.selectedDate = null
      this.cursorPoint = null
      this.loadStats()
    },
    selectTrafficType(type) {
      this.selectedTrafficType = type
      this.loadStats()
    },
    selectUser(userId) {
      this.selectedUserId = userId
      this.loadStats()
    },
    selectDate(date) {
      if (this.selectedDate === date) {
        this.selectedDate = null
      } else {
        this.selectedDate = date
      }
      this.loadStats()
    },
    clearDateFilter() {
      this.selectedDate = null
      this.loadStats()
    },
    hoverItem(item, index) {
      this.hoveredItem = item
      this.hoveredIndex = index
    },
    leaveItem() {
      this.hoveredItem = null
      this.hoveredIndex = -1
    },
    hoverHourly(item, index) {
      this.hoveredHourlyItem = item
      this.hoveredHourlyIndex = index
    },
    leaveHourlyItem() {
      this.hoveredHourlyItem = null
      this.hoveredHourlyIndex = -1
    },
    onSvgMouseMove(event) {
      if (!this.waveformPoints.length) return
      const svg = this.$refs.svgWaveform
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const mouseX = event.clientX - rect.left
      const svgX = (mouseX / rect.width) * 1000
      const count = this.waveformPoints.length
      const index = Math.round((svgX / 1000) * (count - 1))
      const clampedIndex = Math.max(0, Math.min(count - 1, index))
      this.cursorPoint = this.waveformPoints[clampedIndex]
    },
    getBarHeightBytes(item) {
      if (this.selectedTrafficType === 'internet') {
        return item.bytesInternet || 0
      } else if (this.selectedTrafficType === 'local') {
        return item.bytesLocal || 0
      }
      return item.bytesTotal || 0
    },
    getItemIcon(item) {
      if (item.libraryItemId === 'general') return 'devices'
      if (item.libraryItemId === 'backup') return 'settings_backup_restore'
      if (item.libraryItemId === 'shared') return 'share'
      if (item.category === 'stream') return 'headphones'
      if (item.category === 'download') return 'download_for_offline'
      return 'book_2'
    },
    getItemIconClass(item) {
      if (item.libraryItemId === 'general') return 'text-gray-400'
      if (item.category === 'stream') return 'text-emerald-400'
      if (item.category === 'download') return 'text-purple-400'
      return 'text-sky-400'
    },
    getCategoryBadgeClass(category) {
      if (category === 'stream') return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
      if (category === 'download') return 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
      return 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
    },
    hasSecondaryActivity(item) {
      if (!item) return false
      let count = 0
      if ((item.bytesStream || 0) > 0) count++
      if ((item.bytesDownload || 0) > 0) count++
      if ((item.bytesOther || 0) > 0) count++
      return count > 1
    },
    getSecondaryActivityText(item) {
      if (!item) return ''
      const parts = []
      if (item.category !== 'stream' && (item.bytesStream || 0) > 0) {
        parts.push(`+${this.$bytesPretty(item.bytesStream)} stream`)
      }
      if (item.category !== 'download' && (item.bytesDownload || 0) > 0) {
        parts.push(`+${this.$bytesPretty(item.bytesDownload)} dl`)
      }
      if (item.category !== 'other' && (item.bytesOther || 0) > 0) {
        parts.push(`+${this.$bytesPretty(item.bytesOther)} other`)
      }
      return parts.join(', ')
    },
    getActivityTooltip(item) {
      if (!item) return ''
      const parts = []
      if ((item.bytesStream || 0) > 0) parts.push(`Streaming: ${this.$bytesPretty(item.bytesStream)}`)
      if ((item.bytesDownload || 0) > 0) parts.push(`Downloads: ${this.$bytesPretty(item.bytesDownload)}`)
      if ((item.bytesOther || 0) > 0) parts.push(`Other (Covers/Meta): ${this.$bytesPretty(item.bytesOther)}`)
      return parts.join(' | ')
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
        if (this.selectedDate) {
          url += `&date=${this.selectedDate}`
        }
        const data = await this.$axios.$get(url)
        if (data) {
          this.summary = data.summary || this.summary
          this.dailyChartData = data.daily || []
          this.userBreakdown = data.userBreakdown || []
          this.itemBreakdown = data.itemBreakdown || []
          this.hourlyData = data.hourly || []
          this.waveform10m = data.waveform10m || []
          this.waveformPeakBytes = data.waveformPeakBytes || 0
          this.waveformPeakMbps = data.waveformPeakMbps || 0
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
        this.selectedDate = null
        this.hoveredItem = null
        this.hoveredIndex = -1
        this.hoveredHourlyItem = null
        this.hoveredHourlyIndex = -1
        this.cursorPoint = null
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
