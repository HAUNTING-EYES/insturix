"use client";

/**
 * Four-place shell (migration plan Phase 3): the persistent nav rail every
 * studio place shares, plus the Calendar and Library places. Home and the
 * Project surface keep their own components — the rail is the shell.
 *
 * Vocabulary inherits vibe-final-mockup.html (rail icons + gold needs-you
 * badge). The bell badge reads the real Needs-you index from Slice 2;
 * in mock mode there is no badge — nothing fakes a count.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { studioRealTurnsEnabled } from "@/lib/studio/client/turnClient";
import { dayBucket, deliverableState, type ProjectStatusPayload } from "@/lib/studio/client/place-helpers";
import { MOCK_BRANDS, MOCK_DELIVERABLE, MOCK_DELIVERABLE_EMAIL } from "@/lib/studio/mock/data";
import type { StudioDeliverable } from "@/lib/studio/contracts/objects";

/* ── shared bits ── */

function StateChip({ status }: { status: ProjectStatusPayload }) {
  const color =
    status.state === "awaiting_confirmation" || status.state === "running"
      ? "var(--gold)"
      : status.state === "error"
        ? "var(--red)"
        : status.state === "planning"
          ? "var(--muted)"
          : "var(--green)";
  return (
    <span className="stu-chip" style={{ color, borderColor: color }}>
      {status.label}
    </span>
  );
}

/* ── the rail ── */

const RAIL_ICONS = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18" />
    </svg>
  ),
  library: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ),
};

export function StudioRail() {
  const pathname = usePathname();
  const REAL = studioRealTurnsEnabled;
  const [needsCount, setNeedsCount] = useState<number | null>(null);

  useEffect(() => {
    if (!REAL) return;
    let alive = true;
    const poll = () =>
      fetch("/api/studio/projects?attention=needs_you")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { projects?: unknown[] }) => alive && setNeedsCount(d.projects?.length ?? 0))
        .catch(() => alive && setNeedsCount(null));
    poll();
    const t = setInterval(poll, 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [REAL]);

  const onProject = pathname.startsWith("/studio/d/");
  const projectHref = onProject ? pathname : "/studio";
  const active = (place: string) =>
    place === "project" ? onProject : pathname === (place === "home" ? "/studio" : `/studio/${place}`);

  const item = (place: "home" | "project" | "calendar" | "library", href: string, label: string, icon: React.ReactNode) => (
    <Link key={place} href={href} className={`stu-rbtn${active(place) ? " on" : ""}`} title={label} aria-label={label} aria-current={active(place) ? "page" : undefined}>
      {icon}
      <span className="stu-rl">{place === "project" ? "Project" : label.split(" ")[0]}</span>
    </Link>
  );

  return (
    <nav className="stu-rail" aria-label="Studio places">
      <Link href="/studio" className="stu-railmark" title="Insturix — Studio" aria-label="Insturix — Studio home">
        <span />
      </Link>
      {item("home", "/studio", "Home", RAIL_ICONS.home)}
      {item("project", projectHref, "Project — the working chat", RAIL_ICONS.chat)}
      {item("calendar", "/studio/calendar", "Calendar", RAIL_ICONS.calendar)}
      {item("library", "/studio/library", "Library", RAIL_ICONS.library)}
      <div className="stu-railgap" />
      <Link
        href="/studio?attention=1"
        className="stu-rbtn"
        title={needsCount == null ? "Needs you — attention items live on Home" : `Needs you — ${needsCount} item${needsCount === 1 ? "" : "s"}`}
        aria-label="Needs you"
        style={{ position: "relative" }}
      >
        {RAIL_ICONS.bell}
        <span className="stu-rl">Needs</span>
        {needsCount != null && needsCount > 0 && <span className="stu-railbadge">{needsCount > 9 ? "9+" : needsCount}</span>}
      </Link>
    </nav>
  );
}

/* ── shared place frame ── */

function PlaceFrame({ crumb, title, sub, children }: { crumb: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="stu">
      <header className="stu-top">
        <div className="stu-brand">
          <span className="stu-mark" />
          <span className="stu-word">
            Instu<b>rix</b>
          </span>
        </div>
        <div className="stu-crumb">
          <Link href="/studio">Home</Link>
          <span>·</span>
          <span className="dn">{crumb}</span>
        </div>
      </header>
      <div className="stu-placebody">
        <div className="stu-placehead">
          <h1>{title}</h1>
          <p>{sub}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Calendar place ── */

type OverviewPayload = { deliverables: StudioDeliverable[]; brands?: Record<string, string> };

export function CalendarPlace() {
  const REAL = studioRealTurnsEnabled;
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!REAL) return;
    fetch("/api/studio/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: OverviewPayload) => setData(d))
      .catch((e: Error) => setError(e.message));
  }, [REAL]);

  const deliverables = REAL ? (data?.deliverables ?? []) : [MOCK_DELIVERABLE, MOCK_DELIVERABLE_EMAIL];
  const buckets = new Map<string, StudioDeliverable[]>();
  for (const d of [...deliverables].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))) {
    const k = dayBucket(d.updatedAt);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(d);
  }

  return (
    <PlaceFrame
      crumb="Calendar"
      title="Calendar"
      sub="when things ship — dated milestones arrive as projects gain schedules; today it orders real work by when it last moved"
    >
      {error && <p className="stu-placeerror">couldn&apos;t load real data ({error}) — showing nothing rather than faking it</p>}
      {!error && !REAL && <p className="stu-placemock">demo data — real projects appear when STUDIO_REAL_TURNS is on</p>}
      {[...buckets.entries()].map(([day, rows]) => (
        <section key={day} className="stu-daygroup">
          <div className="stu-mlabel">{day}</div>
          {rows.map((d) => (
            <Link key={d.id} href={`/studio/d/${d.id}`} className="stu-dayrow">
              <span className="stu-daytitle">{d.title}</span>
              <StateChip status={deliverableState(d)} />
            </Link>
          ))}
        </section>
      ))}
      {buckets.size === 0 && !error && <p className="stu-placeempty">nothing yet — start something from Home</p>}
    </PlaceFrame>
  );
}

/* ── Library place ── */

export function LibraryPlace() {
  const REAL = studioRealTurnsEnabled;
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!REAL) return;
    fetch("/api/studio/overview")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: OverviewPayload) => setData(d))
      .catch((e: Error) => setError(e.message));
  }, [REAL]);

  const deliverables = REAL ? (data?.deliverables ?? []) : [MOCK_DELIVERABLE, MOCK_DELIVERABLE_EMAIL];
  const brandName = (id: string) => (REAL ? (data?.brands?.[id] ?? id) : (MOCK_BRANDS.find((b) => b.id === id)?.name ?? id));
  const groups = new Map<string, StudioDeliverable[]>();
  for (const d of deliverables) {
    const k = brandName(d.brandId);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(d);
  }

  return (
    <PlaceFrame crumb="Library" title="Library" sub="everything made, grouped by brand — brand settings live in the vault">
      {error && <p className="stu-placeerror">couldn&apos;t load real data ({error}) — showing nothing rather than faking it</p>}
      {!error && !REAL && <p className="stu-placemock">demo data — real projects appear when STUDIO_REAL_TURNS is on</p>}
      {[...groups.entries()].map(([brand, rows]) => (
        <section key={brand} className="stu-daygroup">
          <div className="stu-mlabel">{brand}</div>
          {rows.map((d) => (
            <Link key={d.id} href={`/studio/d/${d.id}`} className="stu-dayrow">
              <span className="stu-daytitle">{d.title}</span>
              <span className="stu-daysub">
                {d.artifacts.length} artifact{d.artifacts.length === 1 ? "" : "s"} · {dayBucket(d.updatedAt)}
              </span>
              <StateChip status={deliverableState(d)} />
            </Link>
          ))}
        </section>
      ))}
      {groups.size === 0 && !error && <p className="stu-placeempty">nothing yet — start something from Home</p>}
    </PlaceFrame>
  );
}
