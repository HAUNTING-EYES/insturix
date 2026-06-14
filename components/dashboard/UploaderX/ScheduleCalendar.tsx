"use client";

import React, { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink } from "lucide-react";

type SchedulePlatform = "youtube" | "facebook";
type PlatformFilter = "all" | SchedulePlatform;
type StateFilter = "all" | "scheduled" | "published" | "draft";

export interface UploaderXScheduleVideo {
  videoUuid: string;
  filename: string;
  publicUrl?: string;
  uploadedAt?: string;
  status?: string;
  platforms?: string[];
  metadata?: Record<string, unknown>;
}

interface ScheduleItem {
  id: string;
  platform: SchedulePlatform;
  label: string;
  publishAt: Date;
  state: string;
  url?: string;
  video: UploaderXScheduleVideo;
}

interface ScheduleCalendarProps {
  videos: UploaderXScheduleVideo[];
  onSelectVideo: (videoUuid: string) => void;
}

const C = {
  bg: "#0B0B0A",
  raised: "#0F0F0E",
  deeper: "#131312",
  border: "#1C1B19",
  borderL: "#282724",
  t1: "#ECE9E1",
  t2: "#B5B2A8",
  t3: "#7A776E",
  t5: "#454340",
  gold: "#D4A652",
  goldBg: "rgba(212,166,82,.08)",
  goldBd: "rgba(212,166,82,.16)",
  green: "#5EC97E",
  blue: "#6AA8D4",
} as const;

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function formatMonth(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function shiftMonth(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildMonthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function createItem(video: UploaderXScheduleVideo, platform: SchedulePlatform): ScheduleItem | null {
  const platformMeta = readRecord(readRecord(video.metadata)?.[platform]);
  const scheduledTime = readString(platformMeta?.scheduledTime);
  if (!scheduledTime) return null;

  const publishAt = new Date(scheduledTime);
  if (Number.isNaN(publishAt.getTime())) return null;

  return {
    id: `${video.videoUuid}-${platform}-${scheduledTime}`,
    platform,
    label: platform === "youtube" ? "YouTube" : "Facebook",
    publishAt,
    state: readString(platformMeta?.publishState) || "scheduled",
    url: readString(platformMeta?.url),
    video,
  };
}

function collectScheduleItems(videos: UploaderXScheduleVideo[]) {
  return videos
    .flatMap((video) => [
      createItem(video, "youtube"),
      createItem(video, "facebook"),
    ])
    .filter((item): item is ScheduleItem => Boolean(item))
    .sort((a, b) => a.publishAt.getTime() - b.publishAt.getTime());
}

function platformColor(platform: SchedulePlatform) {
  return platform === "youtube" ? C.gold : C.blue;
}

export function ScheduleCalendar({ videos, onSelectVideo }: ScheduleCalendarProps) {
  const [month, setMonth] = useState(() => new Date());
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const items = useMemo(() => collectScheduleItems(videos), [videos]);
  const filteredItems = useMemo(() => items.filter((item) => {
    const platformMatch = platformFilter === "all" || item.platform === platformFilter;
    const stateMatch = stateFilter === "all" || item.state === stateFilter;
    return platformMatch && stateMatch;
  }), [items, platformFilter, stateFilter]);
  const days = useMemo(() => buildMonthDays(month), [month]);
  const now = new Date();
  const upcoming = filteredItems.filter((item) => item.publishAt.getTime() >= now.getTime()).slice(0, 6);

  return (
    <section
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: C.raised,
        padding: 16,
        marginBottom: 32,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <CalendarDays size={16} color={C.gold} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.t1 }}>Schedule calendar</div>
          <div style={{ fontSize: 11, color: C.t3 }}>YouTube and Facebook scheduled publishes</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => setMonth((current) => shiftMonth(current, -1))}
            aria-label="Previous month"
            style={iconButtonStyle}
          >
            <ChevronLeft size={14} />
          </button>
          <span style={{ minWidth: 132, textAlign: "center", fontSize: 12, color: C.t2, fontWeight: 700 }}>
            {formatMonth(month)}
          </span>
          <button
            type="button"
            onClick={() => setMonth((current) => shiftMonth(current, 1))}
            aria-label="Next month"
            style={iconButtonStyle}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([
            ["all", "All platforms"],
            ["youtube", "YouTube"],
            ["facebook", "Facebook"],
          ] as Array<[PlatformFilter, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setPlatformFilter(value)}
              style={chipStyle(platformFilter === value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {([
            ["all", "All states"],
            ["scheduled", "Scheduled"],
            ["published", "Published"],
            ["draft", "Draft"],
          ] as Array<[StateFilter, string]>).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStateFilter(value)}
              style={chipStyle(stateFilter === value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ border: `1px dashed ${C.borderL}`, borderRadius: 8, padding: 20, color: C.t3, fontSize: 12 }}>
          Scheduled posts will appear here after you publish with a future date.
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ border: `1px dashed ${C.borderL}`, borderRadius: 8, padding: 20, color: C.t3, fontSize: 12 }}>
          No scheduled posts match these filters.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(240px, .9fr)", gap: 14 }}>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, marginBottom: 4 }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} style={{ fontSize: 10, color: C.t5, textAlign: "center" }}>{day}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4 }}>
              {days.map((day) => {
                const dayItems = filteredItems.filter((item) => sameDay(item.publishAt, day));
                const muted = day.getMonth() !== month.getMonth();
                return (
                  <div
                    key={day.toISOString()}
                    style={{
                      minHeight: 72,
                      border: `1px solid ${sameDay(day, now) ? C.goldBd : C.border}`,
                      borderRadius: 6,
                      padding: 6,
                      background: sameDay(day, now) ? C.goldBg : C.deeper,
                      opacity: muted ? 0.45 : 1,
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ fontSize: 10, color: muted ? C.t5 : C.t3, marginBottom: 4 }}>
                      {day.getDate()}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {dayItems.slice(0, 2).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onSelectVideo(item.video.videoUuid)}
                          title={`${item.label}: ${item.video.filename}`}
                          style={{
                            border: `1px solid ${platformColor(item.platform)}55`,
                            color: platformColor(item.platform),
                            background: "rgba(255,255,255,.02)",
                            borderRadius: 4,
                            padding: "2px 4px",
                            fontSize: 10,
                            textAlign: "left",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            cursor: "pointer",
                          }}
                        >
                          {item.label}
                        </button>
                      ))}
                      {dayItems.length > 2 && (
                        <span style={{ fontSize: 9, color: C.t5 }}>+{dayItems.length - 2} more</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.bg, padding: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Clock3 size={13} color={C.t3} />
              <span style={{ fontSize: 11, color: C.t3, fontWeight: 700 }}>Upcoming</span>
            </div>
            {upcoming.length === 0 ? (
              <div style={{ fontSize: 12, color: C.t5 }}>No upcoming scheduled posts.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {upcoming.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      width: "100%",
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      background: C.raised,
                      padding: 10,
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 6, background: platformColor(item.platform) }} />
                      <span style={{ fontSize: 11, color: platformColor(item.platform), fontWeight: 800 }}>{item.label}</span>
                      <span style={{ marginLeft: "auto", fontSize: 10, color: item.state === "scheduled" ? C.green : C.t5 }}>
                        {item.state}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: C.t2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.video.filename}
                    </div>
                    <div style={{ fontSize: 10, color: C.t5, marginTop: 3 }}>{formatDateTime(item.publishAt)}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => onSelectVideo(item.video.videoUuid)}
                        style={smallActionStyle}
                      >
                        Open video
                      </button>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ ...smallActionStyle, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}
                        >
                          Open post <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
    </section>
  );
}

const iconButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  background: C.deeper,
  color: C.t3,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
};

function chipStyle(active: boolean): React.CSSProperties {
  return {
    border: `1px solid ${active ? C.goldBd : C.border}`,
    background: active ? C.goldBg : C.deeper,
    color: active ? C.gold : C.t3,
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
  };
}

const smallActionStyle: React.CSSProperties = {
  border: `1px solid ${C.borderL}`,
  background: C.deeper,
  color: C.t2,
  borderRadius: 5,
  padding: "5px 8px",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
};
