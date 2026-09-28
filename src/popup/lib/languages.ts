export type LanguageOption = { value: string; label: string }

// Temporary fixed language set for the quick-translate and settings language
// selects. Values are the full language names, matching the free-text strings
// already stored in settings/quick-translate state and sent to the provider.
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "Japanese", label: "Japanese" },
  { value: "English", label: "English" },
  { value: "Vietnamese", label: "Vietnamese" },
]
