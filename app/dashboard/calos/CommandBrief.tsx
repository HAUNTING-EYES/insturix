'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { startOfWeek, endOfWeek } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Command shell — the anticipatory band above the calendar grid. Greets the user, surfaces what
 * needs them (cards awaiting review, with inline Approve / Changes), and shows active campaigns with
 * progress. Reads the SAME cards the calendar already loaded (no extra deliverables fetch) so the
 * numbers can never disagree with the grid. Collapsible (remembered) so power users can hide it.
 */

interface BriefCard {
  id: string;
  title: string;
  platform?: string;
  plannedDates?: string[];
  date?: string;
  campaignId?: string;
  editorialStatus?: string;
}

interface CampaignLite {
  _id: string;
  name: string;
  objective?: string;
}

const REVIEWABLE = ['generated', 'in_review', 'changes_requested'];
const LS_COLLAPSED = 'calos_brief_collapsed';

// Platform -> dot color (warm-editorial). ponytail: mirrors the campaign workspace's map; extract to
// a shared util if a third consumer appears.
const PLATFORM_DOT: Record<string, string> = {
  instagram: '#D4A652',
  tiktok: '#5CCCB8',
  linkedin: '#6FA8DC',
  youtube: '#D46A5C',
  facebook: '#7C9CD0',
  twitter: '#8A867C',
};
const dot = (p?: string) => (p && PLATFORM_DOT[p]) || '#D4A652';

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function CommandBrief({
  cards,
  brandId,
  onDecision,
}: {
  cards: BriefCard[];
  brandId: string;
  onDecision: (id: string, decision: 'approved' | 'changes_requested') => void;
}) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignLite[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(LS_COLLAPSED) === '1');
    } catch {
      /* localStorage unavailable — stay expanded */
    }
  }, []);

  const toggle = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(LS_COLLAPSED, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch(`/api/services/calos/campaigns?brandId=${encodeURIComponent(brandId)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      setCampaigns(
        Array.isArray(data?.campaigns)
          ? data.campaigns.map((c: CampaignLite) => ({ _id: c._id, name: c.name, objective: c.objective }))
          : []
      );
    } catch {
      setCampaigns([]);
    }
  }, [brandId]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const reviewable = useMemo(
    () => cards.filter((c) => REVIEWABLE.includes(c.editorialStatus || '')),
    [cards]
  );

  const stats = useMemo(() => {
    const ws = startOfWeek(new Date(), { weekStartsOn: 0 });
    const we = endOfWeek(new Date(), { weekStartsOn: 0 });
    const thisWeek = cards.filter((c) => {
      const d = c.plannedDates?.[0] || c.date;
      if (!d) return false;
      const dt = new Date(d);
      return dt >= ws && dt <= we;
    }).length;
    const approved = cards.filter((c) => c.editorialStatus === 'approved').length;
    return { review: reviewable.length, thisWeek, approved };
  }, [cards, reviewable]);

  const progressFor = (cid: string) => {
    const cc = cards.filter((c) => c.campaignId === cid);
    const drafted = cc.filter((c) => c.editorialStatus && c.editorialStatus !== 'idea').length;
    return { total: cc.length, drafted };
  };

  const pill =
    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1]';

  return (
    <div className="border-b border-[#1C1B19]/60 bg-[#0B0B0A] px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-[13px] text-[#ECE9E1]" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            {greeting()}.
          </span>
          <div className="hidden sm:flex items-center gap-2">
            <span className={pill}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#B08CE0]" />
              {stats.review} to review
            </span>
            <span className={pill}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#5CCCB8]" />
              {stats.thisWeek} this week
            </span>
            <span className={pill}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#5DCAA5]" />
              {stats.approved} approved
            </span>
          </div>
        </div>
        <button
          onClick={toggle}
          aria-label={collapsed ? 'Expand brief' : 'Collapse brief'}
          className="shrink-0 text-[#7A776E] hover:text-[#ECE9E1] p-1"
        >
          {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-2.5 space-y-2.5">
          {reviewable.length > 0 ? (
            <div>
              <div className="text-[10px] text-[#7A776E] uppercase tracking-wide mb-1.5">Needs you now</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {reviewable.slice(0, 8).map((c) => (
                  <div
                    key={c.id}
                    className="shrink-0 flex items-center gap-2.5 rounded-lg border border-[#1C1B19] bg-[#0F0F0E] pl-2.5 pr-2 py-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: dot(c.platform) }} />
                    <span className="text-[12px] text-[#ECE9E1] max-w-[180px] truncate">{c.title}</span>
                    <button
                      onClick={() => onDecision(c.id, 'approved')}
                      className="text-[10.5px] font-medium rounded-md px-2 py-1 bg-[#5DCAA5]/15 border border-[#5DCAA5]/40 text-[#5DCAA5] hover:bg-[#5DCAA5]/25"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => onDecision(c.id, 'changes_requested')}
                      className="text-[10.5px] rounded-md px-2 py-1 border border-[#1C1B19] text-[#B8B4A8] hover:bg-[#1C1B19]/60"
                    >
                      Changes
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-[#7A776E]">You&apos;re all caught up. Nothing waiting on review.</div>
          )}

          {campaigns.length > 0 && (
            <div>
              <div className="text-[10px] text-[#7A776E] uppercase tracking-wide mb-1.5">Campaigns</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {campaigns.map((c) => {
                  const p = progressFor(c._id);
                  const pct = p.total > 0 ? Math.round((p.drafted / p.total) * 100) : 0;
                  return (
                    <button
                      key={c._id}
                      onClick={() =>
                        router.push(
                          `/dashboard/calos/campaigns/${encodeURIComponent(c._id)}?brandId=${encodeURIComponent(brandId)}`
                        )
                      }
                      className="shrink-0 text-left w-44 rounded-lg border border-[#1C1B19] bg-[#0F0F0E] px-3 py-2 hover:bg-[#1C1B19]/40"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] text-[#ECE9E1] truncate">{c.name}</span>
                        {c.objective && <span className="text-[9.5px] text-[#7A776E] capitalize shrink-0">{c.objective}</span>}
                      </div>
                      <div className="text-[10px] text-[#7A776E] mt-1">
                        {p.total === 0 ? 'No content yet' : `${p.drafted} of ${p.total} drafted`}
                      </div>
                      <div className="h-1 rounded-full bg-[#1C1B19] overflow-hidden mt-1.5">
                        <span className="block h-full bg-[#D4A652]" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
