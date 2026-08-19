"use client";

import React, { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  X,
  Plus,
  FileText,
  Film,
  DollarSign,
  Camera,
  BookOpen,
  Globe,
  Music,
  Search,
  FileQuestion,
  ChevronLeft,
  ChevronRight,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface DocumentTab {
  scriptId: string;
  title: string;
  documentType: string;
  active?: boolean;
}

interface DocumentTabsProps {
  tabs: DocumentTab[];
  activeTabId: string;
  onTabClick: (scriptId: string) => void;
  onTabClose?: (scriptId: string) => void;
  onNewTab?: () => void;
  onTabReorder?: (newOrder: DocumentTab[]) => void;
  className?: string;
}

const DOC_TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  screenplay: FileText,
  vfx_brief: Film,
  budget: DollarSign,
  shot_list: Camera,
  character_bible: BookOpen,
  world_bible: Globe,
  score_direction: Music,
  research_brief: Search,
  interview_questions: FileQuestion,
  custom: FileText,
};

function getDocIcon(docType: string) {
  return DOC_TYPE_ICONS[docType] || FileText;
}

function SortableTab({
  tab,
  isActive,
  onTabClick,
  onTabClose,
  tabCount,
}: {
  tab: DocumentTab;
  isActive: boolean;
  onTabClick: (scriptId: string) => void;
  onTabClose?: (scriptId: string) => void;
  tabCount: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.scriptId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    height: 34,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  const Icon = getDocIcon(tab.documentType);

  return (
    <div
      ref={setNodeRef}
      data-document-id={tab.scriptId}
      style={style}
      className={cn(
        "group relative flex items-center gap-1 pl-1 pr-2 min-w-[120px] max-w-[200px] shrink-0 text-[11px] font-medium transition-colors select-none",
        "border-r border-[#1C1B19]",
        isActive
          ? "bg-[#0F0F0E] text-[#ECE9E1]"
          : "bg-[#0B0B0A] text-[#5F5E5A] hover:text-[#B5B2A8] hover:bg-[#0F0F0E]/50",
        isDragging && "shadow-lg shadow-black/40 rounded-sm"
      )}
    >
      {isActive && (
        <span className="absolute top-0 left-0 right-0 h-[2px] bg-[#D4A652]/80 rounded-b-sm" />
      )}

      <span
        {...attributes}
        {...listeners}
        className="flex items-center px-0.5 cursor-grab active:cursor-grabbing text-[#454340] hover:text-[#7A776E] shrink-0"
      >
        <GripVertical className="h-3 w-3" />
      </span>

      <button
        onClick={() => onTabClick(tab.scriptId)}
        className="flex items-center gap-1.5 flex-1 min-w-0 h-full"
      >
        <Icon className="h-3 w-3 shrink-0 opacity-50" />
        <span className="truncate flex-1 text-left">
          {tab.title || "Untitled"}
        </span>
      </button>

      {onTabClose && tabCount > 1 && (
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            onTabClose(tab.scriptId);
          }}
          className={cn(
            "ml-0.5 rounded-sm p-0.5 transition-all",
            isActive
              ? "opacity-40 hover:opacity-100 hover:bg-[#1C1B19]"
              : "opacity-0 group-hover:opacity-50 hover:opacity-100! hover:bg-[#1C1B19]"
          )}
        >
          <X className="h-2.5 w-2.5" />
        </span>
      )}
    </div>
  );
}

export function DocumentTabs({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
  onTabReorder,
  className,
}: DocumentTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  const scrollByAmount = useCallback(
    (dir: number) => {
      scrollRef.current?.scrollBy({ left: dir * 180, behavior: "smooth" });
      setTimeout(checkScroll, 300);
    },
    [checkScroll]
  );

  React.useEffect(() => {
    checkScroll();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScroll, { passive: true });
      const ro = new ResizeObserver(checkScroll);
      ro.observe(el);
      return () => {
        el.removeEventListener("scroll", checkScroll);
        ro.disconnect();
      };
    }
  }, [checkScroll, tabs.length]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tabs.findIndex((t) => t.scriptId === active.id);
    const newIndex = tabs.findIndex((t) => t.scriptId === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tabs, oldIndex, newIndex);
    onTabReorder?.(reordered);
  }

  if (tabs.length <= 1 && !onNewTab) return null;

  return (
    <div
      className={cn(
        "relative flex items-stretch bg-[#0B0B0A] border-b border-[#1C1B19]",
        className
      )}
    >
      {canScrollLeft && (
        <button
          onClick={() => scrollByAmount(-1)}
          className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-1 bg-linear-to-r from-[#0B0B0A] via-[#0B0B0A]/90 to-transparent"
          aria-label="Scroll tabs left"
        >
          <ChevronLeft className="h-3.5 w-3.5 text-[#5F5E5A]" />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex items-stretch overflow-x-auto scrollbar-none flex-1"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={tabs.map((t) => t.scriptId)}
            strategy={horizontalListSortingStrategy}
          >
            {tabs.map((tab) => (
              <SortableTab
                key={tab.scriptId}
                tab={tab}
                isActive={tab.scriptId === activeTabId}
                onTabClick={onTabClick}
                onTabClose={onTabClose}
                tabCount={tabs.length}
              />
            ))}
          </SortableContext>
        </DndContext>

        {onNewTab && (
          <button
            onClick={onNewTab}
            className="flex items-center justify-center px-2.5 text-[#454340] hover:text-[#7A776E] hover:bg-[#0F0F0E]/40 transition-colors shrink-0 border-r border-[#1C1B19]"
            style={{ height: 34 }}
            title="New document"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {canScrollRight && (
        <button
          onClick={() => scrollByAmount(1)}
          className="absolute right-0 top-0 bottom-0 z-10 flex items-center px-1 bg-linear-to-l from-[#0B0B0A] via-[#0B0B0A]/90 to-transparent"
          aria-label="Scroll tabs right"
        >
          <ChevronRight className="h-3.5 w-3.5 text-[#5F5E5A]" />
        </button>
      )}
    </div>
  );
}
