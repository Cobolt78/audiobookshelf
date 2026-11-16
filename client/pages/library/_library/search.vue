<template>
  <div class="page" :class="streamLibraryItem ? 'streaming' : ''">
    <app-book-shelf-toolbar is-home page="search" :search-query="query" />

    <!-- Expanded Single-Category Search Results View -->
    <div v-if="category" id="bookshelf" class="w-full max-w-full overflow-y-auto px-4 md:px-8 py-6" :style="{ fontSize: sizeMultiplier + 'rem' }">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-6 pb-3 border-b border-white/10">
        <div class="flex items-center space-x-3">
          <button
            type="button"
            class="inline-flex items-center px-3 py-1.5 rounded-md bg-bg hover:bg-white/10 border border-white/15 text-sm text-gray-200 hover:text-white transition-colors cursor-pointer"
            @click="clearCategory"
          >
            <span class="material-symbols text-base mr-1">arrow_back</span>
            <span>All Search Results</span>
          </button>
          <h1 class="text-xl md:text-2xl font-semibold text-white">
            {{ categoryLabel }}
            <span class="text-sm md:text-base font-normal text-gray-400 ml-1">({{ categoryItems.length }} {{ categoryItems.length === 1 ? 'result' : 'results' }})</span>
          </h1>
        </div>
      </div>

      <div v-if="loadingCategory" class="w-full py-16 flex items-center justify-center">
        <widgets-loading-spinner size="la-lg" />
      </div>
      <div v-else-if="!categoryItems.length" class="w-full py-16">
        <p class="text-xl text-center text-gray-300">{{ $getString('MessageNoSearchResultsFor', [query]) }}</p>
      </div>
      <div v-else class="flex flex-wrap gap-6 items-start pb-16">
        <template v-if="category === 'books' || category === 'podcasts' || category === 'episodes'">
          <cards-lazy-book-card
            v-for="(item, index) in categoryItems"
            :key="category === 'episodes' && item.recentEpisode ? item.recentEpisode.id : item.id"
            :index="index"
            :book-mount="item"
            :bookshelf-view="$constants.BookshelfView.DETAIL"
            class="relative!"
            @edit="editItem"
            @editPodcast="editItem"
          />
        </template>
        <template v-else-if="category === 'series'">
          <cards-lazy-series-card
            v-for="(seriesObj, index) in categoryItems"
            :key="seriesObj.id"
            :index="index"
            :series-mount="seriesObj"
            :bookshelf-view="$constants.BookshelfView.DETAIL"
            class="relative!"
          />
        </template>
        <template v-else-if="category === 'authors'">
          <cards-author-card
            v-for="author in categoryItems"
            :key="author.id"
            :author-mount="author"
            @edit="editAuthor"
          />
        </template>
        <template v-else-if="category === 'narrators'">
          <cards-narrator-card
            v-for="narrator in categoryItems"
            :key="narrator.name"
            :narrator="narrator"
          />
        </template>
        <template v-else-if="category === 'tags'">
          <cards-group-card
            v-for="tag in categoryItems"
            :key="tag.name"
            :group="tag"
          />
        </template>
      </div>

      <widgets-cover-size-widget class="fixed right-4 z-50" :style="{ bottom: streamLibraryItem ? '181px' : '16px' }" />
    </div>

    <!-- Grouped Search Shelves Overview -->
    <template v-else>
      <app-book-shelf-categorized v-if="hasResults" ref="bookshelf" search :results="results" />
      <div v-else class="w-full py-16">
        <p class="text-xl text-center">{{ $getString('MessageNoSearchResultsFor', [query]) }}</p>
      </div>
    </template>
  </div>
</template>

<script>
export default {
  async asyncData({ store, params, redirect, query, app }) {
    const libraryId = params.library
    const library = await store.dispatch('libraries/fetch', libraryId)
    if (!library) {
      return redirect('/oops?message=Library not found')
    }
    const category = query.category || null
    const limitParam = category ? `&limit=0&category=${encodeURIComponent(category)}` : ''
    let results = await app.$axios.$get(`/api/libraries/${libraryId}/search?q=${encodeURIComponent(query.q)}${limitParam}`).catch((error) => {
      console.error('Failed to search library', error)
      return null
    })
    results = {
      podcasts: results?.podcast || [],
      episodes: results?.episodes || [],
      books: results?.book || [],
      authors: results?.authors || [],
      series: results?.series || [],
      tags: results?.tags || [],
      narrators: results?.narrators || []
    }
    return {
      libraryId,
      results,
      query: query.q,
      category
    }
  },
  data() {
    return {
      loadingCategory: false
    }
  },
  watch: {
    '$route.query'(newVal) {
      const nextQ = newVal?.q || ''
      const nextCat = newVal?.category || null
      if ((nextQ && nextQ !== this.query) || nextCat !== this.category) {
        if (nextQ) this.query = nextQ
        this.category = nextCat
        this.search()
      }
    }
  },
  computed: {
    streamLibraryItem() {
      return this.$store.state.streamLibraryItem
    },
    sizeMultiplier() {
      return this.$store.getters['user/getSizeMultiplier']
    },
    hasResults() {
      return Object.values(this.results).find((r) => !!r && r.length)
    },
    categoryLabel() {
      const labels = {
        books: this.$strings.LabelBooks || 'Books',
        podcasts: this.$strings.LabelPodcasts || 'Podcasts',
        episodes: this.$strings.LabelEpisodes || 'Episodes',
        series: this.$strings.LabelSeries || 'Series',
        authors: this.$strings.LabelAuthors || 'Authors',
        narrators: this.$strings.LabelNarrators || 'Narrators',
        tags: this.$strings.LabelTags || 'Tags'
      }
      return labels[this.category] || this.category || ''
    },
    categoryItems() {
      if (!this.category) return []
      if (this.category === 'books') {
        return (this.results.books || []).map((res) => res.libraryItem)
      }
      if (this.category === 'podcasts') {
        return (this.results.podcasts || []).map((res) => res.libraryItem)
      }
      if (this.category === 'episodes') {
        return (this.results.episodes || []).map((res) => res.libraryItem)
      }
      if (this.category === 'series') {
        return (this.results.series || []).map((seriesObj) => ({
          ...seriesObj.series,
          books: seriesObj.books,
          type: 'series'
        }))
      }
      if (this.category === 'authors') {
        return (this.results.authors || []).map((a) => ({
          ...a,
          type: 'author'
        }))
      }
      if (this.category === 'narrators') {
        return (this.results.narrators || []).map((n) => ({
          ...n,
          type: 'narrator'
        }))
      }
      if (this.category === 'tags') {
        return (this.results.tags || []).map((t) => ({
          name: t.name,
          books: t.books || [],
          type: 'tags'
        }))
      }
      return []
    }
  },
  methods: {
    clearCategory() {
      this.$router.push(`/library/${this.libraryId}/search?q=${encodeURIComponent(this.query)}`).catch(() => {})
    },
    editItem(libraryItem, tab = 'details') {
      const itemIds = this.categoryItems.map((e) => e.id)
      this.$store.commit('setBookshelfBookIds', itemIds)
      this.$store.commit('showEditModalOnTab', { libraryItem, tab: tab || 'details' })
    },
    editAuthor(author) {
      this.$store.commit('globals/showEditAuthorModal', author)
    },
    async search() {
      this.loadingCategory = !!this.category
      const limitParam = this.category ? `&limit=0&category=${encodeURIComponent(this.category)}` : ''
      const results = await this.$axios
        .$get(`/api/libraries/${this.libraryId}/search?q=${encodeURIComponent(this.query)}${limitParam}`)
        .catch((error) => {
          console.error('Failed to search library', error)
          return null
        })
      this.loadingCategory = false
      this.results = {
        podcasts: results?.podcast || [],
        episodes: results?.episodes || [],
        books: results?.book || [],
        authors: results?.authors || [],
        series: results?.series || [],
        tags: results?.tags || [],
        narrators: results?.narrators || []
      }
      this.$nextTick(() => {
        if (this.$refs.bookshelf) {
          this.$refs.bookshelf.setShelvesFromSearch()
        }
      })
    }
  },
  mounted() {},
  beforeDestroy() {}
}
</script>
