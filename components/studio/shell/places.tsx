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
import { dayBucket, deliverableState, publishStatusChip, type ProjectStatusPayload } from "@/lib/studio/client/place-helpers";
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

type NeedsYouProject = { projectId: string; title: string; status: ProjectStatusPayload };
type NeedsYouConnection = { platform: string; state: "attention" | "reconnect"; displayName: string | null; message: string | null };

/** Needs-you slide-over (mockup §16.3 option B): the open decisions queue
 *  (spine operations) + connection health (CalOS). Rows are pure records —
 *  no invented severities, and healthy connections never surface. */
export function NeedsYouPop({
  open,
  onClose,
  projects,
  connections,
  error,
}: {
  open: boolean;
  onClose: () => void;
  projects: NeedsYouProject[];
  connections: NeedsYouConnection[];
  error: string | null;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside className={`stu-needspop${open ? " on" : ""}`} aria-label="Needs you" aria-hidden={!open}>
      <div className="stu-needsh">
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        <span className="stu-needshlabel">Needs you</span>
        <span className="stu-mlabel">{projects.length + connections.length > 0 ? `${projects.length + connections.length} open` : ""}</span>
        <button className="stu-needsx" onClick={onClose} aria-label="Close needs you">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div className="stu-needsbody">
        {error && <p className="stu-placeerror">couldn&apos;t load the queue ({error})</p>}
        {!error && projects.length === 0 && connections.length === 0 && (
          <p className="stu-placeempty">nothing needs you right now — anything that does lands here, never silently</p>
        )}
        {projects.map((p) => (
          <Link key={p.projectId} href={`/studio/d/${p.projectId}`} className="stu-needsrow" onClick={onClose}>
            <span className="stu-needstitle">{p.title}</span>
            <span className="stu-needssub">{p.status.label} — answered in the project chat</span>
            <span className="stu-needsopen">Open</span>
          </Link>
        ))}
        {connections.length > 0 && <div className="stu-mlabel" style={{ marginTop: 4 }}>connections</div>}
        {connections.map((c) => (
          <div key={c.platform} className={`stu-needsrow${c.state === "reconnect" ? " danger" : ""}`} style={{ textDecoration: "none" }}>
            <span className="stu-needstitle">
              {c.platform}
              {c.displayName ? ` · ${c.displayName}` : ""}
            </span>
            <span className="stu-needssub">{c.message ?? "needs attention before publishing"}</span>
            <span className="stu-needsopen">{c.state === "reconnect" ? "Reconnect" : "Resolve"}</span>
          </div>
        ))}
      </div>
      <div className="stu-needsfoot">nothing publishes or proceeds without you</div>
    </aside>
  );
}

export function StudioRail() {
  const pathname = usePathname();
  const REAL = studioRealTurnsEnabled;
  const [needsProjects, setNeedsProjects] = useState<NeedsYouProject[]>([]);
  const [needsConnections, setNeedsConnections] = useState<NeedsYouConnection[]>([]);
  const [needsError, setNeedsError] = useState<string | null>(null);
  const [popOpen, setPopOpen] = useState(false);
  const needsCount = needsProjects.length + needsConnections.length;

  useEffect(() => {
    if (!REAL) return;
    let alive = true;
    const poll = () =>
      fetch("/api/studio/needs-you")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { projects?: NeedsYouProject[]; connections?: NeedsYouConnection[] }) => {
          if (!alive) return;
          setNeedsProjects(d.projects ?? []);
          setNeedsConnections(d.connections ?? []);
          setNeedsError(null);
        })
        .catch((e: Error) => alive && setNeedsError(e.message));
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
      <a href="/account/connections" className="stu-rbtn" title="Account — org, billing, connections, storage">
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
        <span className="stu-rl">Account</span>
      </a>
      <button
        className="stu-rbtn"
        onClick={() => setPopOpen((v) => !v)}
        title={REAL ? `Needs you — ${needsCount} item${needsCount === 1 ? "" : "s"}` : "Needs you — attention items appear here in real mode"}
        aria-label="Needs you"
        aria-haspopup="dialog"
        aria-expanded={popOpen}
        style={{ position: "relative" }}
      >
        {RAIL_ICONS.bell}
        <span className="stu-rl">Needs</span>
        {REAL && needsCount > 0 && <span className="stu-railbadge">{needsCount > 9 ? "9+" : needsCount}</span>}
      </button>
      <NeedsYouPop open={popOpen} onClose={() => setPopOpen(false)} projects={needsProjects} connections={needsConnections} error={needsError} />
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
type CalendarPayload = {
  scheduled: Array<{ id: string; deliverableId: string; platform: string; status: string; publishAt: string; postUrl: string | null; lastError: string | null }>;
  /** §12 projection: editorial pipeline (planned dates on idea/draft cards).
   *  A planned item is NOT a scheduled post — approval moves it across. */
  planned?: Array<{ id: string; deliverableId: string; platform: string; plannedAt: string; editorialStatus: string; title: string }>;
};

export function CalendarPlace() {
  const REAL = studioRealTurnsEnabled;
  const [data, setData] = useState<OverviewPayload | null>(null);
  const [cal, setCal] = useState<CalendarPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!REAL) return;
    const safe = <T,>(p: Promise<T>) => p.catch(() => null);
    void (
      Promise.all([
        safe(fetch("/api/studio/overview").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))),
        safe(fetch("/api/studio/calendar").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))),
      ]) as Promise<[OverviewPayload | null, CalendarPayload | null]>
    ).then(([o, c]) => {
      if (o) setData(o);
      if (c) setCal(c);
      if (!o && !c) setError("overview and calendar both unreachable");
    });
  }, [REAL]);

  const deliverables = REAL ? (data?.deliverables ?? []) : [MOCK_DELIVERABLE, MOCK_DELIVERABLE_EMAIL];
  const buckets = new Map<string, StudioDeliverable[]>();
  for (const d of [...deliverables].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))) {
    const k = dayBucket(d.updatedAt);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(d);
  }

  /* Phase 4: real dated milestones from CalOS's delivery queue — past 7 days
   * + next 45, grouped by publish day. Delivery state lives there, not on
   * deliverables; nothing here publishes by itself. */
  const scheduled = REAL ? (cal?.scheduled ?? []) : [];
  const schedBuckets = new Map<string, CalendarPayload["scheduled"]>();
  for (const r of scheduled) {
    const k = dayBucket(r.publishAt);
    if (!schedBuckets.has(k)) schedBuckets.set(k, []);
    schedBuckets.get(k)!.push(r);
  }
  const schedTotal = scheduled.length;

  /* §12: the plan layer — planned dates on editorial-pipeline cards, grouped
   * by day, clearly not-yet-scheduled */
  const planned = REAL ? (cal?.planned ?? []) : [];
  const plannedBuckets = new Map<string, NonNullable<CalendarPayload["planned"]>>();
  for (const p of planned) {
    const k = dayBucket(p.plannedAt);
    if (!plannedBuckets.has(k)) plannedBuckets.set(k, []);
    plannedBuckets.get(k)!.push(p);
  }

  return (
    <PlaceFrame
      crumb="Calendar"
      title="Calendar"
      sub="when things ship — scheduled posts from the delivery queue, then real work by when it last moved"
    >
      {error && <p className="stu-placeerror">couldn&apos;t load real data ({error}) — showing nothing rather than faking it</p>}
      {!error && !REAL && <p className="stu-placemock">demo data — real projects appear when STUDIO_REAL_TURNS is on</p>}
      {[...schedBuckets.entries()].map(([day, rows]) => (
        <section key={`s_${day}`} className="stu-daygroup">
          <div className="stu-mlabel">{day} · scheduled</div>
          {rows.map((r) => {
            const chip = publishStatusChip(r.status);
            const row = (
              <span className="stu-dayrow" style={{ cursor: r.postUrl ? "pointer" : "default" }}>
                <span className="stu-daytitle">{r.platform}</span>
                <span className="stu-daysub">
                  {new Date(r.publishAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })}
                  {r.lastError && r.status === "failed" ? ` · ${r.lastError.slice(0, 60)}` : ""}
                </span>
                <StateChip status={chip} />
              </span>
            );
            return r.postUrl ? (
              <a key={r.id} href={r.postUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                {row}
              </a>
            ) : (
              <span key={r.id}>{row}</span>
            );
          })}
        </section>
      ))}
      {REAL && schedTotal === 0 && planned.length === 0 && !error && (
        <p className="stu-placeempty">nothing scheduled yet — approved work lands here with its publish day; nothing ever posts without approval</p>
      )}
      {[...plannedBuckets.entries()].map(([day, rows]) => (
        <section key={`p_${day}`} className="stu-daygroup">
          <div className="stu-mlabel">{day} · planned</div>
          {rows.map((p) => (
            <span key={p.id} className="stu-dayrow">
              <span className="stu-daytitle">{p.title}</span>
              <span className="stu-daysub">
                {p.platform} · {new Date(p.plannedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })} · {p.editorialStatus} — not yet scheduled
              </span>
            </span>
          ))}
        </section>
      ))}
      {[...buckets.entries()].map(([day, rows]) => (
        <section key={day} className="stu-daygroup">
          <div className="stu-mlabel">{day} · recent work</div>
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

/* ── Brands place (plan §7) ── */

type BrandsPayload = {
  brands: Array<{ brandId: string; name: string; acceptedAt: string | null; updatedAt: string; connections: Array<{ platform: string; displayName: string | null }> }>;
};

export function BrandsPlace() {
  const REAL = studioRealTurnsEnabled;
  const [data, setData] = useState<BrandsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!REAL) return;
    fetch("/api/studio/brands")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: BrandsPayload) => setData(d))
      .catch((e: Error) => setError(e.message));
  }, [REAL]);

  const brands = REAL ? (data?.brands ?? []) : MOCK_BRANDS.map((b) => ({ brandId: b.id, name: b.name, acceptedAt: null, updatedAt: new Date().toISOString(), connections: [] }));

  return (
    <PlaceFrame
      crumb="Brands"
      title="Brands"
      sub="accepted Brand Vault profiles and their connected accounts — brand truth lives in the vault, changes are made there"
    >
      {error && <p className="stu-placeerror">couldn&apos;t load brands ({error}) — showing nothing rather than faking it</p>}
      {!error && !REAL && <p className="stu-placemock">demo data — real brands appear when STUDIO_REAL_TURNS is on</p>}
      {brands.map((b) => (
        <section key={b.brandId} className="stu-daygroup">
          <div className="stu-brandcard">
            <div className="stu-brandrow">
              <span className="stu-daytitle">{b.name}</span>
              <span className="stu-daysub">{b.acceptedAt ? `vault accepted ${dayBucket(b.acceptedAt)}` : "accepted profile"}</span>
            </div>
            <div className="stu-brandconn">
              {b.connections.length === 0 ? (
                <span className="stu-needssub">no connected accounts assigned yet</span>
              ) : (
                b.connections.map((c) => (
                  <span key={`${b.brandId}_${c.platform}`} className="stu-chip">
                    {c.platform}
                    {c.displayName ? ` · ${c.displayName}` : ""}
                  </span>
                ))
              )}
            </div>
            {REAL && <BrandProfileEditor brandId={b.brandId} />}
          </div>
        </section>
      ))}
      {brands.length === 0 && !error && <p className="stu-placeempty">no brands yet — accept a scan from the Brand Vault to create one</p>}
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

/* §17 Phase 9: the brand's OWNED public profile, edited right in the Brands
 * place (vault-scope auth on the route). The public page is the existing
 * /profile/<username>; the QR is generated client-side from the real URL —
 * loading/error states honest, download is a plain file. */
import QRCode from "qrcode";

function BrandProfileEditor({ brandId }: { brandId: string }) {
  type Profile = { username: string; bio: string; status: string; accentColor: string; links: Array<{ platform: string; url: string; title?: string }> };
  const [profile, setProfile] = useState<Profile | null>(null);
  const [missing, setMissing] = useState(false);
  const [form, setForm] = useState({ username: "", bio: "", status: "", accentColor: "gold" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/studio/brands/${brandId}/profile`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { profile: Profile | null }) => {
        if (cancelled) return;
        if (d.profile) {
          setProfile(d.profile);
          setForm({ username: d.profile.username, bio: d.profile.bio ?? "", status: d.profile.status ?? "", accentColor: d.profile.accentColor ?? "gold" });
        } else {
          setMissing(true);
        }
      })
      .catch(() => setMsg("couldn't load the profile"));
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  useEffect(() => {
    if (!profile?.username) return;
    setQr(null);
    setQrError(null);
    QRCode.toDataURL(`${typeof window === "undefined" ? "" : window.location.origin}/profile/${profile.username}`)
      .then((url) => setQr(url))
      .catch(() => setQrError("QR generation failed — the link still works"));
  }, [profile?.username]);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/studio/brands/${brandId}/profile`, {
        method: "PUT",
        headers: { "content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = (await res.json().catch(() => null)) as { profile?: Profile; error?: string } | null;
      if (!res.ok || !d?.profile) {
        setMsg(d?.error === "username_taken" ? "that username is taken" : d?.error === "invalid_username" ? "3–30 chars: lowercase letters, digits, dashes" : `save failed (${res.status})`);
        return;
      }
      setProfile(d.profile);
      setMissing(false);
      setMsg("saved — the public page is live");
    } catch {
      setMsg("network — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stu-brandprofile" style={{ marginTop: 10 }}>
      <div className="stu-mlabel" style={{ marginBottom: 6 }}>public page</div>
      {profile ? (
        <div className="stu-chips">
          <a className="stu-chip" href={`/profile/${profile.username}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
            /profile/{profile.username} ↗
          </a>
        </div>
      ) : (
        <div className="stu-needssub" style={{ marginBottom: 6 }}>{missing ? "no public page yet — claim a username below" : "…"}</div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
        <input className="stu-placeinput" style={{ flex: "1 1 120px" }} placeholder="username (lowercase)" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })} />
        <input className="stu-placeinput" style={{ flex: "2 1 180px" }} placeholder="status — one line" maxLength={50} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
      </div>
      <textarea className="stu-placeinput" style={{ width: "100%", marginTop: 6, minHeight: 48, resize: "vertical" }} placeholder="bio — what this brand posts" maxLength={256} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
      <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select className="stu-placeinput" value={form.accentColor} onChange={(e) => setForm({ ...form, accentColor: e.target.value })}>
          {["gold", "cyan", "rose", "green", "purple", "coral"].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button className="stu-btn" onClick={() => void save()} disabled={busy}>
          {busy ? "saving…" : profile ? "save changes" : "create public page"}
        </button>
        {msg && <span className="stu-needssub">{msg}</span>}
      </div>
      {profile?.username && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          {qr && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated client-side */}
              <img src={qr} alt={`QR for /profile/${profile.username}`} style={{ width: 72, height: 72, borderRadius: 8 }} />
              <a className="stu-btn" href={qr} download={`insturix-${profile.username}-qr.png`}>download QR</a>
            </>
          )}
          {qrError && <span className="stu-needssub">{qrError}</span>}
          {!qr && !qrError && <span className="stu-needssub">generating QR…</span>}
        </div>
      )}
    </div>
  );
}
