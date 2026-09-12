import { getProviderSettings, saveProviderSettings, type ProviderSettings } from "../shared/settings"
import type { QuickTranslateResponse } from "../shared/messages"
import type { SlacktorLogEntry } from "../background/log-store"

const form = document.querySelector<HTMLFormElement>("#quick-settings")!
const connectionStatus = document.querySelector<HTMLElement>("#connection-status")!
const saveStatus = document.querySelector<HTMLElement>("#save-status")!
const baseUrl = document.querySelector<HTMLInputElement>("#base-url")!
const model = document.querySelector<HTMLInputElement>("#model")!
const apiKey = document.querySelector<HTMLInputElement>("#api-key")!
const targetLanguage = document.querySelector<HTMLInputElement>("#target-language")!
const customPrompt = document.querySelector<HTMLTextAreaElement>("#custom-prompt")!
const autoTranslate = document.querySelector<HTMLInputElement>("#auto-translate")!
const extensionEnabled = document.querySelector<HTMLInputElement>("#extension-enabled")!
const showTranslations = document.querySelector<HTMLInputElement>("#show-translations")!
const translationToggle = document.querySelector<HTMLLabelElement>("#translation-toggle")!
const toggleKey = document.querySelector<HTMLButtonElement>("#toggle-key")!
const quickSource = document.querySelector<HTMLTextAreaElement>("#quick-source")!
const quickTargetLanguage = document.querySelector<HTMLInputElement>("#quick-target-language")!
const quickBackLanguage = document.querySelector<HTMLInputElement>("#quick-back-language")!
const quickTranslateButton = document.querySelector<HTMLButtonElement>("#quick-translate")!
const quickResults = document.querySelector<HTMLElement>("#quick-results")!
const quickJapanese = document.querySelector<HTMLElement>("#quick-japanese")!
const quickEnglish = document.querySelector<HTMLElement>("#quick-english")!
const mainView = document.querySelector<HTMLElement>("#main-view")!
const settingsView = document.querySelector<HTMLElement>("#settings-view")!
const historyList = document.querySelector<HTMLElement>("#history-list")!
const historyEmpty = document.querySelector<HTMLElement>("#history-empty")!
const logsModal = document.querySelector<HTMLDialogElement>("#logs-modal")!
const logsList = document.querySelector<HTMLElement>("#logs-list")!
const logsEmpty = document.querySelector<HTMLElement>("#logs-empty")!
const slackQueueStats = document.querySelector<HTMLElement>("#slack-queue-stats")!
const slackProgressStats = document.querySelector<HTMLElement>("#slack-progress-stats")!
const showLogsButton = document.querySelector<HTMLButtonElement>("#show-logs")!
const privacyConsentModal = document.querySelector<HTMLDialogElement>("#privacy-consent-modal")!
const privacyConsentCheck = document.querySelector<HTMLInputElement>("#privacy-consent-check")!
const acceptPrivacyConsent = document.querySelector<HTMLButtonElement>("#accept-privacy-consent")!
const configFileInput = document.querySelector<HTMLInputElement>("#config-file-input")!
let privacyConsent = false
let currentLogs: SlacktorLogEntry[] = []

type QuickHistoryEntry = {
  id: string
  source: string
  japanese: string
  english: string
  createdAt: number
}
type QuickUiState = {
  draft: string
  targetLanguage: string
  backTranslationLanguage: string
  clearAfterClose: boolean
  lastTranslatedSource?: string
  history: QuickHistoryEntry[]
}
type ExportedConfig = {
  schemaVersion: 1
  providerSettings: ProviderSettings
  quickTranslator: Pick<QuickUiState, "targetLanguage" | "backTranslationLanguage">
}
const QUICK_UI_KEY = "quick-translator-ui"
const QUICK_HISTORY_RETENTION_MS = 2 * 24 * 60 * 60 * 1000
let quickUiState: QuickUiState = {
  draft: "",
  targetLanguage: "Japanese",
  backTranslationLanguage: "English",
  clearAfterClose: false,
  history: [],
}

void Promise.all([load(), loadQuickUiState()])
void refreshSlackApiStats()
void refreshProviderRuntimeStatus()
window.setInterval(() => {
  void refreshSlackApiStats()
  void refreshProviderRuntimeStatus()
}, 500)

async function load(): Promise<void> {
  const settings = await getProviderSettings()
  extensionEnabled.checked = settings.extensionEnabled
  baseUrl.value = settings.baseUrl
  model.value = settings.model
  apiKey.value = settings.apiKey
  targetLanguage.value = settings.targetLanguage
  customPrompt.value = settings.customPrompt
  autoTranslate.checked = settings.autoTranslate
  showTranslations.checked = settings.showTranslations
  updateTranslationToggleTooltip()
  privacyConsent = settings.privacyConsent
  updateConnectionStatus()
  if (!privacyConsent) privacyConsentModal.showModal()
}

async function loadQuickUiState(): Promise<void> {
  const stored = await chrome.storage.local.get(QUICK_UI_KEY)
  quickUiState = { ...quickUiState, ...stored[QUICK_UI_KEY] }
  const retainedHistory = retainRecentHistory(quickUiState.history)
  const historyWasPruned = retainedHistory.length !== quickUiState.history.length
  quickUiState.history = retainedHistory
  if (
    quickUiState.clearAfterClose &&
    quickUiState.lastTranslatedSource !== undefined &&
    quickUiState.draft === quickUiState.lastTranslatedSource
  ) {
    quickUiState.draft = ""
    quickUiState.clearAfterClose = false
    quickUiState.lastTranslatedSource = undefined
    await saveQuickUiState()
  } else if (historyWasPruned) {
    await saveQuickUiState()
  }
  quickSource.value = quickUiState.draft
  quickTargetLanguage.value = quickUiState.targetLanguage
  quickBackLanguage.value = quickUiState.backTranslationLanguage
  renderHistory()
}

async function saveQuickUiState(): Promise<void> {
  await chrome.storage.local.set({ [QUICK_UI_KEY]: quickUiState })
}

function renderHistory(): void {
  historyList.replaceChildren()
  for (const entry of quickUiState.history) {
    const item = document.createElement("article")
    item.className = "history-item"
    const time = document.createElement("time")
    time.dateTime = new Date(entry.createdAt).toISOString()
    time.textContent = new Date(entry.createdAt).toLocaleString()
    const text = document.createElement("p")
    text.textContent = entry.english
    item.append(time, text)
    item.addEventListener("click", () => {
      quickSource.value = entry.source ?? ""
      quickJapanese.textContent = entry.japanese ?? ""
      quickEnglish.textContent = entry.english
      quickResults.hidden = false
      quickUiState.draft = quickSource.value
      quickUiState.clearAfterClose = true
      quickUiState.lastTranslatedSource = quickSource.value
      void saveQuickUiState()
    })
    historyList.append(item)
  }
  historyEmpty.hidden = quickUiState.history.length > 0
}

function updateConnectionStatus(): void {
  const configured = Boolean(baseUrl.value.trim() && model.value.trim() && apiKey.value.trim())
  if (!configured) setProviderStatus("unconfigured", "Provider is not configured")
}

toggleKey.addEventListener("click", () => {
  const visible = apiKey.type === "text"
  apiKey.type = visible ? "password" : "text"
  toggleKey.textContent = visible ? "Show" : "Hide"
  toggleKey.setAttribute("aria-label", visible ? "Show API key" : "Hide API key")
})

form.addEventListener("input", updateConnectionStatus)

quickSource.addEventListener("input", () => {
  quickUiState.draft = quickSource.value
  // Any edit after a successful translation means the user is preparing new
  // text. Preserve that draft on the next popup open, even if they later change
  // it back to the same visible value.
  quickUiState.clearAfterClose = false
  quickUiState.lastTranslatedSource = undefined
  void saveQuickUiState()
})

for (const input of [quickTargetLanguage, quickBackLanguage]) {
  input.addEventListener("input", () => {
    quickUiState.targetLanguage = quickTargetLanguage.value
    quickUiState.backTranslationLanguage = quickBackLanguage.value
    void saveQuickUiState()
  })
}

form.addEventListener("submit", (event) => {
  event.preventDefault()
  saveStatus.className = "save-status"
  saveStatus.textContent = "Saving..."

  try {
    const settings = getDraftProviderSettings()
    void requestProviderPermission(settings.baseUrl).then(() => saveProviderSettings(settings))
      .then(() => {
        updateConnectionStatus()
        saveStatus.className = "save-status success"
        saveStatus.textContent = "Configuration saved."
      })
      .catch((error: unknown) => {
        saveStatus.className = "save-status error"
        saveStatus.textContent = error instanceof Error
          ? error.message
          : "Could not save configuration or endpoint permission was denied."
      })
  } catch (error: unknown) {
    saveStatus.className = "save-status error"
    saveStatus.textContent = error instanceof Error
      ? error.message
      : "Could not validate the provider configuration."
  }
})

document.querySelector<HTMLButtonElement>("#clear-translation-cache")!.addEventListener("click", (event) => {
  const button = event.currentTarget
  if (!(button instanceof HTMLButtonElement)) return
  button.disabled = true
  saveStatus.className = "save-status"
  saveStatus.textContent = "Clearing cache..."
  chrome.runtime.sendMessage({ type: "clear-translation-cache" }, (response?: { ok: boolean }) => {
    button.disabled = false
    if (chrome.runtime.lastError || !response?.ok) {
      saveStatus.className = "save-status error"
      saveStatus.textContent = "Could not clear the translation cache."
      return
    }
    saveStatus.className = "save-status success"
    saveStatus.textContent = "Translation cache cleared. Active translations were not stopped."
  })
})

document.querySelector<HTMLButtonElement>("#test-provider")!.addEventListener("click", (event) => {
  const button = event.currentTarget
  if (!(button instanceof HTMLButtonElement)) return
  button.disabled = true
  const original = button.textContent
  button.textContent = "Testing..."
  saveStatus.className = "save-status"
  saveStatus.textContent = "Testing current configuration..."

  let succeeded = false
  void Promise.resolve()
    .then(async () => {
      const settings = getDraftProviderSettings()
      await requestProviderPermission(settings.baseUrl)
      const response = await chrome.runtime.sendMessage({ type: "test-provider", settings }) as {
        ok: boolean
        error?: string
      }
      if (!response?.ok) throw new Error(response?.error ?? "Provider test failed.")
      await saveProviderSettings(settings)
      succeeded = true
      updateConnectionStatus()
      saveStatus.className = "save-status success"
      saveStatus.textContent = "Provider test succeeded. Configuration saved."
    })
    .catch((error: unknown) => {
      saveStatus.className = "save-status error"
      saveStatus.textContent = error instanceof Error ? error.message : "Provider test failed."
    })
    .finally(() => {
      button.disabled = false
      button.textContent = succeeded ? "Test succeeded" : "Test failed"
      window.setTimeout(() => { button.textContent = original }, 1400)
      void refreshProviderRuntimeStatus()
    })
})

function getDraftProviderSettings(): ProviderSettings {
  const settings = {
    extensionEnabled: extensionEnabled.checked,
    baseUrl: baseUrl.value.trim(),
    apiKey: apiKey.value.trim(),
    model: model.value.trim(),
    targetLanguage: targetLanguage.value.trim(),
    customPrompt: customPrompt.value.trim(),
    autoTranslate: autoTranslate.checked,
    showTranslations: showTranslations.checked,
    privacyConsent,
  }
  if (!settings.baseUrl || !settings.apiKey || !settings.model || !settings.targetLanguage) {
    throw new Error("Enter endpoint, model, API key, and target language first.")
  }
  return settings
}

extensionEnabled.addEventListener("change", () => {
  void getProviderSettings().then((settings) => saveProviderSettings({
    ...settings,
    extensionEnabled: extensionEnabled.checked,
  })).then(() => chrome.runtime.sendMessage({
    type: "set-extension-enabled",
    enabled: extensionEnabled.checked,
  })).then(() => {
    saveStatus.className = "save-status success"
    saveStatus.textContent = extensionEnabled.checked ? "Slacktor enabled." : "Slacktor disabled for this installation."
  }).catch(() => {
    saveStatus.className = "save-status error"
    saveStatus.textContent = "Could not update Slacktor state."
  })
})

document.querySelector<HTMLButtonElement>("#export-config-file")!.addEventListener("click", () => {
  void exportConfig().then((config) => {
    const url = URL.createObjectURL(new Blob([config], { type: "application/json" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "slacktor-config.json"
    link.click()
    URL.revokeObjectURL(url)
    showConfigSuccess("Configuration exported to file. Keep it private because it contains your API key.")
  }).catch(showConfigError)
})

document.querySelector<HTMLButtonElement>("#export-config-clipboard")!.addEventListener("click", () => {
  void exportConfig().then((config) => navigator.clipboard.writeText(config)).then(() => {
    showConfigSuccess("Configuration copied. It contains your API key.")
  }).catch(showConfigError)
})

document.querySelector<HTMLButtonElement>("#import-config-file")!.addEventListener("click", () => configFileInput.click())
configFileInput.addEventListener("change", () => {
  const file = configFileInput.files?.[0]
  configFileInput.value = ""
  if (file) void file.text().then(importConfig).catch(showConfigError)
})

document.querySelector<HTMLButtonElement>("#import-config-clipboard")!.addEventListener("click", () => {
  void navigator.clipboard.readText().then(importConfig).catch(showConfigError)
})

async function exportConfig(): Promise<string> {
  const config: ExportedConfig = {
    schemaVersion: 1,
    providerSettings: await getProviderSettings(),
    quickTranslator: {
      targetLanguage: quickUiState.targetLanguage,
      backTranslationLanguage: quickUiState.backTranslationLanguage,
    },
  }
  return JSON.stringify(config, null, 2)
}

async function importConfig(text: string): Promise<void> {
  const config = parseImportedConfig(text)
  if (config.providerSettings.baseUrl) await requestProviderPermission(config.providerSettings.baseUrl)
  await saveProviderSettings(config.providerSettings)
  quickUiState.targetLanguage = config.quickTranslator.targetLanguage
  quickUiState.backTranslationLanguage = config.quickTranslator.backTranslationLanguage
  await saveQuickUiState()
  await load()
  quickTargetLanguage.value = quickUiState.targetLanguage
  quickBackLanguage.value = quickUiState.backTranslationLanguage
  await chrome.runtime.sendMessage({ type: "set-extension-enabled", enabled: config.providerSettings.extensionEnabled })
  await chrome.runtime.sendMessage({ type: "set-translation-visibility", visible: config.providerSettings.showTranslations })
  showConfigSuccess("Configuration imported.")
}

function parseImportedConfig(text: string): ExportedConfig {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error("The selected content is not valid JSON.")
  }
  if (!isRecord(value) || value.schemaVersion !== 1 || !isProviderSettings(value.providerSettings) || !isRecord(value.quickTranslator)) {
    throw new Error("This is not a valid Slacktor configuration file.")
  }
  const targetLanguage = value.quickTranslator.targetLanguage
  const backTranslationLanguage = value.quickTranslator.backTranslationLanguage
  if (typeof targetLanguage !== "string" || typeof backTranslationLanguage !== "string" || !targetLanguage.trim() || !backTranslationLanguage.trim()) {
    throw new Error("Quick Translator languages are invalid.")
  }
  return {
    schemaVersion: 1,
    providerSettings: value.providerSettings,
    quickTranslator: { targetLanguage: targetLanguage.trim(), backTranslationLanguage: backTranslationLanguage.trim() },
  }
}

function isProviderSettings(value: unknown): value is ProviderSettings {
  if (!isRecord(value)) return false
  return typeof value.extensionEnabled === "boolean"
    && typeof value.baseUrl === "string"
    && typeof value.apiKey === "string"
    && typeof value.model === "string"
    && typeof value.targetLanguage === "string"
    && typeof value.customPrompt === "string"
    && typeof value.autoTranslate === "boolean"
    && typeof value.showTranslations === "boolean"
    && typeof value.privacyConsent === "boolean"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function showConfigSuccess(message: string): void {
  saveStatus.className = "save-status success"
  saveStatus.textContent = message
}

function showConfigError(error: unknown): void {
  saveStatus.className = "save-status error"
  saveStatus.textContent = error instanceof Error ? error.message : "Configuration transfer failed."
}

showTranslations.addEventListener("change", () => {
  updateTranslationToggleTooltip()
  void getProviderSettings().then((settings) => saveProviderSettings({
    ...settings,
    showTranslations: showTranslations.checked,
  })).then(() => chrome.runtime.sendMessage({
    type: "set-translation-visibility",
    visible: showTranslations.checked,
  })).catch(() => {
    // Settings remain persisted; an existing Slack tab may need one reload.
  })
})

function updateTranslationToggleTooltip(): void {
  const label = showTranslations.checked ? "Disable translation" : "Enable translation"
  translationToggle.title = label
  showTranslations.setAttribute("aria-label", label)
}

async function requestProviderPermission(endpoint: string): Promise<void> {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error("Use an HTTPS endpoint, or HTTP on localhost only.")
  }
  const isLocalHttp = url.protocol === "http:" && (
    url.hostname === "localhost" || url.hostname === "127.0.0.1"
  )
  if (url.protocol !== "https:" && !isLocalHttp) {
    throw new Error("Use an HTTPS endpoint, or HTTP on localhost only.")
  }
  const granted = await chrome.permissions.request({ origins: [`${url.protocol}//${url.host}/*`] })
  if (!granted) throw new Error("Permission was not granted for this AI endpoint.")
}

quickTranslateButton.addEventListener("click", () => {
  const text = quickSource.value.trim()
  if (!text) {
    quickSource.focus()
    return
  }
  const targetLanguage = quickTargetLanguage.value.trim()
  const backTranslationLanguage = quickBackLanguage.value.trim()
  if (!targetLanguage || !backTranslationLanguage) {
    const emptyLanguageInput = !targetLanguage ? quickTargetLanguage : quickBackLanguage
    emptyLanguageInput.focus()
    return
  }

  setQuickTranslating(true)
  quickResults.hidden = true

  void sendQuickTranslate(text, targetLanguage, backTranslationLanguage)
    .then(async (response) => {
      if (!response.ok) throw new Error(response.error)
      quickJapanese.textContent = response.japanese
      quickEnglish.textContent = response.english
      quickResults.hidden = false
      quickUiState.history = [
        {
          id: crypto.randomUUID(),
          source: text,
          japanese: response.japanese,
          english: response.english,
          createdAt: Date.now(),
        },
        ...retainRecentHistory(quickUiState.history),
      ].slice(0, 50)
      quickUiState.draft = quickSource.value
      const inputIsUnchanged = quickSource.value.trim() === text
      quickUiState.lastTranslatedSource = inputIsUnchanged ? quickSource.value : undefined
      quickUiState.clearAfterClose = inputIsUnchanged
      // Persist before considering the translation complete. Chrome action
      // popups can be destroyed immediately when the user clicks elsewhere.
      await saveQuickUiState()
      renderHistory()
    })
    .catch(() => {
      // Keep the source text intact and restore the button so retry always works.
    })
    .finally(() => setQuickTranslating(false))
})

function sendQuickTranslate(
  text: string,
  targetLanguage: string,
  backTranslationLanguage: string,
): Promise<QuickTranslateResponse> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({
        type: "quick-translate",
        text,
        targetLanguage,
        backTranslationLanguage,
      }, (response?: QuickTranslateResponse) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
          return
        }
        if (!response) {
          reject(new Error("Quick translation returned no response."))
          return
        }
        resolve(response)
      })
    } catch (error) {
      reject(error)
    }
  })
}

function retainRecentHistory(history: QuickHistoryEntry[] | undefined): QuickHistoryEntry[] {
  if (!Array.isArray(history)) return []
  const cutoff = Date.now() - QUICK_HISTORY_RETENTION_MS
  return history.filter((entry) => Number.isFinite(entry?.createdAt) && entry.createdAt >= cutoff)
}

function setQuickTranslating(translating: boolean): void {
  quickTranslateButton.disabled = translating
  quickTranslateButton.replaceChildren()
  if (translating) {
    const spinner = document.createElement("span")
    spinner.className = "button-spinner"
    spinner.setAttribute("aria-label", "Translating")
    quickTranslateButton.append(spinner)
  } else {
    const label = document.createElement("span")
    label.className = "button-label"
    label.textContent = "Translate"
    quickTranslateButton.append(label)
  }
}

for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-copy]"))) {
  button.addEventListener("click", () => {
    const text = button.dataset.copy === "japanese" ? quickJapanese.textContent : quickEnglish.textContent
    void navigator.clipboard.writeText(text ?? "").then(() => {
      button.style.color = "#007a5a"
      window.setTimeout(() => { button.style.color = "#1264a3" }, 700)
    })
  })
}

for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-move]"))) {
  button.addEventListener("click", () => {
    const text = button.dataset.move === "japanese" ? quickJapanese.textContent : quickEnglish.textContent
    if (!text) return
    chrome.runtime.sendMessage({ type: "append-to-slack-input", text }, (response?: { ok: boolean; error?: string }) => {
      const moved = !chrome.runtime.lastError && response?.ok
      button.style.color = moved ? "#007a5a" : "#c4314b"
      button.title = moved ? "Moved to Slack input" : response?.error ?? "Could not reach Slack"
      window.setTimeout(() => {
        button.style.color = ""
        button.title = "Move to Slack input"
      }, 1200)
    })
  })
}

document.querySelector<HTMLButtonElement>("#clear-source")!.addEventListener("click", () => {
  quickSource.value = ""
  quickUiState.draft = ""
  quickUiState.clearAfterClose = false
  quickUiState.lastTranslatedSource = undefined
  quickResults.hidden = true
  void saveQuickUiState()
  quickSource.focus()
})

document.querySelector<HTMLButtonElement>("#clear-history")!.addEventListener("click", () => {
  quickUiState.history = []
  void saveQuickUiState()
  renderHistory()
})

document.querySelector<HTMLButtonElement>("#show-settings")!.addEventListener("click", () => {
  mainView.hidden = true
  settingsView.hidden = false
})

document.querySelector<HTMLButtonElement>("#back-main")!.addEventListener("click", () => {
  settingsView.hidden = true
  mainView.hidden = false
})

showLogsButton.addEventListener("click", () => {
  logsModal.showModal()
  void loadLogs()
})

document.querySelector<HTMLButtonElement>("#retranslate-all")!.addEventListener("click", () => {
  chrome.runtime.sendMessage(
    { type: "retranslate-visible-from-popup" },
    (response?: { ok: boolean; queued?: number }) => {
      saveStatus.className = response?.ok ? "save-status success" : "save-status error"
      saveStatus.textContent = response?.ok
        ? `${response.queued ?? 0} visible messages queued for retranslation.`
        : "No visible Slack messages could be retranslated."
    },
  )
})

document.querySelector<HTMLButtonElement>("#terminate-all")!.addEventListener("click", () => {
  stopSlackTranslations()
})

function stopSlackTranslations(): void {
  chrome.runtime.sendMessage({ type: "terminate-slack-translations" }, (response?: { ok: boolean }) => {
    saveStatus.className = response?.ok ? "save-status success" : "save-status error"
    saveStatus.textContent = response?.ok
      ? "Queued translations stopped. Active translations will finish. Cache kept."
      : "Could not stop translations on the active Slack tab."
  })
}

document.querySelector<HTMLButtonElement>("#close-logs")!.addEventListener("click", () => logsModal.close())
document.querySelector<HTMLButtonElement>("#refresh-logs")!.addEventListener("click", () => void loadLogs())
document.querySelector<HTMLButtonElement>("#clear-logs")!.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "clear-logs" }, () => void loadLogs())
})
document.querySelector<HTMLButtonElement>("#copy-logs")!.addEventListener("click", () => {
  void navigator.clipboard.writeText(JSON.stringify(currentLogs, null, 2))
})

async function loadLogs(): Promise<void> {
  currentLogs = await chrome.runtime.sendMessage({ type: "get-logs" }) as SlacktorLogEntry[]
  logsList.replaceChildren()
  for (const entry of currentLogs) {
    const item = document.createElement("article")
    item.className = `log-entry ${entry.level}`
    const heading = document.createElement("header")
    heading.innerHTML = `<strong>${entry.scope}</strong><time>${new Date(entry.createdAt).toLocaleTimeString()}</time>`
    const message = document.createElement("p")
    message.textContent = entry.message
    item.append(heading, message)
    if (entry.details) {
      const details = document.createElement("pre")
      details.textContent = JSON.stringify(entry.details, null, 2)
      item.append(details)
    }
    logsList.append(item)
  }
  logsEmpty.hidden = currentLogs.length > 0
}

async function refreshSlackApiStats(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    const stats = await chrome.runtime.sendMessage({
      type: "get-slack-translation-stats",
      tabId: tab?.id,
    }) as {
      waiting: number
      active: number
      retrying: number
      translatedToday: number
      requestsToday: number
    }
    const retrying = stats.retrying > 0 ? ` · ${stats.retrying} retrying` : ""
    slackQueueStats.textContent = `${stats.waiting} waiting · ${stats.active} active${retrying}`
    slackProgressStats.textContent = `${stats.translatedToday} translated today · ${stats.requestsToday} LLM requests`
    slackQueueStats.className = `api-stats ${stats.waiting > 0 ? "busy" : stats.active > 0 ? "active" : ""}`
  } catch {
    slackQueueStats.textContent = "Stats unavailable"
    slackProgressStats.textContent = ""
    slackQueueStats.className = "api-stats"
  }
}

async function refreshProviderRuntimeStatus(): Promise<void> {
  try {
    const status = await chrome.runtime.sendMessage({ type: "get-provider-runtime-status" }) as {
      state: "unconfigured" | "ready" | "error"
      message: string
    }
    setProviderStatus(status.state, status.message)
  } catch {
    setProviderStatus("error", "Could not read provider status")
  }
}

function setProviderStatus(
  state: "unconfigured" | "ready" | "error",
  message: string,
): void {
  connectionStatus.className = `status-dot ${state}`
  connectionStatus.title = message
  connectionStatus.setAttribute("aria-label", message)
  showLogsButton.classList.toggle("provider-error", state === "error")
}

privacyConsentCheck.addEventListener("change", () => {
  acceptPrivacyConsent.disabled = !privacyConsentCheck.checked
})

acceptPrivacyConsent.addEventListener("click", () => {
  if (!privacyConsentCheck.checked) return
  void getProviderSettings().then((settings) => saveProviderSettings({
    ...settings,
    privacyConsent: true,
  })).then(() => {
    privacyConsent = true
    privacyConsentModal.close()
    saveStatus.className = "save-status success"
    saveStatus.textContent = "Slack translation enabled. Refresh an open Slack tab once."
  })
})
