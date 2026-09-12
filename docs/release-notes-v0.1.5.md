# Slacktor v0.1.5

Slacktor `0.1.5` improves translation reliability, Quick Translator workflows,
and control over parallel Slacktor installations.

## Highlights

- Disable one Slacktor installation completely from Settings to prevent
  conflicts between the Chrome Web Store and unpacked development builds.
- Import or export configuration through a JSON file or the clipboard.
- Move either Quick Translator result directly into a visible Slack composer.
- Translate Slack permalink previews and newly posted messages more reliably.
- Recover malformed JSON returned by AI providers without failing an entire
  translation batch when the response can be repaired safely.

## New Features

- Added an **Enable Slacktor** setting. Disabling it cancels active translation
  requests, clears Slacktor translation UI from Slack, stops new message
  processing, and disables Quick Translator actions for that installation.
- Added configuration export to `slacktor-config.json` and the clipboard.
- Added configuration import from a JSON file and the clipboard with schema,
  type, endpoint, and permission validation.
- Configuration transfer includes provider settings, API key, translation
  preferences, extension state, privacy consent, and Quick Translator
  languages. It excludes Quick Translator history and drafts.
- Added icon actions for moving either Quick Translator output into the active
  Slack message composer without replacing existing composer text.
- Added automatic content-script recovery when an existing Slack tab has no
  receiver after the extension is reloaded.
- Added translation support for Slack message permalink previews while leaving
  ordinary external URL previews untranslated.

## Translation Improvements

- Improved preservation of the source message's intent, emotional tone,
  urgency, directness, and intensity. Translations are no longer instructed to
  soften tense, blunt, critical, or confrontational messages.
- Messages already written in the target language now produce an empty
  translation instead of repeating or paraphrasing the source.
- Empty successful translations are cached and do not increase the translated
  message counter.
- Reuse the opposite output from recent Quick Translator history when a Slack
  message exactly matches one of its normalized outputs, avoiding another AI
  request.
- Added priority processing for recent messages, stronger batching and request
  cancellation, and safeguards against duplicate requests caused by Slack's
  optimistic rendering and DOM virtualization.
- Improved translation of messages posted by the current user before Slack has
  assigned the final message timestamp.
- Treat messages removed from Slack's DOM as silent cancellations instead of
  displaying `Translation no longer visible.` as an error.
- Added guarded recovery for unescaped quotation marks and control characters
  in otherwise valid provider JSON responses.

## Quick Translator Improvements

- Quick Translator languages are configurable as **Translate to** and **then
  translate to**.
- History selections are temporary previews. Closing the popup without editing
  clears the source input; edited, untranslated drafts remain available on the
  next open.
- Improved Slack composer discovery across current Slack editor variants.
- Added insertion verification and an input-event fallback when the deprecated
  browser insertion command reports failure incorrectly.
- Move and copy controls use compact icons with tooltips and accessible labels.

## UI And Status Improvements

- Moved translation visibility to a compact header toggle with a dynamic
  tooltip.
- The extension badge shows a gray minus sign when translation is hidden or the
  installation is disabled, while active and waiting queue counts retain
  priority.
- Improved provider status, queue statistics, retry behavior, and cancellation
  handling.

## Upgrade Notes

- This release adds the `scripting`, `clipboardRead`, and `clipboardWrite`
  permissions. Chrome may ask the user to approve the updated extension.
- Configuration exports contain the configured API key. Store exported files
  securely and avoid sharing clipboard contents.
- After updating an unpacked build, reload the extension from
  `chrome://extensions`. Slacktor can then recover its content script in open
  Slack tabs when **Move to Slack input** is used.

## Chrome Web Store Release Notes

Version 0.1.5 adds a complete per-installation enable/disable control to prevent
conflicts between Store and development builds, plus configuration import and
export through files or the clipboard. Quick Translator can now move results
directly into Slack, supports configurable forward and verification languages,
and handles history drafts more predictably. This release also improves new
message and Slack permalink-preview translation, queue prioritization,
cancellation behavior, duplicate-request prevention, and malformed provider
JSON recovery.

## Privacy And Security

- Slacktor has no developer-operated AI backend.
- Slack content is sent only to the AI endpoint configured by the user.
- API keys and configuration remain in local extension storage unless the user
  explicitly exports them.
- Diagnostic logs do not contain API keys or Slack message text.
- Slacktor does not use analytics, advertising, or remote executable code.

Privacy policy: https://ductrungdoit.github.io/Slacktor/privacy-policy.html
