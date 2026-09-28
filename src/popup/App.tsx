import { History, Languages, Settings as SettingsIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { Footer } from "@/components/Footer"
import { Header } from "@/components/Header"
import { HistoryTab } from "@/components/HistoryTab"
import { LogsDialog } from "@/components/LogsDialog"
import { PrivacyConsentDialog } from "@/components/PrivacyConsentDialog"
import { QuickTranslateTab } from "@/components/QuickTranslateTab"
import { SettingsTab } from "@/components/SettingsTab"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useLogs } from "@/hooks/useLogs"
import { useProviderSettings } from "@/hooks/useProviderSettings"
import { useProviderStatus } from "@/hooks/useProviderStatus"
import { useQuickTranslator } from "@/hooks/useQuickTranslator"
import { useSlackStats } from "@/hooks/useSlackStats"

type TabKey = "quick" | "history" | "settings"

export function App() {
  const provider = useProviderSettings()
  const status = useProviderStatus(provider.configured)
  const slackStats = useSlackStats()
  const quick = useQuickTranslator()
  const logs = useLogs()

  const [activeTab, setActiveTab] = useState<TabKey>("quick")
  const [logsOpen, setLogsOpen] = useState(false)

  useEffect(() => {
    if (provider.loaded) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.body.classList.remove("preload")
        })
      })
    }
  }, [provider.loaded])

  return (
    <TooltipProvider>
      <div className="flex size-full flex-col">
        <Header
          status={status}
          showTranslations={provider.draft.showTranslations}
          onToggleShowTranslations={(next) => void provider.setShowTranslations(next)}
          onOpenLogs={() => setLogsOpen(true)}
          hasProviderError={status.state === "error"}
        />

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TabKey)}
          className="flex min-h-0 w-full flex-1 flex-col"
        >
          <div className="px-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="quick">
                <Languages />
                Translate
              </TabsTrigger>
              <TabsTrigger value="history">
                <History />
                History
              </TabsTrigger>
              <TabsTrigger value="settings">
                <SettingsIcon />
                Settings
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="quick" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <QuickTranslateTab quick={quick} />
          </TabsContent>
          <TabsContent value="history" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <HistoryTab
              history={quick.history}
              onRestore={(entry) => {
                quick.restoreFromHistory(entry)
                setActiveTab("quick")
              }}
              onDelete={quick.deleteHistoryEntry}
              onClear={quick.clearHistory}
            />
          </TabsContent>
          <TabsContent value="settings" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <SettingsTab
              provider={provider}
              quickLanguages={{
                targetLanguage: quick.targetLanguage,
                backTranslationLanguage: quick.backTranslationLanguage,
              }}
              onImportQuickLanguages={(next) => quick.setQuickLanguages(next)}
            />
          </TabsContent>
        </Tabs>

        <Footer stats={slackStats.stats} unavailable={slackStats.unavailable} />
      </div>

      <LogsDialog open={logsOpen} onOpenChange={setLogsOpen} logsState={logs} />
      <PrivacyConsentDialog
        open={provider.loaded && !provider.draft.privacyConsent}
        onAccept={() => void provider.acceptPrivacyConsent()}
      />
    </TooltipProvider>
  )
}
