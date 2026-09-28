import type { ProviderSettings } from "../shared/settings"
import {
  normalizeSlackMessageId,
  type RawSlackMessage,
  type ThreadContextPlan,
} from "../shared/types"

type TranslationCacheEntry = {
  id: string
  translation: string
  createdAt: number
}

const DATABASE_NAME = "slacktor"
const STORE_NAME = "translations"
const DATABASE_VERSION = 5
const TRANSLATION_CACHE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Defines the milestone version that requires clearing the translation cache.
 *
 * HOW IT WORKS:
 * - When releasing a version that requires wiping old cached translations (e.g. 0.1.7 due to
 *   cache key cleanup and token optimizations), set this constant to that version: "0.1.7".
 * - When releasing subsequent versions that DO NOT require clearing cache (e.g. 0.1.8),
 *   leave this constant as "0.1.7". Existing caches will be preserved!
 * - If a future release (e.g. 0.2.0) requires wiping cache again, simply update this to "0.2.0".
 */
export const LAST_CACHE_RESET_VERSION = "0.1.7"

export async function checkAndMigrateTranslationCache(): Promise<{
  cacheCleared: boolean
  isVersionUpgrade: boolean
}> {
  const currentVersion = chrome.runtime.getManifest().version
  const stored = await chrome.storage.local.get([
    "lastClearedCacheVersion",
    "lastKnownExtensionVersion",
  ])

  const isVersionUpgrade = Boolean(
    stored.lastKnownExtensionVersion && stored.lastKnownExtensionVersion !== currentVersion,
  )

  let cacheCleared = false
  if (stored.lastClearedCacheVersion !== LAST_CACHE_RESET_VERSION) {
    await clearTranslationCache()
    await chrome.storage.local.set({ lastClearedCacheVersion: LAST_CACHE_RESET_VERSION })
    cacheCleared = true
  }

  if (stored.lastKnownExtensionVersion !== currentVersion) {
    await chrome.storage.local.set({ lastKnownExtensionVersion: currentVersion })
  }

  return { cacheCleared, isVersionUpgrade }
}

export async function getCachedTranslation(
  message: RawSlackMessage,
  settings: ProviderSettings,
  context: ThreadContextPlan = { recentMessages: [] },
): Promise<string | undefined> {
  const id = getTranslationCacheId(message, settings)
  let entry = await getEntry(id)
  if (!entry) {
    entry = await getEntry(getLegacyTranslationCacheId(message, settings, context))
    if (entry && entry.createdAt + TRANSLATION_CACHE_RETENTION_MS > Date.now()) {
      const database = await openDatabase()
      entry = { ...entry, id }
      await transaction(database, "readwrite", (store) => store.put(entry!))
    }
  }
  if (!entry) return undefined
  if (entry.createdAt + TRANSLATION_CACHE_RETENTION_MS > Date.now()) return entry.translation

  const database = await openDatabase()
  await transaction(database, "readwrite", (store) => store.delete(id))
  return undefined
}

let writesSinceCacheCleanup = 0
let lastCacheCleanupAt = 0
const CLEANUP_CACHE_WRITE_INTERVAL = 50
const CLEANUP_CACHE_INTERVAL_MS = 15 * 60 * 1000

export async function cacheTranslation(
  message: RawSlackMessage,
  settings: ProviderSettings,
  translation: string,
  _context: ThreadContextPlan = { recentMessages: [] },
): Promise<void> {
  const database = await openDatabase()
  const entry: TranslationCacheEntry = {
    id: getTranslationCacheId(message, settings),
    translation,
    createdAt: Date.now(),
  }

  await transaction(database, "readwrite", (store) => store.put(entry))

  writesSinceCacheCleanup += 1
  if (
    writesSinceCacheCleanup >= CLEANUP_CACHE_WRITE_INTERVAL ||
    Date.now() - lastCacheCleanupAt >= CLEANUP_CACHE_INTERVAL_MS
  ) {
    writesSinceCacheCleanup = 0
    lastCacheCleanupAt = Date.now()
    void cleanupExpiredTranslations()
  }
}

export async function cleanupExpiredTranslations(): Promise<void> {
  try {
    const database = await openDatabase()
    const cutoff = Date.now() - TRANSLATION_CACHE_RETENTION_MS
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite")
      const store = tx.objectStore(STORE_NAME)
      const request = store.openCursor()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const cursor = request.result
        if (cursor) {
          const entry = cursor.value as TranslationCacheEntry
          if (entry.createdAt < cutoff) {
            cursor.delete()
          }
          cursor.continue()
        } else {
          resolve()
        }
      }
    })
  } catch {
    // Periodic background cleanup failure should not affect active user workflow
  }
}

export async function clearTranslationCache(): Promise<void> {
  const database = await openDatabase()
  await transaction(database, "readwrite", (store) => store.clear())
}

export function getTranslationCacheId(
  message: RawSlackMessage,
  settings: ProviderSettings,
): string {
  // Thread context is deliberately excluded. Slacktor rebuilds it while Slack
  // virtualizes the channel, so including it makes the same translation miss
  // cache after every extension or page reload. Retranslate uses forceRefresh
  // when the user explicitly wants a context-aware update.
  return stableHash(
    [
      message.workspaceId ?? "",
      message.conversationId ?? "",
      normalizeSlackMessageId(message.timestamp ?? message.messageId),
      message.sourceText,
      settings.baseUrl,
      settings.model,
      settings.targetLanguage,
      settings.customPrompt,
    ].join("\u0000"),
  )
}

function getLegacyTranslationCacheId(
  message: RawSlackMessage,
  settings: ProviderSettings,
  context: ThreadContextPlan,
): string {
  return stableHash(
    [
      message.workspaceId ?? "",
      message.conversationId ?? "",
      message.messageId,
      message.sourceText,
      settings.baseUrl,
      settings.model,
      settings.targetLanguage,
      settings.customPrompt,
      context.summary ?? "",
      context.recentMessages
        .map((item) => `${item.messageId}\u0001${item.timestamp}\u0001${item.sourceText}`)
        .join("\u0002"),
    ].join("\u0000"),
  )
}

const FNV64_OFFSET = 0xcbf29ce484222325n
const FNV64_PRIME = 0x100000001b3n

function stableHash(value: string): string {
  let hash = FNV64_OFFSET
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index))
    hash = (hash * FNV64_PRIME) & 0xffffffffffffffffn
  }
  return `v2-${hash.toString(16).padStart(16, "0")}`
}

async function getEntry(id: string): Promise<TranslationCacheEntry | undefined> {
  const database = await openDatabase()
  return transaction(database, "readonly", (store) => store.get(id)) as Promise<
    TranslationCacheEntry | undefined
  >
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" })
      }
      if (!request.result.objectStoreNames.contains("context-messages")) {
        const contextStore = request.result.createObjectStore("context-messages", { keyPath: "id" })
        contextStore.createIndex("threadKey", "threadKey", { unique: false })
      }
      if (!request.result.objectStoreNames.contains("context-threads")) {
        request.result.createObjectStore("context-threads", { keyPath: "threadKey" })
      }
      if (!request.result.objectStoreNames.contains("thread-summaries")) {
        request.result.createObjectStore("thread-summaries", { keyPath: "threadKey" })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function transaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = operation(database.transaction(STORE_NAME, mode).objectStore(STORE_NAME))
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}
