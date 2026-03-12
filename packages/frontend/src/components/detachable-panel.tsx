"use client";

import { MonitorUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DetachablePanelType = "chart" | "events" | "details";

interface DetachablePanelProps {
  type?: DetachablePanelType;
  params?: Record<string, string | string[] | null | undefined>;
  label?: string;
  className?: string;
  title?: string;
  description?: string;
  href?: string;
  children?: React.ReactNode;
}

function buildQueryString(params: Record<string, string | string[] | null | undefined>): string {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      if (value.length > 0) {
        searchParams.set(key, value.join(","));
      }
      continue;
    }

    if (value) {
      searchParams.set(key, value);
    }
  }

  return searchParams.toString();
}

export function DetachablePanel({
  type,
  params = {},
  label = "Pop Out",
  className,
  title,
  description,
  href,
  children,
}: DetachablePanelProps) {
  function handleClick() {
    if (href) {
      const popup = window.open(
        href,
        `event-radar-${type ?? "panel"}`,
        "popup=yes,width=1360,height=860,left=80,top=80,resizable=yes,scrollbars=yes",
      );
      popup?.focus();
      return;
    }
    const query = buildQueryString(params);
    const url = `/dashboard/panel/${type}${query ? `?${query}` : ""}`;
    const popup = window.open(
      url,
      `event-radar-${type}`,
      "popup=yes,width=1360,height=860,left=80,top=80,resizable=yes,scrollbars=yes",
    );
    popup?.focus();
  }

  if (children) {
    return (
      <section className={className}>
        <div className="flex items-center justify-between mb-2">
          <div>
            {title && <h3 className="text-sm font-semibold">{title}</h3>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <Button variant="outline" size="sm" onClick={handleClick}>
            <MonitorUp className="h-3.5 w-3.5" />
            {label}
          </Button>
        </div>
        {children}
      </section>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={handleClick}
    >
      <MonitorUp className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
