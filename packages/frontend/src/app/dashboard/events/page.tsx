"use client";

import { Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EventsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Events</h1>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Event Stream
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Live event stream coming soon. Use the Dashboard for real-time events or History for historical browsing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
