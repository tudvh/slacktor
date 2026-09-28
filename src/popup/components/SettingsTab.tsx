import { Eye, EyeOff, Loader2 } from "lucide-react"
import { useRef, useState } from "react"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { useProviderSettings } from "@/hooks/useProviderSettings"
import { buildConfigExport, parseImportedConfig } from "@/lib/config-transfer"
import { LANGUAGE_OPTIONS } from "@/lib/languages"

type SettingsTabProps = {
  provider: ReturnType<typeof useProviderSettings>
  quickLanguages: { targetLanguage: string; backTranslationLanguage: string }
  onImportQuickLanguages: (next: {
    targetLanguage: string
    backTranslationLanguage: string
  }) => void
}

type Status = { tone: "idle" | "success" | "error"; text: string }

export function SettingsTab({
  provider,
  quickLanguages,
  onImportQuickLanguages,
}: SettingsTabProps) {
  const {
    draft,
    updateDraft,
    save,
    testProvider,
    setExtensionEnabled,
    clearTranslationCache,
    importSettings,
  } = provider

  const [status, setStatus] = useState<Status>({ tone: "idle", text: "" })
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showSuccess = (text: string) => setStatus({ tone: "success", text })
  const showError = (error: unknown, fallback: string) =>
    setStatus({ tone: "error", text: error instanceof Error ? error.message : fallback })

  const handleSave = async () => {
    setSaving(true)
    setStatus({ tone: "idle", text: "Saving..." })
    try {
      await save()
      showSuccess("Configuration saved.")
    } catch (error) {
      showError(error, "Could not save configuration or endpoint permission was denied.")
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setStatus({ tone: "idle", text: "Testing current configuration..." })
    try {
      await testProvider()
      showSuccess("Provider test succeeded. Configuration saved.")
    } catch (error) {
      showError(error, "Provider test failed.")
    } finally {
      setTesting(false)
    }
  }

  const handleClearCache = async () => {
    setClearingCache(true)
    setStatus({ tone: "idle", text: "Clearing cache..." })
    try {
      await clearTranslationCache()
      showSuccess("Translation cache cleared. Active translations were not stopped.")
    } catch (error) {
      showError(error, "Could not clear the translation cache.")
    } finally {
      setClearingCache(false)
    }
  }

  const handleExport = async (target: "file" | "clipboard") => {
    try {
      const config = buildConfigExport(draft, quickLanguages)
      if (target === "file") {
        const url = URL.createObjectURL(new Blob([config], { type: "application/json" }))
        const link = document.createElement("a")
        link.href = url
        link.download = "slacktor-config.json"
        link.click()
        URL.revokeObjectURL(url)
        showSuccess(
          "Configuration exported to file. Keep it private because it contains your API key.",
        )
      } else {
        await navigator.clipboard.writeText(config)
        showSuccess("Configuration copied. It contains your API key.")
      }
    } catch (error) {
      showError(error, "Configuration transfer failed.")
    }
  }

  const handleImportText = async (text: string) => {
    try {
      const config = parseImportedConfig(text)
      await importSettings(config.providerSettings)
      onImportQuickLanguages(config.quickTranslator)
      showSuccess("Configuration imported.")
    } catch (error) {
      showError(error, "Configuration transfer failed.")
    }
  }

  const handleImportClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      await handleImportText(text)
    } catch (error) {
      showError(error, "Configuration transfer failed.")
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <Card>
        <CardHeader className="px-4">
          <CardTitle className="text-muted-foreground text-[13px] font-semibold tracking-wide uppercase">
            Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-4">
          <label className="flex items-start gap-2.5">
            <Switch
              checked={draft.extensionEnabled}
              onCheckedChange={(checked) => void setExtensionEnabled(checked)}
              className="mt-0.5"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Enable Slacktor</span>
              <span className="text-muted-foreground text-xs">
                Disable this installation completely to avoid conflicts.
              </span>
            </span>
          </label>

          <div className="grid gap-1.5">
            <Label htmlFor="base-url">AI endpoint</Label>
            <Input
              id="base-url"
              type="url"
              placeholder="https://api.example.com/v1"
              required
              value={draft.baseUrl}
              onChange={(event) => updateDraft({ baseUrl: event.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              placeholder="gpt-4o-mini"
              required
              value={draft.model}
              onChange={(event) => updateDraft({ model: event.target.value })}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="api-key">API key</Label>
            <div className="flex gap-1.5">
              <Input
                id="api-key"
                type={apiKeyVisible ? "text" : "password"}
                placeholder="sk-..."
                required
                value={draft.apiKey}
                onChange={(event) => updateDraft({ apiKey: event.target.value })}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title={apiKeyVisible ? "Hide API key" : "Show API key"}
                    aria-label={apiKeyVisible ? "Hide API key" : "Show API key"}
                    onClick={() => setApiKeyVisible((visible) => !visible)}
                  >
                    {apiKeyVisible ? <EyeOff /> : <Eye />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{apiKeyVisible ? "Hide API key" : "Show API key"}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={testing}
            onClick={() => void handleTest()}
          >
            {testing ? <Loader2 className="animate-spin" /> : null}
            Test provider
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4">
          <CardTitle className="text-muted-foreground text-[13px] font-semibold tracking-wide uppercase">
            Translation
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-4">
          <div className="grid gap-1.5">
            <Label htmlFor="target-language">Translate to</Label>
            <Select
              value={draft.targetLanguage}
              onValueChange={(value) => updateDraft({ targetLanguage: value })}
            >
              <SelectTrigger id="target-language" className="w-full">
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
            <Label htmlFor="custom-prompt">Custom translation instructions</Label>
            <Textarea
              id="custom-prompt"
              rows={3}
              maxLength={2000}
              placeholder="Example: Keep product names in English and use our team's terminology."
              value={draft.customPrompt}
              onChange={(event) => updateDraft({ customPrompt: event.target.value })}
            />
            <p className="text-muted-foreground text-xs">
              Optional. Applied in addition to Slacktor's required translation and output rules.
            </p>
          </div>

          <label className="flex items-start gap-2.5">
            <Switch
              checked={draft.autoTranslate}
              onCheckedChange={(checked) => updateDraft({ autoTranslate: checked })}
              className="mt-0.5"
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Auto-translate member messages</span>
              <span className="text-muted-foreground text-xs">
                Automatically translates messages from team members. Bot and system messages can
                still be translated manually.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4">
          <CardTitle className="text-muted-foreground text-[13px] font-semibold tracking-wide uppercase">
            Configuration transfer
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 px-4">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
            <span className="text-sm font-medium">Export</span>
            <Button variant="outline" size="sm" onClick={() => void handleExport("file")}>
              File
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleExport("clipboard")}>
              Clipboard
            </Button>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
            <span className="text-sm font-medium">Import</span>
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              File
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleImportClipboard()}>
              Clipboard
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void file.text().then(handleImportText)
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4">
          <CardTitle className="text-muted-foreground text-[13px] font-semibold tracking-wide uppercase">
            Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4">
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                className="text-destructive hover:text-destructive w-full"
                disabled={clearingCache}
              >
                {clearingCache ? <Loader2 className="animate-spin" /> : null}
                Clear translation cache
              </Button>
            }
            title="Clear translation cache?"
            description="This removes all cached translations. Active translations in Slack are not stopped, but future views will re-request them from your AI endpoint."
            confirmLabel="Clear cache"
            onConfirm={() => void handleClearCache()}
          />
        </CardContent>
      </Card>

      <div className="bg-background sticky bottom-0 z-10 -mx-4 -mb-4 grid gap-2 border-t px-4 py-3">
        <p
          className={
            status.tone === "error"
              ? "text-destructive min-h-4 text-xs"
              : status.tone === "success"
                ? "text-success min-h-4 text-xs"
                : "text-muted-foreground min-h-4 text-xs"
          }
        >
          {status.text}
        </p>
        <Button disabled={saving} onClick={() => void handleSave()}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save configuration
        </Button>
      </div>
    </div>
  )
}
