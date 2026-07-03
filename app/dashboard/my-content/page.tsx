"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Image as ImageIcon, Video, Music, FileText, BarChart2, Mic, Loader2 } from "lucide-react";
import { StorageCard } from "@/components/shared/StorageCard";
import { useMyContent, type ContentItem, type ContentType } from "@/hooks/useMyContent";

const TYPE_META: Record<ContentType, { label: string; Icon: any }> = {
  image: { label: "Images", Icon: ImageIcon },
  video: { label: "Videos", Icon: Video },
  script: { label: "Scripts", Icon: FileText },
  music: { label: "Music", Icon: Music },
  analysis: { label: "Analyses", Icon: BarChart2 },
  audio: { label: "Audio", Icon: Mic },
};

const FILTERS: Array<{ key: "all" | ContentType; label: string }> = [
  { key: "all", label: "All" },
  { key: "image", label: "Images" },
  { key: "video", label: "Videos" },
  { key: "script", label: "Scripts" },
  { key: "music", label: "Music" },
  { key: "analysis", label: "Analyses" },
  { key: "audio", label: "Audio" },
];

function relativeDate(ms: number): string {
  if (!ms) return "";
  const d = Math.floor((Date.now() - ms) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function ContentCard({ item }: { item: ContentItem }) {
  const { Icon } = TYPE_META[item.type];
  return (
    <Link
      href={item.href}
      className="group block overflow-hidden rounded-lg border border-border/50 bg-card/70 transition-all hover:border-border hover:shadow-md"
    >
      <div className="relative flex aspect-video items-center justify-center bg-muted/40">
        {item.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnail} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <Icon className="h-8 w-8 text-muted-foreground/50" />
        )}
        <span
          className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide"
          style={{ background: "rgba(0,0,0,0.6)", color: "var(--accent-gold, #D4A652)" }}
        >
          {item.tool}
        </span>
      </div>
      <div className="p-2.5">
        <p className="truncate text-[13px] font-medium text-foreground">{item.title}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{TYPE_META[item.type].label.replace(/s$/, "")}</span>
          {item.subtitle && (
            <>
              <span className="opacity-50">·</span>
              <span className="truncate">{item.subtitle}</span>
            </>
          )}
          <span className="opacity-50">·</span>
          <span>{relativeDate(item.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

export default function MyContentPage() {
  const { items, isLoading, error } = useMyContent();
  const [filter, setFilter] = useState<"all" | ContentType>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    for (const it of items) c[it.type] = (c[it.type] || 0) + 1;
    return c;
  }, [items]);

  const shown = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.type === filter)),
    [items, filter],
  );

  return (
    <div className="min-h-screen" style={{ background: "#0B0B0A" }}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-1 text-xl font-semibold text-foreground">My Content</h1>
        <p className="mb-6 text-[13px] text-muted-foreground">
          Everything you&apos;ve made — images, videos, scripts, music, and analyses — in one place.
        </p>

        <div className="mb-6">
          <StorageCard />
        </div>

        {/* Type filter */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {FILTERS.filter((f) => f.key === "all" || counts[f.key]).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-[12px] transition-colors ${
                filter === f.key
                  ? "bg-foreground text-background"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
              {counts[f.key] ? <span className="ml-1 opacity-60">{counts[f.key]}</span> : null}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-sm">Loading your content…</p>
          </div>
        ) : error ? (
          <p className="py-20 text-center text-sm text-muted-foreground">{error}</p>
        ) : shown.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm font-medium text-foreground">Nothing here yet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Content you create across the tools will show up here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {shown.map((item) => (
              <ContentCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
