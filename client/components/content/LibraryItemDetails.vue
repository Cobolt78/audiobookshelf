<template>
  <div>
    <div v-if="narrators?.length" class="flex py-0.5 mt-4">
      <div class="w-34 min-w-34 sm:w-34 sm:min-w-34 break-words">
        <span class="text-white/60 uppercase text-sm">{{ $strings.LabelNarrators }}</span>
      </div>
      <div class="max-w-[calc(100vw-10rem)] overflow-hidden text-ellipsis">
        <template v-for="(narrator, index) in narrators">
          <nuxt-link :key="narrator" :to="`/library/${libraryId}/bookshelf?filter=narrators.${$encode(narrator)}`" class="hover:underline">{{ narrator }}</nuxt-link
          ><span :key="index" v-if="index < narrators.length - 1">,&nbsp;</span>
        </template>
      </div>
    </div>
    <div v-if="publishedYear" role="paragraph" class="flex py-0.5">
      <div class="w-34 min-w-34 sm:w-34 sm:min-w-34 break-words">
        <span class="text-white/60 uppercase text-sm">{{ $strings.LabelPublishYear }}</span>
      </div>
      <div>
        {{ publishedYear }}
      </div>
    </div>
    <div v-if="publisher" role="paragraph" class="flex py-0.5">
      <div class="w-34 min-w-34 sm:w-34 sm:min-w-34 break-words">
        <span class="text-white/60 uppercase text-sm">{{ $strings.LabelPublisher }}</span>
      </div>
      <div>
        <nuxt-link :to="`/library/${libraryId}/bookshelf?filter=publishers.${$encode(publisher)}`" class="hover:underline">{{ publisher }}</nuxt-link>
      </div>
    </div>
    <div v-if="podcastType" role="paragraph" class="flex py-0.5">
      <div class="w-34 min-w-34 sm:w-34 sm:min-w-34 break-words">
        <span class="text-white/60 uppercase text-sm">{{ $strings.LabelPodcastType }}</span>
      </div>
      <div class="capitalize">
        {{ podcastType }}
      </div>
    </div>
    <div class="flex py-0.5" v-if="genres.length">
      <div class="w-34 min-w-34 sm:w-34 sm:min-w-34 break-words">
        <span class="text-white/60 uppercase text-sm">{{ $strings.LabelGenres }}</span>
      </div>
      <div class="max-w-[calc(100vw-10rem)] overflow-hidden text-ellipsis">
        <template v-for="(genre, index) in genres">
          <nuxt-link :key="genre" :to="`/library/${libraryId}/bookshelf?filter=genres.${$encode(genre)}`" class="hover:underline">{{ genre }}</nuxt-link
          ><span :key="index" v-if="index < genres.length - 1">,&nbsp;</span>
        </template>
      </div>
    </div>
    <div class="flex py-0.5" v-if="tags.length">
      <div class="w-34 min-w-34 sm:w-34 sm:min-w-34 break-words">
        <span class="text-white/60 uppercase text-sm">{{ $strings.LabelTags }}</span>
      </div>
      <div class="max-w-[calc(100vw-10rem)] overflow-hidden text-ellipsis">
        <template v-for="(tag, index) in tags">
          <nuxt-link :key="tag" :to="`/library/${libraryId}/bookshelf?filter=tags.${$encode(tag)}`" class="hover:underline">{{ tag }}</nuxt-link
          ><span :key="index" v-if="index < tags.length - 1">,&nbsp;</span>
        </template>
      </div>
    </div>
    <div v-if="language" class="flex py-0.5">
      <div class="w-34 min-w-34 sm:w-34 sm:min-w-34 break-words">
        <span class="text-white/60 uppercase text-sm">{{ $strings.LabelLanguage }}</span>
      </div>
      <div>
        <nuxt-link :to="`/library/${libraryId}/bookshelf?filter=languages.${$encode(language)}`" class="hover:underline">{{ language }}</nuxt-link>
      </div>
    </div>
    <div v-if="tracks.length || (isPodcast && totalPodcastDuration)" role="paragraph" class="flex py-0.5">
      <div class="w-34 min-w-34 sm:w-34 sm:min-w-34 break-words">
        <span class="text-white/60 uppercase text-sm">{{ $strings.LabelDuration }}</span>
      </div>
      <div>
        {{ durationPretty }}
      </div>
    </div>
    <div role="paragraph" class="flex py-0.5">
      <div class="w-34 min-w-34 sm:w-34 sm:min-w-34 break-words">
        <span class="text-white/60 uppercase text-sm">{{ $strings.LabelSize }}</span>
      </div>
      <div>
        {{ sizePretty }}
      </div>
    </div>
    <div v-if="bitratePretty" role="paragraph" class="flex py-0.5">
      <div class="w-34 min-w-34 sm:w-34 sm:min-w-34 break-words">
        <span class="text-white/60 uppercase text-sm">{{ $strings.LabelBitrate }}</span>
      </div>
      <div :title="bitrateTooltip">
        {{ bitratePretty }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    libraryItem: {
      type: Object,
      default: () => {}
    }
  },
  data() {
    return {}
  },
  computed: {
    libraryId() {
      return this.libraryItem.libraryId
    },
    isPodcast() {
      return this.libraryItem.mediaType === 'podcast'
    },
    media() {
      return this.libraryItem.media || {}
    },
    tracks() {
      return this.media.tracks || []
    },
    podcastEpisodes() {
      return this.media.episodes || []
    },
    mediaMetadata() {
      return this.media.metadata || {}
    },
    publishedYear() {
      return this.mediaMetadata.publishedYear
    },
    genres() {
      return this.mediaMetadata.genres || []
    },
    tags() {
      return this.media.tags || []
    },
    podcastAuthor() {
      return this.mediaMetadata.author || ''
    },
    authors() {
      return this.mediaMetadata.authors || []
    },
    publisher() {
      return this.mediaMetadata.publisher || ''
    },
    narrators() {
      return this.mediaMetadata.narrators || []
    },
    language() {
      return this.mediaMetadata.language || null
    },
    durationPretty() {
      if (this.isPodcast) return this.$elapsedPrettyExtended(this.totalPodcastDuration)

      if (!this.tracks.length && !this.audioFile) return 'N/A'
      if (this.audioFile) return this.$elapsedPrettyExtended(this.duration)
      return this.$elapsedPretty(this.duration)
    },
    duration() {
      if (!this.tracks.length && !this.audioFile) return 0
      return this.media.duration
    },
    totalPodcastDuration() {
      if (!this.podcastEpisodes.length) return 0
      let totalDuration = 0
      this.podcastEpisodes.forEach((ep) => (totalDuration += ep.duration || 0))
      return totalDuration
    },
    sizePretty() {
      return this.$bytesPretty(this.media.size)
    },
    podcastType() {
      return this.mediaMetadata.type
    },
    bitrateData() {
      if (this.isPodcast) return null
      const sourceTracks = this.tracks.length ? this.tracks : (this.media.audioFiles?.length ? this.media.audioFiles : [])
      if (!sourceTracks.length) return null

      const bitrates = []
      let totalBits = 0
      let totalDuration = 0

      for (const t of sourceTracks) {
        const br = t.bitRate || t.audioFile?.bitRate
        const dur = t.duration || 0
        if (br && typeof br === "number" && br > 0) {
          bitrates.push(br)
          if (dur > 0) {
            totalBits += br * dur
            totalDuration += dur
          }
        }
      }

      if (bitrates.length) {
        const minKbps = Math.round(Math.min(...bitrates) / 1000)
        const maxKbps = Math.round(Math.max(...bitrates) / 1000)
        const avgKbps = totalDuration > 0 ? Math.round(totalBits / totalDuration / 1000) : Math.round(bitrates.reduce((a, b) => a + b, 0) / bitrates.length / 1000)

        const isUniform = Math.abs(maxKbps - minKbps) <= 2
        return {
          pretty: isUniform ? `${avgKbps} kbps` : `~${avgKbps} kbps`,
          tooltip: isUniform ? null : `Tracks vary: ${minKbps}–${maxKbps} kbps (avg: ${avgKbps} kbps)`
        }
      }

      if (this.duration && this.media.size) {
        const calcKbps = Math.round((this.media.size * 8) / this.duration / 1000)
        if (calcKbps > 0) {
          return {
            pretty: `${calcKbps} kbps`,
            tooltip: null
          }
        }
      }

      return null
    },
    bitratePretty() {
      return this.bitrateData?.pretty || null
    },
    bitrateTooltip() {
      return this.bitrateData?.tooltip || null
    }
  },
  methods: {},
  mounted() {}
}
</script>
