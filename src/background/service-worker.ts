import { translateMessage } from "./translation-service"
import type { AppendToSlackInputResponse, ContentRequest, ExtensionRequest, PublicSettings, TranslateResponse } from "../shared/messages"
import { getProviderSettings } from "../shared/settings"
import { clearTranslationCache } from "./translation-cache"
import { buildThreadContextPlan, getThreadContext, saveContextMessage } from "./context-store"
import { summarizeThread } from "./summary-service"
import { quickTranslate, testProvider } from "./quick-translation-service"
import type { QuickTranslateResponse } from "../shared/messages"
import { clearLogs, getLogs } from "./log-store"
import { getDailyUsageStats } from "./usage-stats"

type SlackTranslationStats = {
  waiting: number
  active: number
  retrying: number
}
const slackTranslationStats = new Map<number, SlackTranslationStats>()
const activeTranslationRequests = new Map<number, Set<AbortController>>()
const translationRequestsById = new Map<string, AbortController>()
type ProviderRuntimeStatus = {
  state: "unconfigured" | "ready" | "error"
  message: string
}
let providerRuntimeStatus: ProviderRuntimeStatus = {
  state: "unconfigured",
  message: "Provider is not configured",
}

void chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
void updateActionBadge()

chrome.runtime.onMessage.addListener((request: ExtensionRequest, _sender, sendResponse) => {
  if (request.type === "get-public-settings") {
    void getProviderSettings().then((settings) => {
      const response: PublicSettings = {
        extensionEnabled: settings.extensionEnabled,
        targetLanguage: settings.targetLanguage,
        configured: Boolean(settings.baseUrl && settings.apiKey && settings.model),
        autoTranslate: settings.autoTranslate,
        showTranslations: settings.showTranslations,
        privacyConsent: settings.privacyConsent,
      }
      if (!response.configured) {
        providerRuntimeStatus = { state: "unconfigured", message: "Provider is not configured" }
      } else if (providerRuntimeStatus.state === "unconfigured") {
        providerRuntimeStatus = { state: "ready", message: "Provider configured" }
      }
      sendResponse(response)
    })
    return true
  }

  if (request.type === "translate") {
    const tabId = _sender.tab?.id
    const controller = new AbortController()
    if (tabId !== undefined) {
      const controllers = activeTranslationRequests.get(tabId) ?? new Set<AbortController>()
      controllers.add(controller)
      activeTranslationRequests.set(tabId, controllers)
    }
    void getProviderSettings().then((settings) => {
      if (!settings.extensionEnabled) throw new DOMException("Slacktor is disabled.", "AbortError")
      return translateMessage(
        request.message,
        request.context,
        request.forceRefresh,
        controller.signal,
        (retrying) => {
        if (tabId === undefined) return
        const stats = slackTranslationStats.get(tabId) ?? {
          waiting: 0,
          active: 0,
          retrying: 0,
        }
        stats.retrying = Math.max(0, stats.retrying + (retrying ? 1 : -1))
        slackTranslationStats.set(tabId, stats)
        },
        request.urgent,
        request.priority,
      )
    })
      .then((translation) => {
        providerRuntimeStatus = { state: "ready", message: "Provider configured and responding" }
        sendResponse({ ok: true, translation } satisfies TranslateResponse)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Translation failed."
        const cancelled = isAbortError(error)
        if (!cancelled) {
          providerRuntimeStatus = { state: "error", message: conciseStatusMessage(message) }
        }
        sendResponse({ ok: false, error: message, cancelled } satisfies TranslateResponse)
      })
      .finally(() => {
        if (tabId === undefined) return
        activeTranslationRequests.get(tabId)?.delete(controller)
        if (request.requestId) translationRequestsById.delete(request.requestId)
      })
    if (request.requestId) translationRequestsById.set(request.requestId, controller)
    return true
  }

  if (request.type === "cancel-translation") {
    translationRequestsById.get(request.requestId)?.abort(new DOMException("Translation no longer visible.", "AbortError"))
    translationRequestsById.delete(request.requestId)
    sendResponse({ ok: true })
    return false
  }

  if (request.type === "observe-message") {
    void getProviderSettings().then((settings) => {
      if (!settings.extensionEnabled) return
      return saveContextMessage(request.message)
    }).then(() => sendResponse({ ok: true }))
    return true
  }

  if (request.type === "get-thread-context") {
    void getProviderSettings().then((settings) => settings.extensionEnabled
      ? buildThreadContextPlan(request.message, summarizeThread)
      : { recentMessages: [] })
      .then((context) => sendResponse(context))
      .catch(() => sendResponse({ recentMessages: [] }))
    return true
  }

  if (request.type === "quick-translate") {
    void getProviderSettings().then((settings) => {
      if (!settings.extensionEnabled) throw new Error("Slacktor is disabled.")
      return quickTranslate(request.text, request.targetLanguage, request.backTranslationLanguage)
    })
      .then((result) => {
        providerRuntimeStatus = { state: "ready", message: "Provider configured and responding" }
        sendResponse({ ok: true, ...result } satisfies QuickTranslateResponse)
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Quick translation failed."
        providerRuntimeStatus = { state: "error", message: conciseStatusMessage(message) }
        sendResponse({ ok: false, error: message } satisfies QuickTranslateResponse)
      })
    return true
  }

  if (request.type === "get-logs") {
    void getLogs().then(sendResponse)
    return true
  }

  if (request.type === "clear-logs") {
    void clearLogs().then(() => sendResponse({ ok: true }))
    return true
  }

  if (request.type === "update-slack-translation-stats") {
    if (_sender.tab?.id !== undefined) {
      slackTranslationStats.set(_sender.tab.id, {
        waiting: request.waiting,
        active: request.active,
        retrying: slackTranslationStats.get(_sender.tab.id)?.retrying ?? 0,
      })
      void updateActionBadge()
    }
    sendResponse({ ok: true })
    return false
  }

  if (request.type === "get-slack-translation-stats") {
    const stats = request.tabId === undefined
      ? undefined
      : slackTranslationStats.get(request.tabId)
    void getDailyUsageStats().then((usage) => sendResponse({
      waiting: stats?.waiting ?? 0,
      active: stats?.active ?? 0,
      retrying: stats?.retrying ?? 0,
      translatedToday: usage.translatedMessages,
      requestsToday: usage.llmRequests,
    }))
    return true
  }

  if (request.type === "get-provider-runtime-status") {
    void getProviderSettings().then((settings) => {
      const configured = Boolean(settings.baseUrl && settings.apiKey && settings.model)
      if (!configured) sendResponse({ state: "unconfigured", message: "Provider is not configured" })
      else sendResponse(providerRuntimeStatus.state === "unconfigured"
        ? { state: "ready", message: "Provider configured" }
        : providerRuntimeStatus)
    })
    return true
  }

  if (request.type === "test-provider") {
    void testProvider(request.settings)
      .then(() => {
        providerRuntimeStatus = { state: "ready", message: "Provider test succeeded" }
        sendResponse({ ok: true })
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Provider test failed."
        providerRuntimeStatus = { state: "error", message: conciseStatusMessage(message) }
        sendResponse({ ok: false, error: message })
      })
    return true
  }

  if (request.type === "retranslate-visible-from-popup") {
    void sendToActiveSlackTab<{ ok: boolean; queued: number }>({ type: "retranslate-visible" })
      .then((response) => sendResponse(response))
      .catch((error: unknown) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Could not reach a Slack tab.",
      } satisfies AppendToSlackInputResponse))
    return true
  }

  if (request.type === "terminate-slack-translations") {
    void chrome.tabs.query({ active: true, currentWindow: true }).then(async ([tab]) => {
      if (!tab?.id || !tab.url?.startsWith("https://app.slack.com/")) throw new Error("No active Slack tab.")
      await chrome.tabs.sendMessage(tab.id, { type: "terminate-slack-translations" })
      sendResponse({ ok: true })
    }).catch(() => sendResponse({ ok: false }))
    return true
  }

  if (request.type === "set-translation-visibility") {
    void chrome.tabs.query({ url: "https://app.slack.com/*" }).then((tabs) => Promise.all(
      tabs.flatMap((tab) => tab.id === undefined || typeof chrome.tabs.sendMessage !== "function"
        ? []
        : [chrome.tabs.sendMessage(tab.id, request).catch(() => undefined)]),
    )).then(async () => {
      await updateActionBadge(request.visible)
      sendResponse({ ok: true })
    }).catch(() => sendResponse({ ok: false }))
    return true
  }

  if (request.type === "set-extension-enabled") {
    if (!request.enabled) {
      for (const controllers of activeTranslationRequests.values()) {
        for (const controller of controllers) controller.abort(new DOMException("Slacktor is disabled.", "AbortError"))
      }
      translationRequestsById.clear()
      slackTranslationStats.clear()
    }
    void chrome.tabs.query({ url: "https://app.slack.com/*" }).then((tabs) => Promise.all(
      tabs.flatMap((tab) => tab.id === undefined || typeof chrome.tabs.sendMessage !== "function"
        ? []
        : [chrome.tabs.sendMessage(tab.id, request).catch(() => undefined)]),
    )).then(async () => {
      await updateActionBadge(undefined, request.enabled)
      sendResponse({ ok: true })
    }).catch(() => sendResponse({ ok: false }))
    return true
  }

  if (request.type === "append-to-slack-input") {
    void sendToWritableSlackTab({ type: "append-to-slack-input", text: request.text })
      .then((response) => sendResponse(response))
      .catch((error: unknown) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Could not reach a Slack tab.",
      } satisfies AppendToSlackInputResponse))
    return true
  }

  if (request.type === "clear-translation-cache") {
    void clearTranslationCache()
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }))
    return true
  }

  return false
})

async function sendToActiveSlackTab<T>(message: ContentRequest): Promise<T> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url?.startsWith("https://app.slack.com/")) throw new Error("No active Slack tab.")
  return await chrome.tabs.sendMessage(tab.id, message) as T
}

async function sendToWritableSlackTab(message: ContentRequest): Promise<AppendToSlackInputResponse> {
  const tabs = await chrome.tabs.query({ url: "https://app.slack.com/*" })
  tabs.sort((left, right) => Number(right.active) - Number(left.active))
  let lastError = tabs.length > 0 ? "No writable Slack input found." : "No Slack tab found."
  for (const tab of tabs) {
    if (tab.id === undefined) continue
    try {
      let response: AppendToSlackInputResponse
      try {
        response = await chrome.tabs.sendMessage(tab.id, message) as AppendToSlackInputResponse
      } catch (error) {
        if (!isMissingReceiverError(error)) throw error
        await injectContentScript(tab.id)
        response = await chrome.tabs.sendMessage(tab.id, message) as AppendToSlackInputResponse
      }
      if (response?.ok) return response
      if (response?.error) lastError = response.error
    } catch (error) {
      if (error instanceof Error) lastError = error.message
      // Try another Slack tab when its content script is unavailable.
    }
  }
  return { ok: false, error: lastError }
}

async function injectContentScript(tabId: number): Promise<void> {
  const files = chrome.runtime.getManifest().content_scripts?.flatMap((script) => script.js ?? []) ?? []
  if (files.length === 0) throw new Error("Slacktor content script is unavailable.")
  await chrome.scripting.executeScript({ target: { tabId }, files })
}

function isMissingReceiverError(error: unknown): boolean {
  return error instanceof Error && (
    error.message.includes("Could not establish connection")
    || error.message.includes("Receiving end does not exist")
  )
}

async function updateActionBadge(showTranslations?: boolean, extensionEnabled?: boolean): Promise<void> {
  let total = 0
  for (const stats of slackTranslationStats.values()) {
    total += stats.waiting + stats.active
  }

  const settings = await getProviderSettings()
  const enabled = extensionEnabled ?? settings.extensionEnabled
  const translationsVisible = showTranslations ?? settings.showTranslations
  const disabled = (!enabled || !translationsVisible) && total === 0
  await chrome.action.setBadgeBackgroundColor({ color: disabled ? "#616061" : "#4a154b" })
  await chrome.action.setBadgeText({ text: total > 0 ? (total > 99 ? "99+" : String(total)) : disabled ? "−" : "" })
  await chrome.action.setTitle({
    title: total > 0
      ? `Slacktor - ${total} Slack translations active or waiting`
      : !enabled ? "Slacktor - extension disabled" : disabled ? "Slacktor - translations hidden" : "Slacktor",
  })
}

chrome.tabs.onRemoved.addListener((tabId) => {
  slackTranslationStats.delete(tabId)
  for (const controller of activeTranslationRequests.get(tabId) ?? []) controller.abort()
  activeTranslationRequests.delete(tabId)
  void updateActionBadge()
})

function conciseStatusMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 160) || "Provider request failed"
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}
