import {
  verifyClientViewToken,
  loadSharedCalendar,
  type SharedCalendarCard,
} from "@/lib/calos/client-view";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ token: string }> };

// Public, client-facing labels for the editorial state machine (decoupled from the dashboard's
// internal meta on purpose — the agency's client sees a plain status, not our internal vocabulary).
const STATUS_LABEL: Record<string, string> = {
  idea: "Idea",
  drafting: "In progress",
  generated: "Draft ready",
  in_review: "In review",
  approved: "Approved",
  changes_requested: "Changes requested",
};

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(iso: string | undefined): string {
  if (!iso) return "Unscheduled";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Unscheduled" : DATE_FMT.format(d);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-[#0B0B0A] text-[#ECE9E1]">
      <div className="mx-auto max-w-2xl px-5 py-10">{children}</div>
    </div>
  );
}

export default async function SharedCalendarPage({ params }: PageProps) {
  const { token } = await params;
  const scope = verifyClientViewToken(token);

  if (!scope) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold">Content Calendar</h1>
        <p className="mt-3 text-sm text-[#7A776E]">
          This share link is invalid or has expired. Ask whoever shared it for a fresh link.
        </p>
      </Shell>
    );
  }

  let cards: SharedCalendarCard[] = [];
  let loadFailed = false;
  try {
    cards = await loadSharedCalendar(scope);
  } catch (e) {
    // Fail honest (R18N): show an explicit error state rather than a blank page that reads as "empty".
    console.error("[CALOS_LOUD] shared calendar load failed:", e);
    loadFailed = true;
  }

  // Group by first planned date (cards arrive pre-sorted by that date).
  const groups = new Map<string, SharedCalendarCard[]>();
  for (const c of cards) {
    const key = c.plannedDates[0] ? c.plannedDates[0].slice(0, 10) : "unscheduled";
    const arr = groups.get(key) ?? [];
    arr.push(c);
    groups.set(key, arr);
  }

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Content Calendar</h1>
        <span className="rounded-full border border-[#1C1B19] px-2.5 py-1 text-[10px] uppercase tracking-wide text-[#7A776E]">
          Shared · read-only
        </span>
      </div>

      {loadFailed ? (
        <p className="mt-6 text-sm text-[#C77]">
          We couldn&apos;t load this calendar right now. Please try again shortly.
        </p>
      ) : cards.length === 0 ? (
        <p className="mt-6 text-sm text-[#7A776E]">No content is scheduled yet. Check back soon.</p>
      ) : (
        <div className="mt-8 space-y-8">
          {Array.from(groups.entries()).map(([key, group]) => (
            <section key={key}>
              <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-[#7A776E]">
                {key === "unscheduled" ? "Unscheduled" : formatDate(group[0].plannedDates[0])}
              </h2>
              <ul className="space-y-2.5">
                {group.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-[#1C1B19] bg-[#0F0F0E] px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-[#ECE9E1]">{c.title}</p>
                      <span className="shrink-0 rounded-md bg-[#1C1B19] px-2 py-0.5 text-[10px] text-[#B8B4A8]">
                        {STATUS_LABEL[c.editorialStatus] ?? c.editorialStatus}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#7A776E]">
                      <span className="capitalize">{c.platform}</span>
                      {c.contentFormat && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{c.contentFormat}</span>
                        </>
                      )}
                    </div>
                    {c.scriptPreview && (
                      <p className="mt-2 text-xs leading-relaxed text-[#B8B4A8]">
                        {c.scriptPreview.length > 160
                          ? `${c.scriptPreview.slice(0, 160)}…`
                          : c.scriptPreview}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Shell>
  );
}
