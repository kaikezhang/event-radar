import { useState, useCallback, useRef, useEffect } from 'react';
import {
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  LogIn,
  MoreHorizontal,
  Palette,
  Pencil,
  Plus,
  Search,
  CheckSquare,
  MoveRight,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { SkeletonCard } from '../components/SkeletonCard.js';
import { TickerSearch } from '../components/TickerSearch.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useWatchlist, useWatchlistSummary } from '../hooks/useWatchlist.js';
import { useWatchlistSections } from '../hooks/useWatchlistSections.js';
import type { WatchlistItem, WatchlistSection } from '../types/index.js';
import type { WatchlistTickerSummary } from '../lib/api.js';

const PUSH_SETTINGS_PATH = '/settings?from=watchlist#push-alerts';

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
  HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  LOW: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const SECTION_COLORS: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  green: 'bg-emerald-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  gray: 'bg-zinc-400',
};

const VALID_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'gray'] as const;

const COLLAPSED_KEY = 'er-watchlist-collapsed';
const SWIPE_THRESHOLD = 80;
const LONG_PRESS_MS = 500;

function getCollapsedState(): Set<string> {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function setCollapsedState(ids: Set<string>) {
  localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
}

function timeAgo(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}


// ── Inline Note Editor ──────────────────────────────────────────

function InlineNote({ ticker, notes, onSave }: { ticker: string; notes: string | null | undefined; onSave: (ticker: string, notes: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(notes ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);
  const handleSave = () => { setEditing(false); const trimmed = value.trim(); if (trimmed !== (notes ?? '').trim()) onSave(ticker, trimmed); };

  if (editing) {
    return (<input ref={inputRef} type="text" value={value} onChange={(e) => setValue(e.target.value)} onBlur={handleSave}
      onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setValue(notes ?? ''); setEditing(false); } }}
      className="mt-1 ml-6 w-full rounded-lg border border-accent-default/40 bg-transparent px-2 py-1 text-xs text-text-secondary outline-none" placeholder="Add a note..." maxLength={500} />);
  }
  return (<button type="button" onClick={() => { setValue(notes ?? ''); setEditing(true); }} className="mt-1 ml-6 block text-left text-xs text-text-secondary/50 hover:text-text-secondary transition">
    {notes ? <span className="text-text-secondary/70">{notes}</span> : <span className="italic">Add note...</span>}
  </button>);
}

// ── Swipeable Row Wrapper (Mobile) ──────────────────────────────

function SwipeableRow({ children, onMoveAction, onRemoveAction }: { children: React.ReactNode; onMoveAction: () => void; onRemoveAction: () => void }) {
  const [translateX, setTranslateX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isHorizontalRef = useRef<boolean | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => { startXRef.current = e.touches[0]!.clientX; startYRef.current = e.touches[0]!.clientY; isHorizontalRef.current = null; setSwiping(true); };
  const handleTouchMove = (e: React.TouchEvent) => { if (!swiping) return; const dx = e.touches[0]!.clientX - startXRef.current; const dy = e.touches[0]!.clientY - startYRef.current; if (isHorizontalRef.current === null) { if (Math.abs(dx) > 5 || Math.abs(dy) > 5) isHorizontalRef.current = Math.abs(dx) > Math.abs(dy); return; } if (!isHorizontalRef.current) return; setTranslateX(Math.min(0, Math.max(-160, dx))); };
  const handleTouchEnd = () => { setSwiping(false); setTranslateX(translateX < -SWIPE_THRESHOLD ? -160 : 0); isHorizontalRef.current = null; };
  const resetSwipe = () => setTranslateX(0);
  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute right-0 top-0 bottom-0 flex items-stretch">
        <button type="button" onClick={() => { resetSwipe(); onMoveAction(); }} className="flex w-20 items-center justify-center bg-blue-500/80 text-white text-xs font-medium"><MoveRight className="mr-1 h-3.5 w-3.5" />Move</button>
        <button type="button" onClick={() => { resetSwipe(); onRemoveAction(); }} className="flex w-20 items-center justify-center bg-red-500/80 text-white text-xs font-medium"><Trash2 className="mr-1 h-3.5 w-3.5" />Remove</button>
      </div>
      <div style={{ transform: `translateX(${translateX}px)`, transition: swiping ? 'none' : 'transform 0.25s ease-out' }} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>{children}</div>

      {editMode && (
        <div className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-2xl border border-border-default bg-bg-surface/98 px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-sm">
            <span className="text-sm font-medium text-text-primary">{selected.size} selected</span>
            <button type="button" onClick={selected.size === items.length ? deselectAll : selectAll} className="ml-1 text-xs text-accent-default hover:underline">{selected.size === items.length ? 'Deselect all' : 'Select all'}</button>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setShowMoveModal(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/25 disabled:opacity-40"><MoveRight className="h-3.5 w-3.5" />Move to...</button>
              <button type="button" onClick={() => setShowConfirmRemove(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Remove</button>
            </div>
          </div>
        </div>
      )}

      {showMoveModal && <MoveSectionModal sections={sections} onSelect={handleBulkMove} onClose={() => { setShowMoveModal(false); setSingleMoveTicker(null); }} />}
      {showConfirmRemove && <ConfirmRemoveDialog count={selected.size} onConfirm={handleBulkRemove} onCancel={() => setShowConfirmRemove(false)} />}
    </div>
  );
}

// ── Move-to-Section Modal ───────────────────────────────────────

function MoveSectionModal({ sections, onSelect, onClose }: { sections: WatchlistSection[]; onSelect: (sectionId: string | null) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative z-10 w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-border-default bg-bg-surface p-4 shadow-[0_20px_50px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">Move to section</h3>
        <div className="space-y-1">
          <button type="button" onClick={() => onSelect(null)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-text-primary hover:bg-white/5"><span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />Unsorted</button>
          {sections.map((s) => (<button key={s.id} type="button" onClick={() => onSelect(s.id)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-text-primary hover:bg-white/5"><span className={`h-2.5 w-2.5 rounded-full ${SECTION_COLORS[s.color] ?? SECTION_COLORS.gray}`} />{s.name}</button>))}
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl bg-white/5 px-3 py-2 text-sm text-text-secondary hover:bg-white/10">Cancel</button>
      </div>

      {editMode && (
        <div className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-2xl border border-border-default bg-bg-surface/98 px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-sm">
            <span className="text-sm font-medium text-text-primary">{selected.size} selected</span>
            <button type="button" onClick={selected.size === items.length ? deselectAll : selectAll} className="ml-1 text-xs text-accent-default hover:underline">{selected.size === items.length ? 'Deselect all' : 'Select all'}</button>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setShowMoveModal(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/25 disabled:opacity-40"><MoveRight className="h-3.5 w-3.5" />Move to...</button>
              <button type="button" onClick={() => setShowConfirmRemove(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Remove</button>
            </div>
          </div>
        </div>
      )}

      {showMoveModal && <MoveSectionModal sections={sections} onSelect={handleBulkMove} onClose={() => { setShowMoveModal(false); setSingleMoveTicker(null); }} />}
      {showConfirmRemove && <ConfirmRemoveDialog count={selected.size} onConfirm={handleBulkRemove} onCancel={() => setShowConfirmRemove(false)} />}
    </div>
  );
}

// ── Confirm Remove Dialog ───────────────────────────────────────

function ConfirmRemoveDialog({ count, onConfirm, onCancel }: { count: number; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative z-10 w-full max-w-xs rounded-2xl border border-border-default bg-bg-surface p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-text-primary">Remove {count} ticker{count !== 1 ? 's' : ''} from watchlist?</h3>
        <p className="mt-2 text-xs text-text-secondary">This action cannot be undone.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onConfirm} className="flex-1 rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/30">Remove</button>
          <button type="button" onClick={onCancel} className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm font-medium text-text-secondary hover:bg-white/10">Cancel</button>
        </div>
      </div>

      {editMode && (
        <div className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-2xl border border-border-default bg-bg-surface/98 px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-sm">
            <span className="text-sm font-medium text-text-primary">{selected.size} selected</span>
            <button type="button" onClick={selected.size === items.length ? deselectAll : selectAll} className="ml-1 text-xs text-accent-default hover:underline">{selected.size === items.length ? 'Deselect all' : 'Select all'}</button>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setShowMoveModal(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/25 disabled:opacity-40"><MoveRight className="h-3.5 w-3.5" />Move to...</button>
              <button type="button" onClick={() => setShowConfirmRemove(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Remove</button>
            </div>
          </div>
        </div>
      )}

      {showMoveModal && <MoveSectionModal sections={sections} onSelect={handleBulkMove} onClose={() => { setShowMoveModal(false); setSingleMoveTicker(null); }} />}
      {showConfirmRemove && <ConfirmRemoveDialog count={selected.size} onConfirm={handleBulkRemove} onCancel={() => setShowConfirmRemove(false)} />}
    </div>
  );
}

// ── Sortable Ticker Row ─────────────────────────────────────────────

interface TickerRowProps {
  item: WatchlistItem;
  tickerSummary?: WatchlistTickerSummary;
  onRemove: (ticker: string) => void;
  editMode: boolean;
  isSelected: boolean;
  onToggleSelect: (ticker: string) => void;
  onSaveNote: (ticker: string, notes: string) => void;
  onMoveAction: (ticker: string) => void;
  onLongPress: (ticker: string) => void;
}

function SortableTickerRow({ item, tickerSummary, onRemove, editMode, isSelected, onToggleSelect, onSaveNote, onMoveAction, onLongPress }: TickerRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.ticker, disabled: editMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePointerDown = () => { longPressTimerRef.current = setTimeout(() => onLongPress(item.ticker), LONG_PRESS_MS); };
  const clearLongPress = () => { if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } };

  const rowContent = (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-2xl border bg-bg-surface/96 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.22)] ${isSelected ? 'border-accent-default/60 bg-accent-default/5' : 'border-border-default'}`}
      onPointerDown={handlePointerDown} onPointerUp={clearLongPress} onPointerCancel={clearLongPress} onPointerLeave={clearLongPress}
    >
      <div className="flex items-center gap-2">
        {editMode ? (
          <button type="button" onClick={() => onToggleSelect(item.ticker)} className="text-text-secondary/60 hover:text-accent-default" aria-label={isSelected ? `Deselect ${item.ticker}` : `Select ${item.ticker}`}>
            {isSelected ? <CheckSquare className="h-5 w-5 text-accent-default" /> : <Square className="h-5 w-5" />}
          </button>
        ) : (
        <button
          type="button"
          className="touch-none cursor-grab text-text-secondary/40 hover:text-text-secondary"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        )}
        <Link
          to={`/ticker/${item.ticker}`}
          className="flex flex-1 items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent-default"
        >
          <span className="text-[17px] font-semibold text-text-primary">
            ${item.ticker}
          </span>
          {item.name && (
            <span className="truncate text-sm text-text-secondary">
              {item.name}
            </span>
          )}
          {tickerSummary && tickerSummary.eventCount24h > 0 && (
            <span className="text-lg" aria-label={`Signal: ${tickerSummary.highestSignal}`}>
              {tickerSummary.highestSignal}
            </span>
          )}
        </Link>
        {!editMode && (<button
          type="button"
          onClick={() => onRemove(item.ticker)}
          className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-full border border-white/10 bg-white/6 p-2 text-text-secondary transition hover:bg-red-500/20 hover:text-red-400"
          aria-label={`Remove ${item.ticker} from watchlist`}
        >
          <X className="h-4 w-4" />
        </button>)}
      </div>

      <InlineNote ticker={item.ticker} notes={item.notes} onSave={onSaveNote} />

      {tickerSummary && tickerSummary.eventCount24h > 0 && (
        <div className="mt-3 ml-6 rounded-2xl border border-white/6 bg-white/[0.02] px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-text-secondary">
              {tickerSummary.eventCount24h} event{tickerSummary.eventCount24h !== 1 ? 's' : ''} (24h)
            </span>
            {tickerSummary.latestEvent && (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  SEVERITY_COLORS[tickerSummary.latestEvent.severity] ?? SEVERITY_COLORS.MEDIUM
                }`}
              >
                {tickerSummary.latestEvent.severity}
              </span>
            )}
          </div>
          {tickerSummary.latestEvent && (
            <p className="mt-1.5 text-sm leading-5 text-text-primary line-clamp-2">
              {tickerSummary.latestEvent.title}
            </p>
          )}
          {tickerSummary.latestEvent && (
            <p className="mt-1 text-xs text-text-secondary">
              {timeAgo(tickerSummary.latestEvent.timestamp)}
            </p>
          )}
        </div>
      )}
    </div>
  );

  if (!editMode) return <SwipeableRow onMoveAction={() => onMoveAction(item.ticker)} onRemoveAction={() => onRemove(item.ticker)}>{rowContent}</SwipeableRow>;
  return rowContent;
}

function DragOverlayRow({ item, tickerSummary }: { item: WatchlistItem; tickerSummary?: WatchlistTickerSummary }) {
  return (
    <div className="rounded-2xl border border-accent-default/40 bg-bg-surface p-4 shadow-[0_20px_50px_rgba(0,0,0,0.4)]">
      <div className="flex items-center gap-2">
        <GripVertical className="h-4 w-4 text-text-secondary/40" />
        <span className="text-[17px] font-semibold text-text-primary">
          ${item.ticker}
        </span>
        {item.name && (
          <span className="truncate text-sm text-text-secondary">{item.name}</span>
        )}
        {tickerSummary && tickerSummary.eventCount24h > 0 && (
          <span className="text-lg">{tickerSummary.highestSignal}</span>
        )}
      </div>

      {editMode && (
        <div className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-2xl border border-border-default bg-bg-surface/98 px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-sm">
            <span className="text-sm font-medium text-text-primary">{selected.size} selected</span>
            <button type="button" onClick={selected.size === items.length ? deselectAll : selectAll} className="ml-1 text-xs text-accent-default hover:underline">{selected.size === items.length ? 'Deselect all' : 'Select all'}</button>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setShowMoveModal(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/25 disabled:opacity-40"><MoveRight className="h-3.5 w-3.5" />Move to...</button>
              <button type="button" onClick={() => setShowConfirmRemove(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Remove</button>
            </div>
          </div>
        </div>
      )}

      {showMoveModal && <MoveSectionModal sections={sections} onSelect={handleBulkMove} onClose={() => { setShowMoveModal(false); setSingleMoveTicker(null); }} />}
      {showConfirmRemove && <ConfirmRemoveDialog count={selected.size} onConfirm={handleBulkRemove} onCancel={() => setShowConfirmRemove(false)} />}
    </div>
  );
}

// ── Section Header ──────────────────────────────────────────────────

interface SectionHeaderProps {
  section: WatchlistSection;
  itemCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onRename: (name: string) => void;
  onChangeColor: (color: string) => void;
  onDelete: () => void;
  onAddTicker: () => void;
}

function SectionHeader({
  section,
  itemCount,
  isCollapsed,
  onToggleCollapse,
  onRename,
  onChangeColor,
  onDelete,
  onAddTicker,
}: SectionHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(section.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setColorPickerOpen(false);
        setConfirmDelete(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [menuOpen]);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== section.name) {
      onRename(trimmed);
    }
    setIsEditing(false);
  };

  return (
    <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
      <button
        type="button"
        onClick={onToggleCollapse}
        className="text-text-secondary hover:text-text-primary"
        aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
      >
        {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      <span className={`h-2.5 w-2.5 rounded-full ${SECTION_COLORS[section.color] ?? SECTION_COLORS.gray}`} />

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename();
            if (e.key === 'Escape') {
              setEditName(section.name);
              setIsEditing(false);
            }
          }}
          className="flex-1 rounded border border-accent-default/40 bg-transparent px-1.5 py-0.5 text-sm font-semibold text-text-primary outline-none"
          maxLength={100}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setEditName(section.name);
            setIsEditing(true);
          }}
          className="flex-1 text-left text-sm font-semibold text-text-primary hover:text-accent-default"
        >
          {section.name}
        </button>
      )}

      <span className="text-xs text-text-secondary">{itemCount}</span>

      <button
        type="button"
        onClick={onAddTicker}
        className="rounded-full p-1 text-text-secondary/60 hover:bg-white/8 hover:text-text-primary"
        aria-label="Add ticker to section"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => {
            setMenuOpen(!menuOpen);
            setColorPickerOpen(false);
            setConfirmDelete(false);
          }}
          className="rounded-full p-1 text-text-secondary/60 hover:bg-white/8 hover:text-text-primary"
          aria-label="Section menu"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl border border-border-default bg-bg-surface shadow-[0_18px_40px_rgba(0,0,0,0.3)]">
            {colorPickerOpen ? (
              <div className="p-2">
                <p className="mb-2 text-xs font-medium text-text-secondary">Pick a color</p>
                <div className="flex flex-wrap gap-1.5">
                  {VALID_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        onChangeColor(c);
                        setColorPickerOpen(false);
                        setMenuOpen(false);
                      }}
                      className={`h-6 w-6 rounded-full ${SECTION_COLORS[c]} ${section.color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-bg-surface' : ''} hover:scale-110 transition`}
                      aria-label={c}
                    />
                  ))}
                </div>
              </div>
            ) : confirmDelete ? (
              <div className="p-2">
                <p className="mb-2 text-xs text-text-secondary">
                  Delete "{section.name}"? Tickers will move to Unsorted.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete();
                      setMenuOpen(false);
                      setConfirmDelete(false);
                    }}
                    className="flex-1 rounded-lg bg-red-500/20 px-2 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/30"
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-lg bg-white/5 px-2 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setEditName(section.name);
                    setIsEditing(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-white/5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => setColorPickerOpen(true)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-white/5"
                >
                  <Palette className="h-3.5 w-3.5" />
                  Change Color
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {editMode && (
        <div className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-2xl border border-border-default bg-bg-surface/98 px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-sm">
            <span className="text-sm font-medium text-text-primary">{selected.size} selected</span>
            <button type="button" onClick={selected.size === items.length ? deselectAll : selectAll} className="ml-1 text-xs text-accent-default hover:underline">{selected.size === items.length ? 'Deselect all' : 'Select all'}</button>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setShowMoveModal(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/25 disabled:opacity-40"><MoveRight className="h-3.5 w-3.5" />Move to...</button>
              <button type="button" onClick={() => setShowConfirmRemove(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Remove</button>
            </div>
          </div>
        </div>
      )}

      {showMoveModal && <MoveSectionModal sections={sections} onSelect={handleBulkMove} onClose={() => { setShowMoveModal(false); setSingleMoveTicker(null); }} />}
      {showConfirmRemove && <ConfirmRemoveDialog count={selected.size} onConfirm={handleBulkRemove} onCancel={() => setShowConfirmRemove(false)} />}
    </div>
  );
}

// ── New Section Form ────────────────────────────────────────────────

function NewSectionForm({ onCreate }: { onCreate: (name: string, color?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>('gray');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onCreate(trimmed, color);
    setName('');
    setColor('gray');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-white/10 px-3 py-2.5 text-sm text-text-secondary/60 transition hover:border-white/20 hover:text-text-secondary"
      >
        <Plus className="h-4 w-4" />
        New Section
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-border-default bg-white/[0.04] p-3 space-y-3">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSubmit();
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Section name"
        className="w-full rounded-lg border border-white/10 bg-transparent px-3 py-2 text-sm text-text-primary placeholder-text-secondary/40 outline-none focus:border-accent-default"
        maxLength={100}
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">Color:</span>
        <div className="flex gap-1.5">
          {VALID_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-5 w-5 rounded-full ${SECTION_COLORS[c]} ${color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-bg-surface' : ''} hover:scale-110 transition`}
              aria-label={c}
            />
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="rounded-lg bg-accent-default px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-white/10"
        >
          Cancel
        </button>
      </div>

      {editMode && (
        <div className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-2xl border border-border-default bg-bg-surface/98 px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-sm">
            <span className="text-sm font-medium text-text-primary">{selected.size} selected</span>
            <button type="button" onClick={selected.size === items.length ? deselectAll : selectAll} className="ml-1 text-xs text-accent-default hover:underline">{selected.size === items.length ? 'Deselect all' : 'Select all'}</button>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setShowMoveModal(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/25 disabled:opacity-40"><MoveRight className="h-3.5 w-3.5" />Move to...</button>
              <button type="button" onClick={() => setShowConfirmRemove(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Remove</button>
            </div>
          </div>
        </div>
      )}

      {showMoveModal && <MoveSectionModal sections={sections} onSelect={handleBulkMove} onClose={() => { setShowMoveModal(false); setSingleMoveTicker(null); }} />}
      {showConfirmRemove && <ConfirmRemoveDialog count={selected.size} onConfirm={handleBulkRemove} onCancel={() => setShowConfirmRemove(false)} />}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────

export function Watchlist() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { items, isLoading, remove, updateItem } = useWatchlist();
  const { summary } = useWatchlistSummary();
  const {
    sections,
    isLoading: sectionsLoading,
    create: createSection,
    update: updateSection,
    remove: removeSection,
    reorder,
  } = useWatchlistSections();
  const [searchOpen, setSearchOpen] = useState(false);
  const [firstTickerAdded, setFirstTickerAdded] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(getCollapsedState);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showConfirmRemove, setShowConfirmRemove] = useState(false);
  const [singleMoveTicker, setSingleMoveTicker] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isEmpty = items.length === 0;
  const hasFirstTickerSuccess =
    firstTickerAdded !== null && items.some((item) => item.ticker === firstTickerAdded);

  const summaryMap = new Map(summary.map((s) => [s.ticker, s]));

  // Group items by section
  const itemsBySection = new Map<string | null, WatchlistItem[]>();
  for (const item of items) {
    const key = item.sectionId ?? null;
    const list = itemsBySection.get(key) ?? [];
    list.push(item);
    itemsBySection.set(key, list);
  }

  // Sort items within each group by sortOrder
  for (const [, groupItems] of itemsBySection) {
    groupItems.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  const unsortedItems = itemsBySection.get(null) ?? [];

  const toggleCollapse = useCallback((sectionId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      setCollapsedState(next);
      return next;
    });
  }, []);

  const handleTickerAdded = (ticker: string) => {
    if (items.length === 0) {
      setFirstTickerAdded(ticker);
    }
  };

  // Build a flat ordered list of all tickers for dnd-kit
  const orderedTickers: string[] = [];
  const tickerToSection = new Map<string, string | null>();

  for (const section of sections) {
    const sectionItems = itemsBySection.get(section.id) ?? [];
    for (const item of sectionItems) {
      orderedTickers.push(item.ticker);
      tickerToSection.set(item.ticker, section.id);
    }
  }
  for (const item of unsortedItems) {
    orderedTickers.push(item.ticker);
    tickerToSection.set(item.ticker, null);
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedTickers.indexOf(active.id as string);
    const newIndex = orderedTickers.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(orderedTickers, oldIndex, newIndex);

    // Determine which section each ticker now belongs to based on position
    // For cross-section moves, the dragged item takes the section of its new neighbor
    const overSectionId = tickerToSection.get(over.id as string) ?? null;
    const reorderItems = newOrder.map((ticker, idx) => ({
      ticker,
      sortOrder: idx,
      sectionId: ticker === (active.id as string) ? overSectionId : tickerToSection.get(ticker) ?? null,
    }));

    reorder(reorderItems);
  };

  const activeItem = activeId ? items.find((i) => i.ticker === activeId) : null;

  const toggleSelect = useCallback((ticker: string) => { setSelected((prev) => { const next = new Set(prev); if (next.has(ticker)) next.delete(ticker); else next.add(ticker); return next; }); }, []);
  const selectAll = () => setSelected(new Set(items.map((i) => i.ticker)));
  const deselectAll = () => setSelected(new Set());
  const exitEditMode = () => { setEditMode(false); setSelected(new Set()); };
  const handleBulkRemove = () => { for (const ticker of selected) remove(ticker); setShowConfirmRemove(false); exitEditMode(); };
  const handleBulkMove = (sectionId: string | null) => { if (singleMoveTicker) { updateItem({ ticker: singleMoveTicker, data: { sectionId } }); setSingleMoveTicker(null); } else { reorder(items.map((item, idx) => ({ ticker: item.ticker, sortOrder: idx, sectionId: selected.has(item.ticker) ? sectionId : (item.sectionId ?? null) }))); } setShowMoveModal(false); };
  const handleSaveNote = (ticker: string, notes: string) => updateItem({ ticker, data: { notes } });
  const handleMoveAction = (ticker: string) => { setSingleMoveTicker(ticker); setShowMoveModal(true); };
  const handleLongPress = (ticker: string) => { if (!editMode) { setEditMode(true); setSelected(new Set([ticker])); } };

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-border-default bg-[linear-gradient(135deg,rgba(249,115,22,0.10),rgba(17,18,23,0.98))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-default">
            Watchlist
          </p>
          <h1 className="mb-1 text-[20px] font-semibold leading-7 text-text-primary">
            Sign in to create your watchlist
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Build a focused watchlist so Event Radar can push the highest
            confidence alerts for the names you care about.
          </p>
          <Link
            to="/login"
            className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-default px-5 py-2 text-[15px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default"
          >
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        </section>
      </div>
    );
  }

  if (isLoading || authLoading || sectionsLoading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <section className="rounded-2xl border border-border-default bg-[linear-gradient(135deg,rgba(249,115,22,0.10),rgba(17,18,23,0.98))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.22)]">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-default">Watchlist</p>
            <h1 className="mb-1 text-[20px] font-semibold leading-7 text-text-primary">{isEmpty ? 'Start with a watchlist' : 'Your radar list'}</h1>
            {isEmpty ? (<p className="mt-2 text-sm leading-6 text-text-secondary">Event Radar works best when you follow a small set of names. Add your first ticker so high-confidence alerts stay focused and useful.</p>) : (<p className="text-sm text-text-secondary">{items.length} ticker{items.length !== 1 ? 's' : ''} tracked{sections.length > 0 && ` across ${sections.length} section${sections.length !== 1 ? 's' : ''}`}</p>)}
          </div>
          {!isEmpty && <button type="button" onClick={() => editMode ? exitEditMode() : setEditMode(true)} className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${editMode ? 'bg-accent-default text-white hover:brightness-110' : 'border border-white/10 bg-white/5 text-text-primary hover:bg-white/10'}`}>{editMode ? 'Done' : 'Edit'}</button>}
        </div>
      </section>

      <section className="rounded-2xl border border-border-default bg-bg-surface/96 p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-text-primary">
              {isEmpty ? 'Add your first ticker' : 'Add another ticker'}
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              {isEmpty
                ? 'Start with the names you care about most. You can add more anytime.'
                : 'Keep your watchlist tight so the feed stays signal-heavy.'}
            </p>
          </div>
          <span className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-accent-default/12 text-accent-default">
            <Plus className="h-5 w-5" />
          </span>
        </div>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex min-h-11 w-full items-center gap-3 rounded-full border border-white/10 bg-white/6 px-4 py-2 text-[15px] text-text-secondary/60 transition hover:bg-white/8 focus:border-accent-default focus:outline-none focus:ring-2 focus:ring-accent-default"
        >
          <Search className="h-4 w-4" />
          <span>{isEmpty ? 'Search tickers to add (e.g. AAPL)' : 'Search tickers...'}</span>
          <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
            /
          </kbd>
        </button>
      </section>

      <TickerSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onTickerAdded={handleTickerAdded}
      />

      {isEmpty ? (
        <section className="rounded-2xl border border-border-default bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-5 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
          <div className="flex items-start gap-3">
            <span className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent-default/12 text-accent-default">
              <Bell className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <h2 className="text-[17px] font-semibold text-text-primary">
                Watchlist-first onboarding
              </h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Build a focused list first, then let Event Radar push the highest
                confidence alerts to this device when something matters.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-default">
                Step 1
              </p>
              <p className="mt-2 text-sm font-medium text-text-primary">
                Add your first ticker above.
              </p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                Start with the one stock you would want to hear about immediately.
              </p>
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent-default">
                Step 2
              </p>
              <p className="mt-2 text-sm font-medium text-text-primary">
                Turn on push for high-confidence alerts.
              </p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">
                You do not need push to use the app, but it is the fastest way to
                catch the alerts worth acting on.
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              to={PUSH_SETTINGS_PATH}
              className="inline-flex min-h-11 items-center justify-center rounded-full bg-accent-default px-4 py-2 text-[15px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-accent-default"
            >
              Enable push alerts
            </Link>
            <Link
              to="/search"
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[15px] font-semibold text-text-primary transition hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-accent-default"
            >
              Browse tickers
            </Link>
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          {hasFirstTickerSuccess ? (
            <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-400/10 p-5 text-emerald-50 shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-1 h-5 w-5 text-emerald-300" />
                <div className="flex-1">
                  <h2 className="text-[17px] font-semibold">
                    {firstTickerAdded} is now on your watchlist
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-emerald-50/85">
                    Event Radar will now keep this name in view. Enable push on this
                    device if you want high-confidence alerts to reach you away from
                    the feed.
                  </p>
                  <Link
                    to={PUSH_SETTINGS_PATH}
                    className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-emerald-200/20 bg-emerald-300/10 px-4 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-300/15 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                  >
                    Enable push alerts on this device
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          ) : null}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={orderedTickers} strategy={verticalListSortingStrategy}>
              {sections.map((section) => {
                const sectionItems = itemsBySection.get(section.id) ?? [];
                const isCollapsedSection = collapsed.has(section.id);

                return (
                  <div key={section.id} className="space-y-2">
                    <SectionHeader
                      section={section}
                      itemCount={sectionItems.length}
                      isCollapsed={isCollapsedSection}
                      onToggleCollapse={() => toggleCollapse(section.id)}
                      onRename={(name) => updateSection({ id: section.id, data: { name } })}
                      onChangeColor={(color) => updateSection({ id: section.id, data: { color } })}
                      onDelete={() => removeSection(section.id)}
                      onAddTicker={() => setSearchOpen(true)}
                    />
                    {!isCollapsedSection && (
                      <div className="space-y-2 pl-2">
                        {sectionItems.map((item) => (
                          <SortableTickerRow key={item.ticker} item={item} tickerSummary={summaryMap.get(item.ticker)} onRemove={remove} editMode={editMode} isSelected={selected.has(item.ticker)} onToggleSelect={toggleSelect} onSaveNote={handleSaveNote} onMoveAction={handleMoveAction} onLongPress={handleLongPress} />
                        ))}
                        {sectionItems.length === 0 && (
                          <p className="py-3 text-center text-sm text-text-secondary/50">
                            No tickers in this section
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {unsortedItems.length > 0 && (
                <div className="space-y-2">
                  {sections.length > 0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
                      <span className="flex-1 text-sm font-semibold text-text-secondary">
                        Unsorted
                      </span>
                      <span className="text-xs text-text-secondary">{unsortedItems.length}</span>
                    </div>
                  )}
                  <div className={sections.length > 0 ? 'space-y-2 pl-2' : 'space-y-2'}>
                    {unsortedItems.map((item) => (
                      <SortableTickerRow
                        key={item.ticker}
                        item={item}
                        tickerSummary={summaryMap.get(item.ticker)}
                        onRemove={remove}
                      />
                    ))}
                  </div>
                </div>
              )}
            </SortableContext>

            <DragOverlay>
              {activeItem ? (
                <DragOverlayRow
                  item={activeItem}
                  tickerSummary={summaryMap.get(activeItem.ticker)}
                />
              ) : null}
            </DragOverlay>
          </DndContext>

          <NewSectionForm
            onCreate={(name, color) => createSection({ name, color })}
          />
        </section>
      )}

      {editMode && (
        <div className="fixed bottom-6 left-1/2 z-40 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-2xl border border-border-default bg-bg-surface/98 px-4 py-3 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-sm">
            <span className="text-sm font-medium text-text-primary">{selected.size} selected</span>
            <button type="button" onClick={selected.size === items.length ? deselectAll : selectAll} className="ml-1 text-xs text-accent-default hover:underline">{selected.size === items.length ? 'Deselect all' : 'Select all'}</button>
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setShowMoveModal(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500/15 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-500/25 disabled:opacity-40"><MoveRight className="h-3.5 w-3.5" />Move to...</button>
              <button type="button" onClick={() => setShowConfirmRemove(true)} disabled={selected.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/25 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />Remove</button>
            </div>
          </div>
        </div>
      )}

      {showMoveModal && <MoveSectionModal sections={sections} onSelect={handleBulkMove} onClose={() => { setShowMoveModal(false); setSingleMoveTicker(null); }} />}
      {showConfirmRemove && <ConfirmRemoveDialog count={selected.size} onConfirm={handleBulkRemove} onCancel={() => setShowConfirmRemove(false)} />}
    </div>
  );
}
