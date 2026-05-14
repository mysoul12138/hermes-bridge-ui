<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NInput, NModal, NSpin, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { fetchSessions, searchSessions, type SessionSearchResult, type SessionSummary } from '@/api/hermes/sessions'
import { fetchConversationSummaries, type ConversationSummary } from '@/api/hermes/conversations'
import { useChatStore } from '@/stores/hermes/chat'
import { useSessionSearch } from '@/composables/useSessionSearch'

const { t } = useI18n()
const message = useMessage()
const router = useRouter()
const chatStore = useChatStore()
const { sessionSearchOpen } = useSessionSearch()

const query = ref('')
const loading = ref(false)
type RecentSession = SessionSummary | ConversationSummary
const recentSessions = ref<RecentSession[]>([])
const searchResults = ref<SessionSearchResult[]>([])
const activeIndex = ref(0)
const inputRef = ref<InstanceType<typeof NInput> | null>(null)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let requestSeq = 0

type SearchItem = SessionSearchResult | (SessionSummary & {
  snippet?: string
  matched_message_id: number | null
  rank: number
}) | (ConversationSummary & {
  snippet?: string
  matched_message_id: number | null
  rank: number
})
type ChatStoreSession = typeof chatStore.sessions[number]

const hasQuery = computed(() => query.value.trim().length > 0)

const items = computed<SearchItem[]>(() => {
  if (hasQuery.value) return searchResults.value
  return recentSessions.value.map(session => ({
    ...session,
    matched_message_id: null,
    snippet: session.preview || '',
    rank: 0,
  }))
})

function formatSource(source: string): string {
  const map: Record<string, string> = {
    api_server: 'API Server',
    cli: 'CLI',
    telegram: 'Telegram',
    discord: 'Discord',
    slack: 'Slack',
    matrix: 'Matrix',
    whatsapp: 'WhatsApp',
    signal: 'Signal',
    cron: 'Cron',
    weixin: 'WeChat',
  }
  return map[source] || source
}

function formatTime(ts?: number): string {
  if (!ts) return ''
  const date = new Date(ts * 1000)
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getItemTitle(item: SearchItem): string {
  const title = item.title?.trim()
  if (title) return title
  if (item.preview?.trim()) return item.preview.trim()
  return item.id
}

function looksLikeContinuationPrompt(text: string | null | undefined): boolean {
  const normalized = (text || '').replace(/\s+/g, ' ').trim().toLowerCase()
  return normalized.startsWith('previous conversation context:')
    || normalized.startsWith('current user message:')
}

async function loadRecentSessions() {
  const seq = ++requestSeq
  loading.value = true
  try {
    let sessions: RecentSession[]
    try {
      sessions = await fetchConversationSummaries({ humanOnly: true, limit: 8 })
    } catch {
      sessions = await fetchSessions(undefined, 8)
    }
    if (seq !== requestSeq) return
    recentSessions.value = sessions
    searchResults.value = []
    activeIndex.value = 0
  } catch (err) {
    if (seq !== requestSeq) return
    message.error(err instanceof Error ? err.message : t('chat.searchFailed'))
  } finally {
    if (seq === requestSeq) {
      loading.value = false
    }
  }
}

async function runSearch(text: string) {
  const seq = ++requestSeq
  loading.value = true
  try {
    const results = text.trim()
      ? await searchSessions(text.trim(), undefined, 10)
      : []
    if (seq !== requestSeq) return
    searchResults.value = results
    activeIndex.value = 0
  } catch (err) {
    if (seq !== requestSeq) return
    message.error(err instanceof Error ? err.message : t('chat.searchFailed'))
  } finally {
    if (seq === requestSeq) {
      loading.value = false
    }
  }
}

async function ensureChatSessionsLoaded() {
  if (chatStore.sessions.length === 0) {
    await chatStore.loadSessions()
  }
}

async function openItem(item: SearchItem) {
  const messageId = item.matched_message_id != null ? String(item.matched_message_id) : null
  sessionSearchOpen.value = false

  await ensureChatSessionsLoaded()
  let targetSession: ChatStoreSession | null = chatStore.sessions.find(session =>
    session.id === item.id || (session.representedSessionIds || [session.id]).includes(item.id),
  ) || null
  let targetId = targetSession?.id || item.id

  const shouldResolveViaSummaries = !targetSession || looksLikeContinuationPrompt(targetSession.title) || looksLikeContinuationPrompt(getItemTitle(item))
  if (shouldResolveViaSummaries) {
    try {
      const summaries = await fetchConversationSummaries({ humanOnly: true, limit: 2000 })
      const mapped = summaries.find(summary => (summary.represented_session_ids || [summary.id]).includes(item.id))
      if (mapped) {
        targetId = mapped.id
        targetSession = chatStore.sessions.find(session => session.id === mapped.id) || null
        if (!targetSession) {
          const fallbackSession: ChatStoreSession = {
            id: mapped.id,
            title: mapped.title || mapped.preview || mapped.id,
            source: mapped.source,
            messages: [],
            createdAt: Math.round((mapped.started_at || 0) * 1000) || Date.now(),
            updatedAt: Math.round((mapped.last_active || mapped.started_at || 0) * 1000) || Date.now(),
            model: mapped.model,
            provider: mapped.billing_provider || undefined,
            billingBaseUrl: mapped.billing_base_url || undefined,
            messageCount: mapped.message_count,
            inputTokens: mapped.input_tokens,
            outputTokens: mapped.output_tokens,
            endedAt: mapped.ended_at != null ? Math.round(mapped.ended_at * 1000) : null,
            lastActiveAt: mapped.last_active ? Math.round(mapped.last_active * 1000) : undefined,
            branchSessionCount: mapped.branch_session_count,
            representedSessionIds: mapped.represented_session_ids || [mapped.id],
          }
          chatStore.sessions.unshift(fallbackSession)
          targetSession = fallbackSession
        }
      }
    } catch {
      // Fall back to the current chat store session map when summaries fail.
    }
  }

  if (!targetSession) {
    await chatStore.loadSessions()
    targetSession = chatStore.sessions.find(session =>
      session.id === targetId || (session.representedSessionIds || [session.id]).includes(item.id),
    ) || null
  }
  if (!targetSession) {
    const fallbackSession: ChatStoreSession = {
      id: targetId,
      title: getItemTitle(item),
      source: item.source,
      messages: [],
      createdAt: Math.round((item.started_at || 0) * 1000) || Date.now(),
      updatedAt: Math.round((item.last_active || item.started_at || 0) * 1000) || Date.now(),
      model: item.model,
      provider: item.billing_provider || undefined,
      billingBaseUrl: item.billing_base_url || undefined,
      messageCount: item.message_count,
      inputTokens: item.input_tokens,
      outputTokens: item.output_tokens,
      endedAt: item.ended_at != null ? Math.round(item.ended_at * 1000) : null,
      lastActiveAt: item.last_active ? Math.round(item.last_active * 1000) : undefined,
      representedSessionIds: [targetId, item.id],
    }
    chatStore.sessions.unshift(fallbackSession)
    targetSession = fallbackSession
  }
  const finalTargetId = targetSession ? targetSession.id : targetId
  await chatStore.switchSession(finalTargetId, messageId)
  if (router.currentRoute.value.name !== 'hermes.chat') {
    await router.push({ name: 'hermes.chat' })
  }
}

function closeModal() {
  sessionSearchOpen.value = false
}

function moveSelection(delta: number) {
  const list = items.value
  if (list.length === 0) return
  const next = activeIndex.value + delta
  activeIndex.value = (next + list.length) % list.length
}

async function handleKeydown(e: KeyboardEvent) {
  if (!sessionSearchOpen.value) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    moveSelection(1)
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    moveSelection(-1)
    return
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    const item = items.value[activeIndex.value]
    if (item) {
      await openItem(item)
    }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    closeModal()
  }
}

watch(
  () => sessionSearchOpen.value,
  async (open) => {
    if (!open) {
      query.value = ''
      searchResults.value = []
      recentSessions.value = []
      activeIndex.value = 0
      return
    }

    query.value = ''
    searchResults.value = []
    activeIndex.value = 0
    await loadRecentSessions()
    await nextTick()
    inputRef.value?.focus?.()
  },
)

watch(query, (value) => {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  debounceTimer = setTimeout(() => {
    if (!sessionSearchOpen.value) return
    void runSearch(value)
  }, 160)
})

watch(items, () => {
  if (activeIndex.value >= items.value.length) {
    activeIndex.value = 0
  }
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
})
</script>

<template>
  <NModal
    v-model:show="sessionSearchOpen"
    preset="card"
    :title="t('chat.searchTitle')"
    :style="{ width: 'min(760px, calc(100vw - 24px))' }"
    :mask-closable="true"
    :auto-focus="false"
  >
    <div class="session-search-modal">
      <div class="search-header">
        <div class="search-title">{{ t('chat.searchSubtitle') }}</div>
        <div class="search-hint">{{ t('chat.searchHint') }}</div>
      </div>

      <NInput
        ref="inputRef"
      v-model:value="query"
      :placeholder="t('chat.searchPlaceholder')"
      clearable
      size="large"
    />

      <div class="search-body">
        <NSpin :show="loading">
          <div v-if="items.length === 0" class="search-empty">
            {{ hasQuery ? t('chat.searchNoResults') : t('chat.searchEmpty') }}
          </div>
          <div v-else class="result-list">
            <button
              v-for="(item, idx) in items"
              :key="item.id"
              class="result-item"
              :class="{ active: idx === activeIndex }"
              @click="openItem(item)"
              @mouseenter="activeIndex = idx"
            >
              <div class="result-main">
                <div class="result-title-row">
                  <span class="result-title">{{ getItemTitle(item) }}</span>
                  <span class="result-source">{{ formatSource(item.source) }}</span>
                </div>
                <div class="result-snippet">
                  {{ hasQuery ? item.snippet || t('chat.searchNoSnippet') : item.preview || t('chat.searchRecent') }}
                </div>
              </div>
              <div class="result-meta">
                <span class="result-time">{{ formatTime(item.last_active || item.started_at) }}</span>
                <span v-if="hasQuery && item.matched_message_id != null" class="result-match">
                  #{{ item.matched_message_id }}
                </span>
              </div>
            </button>
          </div>
        </NSpin>
      </div>

      <div class="search-footer">
        <span>{{ t('chat.searchEnterHint') }}</span>
        <NButton quaternary size="small" @click="closeModal">{{ t('common.cancel') }}</NButton>
      </div>
    </div>
  </NModal>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.session-search-modal {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.search-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.search-title {
  font-size: 14px;
  font-weight: 600;
  color: $text-primary;
}

.search-hint {
  font-size: 12px;
  color: $text-muted;
}

.search-body {
  max-height: min(60vh, 540px);
  overflow: hidden;
}

.search-empty {
  padding: 28px 0;
  text-align: center;
  color: $text-muted;
  font-size: 13px;
}

.result-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(60vh, 540px);
  overflow-y: auto;
  padding-right: 2px;
}

.result-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: $bg-card;
  color: $text-primary;
  text-align: left;
  cursor: pointer;
  transition: border-color $transition-fast, background-color $transition-fast, transform $transition-fast;

  &:hover,
  &.active {
    border-color: $accent-muted;
    background: rgba(var(--accent-primary-rgb), 0.04);
  }
}

.result-main {
  flex: 1;
  min-width: 0;
}

.result-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.result-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-source {
  flex-shrink: 0;
  font-size: 11px;
  color: $text-muted;
}

.result-snippet {
  margin-top: 4px;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.result-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  font-size: 11px;
  color: $text-muted;
  flex-shrink: 0;
}

.result-match {
  font-family: $font-code;
}

.search-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: $text-muted;
}

@media (max-width: $breakpoint-mobile) {
  :deep(.n-modal-body-wrapper) {
    width: calc(100vw - 24px);
  }

  .search-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .result-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .result-meta {
    align-items: flex-start;
    flex-direction: row;
    flex-wrap: wrap;
  }
}
</style>
