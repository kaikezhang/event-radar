"use client";

import { MonitorSpeaker, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useBroadcastSync } from "@/lib/broadcast-sync";

export function Header() {
  const sync = useBroadcastSync();

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div className="flex flex-1 items-center gap-4">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search events..."
            className="w-full rounded-lg border bg-background py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Badge variant="outline" className="gap-1 border-cyan-300/30 bg-cyan-400/10 text-cyan-200">
          <MonitorSpeaker className="h-3.5 w-3.5" />
          {sync.activeWindowCount} window{sync.activeWindowCount === 1 ? "" : "s"}
        </Badge>
      </div>
    </header>
  );
}
