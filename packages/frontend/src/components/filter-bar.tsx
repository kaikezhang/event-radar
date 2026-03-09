'use client';

import { useState, useCallback, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Save, 
  X, 
  ChevronDown,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from './ui/card';
import type { EventFilters, SavedPreset } from '../hooks/use-events-websocket';

interface FilterBarProps {
  filters: EventFilters;
  onFiltersChange: (filters: EventFilters) => void;
  presets: SavedPreset[];
  onSavePreset: (name: string, filters: EventFilters) => void;
  onDeletePreset: (id: string) => void;
  sources: string[];
  isConnected: boolean;
}

const SEVERITY_OPTIONS = [
  { value: 'CRITICAL', label: 'Critical', color: 'bg-red-500' },
  { value: 'HIGH', label: 'High', color: 'bg-orange-500' },
  { value: 'MEDIUM', label: 'Medium', color: 'bg-yellow-500' },
  { value: 'LOW', label: 'Low', color: 'bg-green-500' },
];

const TIER_OPTIONS = [
  { value: 1, label: 'Tier 1' },
  { value: 2, label: 'Tier 2' },
  { value: 3, label: 'Tier 3' },
];

export function FilterBar({
  filters,
  onFiltersChange,
  presets,
  onSavePreset,
  onDeletePreset,
  sources,
  isConnected,
}: FilterBarProps) {
  const [tickerInput, setTickerInput] = useState(filters.ticker || '');
  const [showPresets, setShowPresets] = useState(false);

  // Debounce ticker input
  useEffect(() => {
    const timer = setTimeout(() => {
      if (tickerInput !== filters.ticker) {
        onFiltersChange({ ...filters, ticker: tickerInput || undefined });
      }
    }, 300);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerInput]);

  const handleSeverityChange = useCallback((value: string) => {
    const severity = value === 'all' ? undefined : [value];
    onFiltersChange({ ...filters, severity });
  }, [filters, onFiltersChange]);

  const handleSourceChange = useCallback((value: string) => {
    const source = value === 'all' ? undefined : [value];
    onFiltersChange({ ...filters, source });
  }, [filters, onFiltersChange]);

  const handleTierChange = useCallback((value: string) => {
    const tier = value === 'all' ? undefined : [parseInt(value, 10)];
    onFiltersChange({ ...filters, tier });
  }, [filters, onFiltersChange]);

  const handleSavePreset = useCallback(() => {
    const name = prompt('Enter preset name:');
    if (name?.trim()) {
      onSavePreset(name.trim(), filters);
    }
  }, [filters, onSavePreset]);

  const handleLoadPreset = useCallback((preset: SavedPreset) => {
    onFiltersChange(preset.filters);
    setTickerInput(preset.filters.ticker || '');
    setShowPresets(false);
  }, [onFiltersChange]);

  const handleClearFilters = useCallback(() => {
    onFiltersChange({});
    setTickerInput('');
  }, [onFiltersChange]);

  const hasActiveFilters = 
    filters.ticker || 
    (filters.severity && filters.severity.length > 0) ||
    (filters.source && filters.source.length > 0) ||
    (filters.tier && filters.tier.length > 0);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
            {!isConnected && (
              <Badge variant="destructive" className="ml-2">
                <AlertCircle className="h-3 w-3 mr-1" />
                Disconnected
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={handleClearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
            <div className="relative">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowPresets(!showPresets)}
              >
                Presets
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
              
              {showPresets && (
                <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-popover border rounded-md shadow-lg p-2">
                  <div className="space-y-1">
                    {presets.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2 px-2">
                        No saved presets
                      </p>
                    ) : (
                      presets.map((preset) => (
                        <div
                          key={preset.id}
                          className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                          onClick={() => handleLoadPreset(preset)}
                        >
                          <span className="text-sm font-medium">
                            {preset.name}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeletePreset(preset.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => {
                        setShowPresets(false);
                        handleSavePreset();
                      }}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Current
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          {/* Ticker Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search ticker..."
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
              className="pl-9 w-32"
            />
          </div>

          {/* Severity Filter */}
          <Select
            value={filters.severity?.[0] || 'all'}
            onValueChange={handleSeverityChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severity</SelectItem>
              {SEVERITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${opt.color}`} />
                    {opt.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Source Filter */}
          <Select
            value={filters.source?.[0] || 'all'}
            onValueChange={handleSourceChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {sources.map((source) => (
                <SelectItem key={source} value={source}>
                  {source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Tier Filter */}
          <Select
            value={filters.tier?.[0]?.toString() || 'all'}
            onValueChange={handleTierChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              {TIER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value.toString()} value={opt.value.toString()}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
