<template>
  <div
    v-if="items.length === 0"
    class="nico-empty"
  >
    {{ emptyText ?? $t('nico.empty') }}
  </div>

  <ion-list v-else-if="displayMode === 'list'">
    <ion-item-sliding
      v-for="item in items"
      :key="item.videoId"
    >
      <ion-item
        button
        class="nico-item"
        @click="$emit('select', item.videoId)"
      >
        <ion-thumbnail slot="start">
          <img
            :src="item.thumbnailUrl || FALLBACK_THUMBNAIL"
            :alt="item.title"
            loading="lazy"
            @error="onImageError"
          />
        </ion-thumbnail>
        <ion-label>
          <h2>{{ item.title }}</h2>
          <p>{{ item.ownerName }}</p>
          <p class="nico-meta">{{ metaLine(item) }}</p>
        </ion-label>
      </ion-item>
      <ion-item-options
        v-if="removeLabel"
        side="end"
      >
        <ion-item-option
          color="danger"
          @click="$emit('remove', item)"
        >
          {{ removeLabel }}
        </ion-item-option>
      </ion-item-options>
    </ion-item-sliding>
  </ion-list>

  <div
    v-else
    class="nico-grid"
  >
    <div
      v-for="item in items"
      :key="item.videoId"
      class="nico-card"
      @click="$emit('select', item.videoId)"
    >
      <ion-card>
        <img
          :src="item.thumbnailUrl || FALLBACK_THUMBNAIL"
          :alt="item.title"
          loading="lazy"
          @error="onImageError"
        />
        <ion-card-header>
          <ion-card-title>{{ item.title }}</ion-card-title>
          <ion-card-subtitle>{{ item.ownerName }}</ion-card-subtitle>
        </ion-card-header>
        <div class="nico-meta nico-card-meta">{{ metaLine(item) }}</div>
      </ion-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  IonCard,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonThumbnail,
} from '@ionic/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatDuration, type NicoVideoCard } from '@/api/niconico'

const FALLBACK_THUMBNAIL = '/placeholder.png'

const props = defineProps<{
  items: NicoVideoCard[]
  mode?: 'list' | 'grid' | undefined
  emptyText?: string | undefined
  removeLabel?: string | undefined
}>()

const displayMode = computed(() => props.mode ?? 'list')

defineEmits<{
  select: [videoId: string]
  remove: [item: NicoVideoCard]
}>()

const { t } = useI18n()

function metaLine(item: NicoVideoCard): string {
  const parts = [formatDuration(item.durationSeconds), `${item.viewCount.toLocaleString()} ${t('nico.video.views')}`]

  if (item.commentCount > 0) {
    parts.push(`${item.commentCount.toLocaleString()} ${t('nico.video.comments')}`)
  }

  return parts.join(' ・ ')
}

function onImageError(event: Event) {
  const image = event.target as HTMLImageElement

  if (image.src.endsWith(FALLBACK_THUMBNAIL)) {
    return
  }

  image.src = FALLBACK_THUMBNAIL
  image.alt = t('aria.thumbnailNotAvailable')
}
</script>

<style scoped>
.nico-empty {
  margin: 1rem;
  font-size: 1.1rem;
  color: var(--ion-color-medium);
}

.nico-item {
  --min-height: 88px;
}

.nico-meta {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}

.nico-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: 0.1rem;
  padding: 0;
}

@media (min-width: 768px) {
  .nico-grid {
    grid-template-columns: repeat(4, minmax(100px, 1fr));
  }
}

.nico-card {
  margin: 3px;
  outline: 3px solid var(--video-outline-color);
}

.nico-card img {
  width: 100%;
  height: auto;
}

.nico-card-meta {
  padding: 0 1rem 0.75rem;
}

ion-thumbnail {
  --size: 120px;
  --border-radius: 4px;
}
</style>
