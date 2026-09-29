import { cn } from "cn"
import { ScrollText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ProviderStatus } from "@/hooks/useProviderStatus"

type HeaderProps = {
  status: ProviderStatus
  showTranslations: boolean
  onToggleShowTranslations: (next: boolean) => void
  onOpenLogs: () => void
  hasProviderError: boolean
}

const STATUS_DOT_CLASS: Record<ProviderStatus["state"], string> = {
  unconfigured: "bg-muted-foreground/50",
  ready: "bg-success",
  error: "bg-destructive",
}

export function Header({
  status,
  showTranslations,
  onToggleShowTranslations,
  onOpenLogs,
  hasProviderError,
}: HeaderProps) {
  return (
    <header className="flex items-center gap-2.5 px-4 pt-4 pb-3">
      <div className="bg-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
        <img src="/icons/icon-32.png" alt="" className="size-6" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="truncate text-[15px] leading-none font-semibold">Slacktor</h1>
        <span className="text-muted-foreground text-[10px] leading-none font-medium">
          v{__APP_VERSION__}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              role="status"
              tabIndex={0}
              aria-label={status.message}
              className={cn("size-2 shrink-0 rounded-full", STATUS_DOT_CLASS[status.state])}
            />
          </TooltipTrigger>
          <TooltipContent>{status.message}</TooltipContent>
        </Tooltip>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center">
            <Switch
              id="show-translations"
              aria-label={showTranslations ? "Hide translations" : "Show translations"}
              checked={showTranslations}
              onCheckedChange={onToggleShowTranslations}
            />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {showTranslations ? "Hide translations" : "Show translations"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            title="Logs"
            aria-label="Logs"
            onClick={onOpenLogs}
            className={cn(hasProviderError && "text-destructive hover:text-destructive")}
          >
            <ScrollText />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Logs</TooltipContent>
      </Tooltip>
    </header>
  )
}
