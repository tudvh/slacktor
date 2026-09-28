import { ArrowUpFromLine, Check, Copy, Loader2 } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { useQuickTranslator } from "@/hooks/useQuickTranslator"
import { LANGUAGE_OPTIONS } from "@/lib/languages"

type QuickTranslateTabProps = {
  quick: ReturnType<typeof useQuickTranslator>
}

export function QuickTranslateTab({ quick }: QuickTranslateTabProps) {
  const {
    draft,
    targetLanguage,
    backTranslationLanguage,
    results,
    translating,
    setDraft,
    setTargetLanguage,
    setBackTranslationLanguage,
    setQuickLanguages,
    translate,
    clearSource,
  } = quick

  // Exclude the target language from the back-translation list, but never
  // drop the currently selected back value itself (e.g. from an older
  // imported config where both fields happened to match) — otherwise the
  // select would have no matching item to render and would show blank.
  const backLanguageOptions = LANGUAGE_OPTIONS.filter(
    (option) => option.value !== targetLanguage || option.value === backTranslationLanguage,
  )

  const handleTargetLanguageChange = (value: string) => {
    if (value !== backTranslationLanguage) {
      setTargetLanguage(value)
      return
    }
    const fallback = LANGUAGE_OPTIONS.find((option) => option.value !== value)
    setQuickLanguages({
      targetLanguage: value,
      backTranslationLanguage: fallback?.value ?? backTranslationLanguage,
    })
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="quick-target-language" className="text-muted-foreground text-xs">
            Translate to
          </Label>
          <Select value={targetLanguage} onValueChange={handleTargetLanguageChange}>
            <SelectTrigger id="quick-target-language" className="w-full">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="quick-back-language" className="text-muted-foreground text-xs">
            Then translate back to
          </Label>
          <Select value={backTranslationLanguage} onValueChange={setBackTranslationLanguage}>
            <SelectTrigger id="quick-back-language" className="w-full">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {backLanguageOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="quick-source" className="text-muted-foreground text-xs">
          Source text
        </Label>
        <Textarea
          id="quick-source"
          rows={4}
          placeholder="Enter any text..."
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" disabled={translating} onClick={() => void translate()}>
          {translating ? <Loader2 className="animate-spin" /> : null}
          Translate
        </Button>
        <Button variant="outline" onClick={clearSource}>
          Clear
        </Button>
      </div>

      {results ? (
        <div className="grid gap-2">
          <QuickResultCard
            label={targetLanguage || "Translation"}
            text={results.japanese}
            onCopy={() => void quick.copyResult("japanese")}
            onMove={() => quick.moveResultToInput("japanese")}
          />
          <QuickResultCard
            label={backTranslationLanguage || "Back translation"}
            text={results.english}
            onCopy={() => void quick.copyResult("english")}
            onMove={() => quick.moveResultToInput("english")}
          />
        </div>
      ) : null}
    </div>
  )
}

function QuickResultCard({
  label,
  text,
  onCopy,
  onMove,
}: {
  label: string
  text: string
  onCopy: () => void
  onMove: () => Promise<{ ok: boolean; error?: string }>
}) {
  const [copied, setCopied] = useState(false)
  const [moveState, setMoveState] = useState<"idle" | "ok" | "error">("idle")
  const [moveError, setMoveError] = useState<string | undefined>(undefined)

  const handleCopy = () => {
    onCopy()
    setCopied(true)
    window.setTimeout(() => setCopied(false), 900)
  }

  const handleMove = () => {
    void onMove().then((response) => {
      setMoveState(response.ok ? "ok" : "error")
      setMoveError(response.error)
      window.setTimeout(() => setMoveState("idle"), 1200)
    })
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between px-3 pb-0">
        <span className="text-muted-foreground text-xs font-semibold">{label}</span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Move to Slack input"
                aria-label={`Move ${label} translation to Slack input`}
                onClick={handleMove}
                className={
                  moveState === "ok"
                    ? "text-success"
                    : moveState === "error"
                      ? "text-destructive"
                      : undefined
                }
              >
                <ArrowUpFromLine />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {moveState === "error" && moveError ? moveError : "Move to Slack input"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                title="Copy"
                aria-label={`Copy ${label} translation`}
                onClick={handleCopy}
                className={copied ? "text-success" : undefined}
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>
      <CardContent className="px-3 pt-2">
        <pre className="text-foreground max-h-28 overflow-auto text-[12.5px] leading-relaxed wrap-anywhere whitespace-pre-wrap">
          {text}
        </pre>
      </CardContent>
    </Card>
  )
}
