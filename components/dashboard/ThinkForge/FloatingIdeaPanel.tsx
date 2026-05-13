"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Sparkles, X, Youtube, Instagram, Linkedin } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

// Import type only to avoid runtime dependency cycles
import type { CalendarEvent } from "./Calendar";

type FloatingIdeaPanelProps = {
  event: CalendarEvent;
  onClose: () => void;
  onUpdate?: (id: string, patch: Partial<CalendarEvent>) => void;
};

const platformIcon = (platform: CalendarEvent["platform"]) => {
  const common = "shrink-0";
  if (platform === "youtube") return <Youtube size={14} className={common + " text-[#D4A652]"} />;
  if (platform === "instagram") return <Instagram size={14} className={common + " text-[#D4A652]"} />;
  if (platform === "linkedin") return <Linkedin size={14} className={common + " text-[#D4A652]"} />;
  return null;
};

export default function FloatingIdeaPanel({ event, onClose, onUpdate }: FloatingIdeaPanelProps) {
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<CalendarEvent["status"]>(event.status);

  useEffect(() => {
    // Reset when event changes
    setTitle(event.title);
    setStatus(event.status);
  }, [event]);

  const debouncedSave = useDebouncedCallback((patch: Partial<CalendarEvent>) => {
    onUpdate?.(event.id, patch);
  }, 600);

  // Handlers
  const handleTitleChange = (v: string) => {
    setTitle(v);
    debouncedSave({ title: v });
  };

  const handleStatusChange = (s: CalendarEvent["status"]) => {
    setStatus(s);
    onUpdate?.(event.id, { status: s });
  };

  const statusOptions: Array<CalendarEvent["status"]> = useMemo(() => [
    "draft",
    "scheduled",
    "published",
  ], []);

  return (
    <div className="w-[320px] md:w-[360px] rounded-2xl border border-[#1C1B19]/70 bg-[#0B0B0A]/95 backdrop-blur-xl shadow-2xl shadow-[#D4A652]/20 outline-none">
      <div className="p-3 border-b border-[#1C1B19]/60 flex items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-neutral-200">
          {platformIcon(event.platform)}
          <span className="truncate">{new Date(event.date).toDateString()}</span>
        </div>
        <div className="ml-auto flex items-center gap-1 text-neutral-400">
          <Sparkles size={14} className="text-[#D4A652]/70" />
          {event.aiScore ?? 0}
        </div>
        <button
          aria-label="Close"
          onClick={onClose}
          className="ml-2 p-1 rounded-lg hover:bg-[#1C1B19]/70 text-neutral-400 hover:text-[#ECE9E1] transition"
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="w-full bg-[#0F0F0E]/60 border border-[#1C1B19]/70 rounded-xl px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#D4A652]/40"
          placeholder="Idea…"
        />

        <div className="flex gap-2 items-center text-[11px] text-neutral-400">
          {statusOptions.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] transition ${
                s === status
                  ? "bg-[#D4A652]/20 border-[#D4A652]/50 text-[#D4A652]"
                  : "bg-[#0F0F0E]/50 border-[#1C1B19]/70 hover:bg-[#1C1B19]/60"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            debouncedSave({ aiScore: event.aiScore }); // example autosave touch; extend to persist description if added to type
          }}
          placeholder="Script / notes…"
          rows={6}
          className="w-full bg-[#0F0F0E]/60 border border-[#1C1B19]/70 rounded-xl px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-[#D4A652]/40 resize-none"
        />

        <div className="flex items-center justify-between text-[11px] text-neutral-500">
          <span>Last edited just now</span>
          <button
            className="px-3 py-1.5 rounded-lg bg-gradient-to-br from-[#D4A652] to-[#D4A652] text-white text-[11px] shadow-md"
            onClick={onClose}
          >
            Open Script
          </button>
        </div>
      </div>
    </div>
  );
}
