'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, AlertTriangle, TrendingUp, Clock, Wifi, WifiOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useEventsWebSocket, type EventItem, type EventFilters } from '@/hooks/use-events-websocket';
import { FilterBar } from '@/components/filter-bar';
import { EventList } from '@/components/event-list';
import { EventDetailPanel } from '@/components/event-detail-panel';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'er-dev-2026';

// Mock sources for filter
const MOCK_SOURCES = [
  'SEC',
  'X',
  'Truth-Social',
  'PRNewswire',
  'BusinessWire',
  'GlobeNewswire',
  'Political',
  'Newswire',
];

export default function DashboardPage() {
  const [filters, setFilters] = useState<EventFilters>({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [presets, setPresets] = useState<Array<{ id: string; name: string; filters: EventFilters }>>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);

  const handleCriticalOrHigh = useCallback((event: EventItem) => {
    console.log('Critical/High event:', event);
    setSelectedEvent(event);
  }, []);

  const {
    events,
    isConnected,
    error,
    updateFilters,
    savePreset,
    loadPresets,
    deletePreset,
  } = useEventsWebSocket({
    apiUrl: API_URL,
    apiKey: API_KEY,
    onCriticalOrHigh: handleCriticalOrHigh,
    soundEnabled,
  });

  // Load presets on mount
  useEffect(() => {
    setPresets(loadPresets());
  }, [loadPresets]);

  // Filter events client-side
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (filters.severity?.length && !filters.severity.includes(event.severity || '')) {
        return false;
      }
      if (filters.source?.length && !filters.source.includes(event.source)) {
        return false;
      }
      if (filters.tier?.length && event.tier && !filters.tier.includes(event.tier)) {
        return false;
      }
      if (filters.ticker && event.ticker) {
        if (!event.ticker.toLowerCase().includes(filters.ticker.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [events, filters]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = filteredEvents.length;
    const critical = filteredEvents.filter((e) => e.severity === 'CRITICAL').length;
    const high = filteredEvents.filter((e) => e.severity === 'HIGH').length;
    const sources = new Set(filteredEvents.map((e) => e.source)).size;

    return {
      total,
      critical,
      high,
      sources,
    };
  }, [filteredEvents]);

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: EventFilters) => {
    setFilters(newFilters);
    updateFilters(newFilters);
  }, [updateFilters]);

  // Handle save preset
  const handleSavePreset = useCallback((name: string, presetFilters: EventFilters) => {
    savePreset(name, presetFilters);
    setPresets(loadPresets());
  }, [savePreset, loadPresets]);

  // Handle delete preset
  const handleDeletePreset = useCallback((id: string) => {
    deletePreset(id);
    setPresets(loadPresets());
  }, [deletePreset, loadPresets]);

  // Handle event click
  const handleEventClick = useCallback((event: EventItem) => {
    setSelectedEvent(event);
  }, []);

  // Handle close panel
  const handleClosePanel = useCallback(() => {
    setSelectedEvent(null);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Real-time event monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge variant="outline" className="gap-1 bg-green-500/10 text-green-500 border-green-500/50">
              <Wifi className="h-3 w-3" />
              Connected
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <WifiOff className="h-3 w-3" />
              Disconnected
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Events
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Critical
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.critical}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              High Severity
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.high}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Sources
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sources}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        presets={presets}
        onSavePreset={handleSavePreset}
        onDeletePreset={handleDeletePreset}
        sources={MOCK_SOURCES}
        isConnected={isConnected}
      />

      {/* Event List */}
      <Card>
        <CardHeader>
          <CardTitle>Live Events</CardTitle>
          <CardDescription>
            Real-time event stream {filteredEvents.length !== events.length && `(${filteredEvents.length} of ${events.length} shown)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          <EventList
            events={filteredEvents}
            onEventClick={handleEventClick}
            soundEnabled={soundEnabled}
            onSoundToggle={() => setSoundEnabled(!soundEnabled)}
          />
        </CardContent>
      </Card>

      {/* Event Detail Panel - Slide-out */}
      <EventDetailPanel
        event={selectedEvent}
        onClose={handleClosePanel}
      />
    </div>
  );
}
