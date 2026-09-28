// Single source of truth for Slacktor's brand colors, shared between the popup
// (Tailwind/shadcn CSS variables in src/popup/index.css) and the vanilla DOM
// translation overlay injected into Slack (src/content/translation-renderer.ts).
//
// Keep these hex values in sync with the `:root` tokens declared in
// src/popup/index.css. The popup consumes them via Tailwind utility classes
// (bg-primary, text-destructive, ...); the content script cannot use Tailwind
// since it renders directly into Slack's page, so it imports this object and
// applies the hex values as inline styles instead.
export const SLACKTOR_COLORS = {
  primary: "#1264A3",
  primaryForeground: "#FFFFFF",
  success: "#007A5A",
  destructive: "#C4314B",
  warning: "#9B6A00",
  foreground: "#1D1C1D",
  mutedForeground: "#616061",
  muted: "#F8F8F8",
  border: "#E2E2E2",
  accent: "#EAF4FB",
} as const

export type SlacktorColorToken = keyof typeof SLACKTOR_COLORS
