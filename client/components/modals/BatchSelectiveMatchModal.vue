<template>
  <modals-modal v-model="show" name="batchSelectiveMatch" :processing="processing" :width="620" :height="'unset'">
    <template #outer>
      <div class="absolute top-0 left-0 p-5 w-4/5 overflow-hidden">
        <p class="text-2xl md:text-3xl text-white truncate">{{ title }}</p>
      </div>
    </template>

    <div ref="container" class="w-full rounded-lg bg-bg box-shadow-md overflow-y-auto overflow-x-hidden" style="max-height: 85vh">
      <div v-if="show" class="w-full h-full py-5 px-6 md:px-8 space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center space-x-3">
            <p class="text-sm font-medium text-gray-200">{{ $strings.LabelProvider }}</p>
            <ui-dropdown v-model="provider" :items="providers" small class="w-44" />
          </div>
          <div class="flex items-center space-x-2 text-xs">
            <button type="button" class="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-gray-200 cursor-pointer transition-colors" @click="selectAllFields">Select All</button>
            <button type="button" class="px-2.5 py-1 rounded bg-white/10 hover:bg-white/20 text-gray-200 cursor-pointer transition-colors" @click="clearAllFields">Clear All</button>
          </div>
        </div>

        <div class="border border-white/10 rounded-md p-3 bg-black/20">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold uppercase tracking-wider text-gray-300">Fields to Match</p>
            <span class="text-xs text-gray-400">{{ selectedFields.length }} of {{ availableFields.length }} selected</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            <label
              v-for="field in availableFields"
              :key="field.key"
              class="flex items-center space-x-2 text-sm text-gray-200 hover:text-white cursor-pointer select-none py-0.5"
            >
              <input
                v-model="selectedFields"
                type="checkbox"
                :value="field.key"
                class="w-4 h-4 rounded accent-success cursor-pointer"
              />
              <span class="truncate">{{ field.label }}</span>
            </label>
          </div>
        </div>

        <p class="text-xs text-gray-300 leading-relaxed">
          Only checked fields will be updated. <strong>Unchecked fields are strictly ignored</strong> (never added or overwritten, even if currently blank).
        </p>

        <div class="flex items-center py-1">
          <ui-toggle-switch v-model="overrideExisting" />
          <div class="pl-3">
            <p class="text-sm text-gray-100">Overwrite existing values on checked fields</p>
            <p class="text-xs text-gray-400">When off, checked fields are only filled in if currently empty.</p>
          </div>
        </div>

        <div v-if="isLibraryMode" class="rounded-md border p-3 text-xs space-y-2" :class="hasSkipSettingsEnabled ? 'border-amber-500/40 bg-amber-950/30 text-amber-100' : 'border-white/10 bg-black/20 text-gray-300'">
          <template v-if="hasSkipSettingsEnabled">
            <div class="flex items-start space-x-2">
              <span class="material-symbols text-base text-amber-400 shrink-0 mt-0.5">warning</span>
              <div>
                <p class="font-semibold text-amber-200">Library Skip Setting Active ({{ activeSkipLabels.join(' & ') }})</p>
                <p class="text-amber-100/80 mt-0.5 leading-relaxed">
                  Under <strong>Settings → Libraries → Edit</strong>, this library skips matching any book that already has {{ activeSkipTargetText }}. Those books will be skipped unless you enable the override below.
                </p>
              </div>
            </div>
            <div class="flex items-center pt-1">
              <ui-toggle-switch v-model="ignoreSkipAsinIsbn" />
              <p class="pl-3 text-xs font-medium text-white">Override skip setting (re-match books that already have an ASIN / ISBN)</p>
            </div>
          </template>
          <template v-else>
            <p class="text-gray-300">
              Library Settings: <strong>Skip matching books with ASIN / ISBN</strong> are disabled, so all books in this library will be matched.
            </p>
          </template>
        </div>

        <div class="pt-3 border-t border-white/10 flex items-center justify-between">
          <ui-btn type="button" @click="show = false">{{ $strings.ButtonCancel }}</ui-btn>
          <div class="flex items-center space-x-3">
            <span v-if="!selectedFields.length" class="text-xs text-error">Select at least 1 field</span>
            <ui-btn color="bg-success" :disabled="!selectedFields.length || processing" @click="submit">
              {{ $strings.ButtonSubmit }}
            </ui-btn>
          </div>
        </div>
      </div>
    </div>
  </modals-modal>
</template>

<script>
const STORAGE_FIELDS_KEY = 'abs_selective_match_fields'
const STORAGE_OVERRIDE_KEY = 'abs_selective_match_override'
const DEFAULT_SELECTED_FIELDS = ['cover', 'description', 'author', 'narrator']

const MATCH_FIELDS = [
  { key: 'cover', label: 'Cover Art' },
  { key: 'description', label: 'Description / Summary' },
  { key: 'author', label: 'Author' },
  { key: 'narrator', label: 'Narrator' },
  { key: 'title', label: 'Title' },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'series', label: 'Series' },
  { key: 'publisher', label: 'Publisher' },
  { key: 'publishedYear', label: 'Publish Year' },
  { key: 'genres', label: 'Genres' },
  { key: 'tags', label: 'Tags' },
  { key: 'language', label: 'Language' },
  { key: 'asin', label: 'ASIN' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'explicit', label: 'Explicit' },
  { key: 'abridged', label: 'Abridged' }
]

export default {
  data() {
    return {
      processing: false,
      provider: 'google',
      selectedFields: [...DEFAULT_SELECTED_FIELDS],
      overrideExisting: true,
      ignoreSkipAsinIsbn: false
    }
  },
  watch: {
    selectiveMatchConfig(newVal) {
      if (newVal) {
        this.init()
      }
    }
  },
  computed: {
    selectiveMatchConfig() {
      return this.$store.state.globals.selectiveMatchConfig
    },
    show: {
      get() {
        return !!this.selectiveMatchConfig
      },
      set(val) {
        if (!val) {
          this.$store.commit('globals/setSelectiveMatchConfig', null)
        }
      }
    },
    isLibraryMode() {
      return this.selectiveMatchConfig?.mode === 'library'
    },
    selectedBookIds() {
      return this.selectiveMatchConfig?.libraryItemIds || []
    },
    targetLibrary() {
      if (this.selectiveMatchConfig?.library) {
        return this.selectiveMatchConfig.library
      }
      return this.$store.getters['libraries/getCurrentLibrary']
    },
    providers() {
      return this.$store.state.scanners.bookProviders
    },
    availableFields() {
      return MATCH_FIELDS
    },
    skipAsinEnabled() {
      return !!this.targetLibrary?.settings?.skipMatchingMediaWithAsin
    },
    skipIsbnEnabled() {
      return !!this.targetLibrary?.settings?.skipMatchingMediaWithIsbn
    },
    hasSkipSettingsEnabled() {
      return this.skipAsinEnabled || this.skipIsbnEnabled
    },
    activeSkipLabels() {
      const labels = []
      if (this.skipAsinEnabled) labels.push('Skip ASIN')
      if (this.skipIsbnEnabled) labels.push('Skip ISBN')
      return labels
    },
    activeSkipTargetText() {
      if (this.skipAsinEnabled && this.skipIsbnEnabled) return 'an ASIN or ISBN'
      if (this.skipAsinEnabled) return 'an ASIN'
      return 'an ISBN'
    },
    title() {
      if (!this.selectiveMatchConfig) return ''
      if (this.isLibraryMode) {
        return `Match Books (Select Fields) — ${this.targetLibrary?.name || 'Library'}`
      }
      if (this.selectiveMatchConfig.label) {
        return `${this.selectiveMatchConfig.label} — Match (Select Fields) (${this.selectedBookIds.length})`
      }
      return `Match (Select Fields) — ${this.selectedBookIds.length} Selected`
    }
  },
  methods: {
    init() {
      this.$store.dispatch('scanners/fetchProviders')
      this.provider = this.targetLibrary?.provider || 'google'
      this.ignoreSkipAsinIsbn = false

      try {
        const savedFields = localStorage.getItem(STORAGE_FIELDS_KEY)
        if (savedFields) {
          const parsed = JSON.parse(savedFields)
          if (Array.isArray(parsed)) {
            const validKeys = new Set(MATCH_FIELDS.map((f) => f.key))
            this.selectedFields = parsed.filter((k) => validKeys.has(k))
          }
        }
        const savedOverride = localStorage.getItem(STORAGE_OVERRIDE_KEY)
        if (savedOverride !== null) {
          this.overrideExisting = savedOverride === 'true'
        }
      } catch (err) {
        console.warn('Could not read selective match preferences from localStorage', err)
      }
    },
    savePreferences() {
      try {
        localStorage.setItem(STORAGE_FIELDS_KEY, JSON.stringify(this.selectedFields))
        localStorage.setItem(STORAGE_OVERRIDE_KEY, String(this.overrideExisting))
      } catch (err) {
        console.warn('Could not persist selective match preferences', err)
      }
    },
    selectAllFields() {
      this.selectedFields = MATCH_FIELDS.map((f) => f.key)
    },
    clearAllFields() {
      this.selectedFields = []
    },
    async submit() {
      if (!this.selectedFields.length || this.processing) return
      this.savePreferences()

      if (this.isLibraryMode) {
        if (!this.targetLibrary?.id) return
        this.processing = true
        try {
          await this.$axios.$post(`/api/libraries/${this.targetLibrary.id}/matchall`, {
            provider: this.provider,
            selectedFields: this.selectedFields,
            overrideExisting: this.overrideExisting,
            ignoreSkipAsinIsbn: this.ignoreSkipAsinIsbn
          })
          this.$toast.info(`Selective match started for "${this.targetLibrary.name}"`)
          this.show = false
        } catch (error) {
          console.error('Failed to start selective library match', error)
          const errMsg = error.response?.data || 'Match Books (Select Fields) failed'
          this.$toast.error(errMsg)
        } finally {
          this.processing = false
        }
        return
      }

      if (!this.selectedBookIds.length) return
      this.processing = true
      this.$store.commit('setProcessingBatch', true)
      try {
        await this.$axios.$post(`/api/items/batch/quickmatch`, {
          options: {
            provider: this.provider,
            selectedFields: this.selectedFields,
            overrideExisting: this.overrideExisting
          },
          libraryItemIds: this.selectedBookIds
        })
        this.$toast.info(this.$getString('ToastBatchQuickMatchStarted', [this.selectedBookIds.length]))
        this.show = false
      } catch (error) {
        console.error('Failed to batch selective match', error)
        this.$toast.error(this.$strings.ToastBatchQuickMatchFailed)
      } finally {
        this.processing = false
        this.$store.commit('setProcessingBatch', false)
      }
    }
  }
}
</script>
