import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "cn"
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react"
import React, { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
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
import { toast } from "@/hooks/useToast"
import { buildConfigExport, parseImportedConfig } from "@/lib/config-transfer"
import { LANGUAGE_OPTIONS } from "@/lib/languages"

import type { ProviderSettings } from "../../shared/settings"

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const settingsSchema = z.object({
  extensionEnabled: z.boolean(),
  baseUrl: z
    .string()
    .min(1, "AI endpoint is required.")
    .refine(
      (v) => {
        try {
          const url = new URL(v)
          return (
            url.protocol === "https:" ||
            (url.protocol === "http:" &&
              (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
          )
        } catch {
          return false
        }
      },
      { message: "Must be an HTTPS URL, or HTTP on localhost." },
    ),
  model: z.string().min(1, "Model name is required."),
  apiKey: z.string().min(1, "API key is required."),
  targetLanguage: z.string().min(1, "Target language is required."),
  customPrompt: z.string().max(2000, "Max 2 000 characters."),
  autoTranslate: z.boolean(),
})

type SettingsFormValues = z.infer<typeof settingsSchema>

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type SettingsTabProps = {
  provider: ReturnType<typeof useProviderSettings>
  quickLanguages: { targetLanguage: string; backTranslationLanguage: string }
  onImportQuickLanguages: (next: {
    targetLanguage: string
    backTranslationLanguage: string
  }) => void
  /** Called whenever the form dirty state changes — lets App.tsx guard tab navigation. */
  onDirtyChange?: (isDirty: boolean) => void
  /** Pass a ref; SettingsTab will populate `.current` with a reset function. */
  resetRef?: React.RefObject<(() => void) | undefined>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsTab({
  provider,
  quickLanguages,
  onImportQuickLanguages,
  onDirtyChange,
  resetRef,
}: SettingsTabProps) {
  const { draft, updateDraft, save, testProvider, clearTranslationCache, importSettings } = provider

  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [clearingCache, setClearingCache] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showSuccess = (text: string) => toast.success(text)
  const showError = (error: unknown, fallback: string) =>
    toast.error(error instanceof Error ? error.message : fallback)

  // -------------------------------------------------------------------------
  // Form
  // -------------------------------------------------------------------------

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      extensionEnabled: draft.extensionEnabled,
      baseUrl: draft.baseUrl,
      model: draft.model,
      apiKey: draft.apiKey,
      targetLanguage: draft.targetLanguage,
      customPrompt: draft.customPrompt ?? "",
      autoTranslate: draft.autoTranslate,
    },
  })

  // Sync external draft (e.g. after import) → form values
  useEffect(() => {
    if (!provider.loaded) return
    form.reset({
      extensionEnabled: draft.extensionEnabled,
      baseUrl: draft.baseUrl,
      model: draft.model,
      apiKey: draft.apiKey,
      targetLanguage: draft.targetLanguage,
      customPrompt: draft.customPrompt ?? "",
      autoTranslate: draft.autoTranslate,
    })
  }, [provider.loaded])

  // Keep useProviderSettings draft in sync with what the user types
  const watchedValues = form.watch()
  useEffect(() => {
    updateDraft({
      extensionEnabled: watchedValues.extensionEnabled,
      baseUrl: watchedValues.baseUrl,
      model: watchedValues.model,
      apiKey: watchedValues.apiKey,
      targetLanguage: watchedValues.targetLanguage,
      customPrompt: watchedValues.customPrompt,
      autoTranslate: watchedValues.autoTranslate,
    })
    // Only run when individual fields change, not on every render
  }, [
    watchedValues.extensionEnabled,
    watchedValues.baseUrl,
    watchedValues.model,
    watchedValues.apiKey,
    watchedValues.targetLanguage,
    watchedValues.customPrompt,
    watchedValues.autoTranslate,
  ])

  const isDirty = form.formState.isDirty

  // Notify parent when dirty state changes so it can guard tab navigation.
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])

  // Expose a reset function so App.tsx can discard changes on tab switch.
  useEffect(() => {
    if (resetRef) resetRef.current = () => form.reset()
  })

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleSave = form.handleSubmit(async () => {
    setSaving(true)
    try {
      await save()
      form.reset(form.getValues()) // clear dirty state
      showSuccess("Configuration saved.")
    } catch (error) {
      showError(error, "Could not save configuration or endpoint permission was denied.")
    } finally {
      setSaving(false)
    }
  })

  const handleTest = async () => {
    // Validate provider fields only before testing
    const valid = await form.trigger(["baseUrl", "model", "apiKey"], { shouldFocus: true })
    if (!valid) return
    setTesting(true)
    try {
      await testProvider()
      form.reset(form.getValues())
      showSuccess("Provider test succeeded. Configuration saved.")
    } catch (error) {
      showError(error, "Provider test failed.")
    } finally {
      setTesting(false)
    }
  }

  const handleClearCache = async () => {
    setClearingCache(true)
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
    const valid = await form.trigger(undefined, { shouldFocus: true })
    if (!valid) return

    try {
      const formValues = form.getValues()
      const exportSettings: ProviderSettings = {
        ...draft,
        ...formValues,
        baseUrl: formValues.baseUrl.trim(),
        model: formValues.model.trim(),
        apiKey: formValues.apiKey.trim(),
        targetLanguage: formValues.targetLanguage.trim(),
        customPrompt: formValues.customPrompt.trim(),
      }
      const config = buildConfigExport(exportSettings, quickLanguages)
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
      // Sync form to the imported values
      form.reset({
        extensionEnabled: config.providerSettings.extensionEnabled,
        baseUrl: config.providerSettings.baseUrl,
        model: config.providerSettings.model,
        apiKey: config.providerSettings.apiKey,
        targetLanguage: config.providerSettings.targetLanguage,
        customPrompt: config.providerSettings.customPrompt ?? "",
        autoTranslate: config.providerSettings.autoTranslate,
      })
      showSuccess("Configuration imported.")
    } catch (error) {
      showError(error, "Configuration transfer failed.")
    }
  }

  const handleImportClipboard = async () => {
    try {
      const permissionStatus = await navigator.permissions
        .query({ name: "clipboard-read" as PermissionName })
        .catch(() => null)

      if (permissionStatus?.state === "denied") {
        showError(
          null,
          "Clipboard access is blocked. Allow it in your browser's site settings, then try again.",
        )
        return
      }

      const text = await navigator.clipboard.readText()
      await handleImportText(text)
    } catch (error) {
      showError(error, "Configuration transfer failed.")
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Form {...form}>
      <form onSubmit={(e) => void handleSave(e)} noValidate>
        {/* Unsaved changes banner */}
        <div
          className={cn(
            "sticky top-0 z-20 grid transition-all duration-300 ease-in-out",
            isDirty
              ? "grid-rows-[1fr] opacity-100"
              : "pointer-events-none grid-rows-[0fr] opacity-0",
          )}
          aria-hidden={!isDirty}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="bg-warning flex items-center gap-2 px-4 py-2 text-xs text-white">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              <span className="font-medium">Unsaved changes — remember to save.</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-4 py-4">
          {/* Provider card */}
          <Card>
            <CardHeader className="px-4">
              <CardTitle className="text-muted-foreground text-[13px] font-semibold tracking-wide uppercase">
                Provider
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-4">
              {/* Extension enabled toggle */}
              <FormField
                control={form.control}
                name="extensionEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-2.5">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="mt-0.5"
                      />
                    </FormControl>
                    <div className="grid gap-0.5">
                      <FormLabel className="text-sm font-medium">Enable Slacktor</FormLabel>
                      <FormDescription>
                        Master switch to turn all translation features on or off on Slack Web.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />

              {/* AI endpoint */}
              <FormField
                control={form.control}
                name="baseUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>AI endpoint</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        id="base-url"
                        type="url"
                        placeholder="https://api.example.com/v1"
                        aria-describedby="base-url-error"
                        aria-invalid={!!form.formState.errors.baseUrl}
                      />
                    </FormControl>
                    <FormMessage id="base-url-error" />
                  </FormItem>
                )}
              />

              {/* Model */}
              <FormField
                control={form.control}
                name="model"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Model</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        id="model"
                        placeholder="gpt-4o-mini"
                        aria-invalid={!!form.formState.errors.model}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* API key */}
              <FormField
                control={form.control}
                name="apiKey"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>API key</FormLabel>
                    <FormControl>
                      <div className="flex gap-1.5">
                        <Input
                          {...field}
                          id="api-key"
                          type={apiKeyVisible ? "text" : "password"}
                          placeholder="sk-..."
                          aria-invalid={!!form.formState.errors.apiKey}
                        />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              title={apiKeyVisible ? "Hide API key" : "Show API key"}
                              aria-label={apiKeyVisible ? "Hide API key" : "Show API key"}
                              onClick={() => setApiKeyVisible((v) => !v)}
                            >
                              {apiKeyVisible ? <EyeOff /> : <Eye />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {apiKeyVisible ? "Hide API key" : "Show API key"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

          {/* Translation card */}
          <Card>
            <CardHeader className="px-4">
              <CardTitle className="text-muted-foreground text-[13px] font-semibold tracking-wide uppercase">
                Translation
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 px-4">
              {/* Target language */}
              <FormField
                control={form.control}
                name="targetLanguage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Translate to</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger ref={field.ref} id="target-language" className="w-full">
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
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Custom prompt */}
              <FormField
                control={form.control}
                name="customPrompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Custom translation instructions</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        id="custom-prompt"
                        rows={3}
                        maxLength={2000}
                        placeholder="Example: Keep product names in English and use our team's terminology."
                      />
                    </FormControl>
                    <FormDescription>
                      Optional. Applied in addition to Slacktor's required translation and output
                      rules.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Auto-translate */}
              <FormField
                control={form.control}
                name="autoTranslate"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start gap-2.5">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className="mt-0.5"
                      />
                    </FormControl>
                    <div className="grid gap-0.5">
                      <FormLabel className="text-sm font-medium">
                        Auto-translate member messages
                      </FormLabel>
                      <FormDescription>
                        Automatically translates messages from team members. Bot and system messages
                        can still be translated manually.
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Configuration transfer */}
          <Card>
            <CardHeader className="px-4">
              <CardTitle className="text-muted-foreground text-[13px] font-semibold tracking-wide uppercase">
                Configuration transfer
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 px-4">
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                <span className="text-sm font-medium">Export</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExport("file")}
                >
                  File
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExport("clipboard")}
                >
                  Clipboard
                </Button>
              </div>
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
                <span className="text-sm font-medium">Import</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  File
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleImportClipboard()}
                >
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

          {/* Maintenance */}
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
                    type="button"
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

          {/* Sticky save bar */}
          <div className="bg-background sticky bottom-0 z-10 -mx-4 -mb-4 border-t px-4 py-3">
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : null}
              Save configuration
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}
