<template>
  <div class="w-full h-full px-1 md:px-4 py-1 mb-4">
    <div class="flex items-center justify-between mb-4">
      <p class="text-base md:text-xl font-semibold">{{ $strings.HeaderScheduleLibraryScans }}</p>
      <ui-checkbox v-model="enableAutoScan" @input="toggleEnableAutoScan" :label="$strings.LabelEnable" medium checkbox-bg="bg" label-class="pl-2 text-base md:text-lg" />
    </div>
    <widgets-cron-expression-builder ref="cronExpressionBuilder" v-if="enableAutoScan" v-model="cronExpression" @input="updatedCron" />
    <div v-else>
      <p class="text-yellow-400 text-base">{{ $strings.MessageScheduleLibraryScanNote }}</p>
    </div>

    <!-- Audible Series Sync Schedule for book libraries -->
    <div v-if="isBookLibrary" class="mt-8 pt-6 border-t border-white/10">
      <div class="flex items-center justify-between mb-4">
        <p class="text-base md:text-xl font-semibold">{{ $strings.HeaderScheduleAudibleScan || 'Schedule Audible Series Sync' }}</p>
        <ui-checkbox v-model="enableAudibleScan" @input="toggleEnableAudibleScan" :label="$strings.LabelEnable" medium checkbox-bg="bg" label-class="pl-2 text-base md:text-lg" />
      </div>
      <widgets-cron-expression-builder ref="audibleCronExpressionBuilder" v-if="enableAudibleScan" v-model="audibleCronExpression" @input="updatedAudibleCron" />
      <div v-else>
        <p class="text-yellow-400 text-base">{{ $strings.MessageScheduleAudibleScanNote || 'Scheduled Audible series sync is disabled for this library. Series will only be scanned manually.' }}</p>
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
      audibleCronExpression: null,
      enableAudibleScan: false
    }
  },
  computed: {
    isBookLibrary() {
      return this.library?.mediaType === 'book'
    }
  },
  methods: {
    checkBlurExpressionInput() {
      // returns true if advanced cron input is focused
      if (this.$refs.cronExpressionBuilder?.checkBlurExpressionInput()) return true
      if (this.$refs.audibleCronExpressionBuilder?.checkBlurExpressionInput()) return true
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
    toggleEnableAudibleScan(v) {
      if (!v) this.updatedAudibleCron(null)
      else if (!this.audibleCronExpression) {
        this.audibleCronExpression = '0 3 * * 1'
        this.updatedAudibleCron(this.audibleCronExpression)
      }
    },
    updatedAudibleCron(expression) {
      this.$emit('update', {
        settings: {
          seriesScraperCron: expression
        }
      })
    },
    init() {
      this.cronExpression = this.library.settings.autoScanCronExpression
      this.enableAutoScan = !!this.cronExpression
      this.audibleCronExpression = this.library.settings.seriesScraperCron || (this.isBookLibrary ? '0 3 * * 1' : null)
      this.enableAudibleScan = !!this.audibleCronExpression
    }
  },
  mounted() {
    this.init()
  }
}
</script>