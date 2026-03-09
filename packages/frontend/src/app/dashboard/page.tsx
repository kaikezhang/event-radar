import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingUp, Activity, Clock } from "lucide-react";

export default function DashboardPage() {
  // Placeholder data
  const stats = [
    { label: "Total Events", value: "1,234", icon: Activity },
    { label: "High Severity", value: "23", icon: AlertTriangle },
    { label: "Active Sources", value: "12", icon: TrendingUp },
    { label: "Last 24h", value: "89", icon: Clock },
  ];

  const recentEvents = [
    { id: 1, title: "AAPL announces Q1 earnings beat", ticker: "AAPL", severity: "HIGH", time: "2 min ago" },
    { id: 2, title: "FDA approves NVDA drug candidate", ticker: "NVDA", severity: "CRITICAL", time: "15 min ago" },
    { id: 3, title: "MSFT acquires cybersecurity startup", ticker: "MSFT", severity: "HIGH", time: "32 min ago" },
    { id: 4, title: "GOOGL expands AI partnership", ticker: "GOOGL", severity: "MEDIUM", time: "1 hr ago" },
    { id: 5, title: "TSLA appoints new CFO", ticker: "TSLA", severity: "MEDIUM", time: "2 hr ago" },
  ];

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-severity-critical text-white";
      case "HIGH":
        return "bg-severity-high text-white";
      case "MEDIUM":
        return "bg-severity-medium text-black";
      case "LOW":
        return "bg-severity-low text-white";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Real-time event monitoring</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
          <CardDescription>Latest detected events</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{event.ticker}</span>
                    <Badge className={getSeverityColor(event.severity)}>
                      {event.severity}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{event.title}</p>
                </div>
                <span className="text-sm text-muted-foreground">{event.time}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
