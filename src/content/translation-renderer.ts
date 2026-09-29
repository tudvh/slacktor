import { SAME_LANGUAGE_SENTINEL } from "../background/translation-service"
import type { TranslateResponse } from "../shared/messages"
import { SLACKTOR_COLORS } from "../shared/theme"
import type { RawSlackMessage } from "../shared/types"
import type { ThreadContextPlan } from "../shared/types"
import { stripMediaAndFileLinks } from "./slack-adapter"

const ROOT_ATTRIBUTE = "data-slacktor-translation"
const RENDERED_ATTRIBUTE = "data-slacktor-rendered"
const RETRANSLATE_ACTION_ATTRIBUTE = "data-slacktor-retranslate-action"
// Icon shapes are taken verbatim from lucide-react v1.48.0 node data so that
// the content-script overlay and the popup share an identical visual language.
// Play is rendered filled (fill:currentColor) because lucide's default stroke
// outline is too faint to read as a "translate" affordance at 14 px.
const STROKE_ICON_ATTRS =
  'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
// lucide Play — filled variant for better affordance at small sizes
const PLAY_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>'
// lucide Zap
const LIGHTNING_ICON = `<svg viewBox="0 0 24 24" ${STROKE_ICON_ATTRS} aria-hidden="true"><path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z"/></svg>`
// lucide RotateCw
const RETRANSLATE_ICON = `<svg viewBox="0 0 24 24" ${STROKE_ICON_ATTRS} aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`
// lucide Copy
const COPY_ICON = `<svg viewBox="0 0 24 24" ${STROKE_ICON_ATTRS} aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
// lucide Check (v1.48: path, not polyline)
const CHECK_ICON = `<svg viewBox="0 0 24 24" ${STROKE_ICON_ATTRS} aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`
// lucide LoaderCircle (alias Loader2) — animated via CSS in setSpinnerIcon()
const SPINNER_ICON = `<svg viewBox="0 0 24 24" ${STROKE_ICON_ATTRS} aria-label="Translating" role="status" style="display:inline-block;width:0.9em;height:0.9em;color:${SLACKTOR_COLORS.mutedForeground};vertical-align:-0.15em;animation:slacktor-spin 0.75s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`

export type TranslationController = {
  run: (priority?: boolean) => Promise<string | undefined>
  runUrgent: () => Promise<string | undefined>
  markQueued: (prioritize: () => void) => void
  markPrioritized: () => void
  retranslate: () => Promise<string | undefined>
  applyTranslation: (translation: string) => void
  markStopped: () => void
  markSkipped: (reason: string) => void
  markSameLanguage: () => void
  isConnected: () => boolean
  cancel: () => void
  isTranslated?: () => boolean
}

type ContextLoader = () => Promise<ThreadContextPlan>

export function renderPlaceholder(
  messageNode: HTMLElement,
  anchor: HTMLElement,
  message: RawSlackMessage,
  loadContext: ContextLoader,
  onTranslationComplete?: (translation: string) => void,
): TranslationController | undefined {
  harvestEmojis(messageNode)
  ensureSlacktorStyles()
  const existingHost = messageNode.querySelector<HTMLElement>(`[${ROOT_ATTRIBUTE}]`)
  if (messageNode.hasAttribute(RENDERED_ATTRIBUTE) && existingHost?.isConnected) return undefined
  // Slack can replace only the message body when actions such as Save for later
  // update its state. Remove the stale marker so the translation UI can recover.
  messageNode.removeAttribute(RENDERED_ATTRIBUTE)
  existingHost?.remove()

  const host = document.createElement("div")
  host.setAttribute(ROOT_ATTRIBUTE, "")
  host.dataset.sourceMessageId = message.messageId
  host.className = "notranslate slacktor-translation"
  host.lang = "vi"
  host.style.cssText = "display:block;margin-top:6px"

  const translation = document.createElement("div")
  translation.className = "notranslate slacktor-translation__text"
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("aria-label", "Translate message")
  button.title = "Translate message"
  setPlayIcon(button)
  button.style.cssText = `border:0;background:transparent;color:${SLACKTOR_COLORS.primary};cursor:pointer;font:inherit;padding:0 4px 0 0;vertical-align:middle;line-height:0;display:inline-flex;align-items:center;`

  const result = document.createElement("div")
  result.className = "slacktor-translation__content"
  result.style.cssText =
    "display:inline;margin-left:4px;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:inherit;"
  result.textContent = "Slacktor"

  const actions = document.createElement("div")
  actions.className = "slacktor-translation__actions"
  actions.style.cssText = "display:none;align-items:center;gap:8px;margin-top:6px;user-select:none;"

  let latestTranslationText = ""
  let translating = false
  let requestGeneration = 0
  let activeRequestId: string | undefined
  let prioritize: (() => void) | undefined

  const retranslateButton = createRetranslateButton(() => void translate(true))
  const copyButton = createCopyButton(() => latestTranslationText || result.innerText.trim())
  actions.append(retranslateButton, copyButton)
  attachInstantTooltip(
    button,
    () => button.getAttribute("aria-label") || button.dataset.slacktorTitle || "Translate",
  )

  const showSpinner = (prioritizable = false) => {
    button.style.display = prioritizable ? "inline-flex" : "none"
    button.disabled = false
    result.style.display = "inline"
    result.style.marginLeft = "4px"
    if (prioritizable) {
      setLightningIcon(button)
      button.title = "Translate now"
      button.setAttribute("aria-label", "Translate now")
    }
    actions.style.display = "none"
    setSpinnerIcon(result)
  }

  const markSameLanguage = () => {
    translation.style.borderLeft = `2px solid ${SLACKTOR_COLORS.primary}`
    translation.style.padding = "3px 7px"
    prioritize = undefined
    actions.style.display = "none"
    button.style.display = "inline-flex"
    button.disabled = false
    setRetranslateIcon(button)
    button.title = "Translate message manually"
    button.setAttribute("aria-label", "Translate message manually")
    result.style.color = ""
    result.style.display = "inline"
    result.style.alignItems = ""
    result.style.gap = ""
    result.style.marginLeft = "4px"
    result.style.fontSize = "12px"
    result.style.fontStyle = "italic"
    result.style.opacity = "0.75"
    result.textContent = "Already in target language"
  }

  const applyTranslation = (text: string) => {
    if (text === SAME_LANGUAGE_SENTINEL) {
      markSameLanguage()
      return
    }
    // Restore the border-left bar (may have been cleared by markSameLanguage)
    translation.style.borderLeft = `2px solid ${SLACKTOR_COLORS.primary}`
    translation.style.padding = "3px 7px"
    prioritize = undefined
    button.style.display = "none"
    result.style.color = ""
    result.style.marginLeft = "0"
    result.style.fontSize = ""
    result.style.fontStyle = ""
    result.style.opacity = ""
    result.style.display = ""
    result.style.alignItems = ""
    result.style.gap = ""
    latestTranslationText = text
    if (text) {
      result.innerHTML = formatTranslationHtml(text)
      result.style.display = "block"
      actions.style.display = "flex"
      retranslateButton.style.display = "inline-flex"
      copyButton.style.display = "inline-flex"
    } else {
      result.textContent = ""
      result.style.display = "none"
      actions.style.display = "none"
    }
  }

  const translate = async (
    forceRefresh = false,
    urgent = false,
    priority = false,
  ): Promise<string | undefined> => {
    if (translating && !urgent) return undefined
    translating = true
    translation.style.borderLeftColor = SLACKTOR_COLORS.primary
    const generation = ++requestGeneration
    button.disabled = true
    showSpinner(!urgent && Boolean(prioritize))

    try {
      const context = await loadContext().catch(() => ({ recentMessages: [] }))
      activeRequestId = crypto.randomUUID()
      const response = await sendTranslationRequest(
        message,
        context,
        forceRefresh,
        urgent,
        priority,
        activeRequestId,
      )

      if (generation !== requestGeneration) return undefined
      if (!response?.ok) {
        if (response?.cancelled) return undefined
        showRetry(response?.error ?? "Translation failed.")
        return undefined
      }

      applyTranslation(response.translation)
      onTranslationComplete?.(response.translation)
      return response.translation
    } catch (error: unknown) {
      // Reloading the extension destroys an in-flight content-script context.
      // Avoid emitting an uncaught error from the old renderer instance.
      if (
        generation === requestGeneration &&
        !isContextInvalidated(error) &&
        !isAbortError(error)
      ) {
        showRetry("Translation failed.")
      }
      return undefined
    } finally {
      if (generation === requestGeneration) {
        translating = false
        activeRequestId = undefined
      }
    }
  }

  const showRetry = (error: string) => {
    translation.style.borderLeftColor = SLACKTOR_COLORS.destructive
    actions.style.display = "none"
    result.style.display = "inline"
    result.style.marginLeft = "4px"
    result.style.fontSize = ""
    result.style.fontStyle = ""
    result.style.opacity = ""
    result.textContent = error
    button.disabled = false
    button.style.display = "inline-flex"
    setRetranslateIcon(button)
    button.title = "Retry translation"
    button.setAttribute("aria-label", "Retry translation")
  }

  button.addEventListener("click", () => {
    if (prioritize) {
      prioritize()
      return
    }
    void translate()
  })

  translation.append(button, result, actions)
  translation.style.cssText = [
    "display:block",
    "padding:3px 7px",
    `border-left:2px solid ${SLACKTOR_COLORS.primary}`,
    `color:${SLACKTOR_COLORS.mutedForeground}`,
    "font:inherit",
    "line-height:inherit",
  ].join(";")
  host.append(translation)

  // Keep the translation inside Slack's message-text block, but as its final
  // block child. This prevents it from being inserted between paragraphs or
  // list blocks in multi-section messages.
  anchor.append(host)
  messageNode.setAttribute(RENDERED_ATTRIBUTE, "")
  return {
    run: (priority = false) => translate(false, false, priority),
    runUrgent: () => translate(true, true),
    markQueued(onPrioritize) {
      translation.style.borderLeftColor = SLACKTOR_COLORS.primary
      prioritize = onPrioritize
      actions.style.display = "none"
      result.style.display = "inline"
      result.style.marginLeft = "4px"
      setLightningIcon(button)
      button.title = "Translate next"
      button.setAttribute("aria-label", "Translate next")
      result.textContent = "Translation queued"
    },
    markPrioritized() {
      showSpinner(false)
    },
    retranslate: () => translate(true),
    applyTranslation,
    markStopped() {
      translation.style.borderLeftColor = SLACKTOR_COLORS.primary
      prioritize = undefined
      actions.style.display = "none"
      result.style.display = "inline"
      result.style.marginLeft = "4px"
      result.textContent = "Translation stopped."
      button.disabled = false
      button.style.display = "inline-flex"
      setRetranslateIcon(button)
      button.title = "Retranslate message"
      button.setAttribute("aria-label", "Retranslate message")
    },
    markSkipped(reason: string) {
      translation.style.borderLeftColor = SLACKTOR_COLORS.primary
      prioritize = undefined
      actions.style.display = "none"
      button.style.display = "inline-flex"
      button.disabled = false
      setRetranslateIcon(button)
      button.title = "Translate message manually"
      button.setAttribute("aria-label", "Translate message manually")
      result.style.display = "inline"
      result.style.marginLeft = "4px"
      result.style.fontSize = "12px"
      result.style.fontStyle = "italic"
      result.style.opacity = "0.75"
      result.textContent = reason
    },
    markSameLanguage,
    isConnected: () => messageNode.isConnected,
    isTranslated: () => Boolean(latestTranslationText),
    cancel() {
      requestGeneration += 1
      translating = false
      if (activeRequestId) {
        if (typeof chrome.runtime?.sendMessage === "function") {
          void chrome.runtime
            .sendMessage({ type: "cancel-translation", requestId: activeRequestId })
            .catch(() => undefined)
        }
        activeRequestId = undefined
      }
    },
  }
}

function setPlayIcon(button: HTMLButtonElement): void {
  button.innerHTML = PLAY_ICON
  const icon = button.querySelector("svg")
  if (icon instanceof SVGElement)
    icon.style.cssText = "fill:currentColor;height:14px;width:14px;vertical-align:-2px"
}

function setLightningIcon(button: HTMLButtonElement): void {
  button.innerHTML = LIGHTNING_ICON
  const icon = button.querySelector("svg")
  // Lightning/retranslate are stroke-only lucide glyphs (fill: none already
  // set as an SVG attribute); only size them here, don't force a CSS fill
  // that would override the outline look.
  if (icon instanceof SVGElement) icon.style.cssText = "height:14px;width:14px;vertical-align:-2px"
}

function setRetranslateIcon(button: HTMLButtonElement): void {
  button.innerHTML = RETRANSLATE_ICON
  const icon = button.querySelector("svg")
  if (icon instanceof SVGElement) icon.style.cssText = "height:14px;width:14px;vertical-align:-2px"
}

function setCopyIcon(button: HTMLButtonElement): void {
  button.innerHTML = COPY_ICON
  const icon = button.querySelector("svg")
  if (icon instanceof SVGElement) icon.style.cssText = "height:14px;width:14px;vertical-align:-2px"
}

function setCheckIcon(button: HTMLButtonElement): void {
  button.innerHTML = CHECK_ICON
  const icon = button.querySelector("svg")
  // Green is intentional here (distinct from the primary blue used for the
  // idle action icons) so the "copied" confirmation reads as a clear success
  // state. Uses the shared success token instead of an ad-hoc hex so it
  // matches the popup's own "Copied!" checkmark (QuickResultCard's
  // text-success class).
  if (icon instanceof SVGElement)
    icon.style.cssText = `height:14px;width:14px;vertical-align:-2px;color:${SLACKTOR_COLORS.success}`
}

function ensureSlacktorStyles(): void {
  if (typeof document === "undefined" || document.getElementById("slacktor-shared-styles")) return
  const style = document.createElement("style")
  style.id = "slacktor-shared-styles"
  style.textContent = `@keyframes slacktor-spin { to { transform: rotate(360deg); } }
.slacktor-translation__content .c-mrkdwn__quote:before,
.slacktor-translation__content .c-mrkdwn__quote:after,
.slacktor-translation__content .c-mrkdwn__pre:before,
.slacktor-translation__content .p-rich_text_list:before {
  top: 0 !important;
  height: 100% !important;
}`
  ;(document.head || document.documentElement).appendChild(style)
}

function setSpinnerIcon(container: HTMLElement): void {
  ensureSlacktorStyles()
  container.innerHTML = SPINNER_ICON
}

let activeTooltipEl: HTMLDivElement | null = null

function showInstantTooltip(target: HTMLElement, text: string): void {
  hideInstantTooltip()
  if (!text) return

  const tooltip = document.createElement("div")
  tooltip.className = "notranslate slacktor-tooltip"
  tooltip.textContent = text
  tooltip.style.cssText = [
    "position:fixed",
    "z-index:99999",
    "background:rgba(26,29,33,0.95)",
    "color:#ffffff",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
    "font-size:11px",
    "font-weight:500",
    "line-height:1.3",
    "padding:3px 7px",
    "border-radius:4px",
    "box-shadow:0 2px 8px rgba(0,0,0,0.35)",
    "pointer-events:none",
    "white-space:nowrap",
    "opacity:0",
    "transform:translateY(2px)",
    "transition:opacity 0.1s ease, transform 0.1s ease",
  ].join(";")

  document.body.appendChild(tooltip)
  activeTooltipEl = tooltip

  const rect = target.getBoundingClientRect()
  const tooltipRect = tooltip.getBoundingClientRect()

  let top = rect.top - tooltipRect.height - 6
  let left = rect.left + rect.width / 2 - tooltipRect.width / 2

  if (top < 4) {
    top = rect.bottom + 6
  }
  if (left < 6) left = 6
  if (left + tooltipRect.width > window.innerWidth - 6) {
    left = window.innerWidth - tooltipRect.width - 6
  }

  tooltip.style.top = `${Math.round(top)}px`
  tooltip.style.left = `${Math.round(left)}px`

  requestAnimationFrame(() => {
    if (activeTooltipEl === tooltip) {
      tooltip.style.opacity = "1"
      tooltip.style.transform = "translateY(0)"
    }
  })
}

function hideInstantTooltip(): void {
  if (activeTooltipEl) {
    activeTooltipEl.remove()
    activeTooltipEl = null
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("scroll", hideInstantTooltip, { capture: true, passive: true })
}

function attachInstantTooltip(button: HTMLElement, getTooltipText: () => string): void {
  button.addEventListener("mouseenter", () => {
    if (button.hasAttribute("title")) {
      button.dataset.slacktorTitle = button.getAttribute("title") || ""
      button.removeAttribute("title")
    }
    showInstantTooltip(button, getTooltipText())
  })
  button.addEventListener("mouseleave", () => {
    if (button.dataset.slacktorTitle !== undefined) {
      button.setAttribute("title", button.dataset.slacktorTitle)
    }
    hideInstantTooltip()
  })
}

function fallbackCopy(text: string): void {
  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.style.position = "fixed"
  textarea.style.opacity = "0"
  document.body.appendChild(textarea)
  textarea.select()
  try {
    document.execCommand("copy")
  } catch {
    // Ignore copy error
  }
  textarea.remove()
}

function createRetranslateButton(onTranslate: () => void): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute(RETRANSLATE_ACTION_ATTRIBUTE, "")
  setRetranslateIcon(button)
  button.title = "Retranslate message"
  button.setAttribute("aria-label", "Retranslate message")
  button.style.cssText = [
    "border:0",
    "background:transparent",
    `color:${SLACKTOR_COLORS.primary}`,
    "cursor:pointer",
    "display:none",
    "font:inherit",
    "padding:2px",
    "vertical-align:middle",
    "line-height:0",
    "opacity:0.75",
    "transition:opacity 0.15s ease",
  ].join(";")
  button.addEventListener("mouseenter", () => {
    button.style.opacity = "1"
  })
  button.addEventListener("mouseleave", () => {
    button.style.opacity = "0.75"
  })
  button.addEventListener("click", onTranslate)
  attachInstantTooltip(button, () => "Retranslate message")
  return button
}

function createCopyButton(getText: () => string): HTMLButtonElement {
  const button = document.createElement("button")
  button.type = "button"
  button.setAttribute("data-slacktor-copy-action", "")
  setCopyIcon(button)
  button.title = "Copy translation"
  button.setAttribute("aria-label", "Copy translation")
  button.style.cssText = [
    "border:0",
    "background:transparent",
    `color:${SLACKTOR_COLORS.primary}`,
    "cursor:pointer",
    "display:none",
    "font:inherit",
    "padding:2px",
    "vertical-align:middle",
    "line-height:0",
    "opacity:0.75",
    "transition:opacity 0.15s ease",
  ].join(";")

  let isCopied = false
  let resetTimeout: ReturnType<typeof setTimeout> | undefined

  button.addEventListener("mouseenter", () => {
    button.style.opacity = "1"
  })
  button.addEventListener("mouseleave", () => {
    button.style.opacity = "0.75"
  })

  button.addEventListener("click", () => {
    const rawText = getText()
    if (!rawText) return
    const text = rawText
      .replace(/\[((?:\[[^\]\n]*\]|[^\]\n])+)\]\(slack:\/\/[^)]+\)/g, "$1")
      .replace(/\[((?:\[[^\]\n]*\]|[^\]\n])+)\]\((?:https?:\/\/|mailto:)[^)]+\)/g, "$1")
      .replace(/\[(@[^\]\n]+)\]/g, "$1")
      .replace(/\[(#[a-zA-Z0-9_-]+)\]/g, "$1")
      .trim()
    const doCopy = () => {
      isCopied = true
      setCheckIcon(button)
      button.setAttribute("aria-label", "Copied!")
      showInstantTooltip(button, "Copied!")

      if (resetTimeout) clearTimeout(resetTimeout)
      resetTimeout = setTimeout(() => {
        isCopied = false
        setCopyIcon(button)
        button.setAttribute("aria-label", "Copy translation")
        if (button.matches(":hover")) {
          showInstantTooltip(button, "Copy translation")
        } else {
          hideInstantTooltip()
        }
      }, 1500)
    }

    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(doCopy)
        .catch(() => {
          fallbackCopy(text)
          doCopy()
        })
    } else {
      fallbackCopy(text)
      doCopy()
    }
  })

  attachInstantTooltip(button, () => (isCopied ? "Copied!" : "Copy translation"))
  return button
}

function sendTranslationRequest(
  message: RawSlackMessage,
  context: ThreadContextPlan,
  forceRefresh: boolean,
  urgent = false,
  priority = false,
  requestId?: string,
): Promise<TranslateResponse | undefined> {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        { type: "translate", message, context, forceRefresh, urgent, priority, requestId },
        (response: TranslateResponse | undefined) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
            return
          }
          resolve(response)
        },
      )
    } catch (error) {
      reject(error)
    }
  })
}

function isContextInvalidated(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Extension context invalidated")
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError"
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// Same stroke-style "Link" glyph as lucide-react's <Link />.
const LINK_ICON_SVG = `<svg viewBox="0 0 24 24" ${STROKE_ICON_ATTRS} style="height:12px;width:12px;margin-right:3px;vertical-align:-1px;display:inline-block;flex-shrink:0;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`

function createMentionBadge(mention: string): string {
  return `<span class="c-member_slug" style="background:rgba(29,155,209,0.1);color:var(--p-color-accent, ${SLACKTOR_COLORS.primary});padding:0 4px;border-radius:3px;font-weight:500;text-decoration:none;display:inline-block;line-height:1.4;cursor:default;user-select:text;">${mention}</span>`
}

function createLinkPill(label: string): string {
  return `<span class="c-link_pill" style="background:rgba(29,155,209,0.1);color:var(--p-color-accent, ${SLACKTOR_COLORS.primary});padding:0 5px;border-radius:3px;font-weight:500;text-decoration:none;display:inline-flex;align-items:center;line-height:1.4;cursor:default;user-select:text;">${LINK_ICON_SVG}${label}</span>`
}

// Lucide-style Paperclip icon for files/attachments
const FILE_ICON_SVG = `<svg viewBox="0 0 24 24" ${STROKE_ICON_ATTRS} style="height:12px;width:12px;margin-right:4px;vertical-align:-1px;display:inline-block;flex-shrink:0;"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`

function createFilePill(fileName: string): string {
  const cleanName = escapeHtml(fileName)
  return `<span class="c-file_pill" style="background:rgba(128,128,128,0.12);color:var(--p-color-accent, ${SLACKTOR_COLORS.primary});padding:0 5px;border-radius:3px;font-weight:500;text-decoration:none;display:inline-flex;align-items:center;line-height:1.4;cursor:default;user-select:text;max-width:100%;"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-flex;align-items:center;">${FILE_ICON_SVG}${cleanName}</span></span>`
}

const knownEmojiUrls = new Map<string, string>()

export function harvestEmojis(root: ParentNode = document): void {
  try {
    const images = root.querySelectorAll<HTMLImageElement>(
      "img.c-emoji, .c-emoji img, [data-stringify-type='emoji'] img, img[data-stringify-type='emoji'], img[data-stringify-emoji]",
    )
    for (const img of Array.from(images)) {
      const code = img.getAttribute("alt") || img.dataset.stringifyEmoji
      const src = img.getAttribute("src")
      if (code && src && !src.includes("/files-pri/")) {
        const normalized = code.startsWith(":") && code.endsWith(":") ? code : `:${code}:`
        const cleanName = normalized.slice(1, -1)
        knownEmojiUrls.set(normalized, src)
        knownEmojiUrls.set(cleanName, src)
      }
    }
  } catch {
    // Ignore DOM errors if disconnected
  }
}

function parseMarkdownLists(text: string): string {
  const lines = text.split("\n")
  const result: string[] = []
  let inList = false
  const listStack: Array<{ type: "ul" | "ol"; indent: number }> = []

  const listLineRegex = /^([ \t]*)(?:([-*+•])|(\d+[.)]))[ \t]+(.*)$/
  let currentListHtml = ""

  const getBulletStyle = (depth: number, isOrdered: boolean): string => {
    if (isOrdered) {
      const types = ["decimal", "lower-alpha", "lower-roman"]
      return types[Math.min(depth, types.length - 1)]
    }
    const types = ["disc", "circle", "square"]
    return types[Math.min(depth, types.length - 1)]
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const match = line.match(listLineRegex)

    if (match) {
      const indentStr = match[1]
      const indent = indentStr.replace(/\t/g, "  ").length
      const isOrdered = Boolean(match[3])
      const type = isOrdered ? "ol" : "ul"
      const content = match[4]

      if (!inList) {
        inList = true
        listStack.push({ type, indent })
        const depth = listStack.length - 1
        const listStyle = getBulletStyle(depth, isOrdered)
        currentListHtml = `<${type} class="slacktor-list ${isOrdered ? "slacktor-list--ordered" : "slacktor-list--bullet"}" data-indent="${depth}" style="white-space:normal;padding-left:${depth > 0 ? 18 : 22}px;margin:${depth > 0 ? "2px 0" : "4px 0"};list-style-type:${listStyle} !important;list-style-position:outside;"><li data-stringify-indent="${depth}" style="margin:2px 0;white-space:normal;">${content}`
      } else {
        const current = listStack[listStack.length - 1]
        if (indent > current.indent) {
          listStack.push({ type, indent })
          const depth = listStack.length - 1
          const listStyle = getBulletStyle(depth, isOrdered)
          currentListHtml += `<${type} class="slacktor-list ${isOrdered ? "slacktor-list--ordered" : "slacktor-list--bullet"} slacktor-list--nested" data-indent="${depth}" style="white-space:normal;padding-left:18px;margin:2px 0;list-style-type:${listStyle} !important;list-style-position:outside;"><li data-stringify-indent="${depth}" style="margin:2px 0;white-space:normal;">${content}`
        } else if (indent < current.indent) {
          let closing = ""
          while (listStack.length > 1 && indent < listStack[listStack.length - 1].indent) {
            const popped = listStack.pop()
            if (popped) closing += `</li></${popped.type}>`
          }
          const depth = listStack.length - 1
          currentListHtml += `${closing}</li><li data-stringify-indent="${depth}" style="margin:2px 0;white-space:normal;">${content}`
        } else {
          const depth = listStack.length - 1
          currentListHtml += `</li><li data-stringify-indent="${depth}" style="margin:2px 0;white-space:normal;">${content}`
        }
      }
    } else {
      if (inList) {
        if (line.trim() === "") {
          let nextIdx = i + 1
          while (nextIdx < lines.length && lines[nextIdx].trim() === "") {
            nextIdx += 1
          }
          if (nextIdx < lines.length && listLineRegex.test(lines[nextIdx])) {
            continue
          }
        }
        let closing = ""
        while (listStack.length > 0) {
          const popped = listStack.pop()
          if (popped) closing += `</li></${popped.type}>`
        }
        currentListHtml += closing
        result.push(currentListHtml)
        currentListHtml = ""
        inList = false
        if (line.trim() === "") {
          continue
        }
      }
      if (line.trim() === "") {
        let nextIdx = i + 1
        while (nextIdx < lines.length && lines[nextIdx].trim() === "") {
          nextIdx += 1
        }
        if (nextIdx < lines.length && listLineRegex.test(lines[nextIdx])) {
          continue
        }
        if (
          result.length > 0 &&
          (result[result.length - 1].endsWith("</ul>") ||
            result[result.length - 1].endsWith("</ol>"))
        ) {
          continue
        }
      }
      result.push(line)
    }
  }

  if (inList) {
    let closing = ""
    while (listStack.length > 0) {
      const popped = listStack.pop()
      if (popped) closing += `</li></${popped.type}>`
    }
    currentListHtml += closing
    result.push(currentListHtml)
  }

  return result.join("\n")
}

export function formatTranslationHtml(text: string): string {
  // Strip any trailing edited badges
  let processed = text.replace(/(?:^|\s*)\((?:edited|đã chỉnh sửa|編集済み)\)\s*$/gi, "").trim()

  // 1. Strip Slack files, thumbnails, and media attachment links
  processed = stripMediaAndFileLinks(processed)

  // Collapse redundant blank lines between consecutive list items
  let prev = ""
  while (prev !== processed) {
    prev = processed
    processed = processed.replace(
      /((?:^|\r?\n)[ \t]*(?:[-*+•]|\d+[.)])[^\r\n]*)\r?\n\r?\n+(?=[ \t]*(?:[-*+•]|\d+[.)])[ \t]+)/g,
      "$1\n",
    )
  }

  const tokens: string[] = []
  const createToken = (html: string): string => {
    const id = `\uE000${tokens.length}\uE001`
    tokens.push(html)
    return id
  }

  // 2. Extract and preserve multi-line code blocks before escaping
  processed = processed.replace(
    /(?:^|\r?\n)*```(?:[a-zA-Z0-9_-]+)?\r?\n?([\s\S]*?)```(?:\r?\n)*/g,
    (_match, code: string) => {
      const escaped = escapeHtml(code.trim())
      return createToken(
        `<pre class="c-mrkdwn__pre p-rich_text_preformatted" style="background:rgba(128,128,128,0.14);border:1px solid rgba(128,128,128,0.22);color:currentColor;border-radius:4px;padding:6px 8px;margin:6px 0;font-family:Monaco,Menlo,Consolas,Courier,monospace;font-size:12px;line-height:1.4;overflow-x:auto;"><code>${escaped}</code></pre>`,
      )
    },
  )

  // 3. Escape HTML of the remaining text
  processed = escapeHtml(processed)

  // 4. Inline code: `code`
  processed = processed.replace(/`([^`\n]+)`/g, (_match, rawCode: string) => {
    const code = rawCode
      .replace(/^(\*{1,2})([^*\s\n][^*\n]*?)\1$/, "$2")
      .replace(/^(_+)([^_\s\n][^_\n]*?)\1$/, "$2")
    return createToken(
      `<code class="c-mrkdwn__code" style="background:rgba(128,128,128,0.14);border:1px solid rgba(128,128,128,0.22);color:currentColor;padding:1.5px 5px;border-radius:4px;font-family:Monaco,Menlo,Consolas,Courier,monospace;font-size:12px;">${code}</code>`,
    )
  })

  // 5. Markdown links: [label](url) -> non-clickable styled span
  processed = processed.replace(
    /\[((?:\[[^\]\n]*\]|[^\]\n])+)\]\(((?:https?:\/\/|mailto:|slack:\/\/)[^\s)<>"]+)\)/g,
    (_match, label: string, url: string) => {
      if (url === "slack://file" || url.includes(".slack.com/files/")) {
        let fileName = label
        if (fileName.startsWith("http://") || fileName.startsWith("https://")) {
          const path = fileName.split("?")[0].split("#")[0]
          fileName = decodeURIComponent(path.split("/").pop() || "file")
        }
        return createToken(createFilePill(fileName))
      }
      if (
        url.includes("files.slack.com") ||
        url.includes("/files-pri/") ||
        url.includes("/files-tmb/")
      ) {
        return ""
      }
      const isMention =
        label.startsWith("@") ||
        url === "slack://mention" ||
        url.includes("/team/") ||
        url.includes("/user/")
      if (isMention) {
        return createToken(createMentionBadge(label))
      }
      if (label.startsWith("#") || url === "slack://channel") {
        return createToken(
          `<span class="c-channel_name" style="background:rgba(29,155,209,0.08);color:var(--p-color-accent, ${SLACKTOR_COLORS.primary});padding:0 4px;border-radius:3px;font-weight:500;text-decoration:none;display:inline-block;line-height:1.4;cursor:default;user-select:text;">${label}</span>`,
        )
      }
      return createToken(createLinkPill(label.replace(/^mailto:/i, "")))
    },
  )

  // 6. Slack mrkdwn links: &lt;url|label&gt; -> non-clickable styled span
  processed = processed.replace(
    /&lt;((?:https?:\/\/|mailto:|slack:\/\/)[^\s|]+)\|([^&]+)&gt;/g,
    (_match, url: string, label: string) => {
      if (url === "slack://file" || url.includes(".slack.com/files/")) {
        let fileName = label
        if (fileName.startsWith("http://") || fileName.startsWith("https://")) {
          const path = fileName.split("?")[0].split("#")[0]
          fileName = decodeURIComponent(path.split("/").pop() || "file")
        }
        return createToken(createFilePill(fileName))
      }
      if (
        url.includes("files.slack.com") ||
        url.includes("/files-pri/") ||
        url.includes("/files-tmb/")
      ) {
        return ""
      }
      const isMention =
        label.startsWith("@") ||
        url === "slack://mention" ||
        url.includes("/team/") ||
        url.includes("/user/")
      if (isMention) {
        return createToken(createMentionBadge(label))
      }
      if (label.startsWith("#") || url === "slack://channel") {
        return createToken(
          `<span class="c-channel_name" style="background:rgba(29,155,209,0.08);color:var(--p-color-accent, ${SLACKTOR_COLORS.primary});padding:0 4px;border-radius:3px;font-weight:500;text-decoration:none;display:inline-block;line-height:1.4;cursor:default;user-select:text;">${label}</span>`,
        )
      }
      return createToken(createLinkPill(label.replace(/^mailto:/i, "")))
    },
  )

  // 7. Slack mrkdwn channel links: &lt;#C123|channel-name&gt;
  processed = processed.replace(
    /&lt;#[A-Z0-9]+(?:\|([^&]+))?&gt;/g,
    (_match, channelName?: string) => {
      const name = channelName ? `#${channelName}` : "#channel"
      return createToken(
        `<span class="c-channel_name" style="background:rgba(29,155,209,0.08);color:var(--p-color-accent, ${SLACKTOR_COLORS.primary});padding:0 4px;border-radius:3px;font-weight:500;text-decoration:none;display:inline-block;line-height:1.4;cursor:default;user-select:text;">${name}</span>`,
      )
    },
  )

  // 8. Raw URLs: https://... or http://... -> non-clickable styled span
  processed = processed.replace(
    /(^|[\s(])(https?:\/\/[^\s)<>"'`]+)/g,
    (_match, prefix: string, url: string) => {
      if (url.includes(".slack.com/files/")) {
        const path = url.split("?")[0].split("#")[0]
        const fileName = decodeURIComponent(path.split("/").pop() || "file")
        const token = createToken(createFilePill(fileName))
        return `${prefix}${token}`
      }
      if (
        url.includes("files.slack.com") ||
        url.includes("/files-pri/") ||
        url.includes("/files-tmb/")
      ) {
        return prefix
      }
      const token = createToken(createLinkPill(url))
      return `${prefix}${token}`
    },
  )

  // 8b. Email addresses and mailto: -> non-clickable styled span
  processed = processed.replace(
    /(^|[\s(])(?:mailto:)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?=[.,!?;:\s)]|$)/g,
    (_match, prefix: string, email: string) => {
      const token = createToken(createLinkPill(email))
      return `${prefix}${token}`
    },
  )

  // 8c. Domain-like truncated link slugs or hostnames (e.g. faq.atone.be/hc/ja/…/… or github.com/...)
  processed = processed.replace(
    /(^|[\s(])((?:[a-zA-Z0-9-]+\.)+(?:com|org|net|io|me|be|co|jp|vn|app|dev|ai|xyz|info|edu|gov)(?:\/[^\s)<>"'`]*)?)/g,
    (_match, prefix: string, url: string) => {
      if (
        url.includes("files.slack.com") ||
        url.includes("/files-pri/") ||
        url.includes("/files-tmb/")
      ) {
        return prefix
      }
      const token = createToken(createLinkPill(url))
      return `${prefix}${token}`
    },
  )

  // 9a. Bracketed mentions: [@user]
  processed = processed.replace(/\[(@[^\]\n]+)\]/g, (_match, mention: string) => {
    return createToken(createMentionBadge(mention))
  })

  // 9b. Raw mentions: @user, @channel, @here, @everyone
  processed = processed.replace(
    /(^|[\s(])(@(?:channel|here|everyone|[\p{L}\p{N}._-]+))(?=[.,!?;:\s)]|$)/gu,
    (_match, prefix: string, mention: string) => {
      const token = createToken(createMentionBadge(mention))
      return `${prefix}${token}`
    },
  )

  // 10. Bracketed channels: [#channel-name]
  processed = processed.replace(/\[(#[a-zA-Z0-9_-]+)\]/g, (_match, channel: string) => {
    const token = createToken(
      `<span class="c-channel_name" style="background:rgba(29,155,209,0.08);color:var(--p-color-accent, ${SLACKTOR_COLORS.primary});padding:0 4px;border-radius:3px;font-weight:500;text-decoration:none;display:inline-block;line-height:1.4;cursor:default;user-select:text;">${channel}</span>`,
    )
    return token
  })

  // 11. Emojis: :emoji_name: or :emoji_name::skin-tone-X:
  processed = processed.replace(
    /(?<!\d):([a-zA-Z0-9_+-]+(?:::skin-tone-[1-6])?):(?!\d)/g,
    (fullMatch, emojiName: string) => {
      const normalizedCode = `:${emojiName}:`
      let src = knownEmojiUrls.get(normalizedCode) || knownEmojiUrls.get(emojiName)
      if (!src && typeof document !== "undefined") {
        harvestEmojis(document)
        src = knownEmojiUrls.get(normalizedCode) || knownEmojiUrls.get(emojiName)
      }
      if (src) {
        return createToken(
          `<span class="c-emoji c-emoji__medium c-emoji--inline" style="display:inline-block;vertical-align:middle;line-height:1;"><img src="${src}" alt="${normalizedCode}" title="${normalizedCode}" style="width:20px;height:20px;vertical-align:-3px;object-fit:contain;display:inline-block;" /></span>`,
        )
      }

      return fullMatch
    },
  )

  // 12. Bold: *text* or **text**
  processed = processed.replace(
    /(?:\*\*([^*\n]+)\*\*|\*([^*\n]+)\*)/g,
    (_match, g1?: string, g2?: string) => {
      return `<strong>${g1 || g2}</strong>`
    },
  )

  // 13. Italic: _text_
  processed = processed.replace(/_([^_\n]+)_/g, (_match, italic: string) => {
    return `<em>${italic}</em>`
  })

  // 14. Strikethrough: ~text~
  processed = processed.replace(/~([^~\n]+)~/g, (_match, strike: string) => {
    return `<del>${strike}</del>`
  })

  // 15. Lists: parse markdown lists into native Slack ul/ol/li structure with multi-level nesting
  processed = parseMarkdownLists(processed)

  // 16. Blockquotes: group consecutive lines starting with &gt; or &gt;&gt;
  // Runs after inline formatting so blockquote HTML classes/styles are not scanned by markdown regexes.
  // Forwarded message cards (starting with ↳) use a card background without border-left to avoid double lines.
  // Regular blockquotes preserve Slack's standard quote style with border-left and transparent background.
  // Nested quotes (starting with &gt;&gt;) preserve Slack's native c-mrkdwn__quote_group and inner c-mrkdwn__quote structure.
  processed = processed.replace(
    /(^|\r?\n)((?:[ \t\u00A0]*(?<!\\)(?:&gt;)+(?:[ \t\u00A0]?[^\r\n]*)?(?:\r?\n|$)(?:[ \t\u00A0]*\r?\n(?=[ \t\u00A0]*(?<!\\)(?:&gt;)+))?)+)/g,
    (_match, prefix: string, block: string) => {
      const rawLines = block
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)

      const hasNested = rawLines.some((l) => /^[ \t\u00A0]*(?<!\\)(?:&gt;[ \t\u00A0]*){2,}/.test(l))
      const isForwarded = rawLines.some((l) => /^\s*(?:<[^>]+>)*\s*↳/.test(l) || l.includes("↳"))

      if (isForwarded) {
        const lines = rawLines
          .map((l) => l.replace(/^[ \t\u00A0]*(?<!\\)(?:&gt;[ \t\u00A0]*)+/, ""))
          .join("\n")
          .trim()
        const formattedLines = parseMarkdownLists(lines)
        const formatted = formattedLines.replace(
          /^((?:<[^>]+>)*\s*↳\s*)([^\n:]+)(:?(?:<\/[^>]+>)*)\r?\n*/m,
          (_m, p1: string, name: string, p3: string) => {
            const cleanName = name.replace(/<\/?(?:strong|b)>/gi, "").trim()
            return `<div class="slacktor-forwarded-header" style="font-weight:600;margin-bottom:4px;opacity:0.95;">${p1}<strong style="font-weight:700;">${cleanName}</strong>${p3}</div>`
          },
        )
        return `${prefix}<div class="slacktor-forwarded-card" style="border:1px solid rgba(128,128,128,0.25);background:rgba(128,128,128,0.06);border-radius:6px;padding:8px 12px;margin:6px 0;display:block;">${formatted}</div>`
      }

      if (!hasNested) {
        const lines = rawLines
          .map((l) => l.replace(/^[ \t\u00A0]*(?<!\\)&gt;[ \t\u00A0]?/, ""))
          .join("\n")
          .trim()
        const formattedLines = parseMarkdownLists(lines)
        return `${prefix}<blockquote type="cite" class="c-mrkdwn__quote" data-stringify-type="quote" style="margin:4px 0;display:block;">${formattedLines}</blockquote>`
      }

      type Segment = { depth: number; lines: string[] }
      const segments: Segment[] = []
      let currentSeg: Segment | null = null

      for (const line of rawLines) {
        const match = line.match(/^[ \t\u00A0]*(?<!\\)((?:&gt;[ \t\u00A0]*)+)[ \t\u00A0]?(.*)$/)
        if (!match) continue
        const count = match[1].match(/&gt;/g)?.length || 1
        const depth = Math.min(count, 2)
        const content = match[2]

        if (!currentSeg || currentSeg.depth !== depth) {
          currentSeg = { depth, lines: [content] }
          segments.push(currentSeg)
        } else {
          currentSeg.lines.push(content)
        }
      }

      let innerHtml = ""
      for (const seg of segments) {
        const content = parseMarkdownLists(seg.lines.join("\n").trim())
        if (seg.depth === 2) {
          innerHtml += `<blockquote type="cite" class="c-mrkdwn__quote" data-stringify-type="quote" data-stringify-border="1" style="margin:4px 0;display:block;">${content}</blockquote>`
        } else {
          innerHtml += `<div class="p-rich_text_section">${content}</div>`
        }
      }

      return `${prefix}<blockquote class="c-mrkdwn__quote_group" data-stringify-type="quote" style="margin:4px 0;display:block;">${innerHtml}</blockquote>`
    },
  )

  // 17. Restore all tokens in one pass
  processed = processed.replace(/\uE000(\d+)\uE001/g, (_match, index: string) => {
    return tokens[Number.parseInt(index, 10)] ?? ""
  })

  // 18. Restore escaped quotes (e.g. \> or \>> from plain text at line start)
  processed = processed.replace(/\\((?:&gt;[ \t\u00A0]*)+)/g, "$1")

  // Strip any trailing edited badges that may have persisted
  processed = processed.replace(/(?:^|\s*)\((?:edited|đã chỉnh sửa|編集済み)\)\s*$/gi, "").trim()

  // Remove redundant newlines adjacent to block elements (lists, cards, blockquotes, pre).
  // Because these are display: block elements, they already establish their own line breaks;
  // in white-space: pre-wrap, any trailing or leading newline creates an extra visible blank line.
  processed = processed
    .replace(/(<\/(?:ul|ol|blockquote|pre|div)>)[ \t]*\n+/g, "$1")
    .replace(/\n+[ \t]*(<(?:ul|ol|blockquote|pre|div\b))/g, "$1")
    .trim()

  return processed
}
