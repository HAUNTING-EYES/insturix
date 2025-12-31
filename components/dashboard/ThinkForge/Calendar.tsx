'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { addDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, format, isSameMonth, isToday, isSameDay, addMonths, subMonths, getYear, getMonth, setMonth, setYear } from "date-fns";
import { ChevronLeft, ChevronRight, Youtube, Instagram, Linkedin, Sparkles, Plus, Filter, Search, X, Calendar as CalendarIcon, ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ContentCardModal from "./ContentCardModal";
import { ContentCard } from "@/app/dashboard/thinkforge/types";

const DATE_PICKER_WIDTH = 320;
const DATE_PICKER_MARGIN = 12;

// Legacy CalendarEvent type for backward compatibility
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
  events: (ContentCard | CalendarEvent)[];
  onCellClick?: (date: Date) => void;
  onEventClick?: (event: ContentCard | CalendarEvent) => void;
  onEventDrop?: (eventId: string, newDate: Date) => void;
  onClose?: () => void;
  onEventUpdate?: (id: string, patch: Partial<ContentCard | CalendarEvent>) => void;
  onCreateCard?: (date: Date) => void;
  onDeleteCard?: (id: string) => void;
  onOpenScript?: (sessionId: string) => void;
};

// Platform icon mapping with ThinkForge tints (red-forward aesthetic)
const PlatformIcon = ({ platform, size = 12 }: { platform: string; size?: number }) => {
  const tint: Record<string, string> = {
    youtube: 'text-red-400',
    instagram: 'text-rose-400',
    linkedin: 'text-red-300',
  };
  const common = `${tint[platform] || 'text-red-300'} drop-shadow-[0_0_6px_rgba(255,0,0,0.08)]`;
  const icons: Record<string, React.ReactNode> = {
    youtube: <Youtube size={size} className={common} />,
    instagram: <Instagram size={size} className={common} />,
    linkedin: <Linkedin size={size} className={common} />
  };
  return icons[platform] || <Sparkles size={size} className={common} />;
};

// Status color mapping for ThinkForge aesthetic (minimal + red/black)
const getStatusColor = (status: string) => {
  // Keep subtle differences but stay within the red/neutral spectrum for cohesion
  const colors: Record<string, string> = {
    scheduled: 'bg-red-600/15 border-red-500/40 text-red-200',
    draft: 'bg-neutral-800/60 border-neutral-700/70 text-neutral-200',
    published: 'bg-red-600/25 border-red-500/50 text-red-100',
    in_production: 'bg-yellow-600/15 border-yellow-500/40 text-yellow-200',
  };
  return colors[status] || colors.draft;
};

// Event chip component - the small event pills shown in calendar cells
const EventChip = ({ event, onClick, onDragEnd }: { event: ContentCard | CalendarEvent; onClick: () => void; onDragEnd?: (eventId: string, newDate: Date) => void }) => {
  const statusColor = getStatusColor(event.status);
  // Support both legacy tags and new customTags
  const allTags = ('customTags' in event && event.customTags?.length) 
    ? [...event.customTags, ...(event.tags || [])]
    : (event.tags || []);
  const firstTag = allTags?.[0];
  const isContentCard = 'customTags' in event && 'plannedDates' in event;
  
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
  onEventUpdate,
  onCreateCard,
  onDeleteCard,
  onOpenScript
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
  const [selectedCard, setSelectedCard] = useState<ContentCard | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(new Date());
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [pickerPosition, setPickerPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const updatePickerPosition = useCallback(() => {
    if (typeof window === 'undefined' || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const panelWidth = DATE_PICKER_WIDTH;
    const panelHalfWidth = panelWidth / 2;
    const panelHeight = datePickerRef.current?.offsetHeight ?? 360;

    const centerX = rect.left + rect.width / 2;
    const clampedX = Math.min(
      Math.max(centerX, panelHalfWidth + DATE_PICKER_MARGIN),
      viewportWidth - panelHalfWidth - DATE_PICKER_MARGIN
    );

    const desiredTop = rect.bottom + DATE_PICKER_MARGIN;
    const clampedTop = Math.min(
      Math.max(desiredTop, DATE_PICKER_MARGIN),
      viewportHeight - panelHeight - DATE_PICKER_MARGIN
    );

    setPickerPosition({ top: clampedTop, left: clampedX });
  }, []);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const isNavigatingRef = useRef(false);

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

  // Generate calendar grid for all visible months with month tracking
  const calendarDays = useMemo(() => {
    const daysWithMonths: Array<{ day: Date; month: Date }> = [];
    visibleMonths.forEach(month => {
      const days = generateMonthDays(month);
      days.forEach(day => {
        daysWithMonths.push({ day, month });
      });
    });
    return daysWithMonths;
  }, [visibleMonths, generateMonthDays]);

  // Group events by date for quick lookup
  const eventsByDate = useMemo(() => {
    const map = new Map<string, (ContentCard | CalendarEvent)[]>();
    const q = searchQuery.trim().toLowerCase();
    let filtered = q
      ? events.filter((e) => {
          const titleMatch = e.title.toLowerCase().includes(q);
          const tagMatch = e.tags?.some((t) => t.toLowerCase().includes(q));
          const customTagMatch = ('customTags' in e && e.customTags) 
            ? e.customTags.some((t) => t.toLowerCase().includes(q))
            : false;
          const ideaMatch = ('idea' in e && e.idea) 
            ? e.idea.idea.toLowerCase().includes(q) || 
              e.idea.purpose.toLowerCase().includes(q)
            : false;
          return titleMatch || tagMatch || customTagMatch || ideaMatch;
        })
      : events;
    
    // Apply status filter
    if (filterStatus) {
      filtered = filtered.filter(e => e.status === filterStatus);
    }

    filtered.forEach(event => {
      // Support multiple dates for ContentCard
      if ('plannedDates' in event && event.plannedDates?.length > 0) {
        event.plannedDates.forEach(dateStr => {
          const dateKey = format(new Date(dateStr), 'yyyy-MM-dd');
          if (!map.has(dateKey)) {
            map.set(dateKey, []);
          }
          map.get(dateKey)!.push(event);
        });
      } else {
        // Legacy single date support
        const dateKey = format(new Date(event.date), 'yyyy-MM-dd');
        if (!map.has(dateKey)) {
          map.set(dateKey, []);
        }
        map.get(dateKey)!.push(event);
      }
    });
    return map;
  }, [events, searchQuery, filterStatus]);

  // Scroll to a specific month
  const scrollToMonth = useCallback((targetDate: Date, smooth = true) => {
    isNavigatingRef.current = true;
    const targetMonthKey = format(targetDate, 'yyyy-MM');
    
    // Wait for the month to be rendered if needed
    const attemptScroll = (attempts = 0) => {
      const monthElement = monthRefs.current.get(targetMonthKey);
      
      if (monthElement && scrollContainerRef.current) {
        const container = scrollContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        const elementRect = monthElement.getBoundingClientRect();
        
        // Calculate the scroll position
        const scrollOffset = container.scrollTop + elementRect.top - containerRect.top - 10;
        
        container.scrollTo({
          top: scrollOffset,
          behavior: smooth ? 'smooth' : 'auto'
        });
        
        setTimeout(() => {
          isNavigatingRef.current = false;
        }, smooth ? 600 : 100);
      } else if (attempts < 10) {
        // Retry if element not found yet
        setTimeout(() => attemptScroll(attempts + 1), 50);
      } else {
        isNavigatingRef.current = false;
      }
    };
    
    attemptScroll();
  }, []);

  // Ensure month is in visibleMonths and scroll to it
  const navigateToMonth = useCallback((targetDate: Date, smooth = true) => {
    setCurrentDate(targetDate);
    
    // Check if month is already in visibleMonths
    const targetMonthKey = format(targetDate, 'yyyy-MM');
    const isMonthVisible = visibleMonths.some(m => format(m, 'yyyy-MM') === targetMonthKey);
    
    if (!isMonthVisible) {
      // Add the month and surrounding months to visibleMonths
      setVisibleMonths([
        subMonths(targetDate, 2),
        subMonths(targetDate, 1),
        targetDate,
        addMonths(targetDate, 1),
        addMonths(targetDate, 2)
      ]);
    }
    
    // Scroll to the month
    setTimeout(() => {
      scrollToMonth(targetDate, smooth);
    }, isMonthVisible ? 0 : 100);
  }, [visibleMonths, scrollToMonth]);

  // Navigation handlers
  const goToPreviousMonth = () => {
    const prevMonth = subMonths(currentDate, 1);
    navigateToMonth(prevMonth);
  };
  
  const goToNextMonth = () => {
    const nextMonth = addMonths(currentDate, 1);
    navigateToMonth(nextMonth);
  };
  
  const goToToday = () => {
    const today = new Date();
    navigateToMonth(today);
  };

  const handleCreateNewCard = () => {
    const today = new Date();
    onCreateCard?.(today);
  };

  const statusOptions = [
    { value: null, label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'in_production', label: 'In Production' },
    { value: 'published', label: 'Published' },
  ];

  // Infinite scroll handler with improved logic
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      if (isScrollingRef.current || isNavigatingRef.current) return;
      
      const { scrollTop, scrollHeight, clientHeight } = container;
      
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Load more months when near bottom
      if (scrollTop + clientHeight >= scrollHeight - 1000) {
        isScrollingRef.current = true;
        setVisibleMonths(prev => {
          const lastMonth = prev[prev.length - 1];
          return [...prev, addMonths(lastMonth, 1), addMonths(lastMonth, 2)];
        });
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 100);
      }
      
      // Load more months when near top
      if (scrollTop <= 1000) {
        const prevScrollHeight = scrollHeight;
        isScrollingRef.current = true;
        setVisibleMonths(prev => {
          const firstMonth = prev[0];
          return [subMonths(firstMonth, 2), subMonths(firstMonth, 1), ...prev];
        });
        
        // Maintain scroll position after prepending
        requestAnimationFrame(() => {
          if (container) {
            const newScrollHeight = container.scrollHeight;
            container.scrollTop = scrollTop + (newScrollHeight - prevScrollHeight);
          }
          isScrollingRef.current = false;
        });
      }

      // Update current month based on scroll position with debouncing
      scrollTimeoutRef.current = setTimeout(() => {
        if (isNavigatingRef.current) return;
        
        // Find which month is most visible by checking element positions
        let mostVisibleMonth: Date | null = null;
        let maxVisibility = 0;
        
        visibleMonths.forEach(month => {
          const monthKey = format(month, 'yyyy-MM');
          const monthElement = monthRefs.current.get(monthKey);
          if (monthElement) {
            const rect = monthElement.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            
            // Calculate how much of the month is visible
            const visibleTop = Math.max(rect.top, containerRect.top + 100); // Account for header
            const visibleBottom = Math.min(rect.bottom, containerRect.bottom);
            const visibleHeight = Math.max(0, visibleBottom - visibleTop);
            
            if (visibleHeight > maxVisibility) {
              maxVisibility = visibleHeight;
              mostVisibleMonth = month;
            }
          }
        });
        
        if (mostVisibleMonth && !isSameMonth(mostVisibleMonth, currentDate)) {
          setCurrentDate(mostVisibleMonth);
        }
      }, 200);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [visibleMonths, currentDate]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      
      // Close filter menu
      if (showFilterMenu && !target.closest('.filter-menu-container')) {
        setShowFilterMenu(false);
      }
      
      // Close date picker
      if (showDatePicker && datePickerRef.current && !datePickerRef.current.contains(target) && !target.closest('.date-picker-trigger')) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterMenu, showDatePicker]);

  // Sync picker date with current date
  useEffect(() => {
    setPickerDate(currentDate);
  }, [currentDate]);

  // Floating Date Picker Component
  const FloatingDatePicker = () => {
    const [viewMode, setViewMode] = useState<'date' | 'month' | 'year'>('date');
    const [yearRange, setYearRange] = useState(() => {
      const currentYear = getYear(pickerDate);
      return { start: currentYear - 5, end: currentYear + 6 };
    });

    if (!showDatePicker) return null;

    // Generate days for the picker month
    const monthStart = startOfMonth(pickerDate);
    const monthEnd = endOfMonth(pickerDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const days: Date[] = [];
    let day = calendarStart;
    while (day <= calendarEnd) {
      days.push(day);
      day = addDays(day, 1);
    }

    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];

    const years = Array.from({ length: 12 }, (_, i) => yearRange.start + i);

    const closePicker = () => {
      setShowDatePicker(false);
      setViewMode('date');
    };

    if (!showDatePicker || typeof document === 'undefined') return null;

    return createPortal(
      <>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[998]"
          onClick={closePicker}
        />
        <motion.div
          ref={datePickerRef}
          initial={{ opacity: 0, scale: 0.96, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: -6 }}
          transition={{ duration: 0.18 }}
          className="fixed z-[999] rounded-2xl border border-neutral-800/70 bg-neutral-950 shadow-[0_18px_42px_rgba(0,0,0,0.55)] overflow-hidden"
          style={{
            top: pickerPosition.top,
            left: pickerPosition.left,
            width: DATE_PICKER_WIDTH,
            transform: 'translateX(-50%)',
            maxWidth: 'calc(100vw - 32px)'
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {/* Header */}
          <div className="p-3 border-b border-neutral-800/60 bg-neutral-950 flex items-center justify-between">
            <button
              onClick={() => {
                if (viewMode === 'date') {
                  setPickerDate(prev => subMonths(prev, 1));
                } else if (viewMode === 'month') {
                  setPickerDate(prev => subMonths(prev, 12));
                } else {
                  setYearRange(prev => ({ start: prev.start - 12, end: prev.end - 12 }));
                }
              }}
              className="p-1.5 rounded-lg hover:bg-neutral-900/70 text-neutral-400 hover:text-white transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('month')}
                className={`px-2 py-1 text-sm font-semibold rounded transition-colors ${viewMode === 'month' ? 'text-red-200 bg-red-600/10' : 'text-white hover:text-red-200 hover:bg-neutral-900/70'}`}
              >
                {format(pickerDate, 'MMMM')}
              </button>
              <button
                onClick={() => setViewMode('year')}
                className={`px-2 py-1 text-sm font-semibold rounded transition-colors ${viewMode === 'year' ? 'text-red-200 bg-red-600/10' : 'text-white hover:text-red-200 hover:bg-neutral-900/70'}`}
              >
                {format(pickerDate, 'yyyy')}
              </button>
            </div>
            
            <button
              onClick={() => {
                if (viewMode === 'date') {
                  setPickerDate(prev => addMonths(prev, 1));
                } else if (viewMode === 'month') {
                  setPickerDate(prev => addMonths(prev, 12));
                } else {
                  setYearRange(prev => ({ start: prev.start + 12, end: prev.end + 12 }));
                }
              }}
              className="p-1.5 rounded-lg hover:bg-neutral-900/70 text-neutral-400 hover:text-white transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="bg-neutral-950/98">
            {viewMode === 'date' && (
              <>
                {/* Weekday Headers */}
                <div className="grid grid-cols-7 gap-px bg-neutral-800/30 p-2 pb-0">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
                    <div key={day} className="text-center py-2">
                      <span className="text-[10px] font-medium text-neutral-500 uppercase">{day}</span>
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-px bg-neutral-800/30 p-2">
                  {days.map((date, idx) => {
                    const isCurrentMonth = isSameMonth(date, pickerDate);
                    const isToday = isSameDay(date, new Date());
                    const isSelected = isSameDay(date, currentDate);

                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          navigateToMonth(date);
                          closePicker();
                        }}
                        className={`
                          aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-all
                          ${!isCurrentMonth ? 'text-neutral-600' : 'text-neutral-300'}
                          ${isToday ? 'bg-red-900/30 text-red-200 ring-1 ring-red-700/50' : ''}
                          ${isSelected ? 'bg-red-600/30 text-red-100 ring-1 ring-red-500/60' : ''}
                          ${!isToday && !isSelected ? 'hover:bg-neutral-900/70 hover:text-white' : ''}
                        `}
                      >
                        {format(date, 'd')}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {viewMode === 'month' && (
              <div className="p-3">
                <div className="grid grid-cols-3 gap-2">
                  {months.map((month, idx) => {
                    const isSelected = idx === getMonth(pickerDate);
                    return (
                      <button
                        key={month}
                        onClick={() => {
                          const newDate = setMonth(pickerDate, idx);
                          setPickerDate(newDate);
                          setViewMode('date');
                          requestAnimationFrame(updatePickerPosition);
                        }}
                        className={`
                          px-3 py-2 rounded-lg text-sm font-medium transition-all
                          ${isSelected 
                            ? 'bg-red-600/30 text-red-200 ring-1 ring-red-500/60' 
                            : 'bg-neutral-900/60 text-neutral-300 hover:bg-neutral-900/80 hover:text-white'
                          }
                        `}
                      >
                        {month}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {viewMode === 'year' && (
              <div className="p-3">
                <div className="grid grid-cols-3 gap-2">
                  {years.map((year) => {
                    const isSelected = year === getYear(pickerDate);
                    return (
                      <button
                        key={year}
                        onClick={() => {
                          const newDate = setYear(pickerDate, year);
                          setPickerDate(newDate);
                          setViewMode('date');
                          requestAnimationFrame(updatePickerPosition);
                        }}
                        className={`
                          px-3 py-2 rounded-lg text-sm font-medium transition-all
                          ${isSelected 
                            ? 'bg-red-600/30 text-red-200 ring-1 ring-red-500/60' 
                            : 'bg-neutral-900/60 text-neutral-300 hover:bg-neutral-900/80 hover:text-white'
                          }
                        `}
                      >
                        {year}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-2 border-t border-neutral-800/60 bg-neutral-950 flex gap-2">
            <button
              onClick={() => {
                const today = new Date();
                setPickerDate(today);
                navigateToMonth(today);
                closePicker();
              }}
              className="flex-1 px-3 py-1.5 rounded-lg bg-neutral-900/70 border border-neutral-800/70 text-neutral-300 hover:bg-neutral-900/80 hover:text-white transition-all text-xs font-medium"
            >
              Today
            </button>
            <button
              onClick={closePicker}
              className="flex-1 px-3 py-1.5 rounded-lg bg-neutral-900/70 border border-neutral-800/70 text-neutral-300 hover:bg-neutral-900/80 hover:text-white transition-all text-xs font-medium"
            >
              Close
            </button>
          </div>
        </motion.div>
      </>,
      document.body
    );
  };

  const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  useEffect(() => {
    if (!showDatePicker) return;
    updatePickerPosition();

    window.addEventListener('resize', updatePickerPosition);
    window.addEventListener('scroll', updatePickerPosition, true);
    return () => {
      window.removeEventListener('resize', updatePickerPosition);
      window.removeEventListener('scroll', updatePickerPosition, true);
    };
  }, [showDatePicker, updatePickerPosition]);

  return (
    <div className="relative w-full h-full bg-neutral-950 flex flex-col overflow-hidden z-30">
      {/* Calendar Grid - Interactive */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto bg-neutral-950 relative pb-24"
      >
        {/* Fade overlays */}
        <div className="pointer-events-none absolute inset-0 z-20">
          {/* Bottom fade */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-neutral-950 to-transparent" />
        </div>

        <div className="min-h-full" role="grid">
          {visibleMonths.map((monthDate, monthIdx) => {
            const monthDays = calendarDays.filter(({ month }) => isSameMonth(month, monthDate));
            const monthStart = startOfMonth(monthDate);
            const firstDayOfWeek = startOfWeek(monthStart, { weekStartsOn: 0 });
            const isFirstMonth = monthIdx === 0;
            
            const monthKey = format(monthDate, 'yyyy-MM');
            return (
              <div 
                key={monthKey} 
                ref={(el) => {
                  if (el) monthRefs.current.set(monthKey, el);
                  else monthRefs.current.delete(monthKey);
                }}
                className={isFirstMonth ? '' : 'mt-12'}
              >
                {/* Month Header */}
                <div className="sticky top-0 z-20 bg-neutral-950/95 backdrop-blur-xl border-b border-neutral-800/50 py-2 px-4 mb-2 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-neutral-200">
                    {format(monthDate, 'MMMM yyyy')}
                  </h2>
                  <div className="flex items-center gap-2">
                     <button
                        onClick={handleCreateNewCard}
                        className="px-3 py-1.5 rounded-lg bg-neutral-800/60 hover:bg-neutral-800/90 text-neutral-300 text-xs font-medium flex items-center gap-2 border border-neutral-700/50"
                     >
                        <Plus size={14} />
                        New Content
                     </button>
                  </div>
                </div>
                
                {/* Calendar Grid for this month */}
                <div className="grid grid-cols-7" role="grid">
                  {monthDays.map(({ day, month }, idx) => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const dayEvents = eventsByDate.get(dateKey) || [];
                    const isCurrentMonth = isSameMonth(day, month);
                    const isTodayDate = isToday(day);
                    const maxChips = 3;
                    const visible = dayEvents.slice(0, maxChips);
                    const overflow = dayEvents.length - visible.length;

                    return (
                      <div
                        key={`${format(day, 'yyyy-MM-dd')}-${format(month, 'yyyy-MM')}-${idx}`}
                        className={`
                          group relative min-h-[140px] p-3 border-r border-b border-neutral-800/40
                          ${isCurrentMonth ? 'bg-neutral-950' : 'bg-neutral-900/20'}
                          ${isTodayDate ? 'bg-red-950/20 border-red-900/40 shadow-[inset_0_0_0_1px_rgba(127,29,29,0.25)]' : ''}
                          ${idx % 7 === 6 ? 'border-r-0' : ''}
                          hover:bg-neutral-900/50 transition-colors
                        `}
                        role="gridcell"
                        aria-label={format(day, 'MMMM d, yyyy')}
                        onClick={() => {
                           if (dayEvents.length === 0) {
                              onCreateCard?.(day);
                           } else {
                              onCellClick?.(day);
                           }
                        }}
                      >
                        {/* Day number */}
                        <div className="flex items-start justify-between mb-2 pointer-events-none">
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
                        </div>

                        {/* Events */}
                        <div className="space-y-1.5">
                          <AnimatePresence mode="popLayout">
                            {visible.map(event => (
                              <motion.div
                                key={event.id}
                                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                                transition={{ duration: 0.15 }}
                              >
                                <EventChip
                                  event={event}
                                  onClick={() => setSelectedCard(event as ContentCard)}
                                  onDragEnd={onEventDrop}
                                />
                              </motion.div>
                            ))}
                            {overflow > 0 && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-[11px] text-neutral-400 px-1"
                              >
                                +{overflow} more
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Card Modal */}
      {selectedCard && (
        <ContentCardModal
          card={selectedCard}
          isOpen={!!selectedCard}
          onClose={() => setSelectedCard(null)}
          onUpdate={(id, updates) => {
            onEventUpdate?.(id, updates);
            setSelectedCard(prev => prev ? { ...prev, ...updates } : null);
          }}
          onDelete={(id) => {
            onDeleteCard?.(id);
            setSelectedCard(null);
          }}
          onOpenScript={onOpenScript}
        />
      )}

      {/* Legacy Floating Panel for CalendarEvent (backward compatibility) */}
      <AnimatePresence>
        {openEventId && events.find((e) => e.id === openEventId && !('customTags' in e)) && (
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
                {/* Keep FloatingIdeaPanel for legacy CalendarEvent support */}
                <div className="text-xs text-neutral-400 p-4 bg-neutral-900/80 rounded-xl border border-neutral-800/70">
                  Legacy event view - upgrade to ContentCard for full features
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
