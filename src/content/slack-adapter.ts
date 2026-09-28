import type { AuthorIdentity, RawSlackMessage } from "../shared/types"

// Slack does not publish stable DOM contracts. Keep all observed selectors here
// so Milestone 1 changes remain isolated from the observer and renderer.

// ============================================================================
// Slacktor Markers and Attributes
// ============================================================================
export const SLACKTOR_TRANSLATION_ATTR = "data-slacktor-translation"
export const SLACKTOR_ACTION_ATTR = "data-slacktor-translate-action"
export const SLACKTOR_INJECTED_SELECTOR = `[${SLACKTOR_TRANSLATION_ATTR}], [${SLACKTOR_ACTION_ATTR}]`

// ============================================================================
// Message Containers and Candidates
// ============================================================================
const MESSAGE_CONTAINER_SELECTOR = "[data-qa='message_container']"
const FALLBACK_MESSAGE_SELECTOR = "[data-message-id], .c-message_kit__message[data-ts]"
const MESSAGE_SELECTOR = `${MESSAGE_CONTAINER_SELECTOR}, ${FALLBACK_MESSAGE_SELECTOR}`

// ============================================================================
// Message Body and Text Containers
// ============================================================================
const MESSAGE_TEXT_SELECTOR = "[data-qa='message-text']"
const RICH_TEXT_SECTION_SELECTOR = ".p-rich_text_section"
const MESSAGE_BODY_SELECTOR = ".c-message__body"
const AUTOMATED_MESSAGE_BODY_SELECTOR =
  ".c-message__body--automated, .c-message_kit__message--automated, .c-message_kit__gutter__right--system"
const MESSAGE_BODY_BLOCK_SELECTOR = `${MESSAGE_TEXT_SELECTOR}, ${MESSAGE_BODY_SELECTOR}, ${AUTOMATED_MESSAGE_BODY_SELECTOR}`

// ============================================================================
// Forwarded Messages and Attachments
// ============================================================================
const FORWARDED_CARD_SELECTOR = "[data-qa='forwarded_message_card']"
const ATTACHMENT_SELECTOR = ".c-message_attachment"
const ATTACHMENTS_CONTAINER_SELECTOR = ".c-message_kit__attachments"
const ATTACHMENT_DEFAULT_SELECTOR = "[data-qa='message_attachment_default']"

const FORWARDED_AND_ATTACHMENTS_SELECTOR = `${FORWARDED_CARD_SELECTOR}, ${ATTACHMENT_SELECTOR}:not([${SLACKTOR_TRANSLATION_ATTR}] *)`
const FORWARDED_CARD_PARENT_CHECK_SELECTOR = `${FORWARDED_CARD_SELECTOR}, ${ATTACHMENT_SELECTOR}`
const FORWARDED_AUTHOR_SELECTOR =
  "[data-qa='message_attachment_author_name'], [data-qa='member_name'], .c-message_attachment__author_name"
const FORWARDED_HEADER_SELECTOR = [
  ".headerRow__EPnJq",
  ".c-message_attachment__header",
  "[data-qa='attachment-header']",
  ".byline__E46tK",
  ".context__pPPwj",
  "[data-qa='attachment-context']",
  ".c-message_attachment__footer",
  ".c-message_attachment__footer_ts",
  "[data-qa='attachment-footer-timestamp']",
  ".authorName__Z7I7M",
  ".timestamp__Khsjg",
].join(", ")
const FORWARDED_CONTENT_SELECTOR =
  "[data-qa='message_attachment_slack_msg_text'], .body__CoIkE, .c-message_attachment__text"
const RICH_TEXT_BLOCK_OR_SECTION_SELECTOR = ".p-rich_text_block, .p-rich_text_section"
const EXCLUDED_ATTACHMENT_CONTAINERS_SELECTOR = `${ATTACHMENTS_CONTAINER_SELECTOR}, ${ATTACHMENT_SELECTOR}, ${FORWARDED_CARD_SELECTOR}`
const TRANSLATION_ANCHOR_ATTACHMENTS_SELECTOR = `${ATTACHMENTS_CONTAINER_SELECTOR}, ${ATTACHMENT_DEFAULT_SELECTOR}, ${FORWARDED_CARD_SELECTOR}`
const MEDIA_AND_FILES_SELECTOR = [
  "[data-qa='message_kit_files']",
  ".c-files_container",
  ".c-file_gallery",
  ".c-file_gallery_image_file",
  ".c-message_kit__file",
  ".c-message_kit__file__meta",
  ".p-message_gallery_image_file",
  "[data-qa='message_file_image_thumbnail']",
  ".p-file_image_thumbnail__wrapper",
  "[data-unfurl-delete-target]",
  ".c-file__actions",
  "[data-qa='file_actions']",
  "[data-qa='download_action']",
  "[class*='media__']",
  "[class*='thumbnailWrapper']",
  "a[href*='files.slack.com']",
  "a[href*='/files-pri/']",
  "a[href*='/files-tmb/']",
].join(", ")

const EDITED_LABEL_SELECTOR = [
  ".c-message__edited_label",
  "[data-qa='message_edited_label']",
  "[data-stringify-type='edited']",
  ".c-message__edited_timestamp",
].join(", ")

export function stripEditedBadge(text: string): string {
  return text.replace(/(?:^|\s*)\((?:edited|đã chỉnh sửa|編集済み)\)\s*$/gi, "").trim()
}

// ============================================================================
// Permalinks, Timestamps, and Thread Navigation
// ============================================================================
const PERMALINK_MESSAGE_SELECTOR = "a.c-timestamp[href*='/p'], a[href*='/archives/'][href*='/p']"
const PERMALINK_ARCHIVES_SELECTOR = "a.c-timestamp[href*='/archives/'], a[href*='/archives/']"
const PERMALINK_THREAD_ROOT_SELECTOR = "a.c-timestamp[href*='thread_ts=']"
const BROADCAST_PREAMBLE_LINK_SELECTOR =
  "[data-qa*='broadcast'] a[href*='thread_ts='], .c-message__broadcast_preamble a[href*='thread_ts='], .c-message_kit__broadcast_preamble a[href*='thread_ts='], a.c-message__broadcast_preamble_link"
const ANY_THREAD_TS_LINK_SELECTOR = "a[href*='thread_ts=']"
const THREAD_LINK_EXCLUDE_CONTAINERS_SELECTOR = `${MESSAGE_TEXT_SELECTOR}, ${RICH_TEXT_SECTION_SELECTOR}, ${MESSAGE_BODY_SELECTOR}, ${FORWARDED_CARD_SELECTOR}, [${SLACKTOR_TRANSLATION_ATTR}]`

// ============================================================================
// Message Metadata & Senders (Data Attributes & Badges)
// ============================================================================
const MESSAGE_ID_DATA_SELECTOR = "[data-message-id], [data-ts]"
const MESSAGE_TS_DATA_SELECTOR = "[data-msg-ts], [data-ts]"
const MESSAGE_CHANNEL_DATA_SELECTOR = "[data-message-channel]"
const SENDER_DATA_SELECTOR = "[data-message-sender]"
const SENDER_QA_SELECTOR = "[data-qa='message_sender']"
const BOT_BADGE_SELECTOR = "[data-qa='message_sender_app_badge'], .c-app_badge"

// ============================================================================
// Display, Divider & Tombstone Selectors
// ============================================================================
const DATE_DIVIDER_SELECTOR = "[data-qa='date_divider']"
const TOMBSTONE_SELECTOR = ".c-message_kit__tombstone, .c-message_kit__tombstone__text"
const STRINGIFY_IGNORE_ATTR = "data-stringify-ignore"

// ============================================================================
// Skip Detection Selectors
// ============================================================================
const MENTION_SELECTOR =
  "[data-stringify-type='mention'], .c-member_slug, .c-user_group, .c-broadcast"
const EMOJI_SELECTOR = ".c-emoji, [data-stringify-type='emoji'], img"
const LINK_SELECTOR = "a[href]"
const IGNORED_TEXT_IN_SKIP_CHECK_SELECTOR = `[${STRINGIFY_IGNORE_ATTR}='true'], button, [${SLACKTOR_TRANSLATION_ATTR}], [${SLACKTOR_ACTION_ATTR}]`

// ============================================================================
// Skip Reason Messages (User Explanations)
// ============================================================================
export const SKIP_REASON_SYSTEM = "Not auto-translated: System message."
export const SKIP_REASON_BOT = "Not auto-translated: Bot or app message."
export const SKIP_REASON_EMPTY = "Not auto-translated: Empty message."
export const SKIP_REASON_MENTION_ONLY = "Not auto-translated: Mentions only."
export const SKIP_REASON_EMOJI_ONLY = "Not auto-translated: Emojis only."
export const SKIP_REASON_URL_ONLY = "Not auto-translated: Links (URLs) only."
export const SKIP_REASON_MENTION_AND_EMOJI = "Not auto-translated: Mentions and emojis only."
export const SKIP_REASON_NO_TEXT = "Not auto-translated: No translatable text."

// ============================================================================
// Structured Text Classes
// ============================================================================
const CLASS_EXPAND_BUTTON = "c-rich_text_expand_button"
const CLASS_MESSAGE_KIT_FILE = "c-message_kit__file"
const CLASS_MESSAGE_KIT_REACTION_BAR = "c-message_kit__reaction_bar"
const CLASS_PREFORMATTED = "p-rich_text_preformatted"
const CLASS_QUOTE = "p-rich_text_quote"
const CLASS_LIST_ITEM = "p-rich_text_list__item"
const CLASS_LIST = "p-rich_text_list"
const CLASS_RICH_TEXT_SECTION = "p-rich_text_section"
const CLASS_TIMESTAMP = "c-timestamp"
const CLASS_MRKDWN_BR = "c-mrkdwn__br"
const STRINGIFY_PARAGRAPH_BREAK = "paragraph-break"
const STRINGIFY_LINE_BREAK = "line-break"

// ============================================================================
// Regex Patterns
// ============================================================================
const PERMALINK_TS_REGEX = /\/p(\d{10})(\d{6})(?:\/|$|\?)/
const PERMALINK_PATHNAME_TS_REGEX = /\/p(\d{10})(\d{6})(?:\/|$)/
const PERMALINK_ARCHIVES_CID_REGEX = /\/archives\/([A-Z0-9]+)(?:\/|$|\?)/i
const PERMALINK_CID_PARAM_REGEX = /[?&]cid=([A-Z0-9]+)/i
const THREAD_TS_PARAM_REGEX = /[?&]thread_ts=([0-9.]+)/
const NORMALIZED_SLACK_TS_REGEX = /^p(\d{10})(\d{6})$/
const WORKSPACE_CLIENT_ROUTE_REGEX = /\/client\/([A-Z0-9]+)/i
const CHANNEL_CLIENT_ROUTE_REGEX = /\/client\/[^/]+\/([A-Z0-9]+)/i
const THREAD_PANEL_ROUTE_REGEX = /\/thread\/[^/]+-(\d{10}\.\d{6})/

// ============================================================================
// System Messages & Subtypes
// ============================================================================
const SYSTEM_SELECTOR = [
  "[data-message-type='system']",
  "[data-subtype='channel_join']",
  "[data-subtype='channel_leave']",
  "[data-subtype='channel_topic']",
  "[data-subtype='channel_purpose']",
  "[data-subtype='channel_name']",
  "[data-subtype='group_join']",
  "[data-subtype='group_leave']",
  "[data-qa='channel_join']",
  "[data-qa='channel_leave']",
  "[data-qa='message_system']",
  DATE_DIVIDER_SELECTOR,
  "[data-qa='notification']",
  ".c-message__body--automated",
  ".c-message_kit__message--automated",
  ".c-message_kit__tombstone",
  ".c-message_kit__tombstone__text",
  ".c-message_kit__gutter__right--system",
].join(", ")

const SYSTEM_SUBTYPES = new Set([
  "channel_archive",
  "channel_join",
  "channel_leave",
  "channel_name",
  "channel_purpose",
  "channel_topic",
  "group_join",
  "group_leave",
  "me_message",
  "tombstone",
])

export function findMessageNodes(root: ParentNode = document): HTMLElement[] {
  // Slack's real message containers exist independently in the channel and
  // thread-panel virtual lists. Prefer them unconditionally.
  const containers = Array.from(root.querySelectorAll<HTMLElement>(MESSAGE_CONTAINER_SELECTOR))
  if (containers.length > 0) return containers

  return Array.from(root.querySelectorAll<HTMLElement>(FALLBACK_MESSAGE_SELECTOR)).filter(
    (node) => {
      if (node.hasAttribute(SLACKTOR_TRANSLATION_ATTR)) return false
      return node.closest<HTMLElement>(FALLBACK_MESSAGE_SELECTOR) === node
    },
  )
}

export function extractMessage(node: HTMLElement): RawSlackMessage | undefined {
  if (isIgnoredDisplayNode(node)) return undefined

  const timestamp = findMessageTimestamp(node)
  const messageId = node.dataset.messageId ?? timestamp ?? findMessageId(node)
  if (!messageId) return undefined

  const isSystem = isSystemMessageNode(node)
  const isBot = isBotNode(node)
  const sourceText = extractFullMessageSourceText(node) ?? ""
  if (!sourceText && !isSystem && !isBot) return undefined

  const skipAutoTranslateReason = getMessageSkipReason(node, sourceText, isSystem, isBot)
  const author = extractAuthor(node)
  const threadRootTs =
    node.dataset.threadTs ??
    node.dataset.threadRootTs ??
    extractThreadRootFromPermalink(node) ??
    extractThreadRootFromCurrentPage(messageId)

  return {
    workspaceId:
      node.dataset.workspaceId ??
      (typeof window !== "undefined"
        ? window.location.pathname.match(WORKSPACE_CLIENT_ROUTE_REGEX)?.[1]
        : undefined),
    conversationId: findConversationId(node),
    threadRootTs,
    messageId,
    timestamp,
    messageKind: threadRootTs ? "thread-reply" : "unknown",
    author,
    sourceText,
    isBot,
    isSystemMessage: isSystem,
    isDirectMessage: false,
    skipAutoTranslateReason,
  }
}

function extractFullMessageSourceText(node: HTMLElement): string | undefined {
  const parts: string[] = []

  // 1. Main message body
  const mainTextNode = getMainTextNode(node)
  if (mainTextNode) {
    const mainText = getSourceText(mainTextNode)
    if (mainText) parts.push(mainText)
  }

  // 2. Forwarded message cards and attachments
  const cards = Array.from(node.querySelectorAll<HTMLElement>(FORWARDED_AND_ATTACHMENTS_SELECTOR))

  for (const card of cards) {
    // Avoid double processing if card is nested inside another matched card
    if (card.parentElement?.closest(FORWARDED_CARD_PARENT_CHECK_SELECTOR)) continue

    const author = card.querySelector<HTMLElement>(FORWARDED_AUTHOR_SELECTOR)?.textContent?.trim()

    const contentNode =
      card.querySelector<HTMLElement>(FORWARDED_CONTENT_SELECTOR) ??
      Array.from(card.querySelectorAll<HTMLElement>(RICH_TEXT_BLOCK_OR_SECTION_SELECTOR)).find(
        (el) => !el.closest(FORWARDED_HEADER_SELECTOR),
      )

    if (contentNode) {
      const cardText = getForwardedSourceText(contentNode)
      if (cardText) {
        const header = author ? `↳ ${author}:` : "↳ Forwarded message:"

        const quoted = cardText
          .split("\n")
          .map((line) => (line ? `> ${line}` : ">"))
          .join("\n")

        parts.push(`> ${header}\n${quoted}`)
      }
    }
  }

  if (parts.length === 0) return undefined
  const combined = parts.join("\n\n").trim()
  return stripEditedBadge(stripMediaAndFileLinks(combined)) || undefined
}

function getForwardedSourceText(textNode: HTMLElement): string {
  const clone = textNode.cloneNode(true) as HTMLElement
  for (const el of Array.from(
    clone.querySelectorAll(
      `${SLACKTOR_INJECTED_SELECTOR}, ${FORWARDED_HEADER_SELECTOR}, ${MEDIA_AND_FILES_SELECTOR}, ${EDITED_LABEL_SELECTOR}`,
    ),
  )) {
    el.remove()
  }
  return stripEditedBadge(extractStructuredText(clone))
}

function getMainTextNode(node: HTMLElement): HTMLElement | undefined {
  const messageBlocks = node.querySelector<HTMLElement>(MESSAGE_BODY_BLOCK_SELECTOR)
  if (messageBlocks) return messageBlocks

  // If no message-text, only look for p-rich_text_section outside attachments
  const sections = Array.from(node.querySelectorAll<HTMLElement>(RICH_TEXT_SECTION_SELECTOR))
  return sections.find((s) => !s.closest(EXCLUDED_ATTACHMENT_CONTAINERS_SELECTOR))
}

function getSourceText(textNode: HTMLElement): string {
  const clone = textNode.cloneNode(true) as HTMLElement
  for (const el of Array.from(
    clone.querySelectorAll(
      `${SLACKTOR_INJECTED_SELECTOR}, ${MEDIA_AND_FILES_SELECTOR}, ${EDITED_LABEL_SELECTOR}`,
    ),
  )) {
    el.remove()
  }
  return stripEditedBadge(extractStructuredText(clone))
}

function getInlineFileName(node: HTMLElement): string | undefined {
  if (
    node.closest(
      ".c-files_container, [data-qa='message_kit_files'], .c-message_kit__file, .c-file_gallery",
    )
  ) {
    return undefined
  }

  // Explicit inline file chip element in Slack rich text
  const isFileSlug = node.getAttribute("data-qa") === "rich_text_file_element"

  const href = node.getAttribute("href") ?? ""
  const isFileLink =
    node.tagName === "A" &&
    (Boolean(node.querySelector("[data-qa='rich_text_file_element']")) ||
      href.includes(".slack.com/files/") ||
      href.includes("files.slack.com/") ||
      href.includes("/files-pri/") ||
      href.includes("/files-tmb/"))

  if (!isFileSlug && !isFileLink) {
    return undefined
  }

  const nameEl = node.querySelector<HTMLElement>(".c-file_name, [data-qa='file_name']")
  const text = nameEl?.textContent?.trim()
  if (text) return text

  if (href) {
    const cleanPath = href.split("?")[0].split("#")[0]
    const segment = cleanPath.split("/").pop()
    if (segment && /\.[a-z0-9]{2,5}$/i.test(segment)) {
      try {
        return decodeURIComponent(segment)
      } catch {
        return segment
      }
    }
  }

  const directText = node.textContent?.trim()
  if (directText && directText.length < 100 && /\.[a-z0-9]{2,5}$/i.test(directText)) {
    return directText
  }

  if (isFileSlug) {
    return "file"
  }

  return undefined
}

function isMediaOrFileNode(node: HTMLElement): boolean {
  if (
    node.getAttribute("data-qa") === "rich_text_file_element" ||
    Boolean(node.closest("[data-qa='rich_text_file_element']"))
  ) {
    return false
  }

  if (
    node.classList.contains(CLASS_MESSAGE_KIT_FILE) ||
    node.classList.contains("c-files_container") ||
    node.classList.contains("c-file_gallery") ||
    node.classList.contains("c-file_gallery_image_file") ||
    node.classList.contains("p-message_gallery_image_file") ||
    node.classList.contains("c-message_kit__file__meta") ||
    node.classList.contains("c-file__actions") ||
    node.hasAttribute("data-unfurl-delete-target") ||
    node.getAttribute("data-qa") === "message_kit_files" ||
    node.getAttribute("data-qa") === "message_file_image_thumbnail" ||
    node.getAttribute("data-qa") === "file_actions" ||
    node.getAttribute("data-qa") === "download_action" ||
    node.className?.includes?.("media__") ||
    node.className?.includes?.("thumbnailWrapper")
  ) {
    return true
  }

  if (node.tagName === "A") {
    const href = node.getAttribute("href") ?? ""
    if (
      href.includes("files.slack.com/") ||
      href.includes("/files-pri/") ||
      href.includes("/files-tmb/")
    ) {
      if (getInlineFileName(node)) return false
      return true
    }
  }

  return false
}

export function stripMediaAndFileLinks(raw: string): string {
  const cleaned = raw
    .replace(
      /\[[^\]\n]*\]\((?:https?:\/\/)?[^\s)\n]*(?:files\.slack\.com|\/files-pri\/|\/files-tmb\/)[^\s)\n]*\)/gi,
      "",
    )
    .replace(
      /\[[^\]\n]+\.(?:png|jpe?g|gif|webp|svg|bmp|pdf|zip|tar|gz|mp4|mov|avi|docx?|xlsx?|pptx?)(?:@[0-9]+x)?\]\((?!slack:\/\/file)[^)\n]+\)/gi,
      "",
    )
    .replace(
      /\[[^\]\n]+\.(?:png|jpe?g|gif|webp|svg|bmp|pdf|zip|tar|gz|mp4|mov|avi|docx?|xlsx?|pptx?)(?:@[0-9]+x)?\](?!\()/gi,
      "",
    )
    .replace(
      /&lt;https?:\/\/[^\s|&>]*(?:files\.slack\.com|\/files-pri\/|\/files-tmb\/)[^\s|&>]*(\|[^&>]*)?&gt;/gi,
      "",
    )
    .replace(
      /<https?:\/\/[^\s|>']*(?:files\.slack\.com|\/files-pri\/|\/files-tmb\/)[^\s|>']*(\|[^>']*)?>/gi,
      "",
    )
    .replace(
      /https?:\/\/[^\s)<>"'`]*(?:files\.slack\.com|\/files-pri\/|\/files-tmb\/)[^\s)<>"'`]*/gi,
      "",
    )

  const lines = cleaned.split(/\r?\n/)
  const filteredLines: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^>[ \t]*$/.test(line)) {
      let hasNextQuoteLine = false
      for (let j = i + 1; j < lines.length; j++) {
        if (/^>[ \t]*\S/.test(lines[j])) {
          hasNextQuoteLine = true
          break
        }
        if (!lines[j].startsWith(">")) break
      }
      if (
        hasNextQuoteLine &&
        filteredLines.length > 0 &&
        /^>[ \t]*\S/.test(filteredLines[filteredLines.length - 1])
      ) {
        filteredLines.push(">")
      }
      continue
    }
    filteredLines.push(line)
  }

  return filteredLines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const LINE_BREAK_ELEMENTS = new Set(["BLOCKQUOTE", "LI", "OL", "P", "PRE", "UL"])

function wrapInline(text: string, marker: string): string {
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/)
  const leading = match?.[1] ?? ""
  const content = match?.[2] ?? ""
  const trailing = match?.[3] ?? ""
  if (!content) return text
  return `${leading}${marker}${content}${marker}${trailing}`
}

function getListIndentLevel(node: HTMLElement): number {
  if (node.dataset.stringifyIndent !== undefined) {
    const val = Number.parseInt(node.dataset.stringifyIndent, 10)
    if (!Number.isNaN(val) && val >= 0) return val
  }
  if (node.dataset.indent !== undefined) {
    const val = Number.parseInt(node.dataset.indent, 10)
    if (!Number.isNaN(val) && val >= 0) return val
  }
  const parent = node.parentElement
  if (parent?.dataset.indent !== undefined) {
    const val = Number.parseInt(parent.dataset.indent, 10)
    if (!Number.isNaN(val) && val >= 0) return val
  }
  let depth = 0
  let curr = node.parentElement
  while (curr && !curr.classList.contains("c-message_kit__blocks") && curr !== document.body) {
    if (curr.tagName === "UL" || curr.tagName === "OL" || curr.classList.contains(CLASS_LIST)) {
      depth += 1
    }
    curr = curr.parentElement
  }
  return Math.max(0, depth - 1)
}

function getListItemPrefix(node: HTMLElement): string {
  const indentLevel = getListIndentLevel(node)
  const indentSpaces = "  ".repeat(indentLevel)

  if (node.dataset.stringifyPrefix) {
    return `${indentSpaces}${node.dataset.stringifyPrefix.trimStart()}`
  }
  const parent = node.parentElement
  if (!parent) return `${indentSpaces}- `
  const isOrdered = parent.tagName === "OL" || parent.dataset.stringifyType === "ordered"
  if (isOrdered) {
    const siblings = Array.from(parent.children).filter(
      (child) =>
        child.tagName === "LI" ||
        (child instanceof HTMLElement && child.classList.contains(CLASS_LIST_ITEM)),
    )
    const index = siblings.indexOf(node)
    const start = Number.parseInt(parent.getAttribute("start") ?? "1", 10)
    const num = (index >= 0 ? index : 0) + (Number.isNaN(start) ? 1 : start)
    return `${indentSpaces}${num}. `
  }
  return `${indentSpaces}- `
}

function extractStructuredText(root: HTMLElement): string {
  const visit = (node: Node, insidePre = false): string => {
    if (node instanceof Text) {
      return node.data
    }
    if (!(node instanceof HTMLElement)) return ""

    if (
      node.getAttribute(STRINGIFY_IGNORE_ATTR) === "true" ||
      node.classList.contains(CLASS_EXPAND_BUTTON) ||
      node.classList.contains(CLASS_MESSAGE_KIT_REACTION_BAR) ||
      node.classList.contains("c-message__edited_label") ||
      Boolean(node.closest(".c-message__edited_label")) ||
      node.hasAttribute(SLACKTOR_TRANSLATION_ATTR) ||
      node.hasAttribute(SLACKTOR_ACTION_ATTR) ||
      isMediaOrFileNode(node)
    ) {
      return ""
    }

    const inlineFileName = getInlineFileName(node)
    if (inlineFileName && !insidePre) {
      return `[${inlineFileName}](slack://file)`
    }

    if (
      node.tagName === "BR" ||
      node.classList.contains(CLASS_MRKDWN_BR) ||
      node.dataset.stringifyType === STRINGIFY_PARAGRAPH_BREAK ||
      node.dataset.stringifyType === STRINGIFY_LINE_BREAK
    ) {
      return "\n"
    }

    if (node.tagName === "IMG") {
      const src = node.getAttribute("src") ?? ""
      if (
        src.includes("files.slack.com") ||
        src.includes("/files-pri/") ||
        src.includes("/files-tmb/") ||
        node.closest(MEDIA_AND_FILES_SELECTOR)
      ) {
        return ""
      }
      const alt = node.getAttribute("alt")
      const emoji = node.dataset.stringifyEmoji
      return alt || emoji || ""
    }

    const tagName = node.tagName
    const isPre =
      tagName === "PRE" ||
      node.classList.contains(CLASS_PREFORMATTED) ||
      node.dataset.stringifyType === "pre"
    const isCode = !isPre && (tagName === "CODE" || node.dataset.stringifyType === "code")
    const isBold = tagName === "B" || tagName === "STRONG" || node.dataset.stringifyType === "bold"
    const isItalic = tagName === "I" || tagName === "EM" || node.dataset.stringifyType === "italic"
    const isStrike =
      tagName === "S" ||
      tagName === "DEL" ||
      tagName === "STRIKE" ||
      node.dataset.stringifyType === "strike"
    const isQuote =
      tagName === "BLOCKQUOTE" ||
      node.classList.contains(CLASS_QUOTE) ||
      node.dataset.stringifyType === "quote"
    const isListItem = tagName === "LI" || node.classList.contains(CLASS_LIST_ITEM)
    const isClickable =
      tagName === "A" ||
      node.classList.contains("c-member_slug") ||
      node.classList.contains("c-user_group") ||
      node.classList.contains("c-broadcast") ||
      node.classList.contains("c-channel_name") ||
      node.dataset.stringifyType === "mention" ||
      node.dataset.stringifyType === "channel" ||
      Boolean(node.getAttribute("data-member-id"))

    let childrenText = ""
    for (const child of Array.from(node.childNodes)) {
      childrenText += visit(child, insidePre || isPre)
    }

    if (isPre) {
      return `\n\`\`\`\n${childrenText.trim()}\n\`\`\`\n`
    }
    if (isCode && !insidePre) {
      return wrapInline(childrenText, "`")
    }
    if (isBold && !insidePre) {
      return wrapInline(childrenText, "*")
    }
    if (isItalic && !insidePre) {
      return wrapInline(childrenText, "_")
    }
    if (isStrike && !insidePre) {
      return wrapInline(childrenText, "~")
    }
    if (isClickable && !insidePre) {
      const href = node.getAttribute("href") ?? ""
      if (
        href.includes("files.slack.com") ||
        href.includes("/files-pri/") ||
        href.includes("/files-tmb/") ||
        node.closest(MEDIA_AND_FILES_SELECTOR)
      ) {
        return ""
      }
      if (node.classList.contains(CLASS_TIMESTAMP)) return childrenText

      const trimmed = childrenText.trim()
      const isMention =
        node.classList.contains("c-member_slug") ||
        node.classList.contains("c-user_group") ||
        node.classList.contains("c-broadcast") ||
        node.dataset.stringifyType === "mention" ||
        href.includes("/team/") ||
        Boolean(node.getAttribute("data-member-id")) ||
        trimmed.startsWith("@")
      if (isMention) {
        const mentionText = trimmed.startsWith("@") ? trimmed : `@${trimmed}`
        return `[${mentionText}](slack://mention)`
      }

      const isChannel =
        node.classList.contains("c-channel_name") ||
        node.dataset.stringifyType === "channel" ||
        href.includes("/archives/") ||
        trimmed.startsWith("#")
      if (isChannel) {
        const channelText = trimmed.startsWith("#") ? trimmed : `#${trimmed}`
        return `[${channelText}](slack://channel)`
      }

      if (href.startsWith("mailto:")) {
        const email = trimmed.replace(/^mailto:/i, "") || href.replace(/^mailto:/i, "")
        return `[${email}](slack://email)`
      }

      // Encode standard web links with a compact semantic protocol instead of
      // full 200-character destination URLs to prevent token waste and translation leakage.
      const linkText = trimmed || href
      return `[${linkText}](slack://link)`
    }
    if (isQuote) {
      const quoted = childrenText
        .split("\n")
        .map((line) => (line.trim() ? `> ${line}` : ""))
        .join("\n")
      return `\n${quoted}\n`
    }
    if (isListItem) {
      const prefix = getListItemPrefix(node)
      return `${prefix}${childrenText.trimStart()}\n`
    }

    const isList = tagName === "UL" || tagName === "OL" || node.classList.contains(CLASS_LIST)
    if (isList) {
      const isNestedList = Boolean(
        node.parentElement?.closest("li, .c-message_kit__list_item, .p-rich_text_list__item"),
      )
      if (isNestedList) {
        const trimmed = childrenText.trimEnd()
        return trimmed ? `\n${trimmed}` : ""
      }
      const trimmed = childrenText.trim()
      return trimmed ? `\n${trimmed}\n` : ""
    }

    const isBlock =
      LINE_BREAK_ELEMENTS.has(tagName) ||
      (node !== root && node.classList.contains(CLASS_RICH_TEXT_SECTION))
    if (isBlock) {
      const trimmed = childrenText.trim()
      return trimmed ? `\n${trimmed}\n` : ""
    }

    return childrenText
  }

  const raw = visit(root)
  return stripEditedBadge(
    raw
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  )
}

export function getTranslationAnchor(node: HTMLElement): HTMLElement | undefined {
  // If the message has attachments or forwarded cards, place the translation after them.
  const attachments = node.querySelector<HTMLElement>(TRANSLATION_ANCHOR_ATTACHMENTS_SELECTOR)
  if (attachments) {
    return attachments
  }

  const textNode = getMainTextNode(node)
  if (!textNode) return undefined
  return textNode
}

export function isMessageCandidate(node: HTMLElement): boolean {
  return (
    node.matches(MESSAGE_CONTAINER_SELECTOR) ||
    (!node.closest<HTMLElement>(MESSAGE_CONTAINER_SELECTOR) &&
      node.matches(FALLBACK_MESSAGE_SELECTOR))
  )
}

export function findClosestMessageNode(node: HTMLElement): HTMLElement | undefined {
  return node.closest<HTMLElement>(MESSAGE_SELECTOR) ?? undefined
}

function _getTextNode(node: HTMLElement): HTMLElement | undefined {
  return (
    node.querySelector<HTMLElement>(MESSAGE_TEXT_SELECTOR) ??
    node.querySelector<HTMLElement>(RICH_TEXT_SECTION_SELECTOR) ??
    node.querySelector<HTMLElement>(MESSAGE_BODY_SELECTOR) ??
    undefined
  )
}

function findMessageId(node: HTMLElement): string | undefined {
  const directId = node.dataset.messageId ?? node.dataset.ts
  if (directId) return directId

  const nested = node.querySelector<HTMLElement>(MESSAGE_ID_DATA_SELECTOR)
  const nestedId = nested?.dataset.messageId ?? nested?.dataset.ts
  if (nestedId) return nestedId

  const permalink = node.querySelector<HTMLAnchorElement>(PERMALINK_MESSAGE_SELECTOR)?.href
  if (permalink) {
    const match = permalink.match(PERMALINK_TS_REGEX)
    if (match) return `${match[1]}.${match[2]}`
  }

  return undefined
}

function findMessageTimestamp(node: HTMLElement): string | undefined {
  const permalink = node.querySelector<HTMLAnchorElement>(PERMALINK_MESSAGE_SELECTOR)?.href
  if (permalink) {
    try {
      const match = new URL(permalink, window.location.origin).pathname.match(
        PERMALINK_PATHNAME_TS_REGEX,
      )
      if (match) return `${match[1]}.${match[2]}`
    } catch {
      const match = permalink.match(PERMALINK_TS_REGEX)
      if (match) return `${match[1]}.${match[2]}`
    }
  }

  const direct = node.dataset.msgTs ?? node.dataset.ts
  if (direct) return normalizeSlackTimestamp(direct)

  // Thread wrappers can contain data-ts values for the thread root. Only use
  // this broad fallback when the message's own timestamp permalink is absent.
  const nested = node.querySelector<HTMLElement>(MESSAGE_TS_DATA_SELECTOR)
  const nestedTimestamp = nested?.dataset.msgTs ?? nested?.dataset.ts
  return nestedTimestamp ? normalizeSlackTimestamp(nestedTimestamp) : undefined
}

function findConversationId(node: HTMLElement): string | undefined {
  const direct = node.dataset.msgChannelId ?? node.dataset.channelId
  if (direct) return direct

  const blockChannel = node.querySelector<HTMLElement>(MESSAGE_CHANNEL_DATA_SELECTOR)?.dataset
    .messageChannel
  if (blockChannel) return blockChannel

  const permalink = node.querySelector<HTMLAnchorElement>(PERMALINK_ARCHIVES_SELECTOR)?.href
  if (permalink) {
    const archivesMatch = permalink.match(PERMALINK_ARCHIVES_CID_REGEX)
    if (archivesMatch) return archivesMatch[1]
    const cidMatch = permalink.match(PERMALINK_CID_PARAM_REGEX)
    if (cidMatch) return cidMatch[1]
  }

  try {
    const pageMatch = window.location.pathname.match(CHANNEL_CLIENT_ROUTE_REGEX)
    if (pageMatch) return pageMatch[1]
  } catch {}

  return undefined
}

function normalizeSlackTimestamp(value: string): string {
  const permalinkMatch = value.match(NORMALIZED_SLACK_TS_REGEX)
  return permalinkMatch ? `${permalinkMatch[1]}.${permalinkMatch[2]}` : value
}

function extractThreadRootFromPermalink(node: HTMLElement): string | undefined {
  // 1. Check message timestamp permalink
  const timestampHref = node.querySelector<HTMLAnchorElement>(PERMALINK_THREAD_ROOT_SELECTOR)?.href
  if (timestampHref) {
    const threadTs = parseThreadTsFromHref(timestampHref)
    if (threadTs) return threadTs
  }

  // 2. Check broadcast preamble ("Also send to channel" / "Replied to a thread:")
  const broadcastLink = node.querySelector<HTMLAnchorElement>(
    BROADCAST_PREAMBLE_LINK_SELECTOR,
  )?.href
  if (broadcastLink) {
    const threadTs = parseThreadTsFromHref(broadcastLink)
    if (threadTs) return threadTs
  }

  // 3. Fallback: Any link with thread_ts in message header/chrome, excluding user text and forward cards
  const candidateLinks = Array.from(
    node.querySelectorAll<HTMLAnchorElement>(ANY_THREAD_TS_LINK_SELECTOR),
  )
  for (const link of candidateLinks) {
    if (link.closest(THREAD_LINK_EXCLUDE_CONTAINERS_SELECTOR)) {
      continue
    }
    const threadTs = parseThreadTsFromHref(link.href)
    if (threadTs) return threadTs
  }

  return undefined
}

function parseThreadTsFromHref(href: string): string | undefined {
  try {
    const match = href.match(THREAD_TS_PARAM_REGEX)
    return match
      ? match[1]
      : (new URL(href, window.location.origin).searchParams.get("thread_ts") ?? undefined)
  } catch {
    return undefined
  }
}

function extractThreadRootFromCurrentPage(messageId: string): string | undefined {
  try {
    const url = new URL(window.location.href)
    const fromQuery = url.searchParams.get("thread_ts") ?? undefined
    if (fromQuery && fromQuery !== messageId) return fromQuery

    // Slack's client thread panel commonly uses /thread/<channel>-<root-ts>.
    // This is a public navigation value and supplies a stable fallback when the
    // timestamp permalink of an individual reply omits thread_ts.
    const routeMatch = url.pathname.match(THREAD_PANEL_ROUTE_REGEX)
    if (routeMatch?.[1] && routeMatch[1] !== messageId) return routeMatch[1]
  } catch {
    // Keep the no-context fallback when Slack has an unexpected URL shape.
  }
  return undefined
}

function isIgnoredDisplayNode(node: HTMLElement): boolean {
  if (
    node.dataset.qa?.toLowerCase().includes("date_divider") ||
    node.querySelector(DATE_DIVIDER_SELECTOR)
  ) {
    return true
  }
  if (node.querySelector(TOMBSTONE_SELECTOR)) {
    return true
  }
  return false
}

function isSystemMessageNode(node: HTMLElement): boolean {
  if (node.matches(SYSTEM_SELECTOR) || node.querySelector(SYSTEM_SELECTOR)) return true
  if (node.dataset.messageType === "system") return true
  if (node.dataset.subtype && SYSTEM_SUBTYPES.has(node.dataset.subtype)) return true
  const ariaLabel = node.getAttribute("aria-label")?.toLowerCase() ?? ""
  if (ariaLabel.includes("system message") || ariaLabel.includes("channel activity")) return true
  const qa = node.dataset.qa?.toLowerCase() ?? ""
  if (qa.includes("system") || qa.includes("notification")) return true
  if (node.querySelector(AUTOMATED_MESSAGE_BODY_SELECTOR)) {
    return true
  }
  return false
}

function isBotNode(node: HTMLElement): boolean {
  if (node.dataset.botId !== undefined || node.dataset.subtype === "bot_message") return true
  if (node.querySelector(BOT_BADGE_SELECTOR)) return true
  return false
}

function getMessageSkipReason(
  node: HTMLElement,
  sourceText: string,
  isSystem: boolean,
  isBot: boolean,
): string | undefined {
  if (isSystem) {
    return SKIP_REASON_SYSTEM
  }
  if (isBot) {
    return SKIP_REASON_BOT
  }

  const trimmed = sourceText.trim()
  if (!trimmed) {
    return SKIP_REASON_EMPTY
  }

  // If message has a forwarded message card, it contains forwarded content
  const hasForwardedCard = Boolean(node.querySelector(FORWARDED_CARD_SELECTOR))
  if (hasForwardedCard) {
    return undefined
  }

  // Inspect the main message text element in DOM to accurately detect mentions, emojis, URLs
  const textContainer = getMainTextNode(node)
  if (textContainer) {
    const clone = textContainer.cloneNode(true) as HTMLElement
    const mentions = Array.from(clone.querySelectorAll(MENTION_SELECTOR))
    const emojis = Array.from(clone.querySelectorAll(EMOJI_SELECTOR))
    const links = Array.from(clone.querySelectorAll(LINK_SELECTOR))
    const ignored = Array.from(clone.querySelectorAll(IGNORED_TEXT_IN_SKIP_CHECK_SELECTOR))

    const hadMentions = mentions.length > 0
    const hadEmojis = emojis.length > 0
    const hadLinks = links.length > 0

    for (const el of [...mentions, ...emojis, ...links, ...ignored]) {
      el.remove()
    }

    const remainingText = clone.textContent ?? ""
    const remainingLetters = remainingText.replace(/[\s\p{P}\p{S}\p{N}]/gu, "").trim()

    if (remainingLetters.length === 0) {
      if (hadMentions && !hadEmojis && !hadLinks) {
        return SKIP_REASON_MENTION_ONLY
      }
      if (hadEmojis && !hadMentions && !hadLinks) {
        return SKIP_REASON_EMOJI_ONLY
      }
      if (hadLinks && !hadMentions && !hadEmojis) {
        return SKIP_REASON_URL_ONLY
      }
      if (hadMentions && hadEmojis) {
        return SKIP_REASON_MENTION_AND_EMOJI
      }
      return SKIP_REASON_NO_TEXT
    }
  } else {
    // Fallback regex check if textContainer is absent
    const noUrls = trimmed
      .replace(/\[([^\]]+)\]\((?:https?:\/\/|slack:\/\/)[^\s)]+\)/g, "")
      .replace(/https?:\/\/\S+/gi, "")
      .trim()
    const noMentions = noUrls
      .replace(/\[([^\]]+)\]\(slack:\/\/mention\)/g, "")
      .replace(/@[a-zA-Z0-9._-]+/g, "")
      .replace(/<![a-zA-Z0-9._-]+>/g, "")
      .trim()
    const noEmojis = noMentions
      .replace(/:[a-zA-Z0-9_+:-]+:/g, "")
      .replace(/\p{Extended_Pictographic}/gu, "")
      .trim()
    const remainingLetters = noEmojis.replace(/[\s\p{P}\p{S}\p{N}]/gu, "").trim()

    if (remainingLetters.length === 0) {
      if (noUrls.length === 0) return SKIP_REASON_URL_ONLY
      if (noMentions.length === 0) return SKIP_REASON_MENTION_ONLY
      if (noEmojis.length === 0) return SKIP_REASON_EMOJI_ONLY
      return SKIP_REASON_NO_TEXT
    }
  }

  return undefined
}

function extractAuthor(node: HTMLElement): AuthorIdentity {
  const memberId =
    node.dataset.memberId ??
    node.dataset.userId ??
    node.querySelector<HTMLElement>(SENDER_DATA_SELECTOR)?.dataset.messageSender
  const displayName = node.querySelector<HTMLElement>(SENDER_QA_SELECTOR)?.dataset.stringifyText
  if (memberId) return { status: "resolved", memberId, displayName }

  return { status: "unknown", reason: "not-present-in-dom" }
}
