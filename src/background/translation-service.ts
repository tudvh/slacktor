import { getProviderSettings } from "../shared/settings"
import type { RawSlackMessage, ThreadContextPlan } from "../shared/types"
import { safeEndpoint, writeLog } from "./log-store"
import { providerFetch } from "./provider-fetch"
import { cacheTranslation, getCachedTranslation } from "./translation-cache"
import { countLlmRequest, countTranslatedMessages } from "./usage-stats"

const MAX_ATTEMPTS = 2
const inFlightTranslations = new Map<string, Promise<string>>()
const recentTranslations = new Map<
  string,
  { translation: string; completedAt: number; timestamp: number }
>()
const RECENT_TRANSLATION_DEDUPE_MS = 8_000
const BATCH_WINDOW_MS = 2_000
const MAX_BATCH_INPUT_TOKENS = 25_000
const APPROXIMATE_BYTES_PER_TOKEN = 4
const MAX_CONCURRENT_NORMAL_REQUESTS = 9
const MAX_SHARED_THREAD_CONTEXT_MESSAGES = 20
const MAX_SHARED_THREAD_CONTEXT_CHARACTERS = 12_000
const MAX_STANDALONE_CONTEXT_MESSAGES = 5
const textEncoder = new TextEncoder()
const QUICK_UI_KEY = "quick-translator-ui"
type TranslationBatchItem = {
  id: string
  message: RawSlackMessage
  context: ThreadContextPlan
  settings: Awaited<ReturnType<typeof getProviderSettings>>
  signal?: AbortSignal
  onRetryStateChange?: (retrying: boolean) => void
  priority: boolean
  resolve: (translation: string) => void
  reject: (error: unknown) => void
}
type TranslationRequestItem = Pick<TranslationBatchItem, "id" | "message" | "context" | "settings">
let pendingBatch: TranslationBatchItem[] = []
let batchTimer: ReturnType<typeof setTimeout> | undefined
let batchSequence = 0
let activeBatchRequests = 0
const batchRequestQueue: TranslationBatchItem[][] = []
let activePriorityRequest = false
const priorityRequestQueue: TranslationBatchItem[][] = []

export async function translateMessage(
  message: RawSlackMessage,
  context: ThreadContextPlan = { recentMessages: [] },
  forceRefresh = false,
  signal?: AbortSignal,
  onRetryStateChange?: (retrying: boolean) => void,
  urgent = false,
  priority = false,
): Promise<string> {
  const settings = await getProviderSettings()

  if (!forceRefresh) {
    const quickHistoryTranslation = await getQuickHistoryCounterpart(message.sourceText)
    if (quickHistoryTranslation !== undefined) {
      await cacheTranslation(message, settings, quickHistoryTranslation, context)
      return quickHistoryTranslation
    }
    const cached = await getCachedTranslation(message, settings, context)
    if (cached !== undefined) return cached
  }

  if (!settings.baseUrl || !settings.apiKey || !settings.model) {
    throw new Error("Configure the AI provider in Slacktor options first.")
  }

  const inFlightId = getRequestDedupeId(message, settings)
  if (!forceRefresh) {
    const recent = recentTranslations.get(inFlightId)
    const timestamp = Number.parseFloat(message.timestamp ?? "")
    if (
      recent &&
      Date.now() - recent.completedAt <= RECENT_TRANSLATION_DEDUPE_MS &&
      (!Number.isFinite(timestamp) ||
        !Number.isFinite(recent.timestamp) ||
        Math.abs(timestamp - recent.timestamp) <= 1)
    ) {
      return recent.translation
    }
    if (recent) recentTranslations.delete(inFlightId)
    const pending = inFlightTranslations.get(inFlightId)
    if (pending) return pending
  }

  const request = urgent
    ? requestUrgentTranslation(message, context, settings, signal, onRetryStateChange)
    : enqueueTranslationRequest(message, context, settings, signal, onRetryStateChange, priority)
  if (!forceRefresh) inFlightTranslations.set(inFlightId, request)
  try {
    const translation = await request
    if (!forceRefresh) {
      recentTranslations.set(inFlightId, {
        translation,
        completedAt: Date.now(),
        timestamp: Number.parseFloat(message.timestamp ?? ""),
      })
      pruneRecentTranslations()
    }
    return translation
  } finally {
    if (!forceRefresh && inFlightTranslations.get(inFlightId) === request) {
      inFlightTranslations.delete(inFlightId)
    }
  }
}

async function getQuickHistoryCounterpart(sourceText: string): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(QUICK_UI_KEY)
  const history = stored[QUICK_UI_KEY]?.history
  if (!Array.isArray(history)) return undefined
  const normalizedSource = normalizeQuickHistoryText(sourceText)
  for (const entry of history) {
    if (typeof entry?.japanese !== "string" || typeof entry?.english !== "string") continue
    if (normalizeQuickHistoryText(entry.japanese) === normalizedSource) return entry.english
    if (normalizeQuickHistoryText(entry.english) === normalizedSource) return entry.japanese
  }
  return undefined
}

function normalizeQuickHistoryText(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

async function requestUrgentTranslation(
  message: RawSlackMessage,
  context: ThreadContextPlan,
  settings: Awaited<ReturnType<typeof getProviderSettings>>,
  signal?: AbortSignal,
  onRetryStateChange?: (retrying: boolean) => void,
): Promise<string> {
  const item = {
    id: `urgent-${batchSequence++}`,
    message,
    context,
    settings,
  }
  if (getEstimatedBatchInputTokens([item]) > MAX_BATCH_INPUT_TOKENS) {
    throw new Error("Message and thread context exceed the 25k input-token safety limit.")
  }
  const translations = await performTranslationRequest([item], signal, onRetryStateChange, true)
  const translation = translations.get(item.id)
  if (translation === undefined) throw new Error("AI provider omitted the urgent translation.")
  await cacheTranslation(message, settings, translation, context)
  if (translation) await countTranslatedMessages(1)
  return translation
}

function enqueueTranslationRequest(
  message: RawSlackMessage,
  context: ThreadContextPlan,
  settings: Awaited<ReturnType<typeof getProviderSettings>>,
  signal?: AbortSignal,
  onRetryStateChange?: (retrying: boolean) => void,
  priority = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    pendingBatch.push({
      id: `translation-${batchSequence++}`,
      message,
      context,
      settings,
      signal,
      onRetryStateChange,
      priority,
      resolve,
      reject,
    })
    if (batchTimer !== undefined) clearTimeout(batchTimer)
    batchTimer = setTimeout(flushPendingBatch, BATCH_WINDOW_MS)
  })
}

function flushPendingBatch(): void {
  batchTimer = undefined
  const items = pendingBatch
  pendingBatch = []

  const priorityItems = items.filter((item) => item.priority)
  const normalItems = items.filter((item) => !item.priority)
  priorityRequestQueue.push(...partitionBatch(priorityItems))
  batchRequestQueue.push(...partitionBatch(normalItems))
  runBatchRequestQueue()
}

function runBatchRequestQueue(): void {
  if (!activePriorityRequest && priorityRequestQueue.length > 0) {
    const items = priorityRequestQueue.shift()
    if (items) {
      activePriorityRequest = true
      void requestTranslationBatch(items).finally(() => {
        activePriorityRequest = false
        runBatchRequestQueue()
      })
    }
  }
  while (activeBatchRequests < MAX_CONCURRENT_NORMAL_REQUESTS && batchRequestQueue.length > 0) {
    const items = batchRequestQueue.shift()
    if (!items) return
    activeBatchRequests += 1
    void requestTranslationBatch(items).finally(() => {
      activeBatchRequests -= 1
      runBatchRequestQueue()
    })
  }
}

function partitionBatch(items: TranslationBatchItem[]): TranslationBatchItem[][] {
  const groups: TranslationBatchItem[][] = []
  let current: TranslationBatchItem[] = []
  for (const item of items) {
    if (item.signal?.aborted) {
      item.reject(item.signal.reason ?? new DOMException("Translation terminated.", "AbortError"))
      continue
    }
    if (getEstimatedBatchInputTokens([item]) > MAX_BATCH_INPUT_TOKENS) {
      item.reject(new Error("Message and thread context exceed the 25k input-token safety limit."))
      continue
    }
    if (current.length > 0 && !hasCompatibleProvider(current[0], item)) {
      groups.push(current)
      current = []
    }
    const candidate = [...current, item]
    if (current.length > 0 && getEstimatedBatchInputTokens(candidate) > MAX_BATCH_INPUT_TOKENS) {
      groups.push(current)
      current = [item]
    } else {
      current = candidate
    }
  }
  if (current.length > 0) groups.push(current)
  return groups
}

function hasCompatibleProvider(left: TranslationBatchItem, right: TranslationBatchItem): boolean {
  return (
    left.settings.baseUrl === right.settings.baseUrl &&
    left.settings.apiKey === right.settings.apiKey &&
    left.settings.model === right.settings.model &&
    left.settings.customPrompt === right.settings.customPrompt
  )
}

function getEstimatedBatchInputTokens(items: TranslationRequestItem[]): number {
  const inputBytes =
    textEncoder.encode(buildBatchSystemPrompt(items[0]?.settings.customPrompt ?? "")).byteLength +
    textEncoder.encode(buildBatchPrompt(items)).byteLength
  return Math.ceil(inputBytes / APPROXIMATE_BYTES_PER_TOKEN)
}

function getRequestDedupeId(
  message: RawSlackMessage,
  settings: Awaited<ReturnType<typeof getProviderSettings>>,
): string {
  return [
    message.workspaceId ?? "",
    message.conversationId ?? "",
    message.author.status === "resolved" ? message.author.memberId : "unknown",
    message.sourceText,
    settings.baseUrl,
    settings.model,
    settings.targetLanguage,
    settings.customPrompt,
  ].join("\u0000")
}

function pruneRecentTranslations(): void {
  if (recentTranslations.size <= 500) return
  const cutoff = Date.now() - RECENT_TRANSLATION_DEDUPE_MS
  for (const [key, value] of recentTranslations) {
    if (value.completedAt < cutoff) recentTranslations.delete(key)
  }
}

/**
 * Clickable element masking pattern:
 * 1. Markdown links: [label](protocol://url)
 *    Matches [label](slack://mention), [label](slack://channel), [label](slack://link), [label](slack://email), [label](https://...)
 * 2. Raw URLs: https?://...
 * 3. Raw emails: user@domain.com
 * 4. Broadcast mentions: @channel, @here, @everyone
 */
const CLICKABLE_MASK_REGEX =
  /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:|slack:\/\/)[^\s)<>"]+)\)|https?:\/\/[^\s)<>"'`]+|(?:mailto:)?[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|@(?:channel|here|everyone)\b/g

export function maskClickableElements(text: string, maskMap: Map<string, string>): string {
  if (!text) return text
  return text.replace(CLICKABLE_MASK_REGEX, (match) => {
    const placeholder = `__SLKT_${maskMap.size}__`
    maskMap.set(placeholder, match)
    return placeholder
  })
}

export function unmaskClickableElements(text: string, maskMap: Map<string, string>): string {
  if (!text || maskMap.size === 0) return text
  return text.replace(/__\s*SLKT_(\d+)\s*__/gi, (_match, id: string) => {
    const key = `__SLKT_${id}__`
    return maskMap.get(key) ?? _match
  })
}

function sanitizeContextText(text: string): string {
  return text.replace(/\[([^\]\n]+)\]\(slack:\/\/[^)]+\)/g, "$1")
}

const BATCH_SYSTEM_PROMPT = [
  "Translate each Slack message accurately into its requested target language.",
  "Preserve the original vibe, intent, emotional tone, urgency, directness, and intensity exactly.",
  "Preserve formatting faithfully: Markdown syntax (*bold*, _italic_, ~strike~, `inline code`, ```code blocks```, > quotes, and lists with bullets or numbers) must be preserved exactly.",
  "Strictly do not translate code inside ```code blocks``` or `inline code`, URLs, email addresses, @mentions (e.g. @username, @here, @channel, including parenthetical or bilingual display names like @Name (note)), #channels, or emoji codes (:emoji_name:).",
  "Strictly preserve all placeholder tokens such as __SLKT_0__, __SLKT_1__, etc. exactly as written. Do not translate, change, reorder, or remove any placeholder token.",
  "Strictly preserve forwarded headers starting with ↳ (such as ↳ Name:) exactly as written. Do not translate the name or alter the ↳ symbol.",
  "Strictly do not include '(edited)' or edited timestamp labels in the translation.",
  "Never soften, sanitize, de-escalate, add politeness, or make an angry, tense, blunt, critical, or confrontational message sound friendlier than the source.",
  "If currentMessage is already written in the requested target language, return an empty string for that item's translation. Do not translate, paraphrase, or repeat it.",
  "Preserve the exact line breaks, list indentation, and nested list hierarchy (e.g. '  - subitem' with leading spaces) faithfully. For multi-level or nested lists, you MUST preserve the exact leading space indentation and hierarchical nesting. Never flatten nested sub-items into top-level items, and do not insert empty lines between list items.",
  "For threadGroups, use sharedContext only to resolve meaning for every item in that group. Translate only each item's currentMessage.",
  "For standaloneItems, use previousMessages only to resolve meaning. Translate only currentMessage.",
  "Return only valid JSON with a translations array. Each entry must contain the unchanged id and its translation. Escape quotation marks and control characters inside every JSON string. Do not add markdown or commentary.",
].join(" ")

function buildBatchSystemPrompt(customPrompt: string): string {
  return customPrompt
    ? `${BATCH_SYSTEM_PROMPT}\n\nAdditional user instructions:\n${customPrompt}`
    : BATCH_SYSTEM_PROMPT
}

function decodeLineBreaks(text: string): string {
  let normalized = text
    .replace(/\\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/(?:^|\s*)\((?:edited|đã chỉnh sửa|編集済み)\)\s*$/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  let prev = ""
  while (prev !== normalized) {
    prev = normalized
    normalized = normalized.replace(
      /((?:^|\r?\n)[ \t]*(?:[-*+•]|\d+[.)])[^\r\n]*)\r?\n\r?\n+(?=[ \t]*(?:[-*+•]|\d+[.)])[ \t]+)/g,
      "$1\n",
    )
  }
  return normalized
}

async function requestTranslationBatch(items: TranslationBatchItem[]): Promise<void> {
  const liveItems = items.filter((item) => !item.signal?.aborted)
  for (const item of items) {
    if (!liveItems.includes(item))
      item.reject(item.signal?.reason ?? new DOMException("Translation terminated.", "AbortError"))
  }
  const [first] = liveItems
  if (!first) return
  const controller = new AbortController()
  const abortIfEmpty = () => {
    if (liveItems.every((item) => item.signal?.aborted))
      controller.abort(new DOMException("Translation terminated.", "AbortError"))
  }
  for (const item of liveItems) item.signal?.addEventListener("abort", abortIfEmpty, { once: true })
  try {
    const translations = await performTranslationRequest(liveItems, controller.signal)
    const completed = await Promise.all(
      liveItems
        .filter((item) => !item.signal?.aborted)
        .map(async (item) => {
          const translation = translations.get(item.id)
          if (translation === undefined)
            throw new Error("AI provider omitted a translation from the batch response.")
          await cacheTranslation(item.message, item.settings, translation, item.context)
          return { item, translation }
        }),
    )
    await countTranslatedMessages(completed.filter((result) => result.translation).length)
    for (const result of completed) result.item.resolve(result.translation)
  } catch (error) {
    for (const item of liveItems) item.reject(error)
  }
}

async function performTranslationRequest(
  items: TranslationRequestItem[],
  signal?: AbortSignal,
  onRetryStateChange?: (retrying: boolean) => void,
  bypassRateLimit = false,
): Promise<Map<string, string>> {
  const first = items[0]
  if (!first) return new Map()
  const settings = first.settings
  const baseUrl = settings.baseUrl.replace(/\/+$/, "")
  const endpoint = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`
  const itemMasks = new Map<string, Map<string, string>>()
  for (const item of items) {
    itemMasks.set(item.id, new Map<string, string>())
  }
  const payload = {
    model: settings.model,
    messages: [
      {
        role: "system",
        content: buildBatchSystemPrompt(settings.customPrompt),
      },
      {
        role: "user",
        content: buildBatchPrompt(items, itemMasks),
      },
    ],
    temperature: 0.2,
  }
  await writeLog({
    level: "info",
    scope: "translation",
    message: "Translation request started",
    details: {
      endpoint: safeEndpoint(endpoint),
      model: settings.model,
      batchSize: items.length,
      urgent: bypassRateLimit,
    },
  })
  let response: Response
  try {
    response = await requestWithRetry(
      endpoint,
      settings.apiKey,
      payload,
      signal,
      onRetryStateChange,
      bypassRateLimit,
    )
  } catch (error) {
    await writeLog({
      level: "error",
      scope: "translation",
      message: error instanceof Error ? error.message : "Translation network request failed",
      details: { endpoint: safeEndpoint(endpoint), model: settings.model },
    })
    throw error
  }

  if (!response.ok) {
    const body = (await response.text()).replace(/\s+/g, " ").trim()
    const detail = body ? `: ${body.slice(0, 240)}` : ""
    const error = `AI request failed (${response.status})${detail}`
    await writeLog({
      level: "error",
      scope: "translation",
      message: error,
      details: { endpoint: safeEndpoint(endpoint), model: settings.model, status: response.status },
    })
    throw new Error(error)
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content?.trim()
  const rawTranslations = parseBatchTranslations(content)
  const translations = new Map<string, string>()
  for (const [id, translation] of rawTranslations) {
    const maskMap = itemMasks.get(id)
    const unmasked = maskMap ? unmaskClickableElements(translation, maskMap) : translation
    translations.set(id, unmasked)
  }
  await writeLog({
    level: "info",
    scope: "translation",
    message: "Translation request completed",
    details: {
      endpoint: safeEndpoint(endpoint),
      model: settings.model,
      status: response.status,
      batchSize: items.length,
      urgent: bypassRateLimit,
    },
  })
  return translations
}

async function requestWithRetry(
  endpoint: string,
  apiKey: string,
  payload: unknown,
  signal?: AbortSignal,
  onRetryStateChange?: (retrying: boolean) => void,
  bypassRateLimit = false,
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const request = bypassRateLimit ? fetch : providerFetch
      if (bypassRateLimit) await countLlmRequest()
      const response = await request(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      })
      if (response.ok || !isRetriableStatus(response.status) || attempt === MAX_ATTEMPTS - 1) {
        return response
      }
      onRetryStateChange?.(true)
      try {
        await delay(retryDelayMs(attempt), signal)
      } finally {
        onRetryStateChange?.(false)
      }
    } catch (error) {
      lastError = error
      if (signal?.aborted || isAbortError(error)) throw signal?.reason ?? error
      if (attempt === MAX_ATTEMPTS - 1) break
      onRetryStateChange?.(true)
      try {
        await delay(retryDelayMs(attempt), signal)
      } finally {
        onRetryStateChange?.(false)
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AI request failed after retries.")
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504
}

function retryDelayMs(attempt: number): number {
  return 400 * 2 ** attempt + Math.floor(Math.random() * 200)
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout)
        reject(new DOMException("Translation terminated.", "AbortError"))
      },
      { once: true },
    )
  })
}

function buildBatchPrompt(
  items: TranslationRequestItem[],
  itemMasks?: Map<string, Map<string, string>>,
): string {
  const threadGroups = new Map<string, TranslationRequestItem[]>()
  const standaloneItems: TranslationRequestItem[] = []
  for (const item of items) {
    const threadKey = getBatchThreadKey(item.message)
    if (!threadKey) {
      standaloneItems.push(item)
      continue
    }
    const group = threadGroups.get(threadKey) ?? []
    group.push(item)
    threadGroups.set(threadKey, group)
  }

  const getMaskedMessage = (item: TranslationRequestItem): string => {
    let maskMap = itemMasks?.get(item.id)
    if (!maskMap) {
      maskMap = new Map<string, string>()
      itemMasks?.set(item.id, maskMap)
    }
    return maskClickableElements(item.message.sourceText, maskMap)
  }

  return JSON.stringify({
    threadGroups: [...threadGroups.entries()].map(([threadKey, group]) => ({
      threadKey,
      olderThreadSummary: group.find((item) => item.context.summary)?.context.summary ?? "",
      sharedContext: buildSharedThreadContext(group),
      items: group.map((item) => ({
        id: item.id,
        targetLanguage: item.settings.targetLanguage,
        currentMessage: getMaskedMessage(item),
      })),
    })),
    standaloneItems: standaloneItems.map((item) => ({
      id: item.id,
      targetLanguage: item.settings.targetLanguage,
      previousMessages: getPreviousStandaloneMessages(item, standaloneItems),
      currentMessage: getMaskedMessage(item),
    })),
  })
}

function getBatchThreadKey(message: RawSlackMessage): string | undefined {
  if (!message.threadRootTs || !message.conversationId) return undefined
  return [message.workspaceId ?? "", message.conversationId, message.threadRootTs].join(":")
}

function buildSharedThreadContext(
  group: TranslationRequestItem[],
): Array<{ author: string; text: string }> {
  const translatedMessageIds = new Set(group.map((item) => item.message.messageId))
  const contextById = new Map<string, { timestamp: string; author: string; text: string }>()
  for (const item of group) {
    for (const message of item.context.recentMessages) {
      if (translatedMessageIds.has(message.messageId)) continue
      contextById.set(message.messageId, {
        timestamp: message.timestamp,
        author: message.authorName ?? "Slack member",
        text: sanitizeContextText(message.sourceText),
      })
    }
  }

  const context = [...contextById.values()].sort(
    (left, right) => Number.parseFloat(left.timestamp) - Number.parseFloat(right.timestamp),
  )
  const selected: Array<{ author: string; text: string }> = []
  let characters = 0
  for (const message of context.slice(-MAX_SHARED_THREAD_CONTEXT_MESSAGES)) {
    if (characters + message.text.length > MAX_SHARED_THREAD_CONTEXT_CHARACTERS) continue
    selected.push({ author: message.author, text: message.text })
    characters += message.text.length
  }
  return selected
}

function getPreviousStandaloneMessages(
  target: TranslationRequestItem,
  standaloneItems: TranslationRequestItem[],
): Array<{ author: string; text: string }> {
  const targetTimestamp = Number.parseFloat(target.message.timestamp ?? "")
  if (!Number.isFinite(targetTimestamp)) return []
  return standaloneItems
    .filter(
      (item) =>
        item !== target &&
        item.message.workspaceId === target.message.workspaceId &&
        item.message.conversationId === target.message.conversationId &&
        Number.parseFloat(item.message.timestamp ?? "") < targetTimestamp,
    )
    .sort(
      (left, right) =>
        Number.parseFloat(right.message.timestamp ?? "") -
        Number.parseFloat(left.message.timestamp ?? ""),
    )
    .slice(0, MAX_STANDALONE_CONTEXT_MESSAGES)
    .reverse()
    .map((item) => ({
      author:
        item.message.author.status === "resolved"
          ? (item.message.author.displayName ?? "Slack member")
          : "Slack member",
      text: sanitizeContextText(item.message.sourceText),
    }))
}

function parseBatchTranslations(content: string | undefined): Map<string, string> {
  if (!content) throw new Error("AI provider returned no translation.")
  const normalized = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  let data: { translations?: Array<{ id?: unknown; translation?: unknown }> }
  try {
    data = JSON.parse(normalized) as typeof data
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    data = JSON.parse(sanitizeJsonStrings(normalized)) as typeof data
  }
  if (!Array.isArray(data.translations))
    throw new Error("AI provider returned an invalid batch response.")
  return new Map(
    data.translations.flatMap((item) =>
      typeof item.id === "string" && typeof item.translation === "string"
        ? [[item.id, decodeLineBreaks(item.translation)] as const]
        : [],
    ),
  )
}

function sanitizeJsonStrings(json: string): string {
  let result = ""
  let inString = false
  let escaped = false

  for (let index = 0; index < json.length; index += 1) {
    const character = json[index]
    if (!inString) {
      result += character
      if (character === '"') inString = true
      continue
    }

    if (escaped) {
      result += character
      escaped = false
      continue
    }
    if (character === "\\") {
      result += character
      escaped = true
      continue
    }
    if (character === '"') {
      const remainder = json.slice(index + 1)
      const nextToken = remainder.match(/\S/)?.[0]
      const commaEndsString = nextToken === "," && /^\s*,\s*(?:["{]|$)/.test(remainder)
      if (nextToken === undefined || commaEndsString || ["}", "]", ":"].includes(nextToken)) {
        result += character
        inString = false
      } else {
        result += '\\"'
      }
      continue
    }

    const codePoint = character.charCodeAt(0)
    result += codePoint <= 0x1f ? `\\u${codePoint.toString(16).padStart(4, "0")}` : character
  }
  return result
}
