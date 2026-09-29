import { useCallback, useEffect, useState } from "react"

import type { QuickTranslateResponse } from "../../shared/messages"
import { sendExtensionMessage } from "../lib/messaging"

export type QuickHistoryEntry = {
  id: string
  source: string
  japanese: string
  english: string
  createdAt: number
}

export type QuickResults = { japanese: string; english: string }

type QuickUiState = {
  draft: string
  targetLanguage: string
  backTranslationLanguage: string
  clearAfterClose: boolean
  lastTranslatedSource?: string
  history: QuickHistoryEntry[]
}

const QUICK_UI_KEY = "quick-translator-ui"
const QUICK_HISTORY_RETENTION_MS = 2 * 24 * 60 * 60 * 1000

const INITIAL_STATE: QuickUiState = {
  draft: "",
  targetLanguage: "Japanese",
  backTranslationLanguage: "English",
  clearAfterClose: false,
  history: [],
}

function retainRecentHistory(history: QuickHistoryEntry[] | undefined): QuickHistoryEntry[] {
  if (!Array.isArray(history)) return []
  const cutoff = Date.now() - QUICK_HISTORY_RETENTION_MS
  return history.filter((entry) => Number.isFinite(entry?.createdAt) && entry.createdAt >= cutoff)
}

export function useQuickTranslator() {
  const [state, setState] = useState<QuickUiState>(INITIAL_STATE)
  const [loaded, setLoaded] = useState(false)
  const [results, setResults] = useState<QuickResults | undefined>(undefined)
  const [translating, setTranslating] = useState(false)

  useEffect(() => {
    void chrome.storage.local.get(QUICK_UI_KEY).then((stored) => {
      let next: QuickUiState = { ...INITIAL_STATE, ...stored[QUICK_UI_KEY] }
      const retainedHistory = retainRecentHistory(next.history)
      const shouldClearDraft =
        next.clearAfterClose &&
        next.lastTranslatedSource !== undefined &&
        next.draft === next.lastTranslatedSource
      if (shouldClearDraft) {
        next = {
          ...next,
          draft: "",
          clearAfterClose: false,
          lastTranslatedSource: undefined,
          history: retainedHistory,
        }
        void chrome.storage.local.set({ [QUICK_UI_KEY]: next })
      } else if (retainedHistory.length !== next.history.length) {
        next = { ...next, history: retainedHistory }
        void chrome.storage.local.set({ [QUICK_UI_KEY]: next })
      }
      setState(next)
      setLoaded(true)
    })
  }, [])

  const persist = useCallback((next: QuickUiState) => {
    setState(next)
    void chrome.storage.local.set({ [QUICK_UI_KEY]: next })
  }, [])

  const setDraft = useCallback(
    (draft: string) => {
      // Any edit after a successful translation means the user is preparing new
      // text. Preserve that draft on next popup open, even if it's later
      // changed back to the same value.
      persist({ ...state, draft, clearAfterClose: false, lastTranslatedSource: undefined })
    },
    [state, persist],
  )

  const setTargetLanguage = useCallback(
    (targetLanguage: string) => persist({ ...state, targetLanguage }),
    [state, persist],
  )

  const setBackTranslationLanguage = useCallback(
    (backTranslationLanguage: string) => persist({ ...state, backTranslationLanguage }),
    [state, persist],
  )

  // Updates both language fields in a single persisted write. Calling
  // setTargetLanguage() and setBackTranslationLanguage() back-to-back would
  // each spread the same stale `state` closure, so the second call silently
  // discards the first call's change; this keeps a combined update atomic.
  const setQuickLanguages = useCallback(
    (next: { targetLanguage: string; backTranslationLanguage: string }) =>
      persist({ ...state, ...next }),
    [state, persist],
  )

  const clearSource = useCallback(() => {
    persist({ ...state, draft: "", clearAfterClose: false, lastTranslatedSource: undefined })
    setResults(undefined)
  }, [state, persist])

  const clearHistory = useCallback(() => {
    persist({ ...state, history: [] })
  }, [state, persist])

  const deleteHistoryEntry = useCallback(
    (id: string) => {
      persist({ ...state, history: state.history.filter((entry) => entry.id !== id) })
    },
    [state, persist],
  )

  const restoreFromHistory = useCallback(
    (entry: QuickHistoryEntry) => {
      setResults({ japanese: entry.japanese, english: entry.english })
      persist({
        ...state,
        draft: entry.source ?? "",
        clearAfterClose: true,
        lastTranslatedSource: entry.source ?? "",
      })
    },
    [state, persist],
  )

  const translate = useCallback(async (): Promise<void> => {
    const text = state.draft.trim()
    const targetLanguage = state.targetLanguage.trim()
    const backTranslationLanguage = state.backTranslationLanguage.trim()
    if (!text || !targetLanguage || !backTranslationLanguage) return

    setTranslating(true)
    setResults(undefined)
    try {
      const response = await sendExtensionMessage<QuickTranslateResponse>({
        type: "quick-translate",
        text,
        targetLanguage,
        backTranslationLanguage,
      })
      if (!response?.ok) throw new Error(response?.error ?? "Quick translation failed.")
      setResults({ japanese: response.japanese, english: response.english })
      const entry: QuickHistoryEntry = {
        id: crypto.randomUUID(),
        source: text,
        japanese: response.japanese,
        english: response.english,
        createdAt: Date.now(),
      }
      const inputIsUnchanged = state.draft.trim() === text
      persist({
        ...state,
        draft: state.draft,
        history: [entry, ...retainRecentHistory(state.history)].slice(0, 50),
        lastTranslatedSource: inputIsUnchanged ? state.draft : undefined,
        clearAfterClose: inputIsUnchanged,
      })
    } catch {
      // Keep the source text intact so retry always works.
    } finally {
      setTranslating(false)
    }
  }, [state, persist])

  const copyResult = useCallback(
    async (which: "japanese" | "english"): Promise<void> => {
      const text = results?.[which] ?? ""
      await navigator.clipboard.writeText(text)
    },
    [results],
  )

  const moveResultToInput = useCallback(
    async (which: "japanese" | "english"): Promise<{ ok: boolean; error?: string }> => {
      const text = results?.[which]
      if (!text) return { ok: false, error: "Nothing to move yet." }
      try {
        return await sendExtensionMessage<{ ok: boolean; error?: string }>({
          type: "append-to-slack-input",
          text,
        })
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Could not reach Slack.",
        }
      }
    },
    [results],
  )

  return {
    loaded,
    draft: state.draft,
    targetLanguage: state.targetLanguage,
    backTranslationLanguage: state.backTranslationLanguage,
    history: state.history,
    results,
    translating,
    setDraft,
    setTargetLanguage,
    setBackTranslationLanguage,
    setQuickLanguages,
    translate,
    clearSource,
    clearHistory,
    deleteHistoryEntry,
    restoreFromHistory,
    copyResult,
    moveResultToInput,
  }
}
