import type { ProviderSettings } from "../../shared/settings"

export type QuickTranslatorLanguages = {
  targetLanguage: string
  backTranslationLanguage: string
}

export type ExportedConfig = {
  schemaVersion: 1
  providerSettings: ProviderSettings
  quickTranslator: QuickTranslatorLanguages
}

export function buildConfigExport(
  providerSettings: ProviderSettings,
  quickTranslator: QuickTranslatorLanguages,
): string {
  const config: ExportedConfig = {
    schemaVersion: 1,
    providerSettings,
    quickTranslator,
  }
  return JSON.stringify(config, null, 2)
}

export function parseImportedConfig(text: string): ExportedConfig {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error("The selected content is not valid JSON.")
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isProviderSettings(value.providerSettings) ||
    !isRecord(value.quickTranslator)
  ) {
    throw new Error("This is not a valid Slacktor configuration file.")
  }
  const targetLanguage = value.quickTranslator.targetLanguage
  const backTranslationLanguage = value.quickTranslator.backTranslationLanguage
  if (
    typeof targetLanguage !== "string" ||
    typeof backTranslationLanguage !== "string" ||
    !targetLanguage.trim() ||
    !backTranslationLanguage.trim()
  ) {
    throw new Error("Quick Translator languages are invalid.")
  }
  return {
    schemaVersion: 1,
    providerSettings: value.providerSettings,
    quickTranslator: {
      targetLanguage: targetLanguage.trim(),
      backTranslationLanguage: backTranslationLanguage.trim(),
    },
  }
}

function isProviderSettings(value: unknown): value is ProviderSettings {
  if (!isRecord(value)) return false
  return (
    typeof value.extensionEnabled === "boolean" &&
    typeof value.baseUrl === "string" &&
    typeof value.apiKey === "string" &&
    typeof value.model === "string" &&
    typeof value.targetLanguage === "string" &&
    typeof value.customPrompt === "string" &&
    typeof value.autoTranslate === "boolean" &&
    typeof value.showTranslations === "boolean" &&
    typeof value.privacyConsent === "boolean"
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
