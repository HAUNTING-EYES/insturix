'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, format, isSameMonth, isToday, isSameDay, addMonths, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight, Youtube, Instagram, Linkedin, Sparkles, Plus, Filter, Search, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import FloatingIdeaPanel from "./FloatingIdeaPanel";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // ISO string
  platform: "youtube" | "instagram" | "linkedin";
  status: "scheduled" | "draft" | "published";
  tags: string[];
  aiScore?: number; // 0-100, optional 
}

type CalendarProps = {
  events: CalendarEvent[];
  onCellClick?: (date: Date) => void;
  onEventClick?: (event: CalendarEvent) => void;
  onEventDrop?: (eventId: string, newDate: Date) => void;
  onClose?: () => void;
  onEventUpdate?: (id: string, patch: Partial<CalendarEvent>) => void;
};

// Platform icon mapping with ThinkForge tints (red-forward aesthetic)
const PlatformIcon = ({ platform, size = 12 }: { platform: CalendarEvent['platform']; size?: number }) => {
  const tint: Record<CalendarEvent['platform'], string> = {
    youtube: 'text-red-400',
    instagram: 'text-rose-400',
    linkedin: 'text-red-300',
  };
  const common = `${tint[platform]} drop-shadow-[0_0_6px_rgba(255,0,0,0.08)]`;
  const icons = {
    youtube: <Youtube size={size} className={common} />,
    instagram: <Instagram size={size} className={common} />,
    linkedin: <Linkedin size={size} className={common} />
  };
  return icons[platform] || null;
};

// Status color mapping for ThinkForge aesthetic (minimal + red/black)
const getStatusColor = (status: CalendarEvent['status']) => {
  // Keep subtle differences but stay within the red/neutral spectrum for cohesion
  const colors = {
    scheduled: 'bg-red-600/15 border-red-500/40 text-red-200',
    draft: 'bg-neutral-800/60 border-neutral-700/70 text-neutral-200',
    published: 'bg-red-600/25 border-red-500/50 text-red-100',
  } as const;
  return colors[status] || colors.draft;
};

// Event chip component - the small event pills shown in calendar cells
const EventChip = ({ event, onClick, onDragEnd }: { event: CalendarEvent; onClick: () => void; onDragEnd?: (eventId: string, newDate: Date) => void }) => {
  const statusColor = getStatusColor(event.status);
  const firstTag = event.tags?.[0];
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      drag
      dragMomentum={false}
      onDragEnd={(_, info) => {
        // Calculate which date cell the event was dropped on
        const dropZone = document.elementFromPoint(info.point.x, info.point.y);
        if (dropZone && onDragEnd) {
          // Find the closest calendar cell
          const cell = dropZone.closest('[role="gridcell"]');
          if (cell) {
            const dateStr = cell.getAttribute('aria-label');
            if (dateStr) {
              // Parse the date from aria-label (format: "MMMM d, yyyy")
              const droppedDate = new Date(dateStr);
              onDragEnd(event.id, droppedDate);
            }
          }
        }
      }}
  className={`group relative px-1.5 py-0.5 rounded-lg text-[10px] font-medium border cursor-pointer hover:scale-[1.02] transition-transform ${statusColor} truncate flex items-center gap-1 ring-1 ring-red-500/10 backdrop-blur-[2px] shadow-[0_1px_6px_rgba(220,38,38,0.15)]`}
      onClick={onClick}
    >
      <PlatformIcon platform={event.platform} size={10} />
      <span className="truncate flex-1">{event.title}</span>
      {firstTag && (
        <span className="shrink-0 px-1 py-[1px] rounded border border-white/10 text-[9px] text-white/70 bg-white/5">
          {firstTag}
        </span>
      )}
      {event.aiScore !== undefined && (
        <span className="flex items-center gap-0.5 text-[9px] opacity-80">
          <Sparkles size={8} className="text-red-300 drop-shadow-[0_0_6px_rgba(239,68,68,0.25)]" />
          {event.aiScore}
        </span>
      )}
    </motion.div>
  );
};

export default function Calendar({
  events,
  onCellClick,
  onEventClick,
  onEventDrop,
  onClose,
  onEventUpdate
}: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [visibleMonths, setVisibleMonths] = useState<Date[]>([
    subMonths(new Date(), 1),
    new Date(),
    addMonths(new Date(), 1)
  ]);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  // Generate calendar days for a single month
  const generateMonthDays = useCallback((date: Date) => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let day = calendarStart;
    
    while (day <= calendarEnd) {
      days.push(day);
      day = addDays(day, 1);
    }

    // Ensure we always have 6 rows (42 days) for consistent height
    while (days.length < 42) {
      days.push(addDays(days[days.length - 1], 1));
    }

    return days;
  }, []);

  // Generate calendar grid for all visible months
  const calendarDays = useMemo(() => {
    return visibleMonths.flatMap(month => generateMonthDays(month));
  }, [visibleMonths, generateMonthDays]);

  // Group events by date for quick lookup
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? events.filter((e) =>
          e.title.toLowerCase().includes(q) ||
          e.tags?.some((t) => t.toLowerCase().includes(q))
        )
      : events;

    filtered.forEach(event => {
      const dateKey = format(new Date(event.date), 'yyyy-MM-dd');
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(event);
    });
    return map;
  }, [events, searchQuery]);

  // Navigation handlers
  const goToPreviousMonth = () => {
    setCurrentDate(prev => subMonths(prev, 1));
    // Scroll to show the previous month if needed
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = Math.max(0, scrollContainerRef.current.scrollTop - 600);
    }
  };
  
  const goToNextMonth = () => {
    setCurrentDate(prev => addMonths(prev, 1));
    // Scroll to show the next month if needed
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop += 600;
    }
  };
  
  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    // Reset visible months to center around today
    setVisibleMonths([
      subMonths(today, 1),
      today,
      addMonths(today, 1)
    ]);
    // Scroll to middle
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight / 3;
    }
  };

  // Infinite scroll handler with improved logic
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrollingRef.current) return;
      
      const { scrollTop, scrollHeight, clientHeight } = container;
      
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Load more months when near bottom
      if (scrollTop + clientHeight >= scrollHeight - 800) {
        isScrollingRef.current = true;
        setVisibleMonths(prev => {
          const lastMonth = prev[prev.length - 1];
          return [...prev, addMonths(lastMonth, 1)];
        });
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 100);
      }
      
      // Load more months when near top
      if (scrollTop <= 800) {
        const prevScrollHeight = scrollHeight;
        isScrollingRef.current = true;
        setVisibleMonths(prev => {
          const firstMonth = prev[0];
          return [subMonths(firstMonth, 1), ...prev];
        });
        
        // Maintain scroll position after prepending
        setTimeout(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = scrollTop + (newScrollHeight - prevScrollHeight);
          }
          isScrollingRef.current = false;
        }, 50);
      }

      // Update current month based on scroll position with debouncing
      scrollTimeoutRef.current = setTimeout(() => {
        const daysPerMonth = 42; // 6 rows * 7 days
        const cellHeight = 140; // min-height of cells
        const rowsPerMonth = 6;
        const monthHeight = cellHeight * rowsPerMonth;
        
        // Calculate which month is most visible
        const scrolledMonths = Math.round(scrollTop / monthHeight);
        const targetMonth = visibleMonths[Math.max(0, Math.min(scrolledMonths, visibleMonths.length - 1))];
        
        if (targetMonth && !isSameMonth(targetMonth, currentDate)) {
          setCurrentDate(targetMonth);
        }
      }, 150);
    };

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [visibleMonths, currentDate]);

  const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="fixed inset-0 left-16 bg-neutral-950 flex flex-col overflow-hidden z-30">
      {/* Toolbar Header */}
      <div className="flex-shrink-0 border-b border-red-900/30 bg-neutral-950/80 backdrop-blur-xl relative z-10">
        <div className="px-6 py-4 flex items-center justify-between">
          {/* Left: Month/Year Navigation */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={goToPreviousMonth}
                className="p-2 rounded-xl border border-neutral-800/70 bg-neutral-900/60 hover:bg-neutral-900/80 text-neutral-400 hover:text-white transition-all shadow-md hover:border-red-800/60 focus:outline-none focus:ring-2 focus:ring-red-700/40"
                aria-label="Previous month"
              >
                <ChevronLeft size={20} />
              </button>
              
              <h1 className="text-2xl font-semibold bg-gradient-to-br from-red-200 via-red-100 to-neutral-200 bg-clip-text text-transparent min-w-[240px] text-center tracking-tight">
                {format(currentDate, 'MMMM yyyy')}
              </h1>
              
              <button
                onClick={goToNextMonth}
                className="p-2 rounded-xl border border-neutral-800/70 bg-neutral-900/60 hover:bg-neutral-900/80 text-neutral-400 hover:text-white transition-all shadow-md hover:border-red-800/60 focus:outline-none focus:ring-2 focus:ring-red-700/40"
                aria-label="Next month"
              >
                <ChevronRight size={20} />
              </button>
            </div>
            
            <button
              onClick={goToToday}
              className="px-4 py-2 text-sm font-medium bg-red-600/10 border border-red-700/40 text-red-200 rounded-xl hover:bg-red-600/15 hover:border-red-700/50 transition-all shadow-md backdrop-blur-sm"
            >
              Today
            </button>
          </div>

          {/* Center: Search */}
          <div className="flex-1 max-w-md mx-8">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
              <input
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-neutral-900/60 border border-neutral-800/70 rounded-xl text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-red-800/60 focus:bg-neutral-900/70 transition-all backdrop-blur-sm"
              />
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-3">
            <button
              className="px-4 py-2 rounded-xl border border-neutral-800/70 bg-neutral-900/60 hover:bg-neutral-900/80 text-neutral-300 hover:text-white hover:border-red-800/60 transition-all text-sm font-medium flex items-center gap-2 shadow-md"
            >
              <Filter size={16} />
              Filter
            </button>
            
            <button
              className="px-4 py-2 rounded-xl bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white transition-all text-sm font-medium flex items-center gap-2 shadow-lg shadow-red-900/30"
            >
              <Plus size={16} />
              New Event
            </button>
          </div>
        </div>
      </div>

      {/* Weekday Headers - Fixed */}
      <div className="flex-shrink-0 border-b border-neutral-800/50 bg-neutral-950/40 relative z-10">
        <div className="grid grid-cols-7">
          {weekDays.map((day, idx) => (
            <div
              key={day}
              className={`px-4 py-3 text-center text-xs font-semibold text-neutral-500 uppercase tracking-wider ${
                idx < 6 ? 'border-r border-neutral-800/50' : ''
              }`}
            >
              {day}
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Grid - Scrollable with fade effect */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto bg-neutral-950 relative pb-24"
      >
        {/* Fade overlays */}
        <div className="pointer-events-none fixed inset-0 left-16 z-20">
          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-neutral-950 to-transparent" />
          {/* Left fade */}
          <div className="absolute top-0 bottom-0 left-0 w-12 bg-gradient-to-r from-neutral-950 to-transparent" />
          {/* Right fade */}
          <div className="absolute top-0 bottom-0 right-0 w-12 bg-gradient-to-l from-neutral-950 to-transparent" />
        </div>

        <div className="grid grid-cols-7 min-h-full" role="grid">
          {calendarDays.map((day, idx) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayEvents = eventsByDate.get(dateKey) || [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isTodayDate = isToday(day);
            const maxChips = 3;
            const visible = dayEvents.slice(0, maxChips);
            const overflow = dayEvents.length - visible.length;

            return (
              <div
                key={`${format(day, 'yyyy-MM-dd')}-${idx}`}
                className={`
                  relative min-h-[140px] p-3 border-r border-b border-neutral-800/40
                  ${isCurrentMonth ? 'bg-neutral-950' : 'bg-neutral-900/20'}
                  ${isTodayDate ? 'bg-red-950/20 border-red-900/40 shadow-[inset_0_0_0_1px_rgba(127,29,29,0.25)]' : ''}
                  hover:bg-neutral-900/40 transition-colors cursor-pointer
                  ${idx % 7 === 6 ? 'border-r-0' : ''}
                `}
                onClick={() => onCellClick?.(day)}
                role="gridcell"
                aria-label={format(day, 'MMMM d, yyyy')}
                tabIndex={0}
              >
                {/* Day number */}
                <div className="flex items-start justify-between mb-2">
                  <span
                    className={`
                      text-base font-semibold
                      ${isTodayDate 
                        ? 'bg-red-700 text-white w-7 h-7 rounded-full flex items-center justify-center text-[13px] shadow-md shadow-red-900/40' 
                        : isCurrentMonth 
                          ? 'text-neutral-300' 
                          : 'text-neutral-600'
                      }
                    `}
                  >
                    {format(day, 'd')}
                  </span>
                  
                  {/* AI overlay placeholder */}
                  {dayEvents.length === 0 && isCurrentMonth && (
                    <div className="opacity-0 hover:opacity-100 transition-opacity">
                      <Sparkles size={14} className="text-red-500/50" />
                    </div>
                  )}
                </div>

                {/* Events */}
                <div className="space-y-1.5">
                  <AnimatePresence>
                    {visible.map(event => (
                      <motion.button
                        key={event.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="w-full text-left"
                        onClick={() => {
                          setOpenEventId(event.id);
                          onEventClick?.(event);
                        }}
                      >
                        <EventChip
                          event={event}
                          onClick={() => {}}
                          onDragEnd={onEventDrop}
                        />
                      </motion.button>
                    ))}
                    {overflow > 0 && (
                      <div className="text-[11px] text-neutral-400">+{overflow} more</div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Panel Overlay */}
      <AnimatePresence>
        {openEventId && events.find((e) => e.id === openEventId) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40"
            onClick={() => setOpenEventId(null)}
          >
            <div className="absolute bottom-0 right-0 p-6 sm:bottom-auto sm:top-1/2 sm:right-12 sm:-translate-y-1/2">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <FloatingIdeaPanel
                  event={events.find((e) => e.id === openEventId)!}
                  onClose={() => setOpenEventId(null)}
                  onUpdate={onEventUpdate}
                />
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
