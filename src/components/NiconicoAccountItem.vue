<template>
  <ion-item
    button
    @click="onItemClick"
  >
    <ion-label>
      <h2>{{ $t('nico.account.title') }}</h2>
      <p>{{ statusText }}</p>
      <p
        v-if="errorText"
        class="nico-account-error"
      >
        {{ errorText }}
      </p>
    </ion-label>
    <ion-button
      v-if="niconicoStore.isLoggedIn"
      slot="end"
      fill="clear"
      color="danger"
      @click.stop="niconicoStore.logout"
    >
      {{ $t('nico.account.logout') }}
    </ion-button>
  </ion-item>
</template>

<script setup lang="ts">
import { IonButton, IonItem, IonLabel, alertController } from '@ionic/vue'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNiconicoStore } from '@/stores/niconicoStore'

const { t } = useI18n()
const niconicoStore = useNiconicoStore()

const statusText = computed(() => {
  if (niconicoStore.isVerifying) {
    return t('menu.getLoading')
  }

  if (niconicoStore.isLoggedIn && niconicoStore.user) {
    const premium = niconicoStore.user.isPremium ? ` (${t('nico.account.premium')})` : ''

    return `${t('nico.account.loggedInAs', { name: niconicoStore.user.nickname })}${premium}`
  }

  return t('nico.account.notLoggedIn')
})

const errorText = computed(() =>
  niconicoStore.errorKey === null ? '' : t(niconicoStore.errorKey),
)

function onItemClick() {
  if (niconicoStore.isLoggedIn) {
    return
  }

  void presentLoginPrompt()
}

async function presentLoginPrompt() {
  const alert = await alertController.create({
    header: t('nico.account.title'),
    message: t('nico.account.sessionHelp'),
    inputs: [
      {
        name: 'session',
        type: 'textarea',
        placeholder: t('nico.account.sessionPlaceholder'),
      },
    ],
    buttons: [
      { text: t('menu.cancel'), role: 'cancel' },
      {
        text: t('nico.account.login'),
        role: 'confirm',
        handler: (data: unknown) => {
          void niconicoStore.login(readSession(data))
        },
      },
    ],
  })

  await alert.present()
}

function readSession(data: unknown): string {
  if (typeof data !== 'object' || data === null) {
    return ''
  }

  const value = (data as Record<string, unknown>)['session']

  return typeof value === 'string' ? value : ''
}

onMounted(() => {
  if (niconicoStore.session !== null) {
    void niconicoStore.verify()
  }
})
</script>

<style scoped>
.nico-account-error {
  color: var(--ion-color-danger);
}
</style>
