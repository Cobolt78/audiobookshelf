<template>
  <div class="w-full h-full px-1 md:px-4 py-1 mb-4">
    <!-- Library File Scans -->
    <div class="flex items-center justify-between mb-4">
      <p class="text-base md:text-xl font-semibold">{{ $strings.HeaderScheduleLibraryScans }}</p>
      <ui-checkbox v-model="enableAutoScan" @input="toggleEnableAutoScan" :label="$strings.LabelEnable" medium checkbox-bg="bg" label-class="pl-2 text-base md:text-lg" />
    </div>
    <widgets-cron-expression-builder ref="cronExpressionBuilder" v-if="enableAutoScan" v-model="cronExpression" @input="updatedCron" />
    <div v-else>
      <p class="text-yellow-400 text-base">{{ $strings.MessageScheduleLibraryScanNote }}</p>
    </div>

    <!-- Full Audible Series Sync Schedule for book libraries -->
    <div v-if="isBookLibrary" class="mt-8 pt-6 border-t border-white/10">
      <div class="flex items-center justify-between mb-2">
        <div>
          <p class="text-base md:text-xl font-semibold">{{ $strings.HeaderScheduleAudibleFullScan || 'Schedule Full Audible Series Sync' }}</p>
          <p class="text-xs text-gray-400 mt-0.5">Fully scans all library series against Audible to update release dates and catalog missing books.</p>
        </div>
        <ui-checkbox v-model="enableAudibleFullScan" @input="toggleEnableAudibleFullScan" :label="$strings.LabelEnable" medium checkbox-bg="bg" label-class="pl-2 text-base md:text-lg" />
      </div>

      <div v-if="enableAudibleFullScan">
        <div class="flex items-center space-x-4 mb-3">
          <ui-dropdown v-model="audibleIntervalDays" @input="updatedAudibleIntervalDays" :label="$strings.LabelCadence || 'Cadence'" :items="intervalDaysOptions" class="w-64" />
        </div>
        <widgets-cron-expression-builder ref="audibleFullCronExpressionBuilder" v-model="audibleFullCronExpression" @input="updatedAudibleFullCron" />
      </div>
      <div v-else>
        <p class="text-yellow-400 text-base">{{ $strings.MessageScheduleAudibleFullScanNote || 'Scheduled full Audible series sync is disabled for this library. Series will only be fully synced when manually triggered.' }}</p>
      </div>
    </div>

    <!-- Quick Audible Series Sync Schedule for book libraries -->
    <div v-if="isBookLibrary" class="mt-8 pt-6 border-t border-white/10">
      <div class="flex items-center justify-between mb-2">
        <div>
          <p class="text-base md:text-xl font-semibold">{{ $strings.HeaderScheduleAudibleQuickScan || 'Schedule Quick Audible Series Sync' }}</p>
          <p class="text-xs text-gray-400 mt-0.5">Quickly scans only new series or series updated since the last scan date to conserve requests and CPU.</p>
        </div>
        <ui-checkbox v-model="enableAudibleQuickScan" @input="toggleEnableAudibleQuickScan" :label="$strings.LabelEnable" medium checkbox-bg="bg" label-class="pl-2 text-base md:text-lg" />
      </div>

      <widgets-cron-expression-builder ref="audibleQuickCronExpressionBuilder" v-if="enableAudibleQuickScan" v-model="audibleQuickCronExpression" @input="updatedAudibleQuickCron" />
      <div v-else>
        <p class="text-yellow-400 text-base">{{ $strings.MessageScheduleAudibleQuickScanNote || 'Scheduled quick Audible series sync is disabled for this library. Series will only be quick-synced when manually triggered.' }}</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    library: {
      type: Object,
      default: () => null
    },
    processing: Boolean
  },
  data() {
    return {
      cronExpression: null,
      enableAutoScan: false,
      audibleFullCronExpression: null,
      enableAudibleFullScan: false,
      audibleIntervalDays: 14,
      audibleQuickCronExpression: null,
      enableAudibleQuickScan: false
    }
  },
  computed: {
    isBookLibrary() {
      return this.library?.mediaType === 'book'
    },
    intervalDaysOptions() {
      return [
        { text: this.$strings.LabelCadenceEvery14Days || 'Every 14 Days (Bi-weekly) [Default]', value: 14 },
        { text: this.$strings.LabelCadenceEvery7Days || 'Every 7 Days (Weekly)', value: 7 },
        { text: this.$strings.LabelCadenceEvery28Days || 'Every 28 Days (Monthly)', value: 28 }
      ]
    }
  },
  methods: {
    checkBlurExpressionInput() {
      if (this.$refs.cronExpressionBuilder?.checkBlurExpressionInput()) return true
      if (this.$refs.audibleFullCronExpressionBuilder?.checkBlurExpressionInput()) return true
      if (this.$refs.audibleQuickCronExpressionBuilder?.checkBlurExpressionInput()) return true
      return false
    },
    toggleEnableAutoScan(v) {
      if (!v) this.updatedCron(null)
      else if (!this.cronExpression) {
        this.cronExpression = '0 0 * * 1'
        this.updatedCron(this.cronExpression)
      }
    },
    updatedCron(expression) {
      this.$emit('update', {
        settings: {
          autoScanCronExpression: expression
        }
      })
    },
    toggleEnableAudibleFullScan(v) {
      if (!v) {
        this.updatedAudibleFullCron(null)
      } else if (!this.audibleFullCronExpression) {
        this.audibleFullCronExpression = '0 3 * * 1'
        this.updatedAudibleFullCron(this.audibleFullCronExpression)
      }
    },
    updatedAudibleFullCron(expression) {
      this.$emit('update', {
        settings: {
          seriesScraperCron: expression,
          seriesScraperIntervalDays: this.audibleIntervalDays
        }
      })
    },
    updatedAudibleIntervalDays(days) {
      this.audibleIntervalDays = days
      this.$emit('update', {
        settings: {
          seriesScraperIntervalDays: days
        }
      })
    },
    toggleEnableAudibleQuickScan(v) {
      if (!v) {
        this.updatedAudibleQuickCron(null)
      } else if (!this.audibleQuickCronExpression) {
        this.audibleQuickCronExpression = '0 2 * * *'
        this.updatedAudibleQuickCron(this.audibleQuickCronExpression)
      }
    },
    updatedAudibleQuickCron(expression) {
      this.$emit('update', {
        settings: {
          seriesScraperQuickCron: expression
        }
      })
    },
    init() {
      this.cronExpression = this.library.settings.autoScanCronExpression
      this.enableAutoScan = !!this.cronExpression

      // Full Scan (Defaults to every 14 days on Monday at 3:00 AM)
      this.audibleFullCronExpression = this.library.settings.seriesScraperCron || (this.isBookLibrary ? '0 3 * * 1' : null)
      this.enableAudibleFullScan = !!this.audibleFullCronExpression
      this.audibleIntervalDays = this.library.settings.seriesScraperIntervalDays ? this.library.settings.seriesScraperIntervalDays : 14

      // Quick Scan (Defaults to daily at 2:00 AM)
      this.audibleQuickCronExpression = this.library.settings.seriesScraperQuickCron || (this.isBookLibrary ? '0 2 * * *' : null)
      this.enableAudibleQuickScan = !!this.audibleQuickCronExpression
    }
  },
  mounted() {
    this.init()
  }
}
</script>