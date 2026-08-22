'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, addDays, startOfDay } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { proposeCadenceCards } from '@/lib/calos/cadence';
import { intentBriefFor, type CalosObjective } from '@/lib/calos/campaign-intent';
import { stageMeta } from '@/lib/calos/stages';
import { type Period, PERIOD_LABELS, periodRange } from '../../period';
import CadenceEditor, { type CadenceRule } from '../../CadenceEditor';
import TrendMarketSelector, {
  LOCAL_TREND_MARKET,
  useResolvedTrendLocation,
} from '../../TrendMarketSelector';

const LS_SELECTED_BRAND = 'calos_selected_brand';
const DEFAULT_BRAND = 'default';

interface Campaign {
  _id: string;
  name: string;
  objective?: CalosObjective;
  theme?: string;
  cadenceRules: CadenceRule[];
}

// Only the fields the workspace reads. The deliverables API returns toContentCard(doc), which carries
// editorialStatus + campaignId + trendContext — typed locally so the page doesn't couple to the
// broader ThinkForge ContentCard type.
interface WorkspaceCard {
  id: string;
  title: string;
  platform?: string;
  plannedDates?: string[];
  date?: string;
  campaignId?: string;
  editorialStatus?: string;
  contentFormat?: string;
  trendContext?: { title?: string; status?: string };
}

const PREVIEW_DAYS = 14; // two weeks of cadence preview ← enough to read the rhythm without scrolling

// Platform -> dot color, reusing the warm-editorial palette. Unknown platforms fall back to gold.
const PLATFORM_DOT: Record<string, string> = {
  instagram: '#D4A652',
  tiktok: '#5CCCB8',
  linkedin: '#6FA8DC',
  youtube: '#D46A5C',
  facebook: '#7C9CD0',
  twitter: '#8A867C',
};
function platformDot(p?: string): string {
  return (p && PLATFORM_DOT[p]) || '#D4A652';
}

export default function CampaignWorkspacePage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const campaignId = params?.id ?? '';

  const [brandId, setBrandId] = useState<string | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [cards, setCards] = useState<WorkspaceCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [period, setPeriod] = useState<Period>('next_30_days');
  const [trendMarket, setTrendMarket] = useState(LOCAL_TREND_MARKET);
  const { trendLocation, isLoading: trendLocationLoading } = useResolvedTrendLocation(trendMarket);
  const [pending, setPending] = useState<'' | 'auto' | 'ai'>('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [discovered, setDiscovered] = useState<
    { title: string; summary?: string; url?: string; platform?: string }[] | null
  >(null);
  const [trendsBusy, setTrendsBusy] = useState(false);

  // brandId: query param wins (the "Open" link passes it), else the calendar's last selection.
  useEffect(() => {
    const fromQuery = search.get('brandId');
    if (fromQuery) {
      setBrandId(fromQuery);
      return;
    }
    try {
      setBrandId(localStorage.getItem(LS_SELECTED_BRAND) || DEFAULT_BRAND);
    } catch {
      setBrandId(DEFAULT_BRAND);
    }
  }, [search]);

  const load = useCallback(async () => {
    if (!brandId || !campaignId) return;
    setLoading(true);
    try {
      const [cRes, dRes] = await Promise.all([
        fetch(`/api/services/calos/campaigns?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' }),
        fetch(`/api/services/calos/deliverables?brandId=${encodeURIComponent(brandId)}`, { cache: 'no-store' }),
      ]);
      const cData = await cRes.json().catch(() => ({}));
      const found: Campaign | undefined = Array.isArray(cData?.campaigns)
        ? cData.campaigns.find((c: Campaign) => c._id === campaignId)
        : undefined;
      if (!found) {
        setNotFound(true);
        setCampaign(null);
        return;
      }
      setNotFound(false);
      setCampaign({
        _id: found._id,
        name: found.name,
        objective: found.objective,
        theme: found.theme,
        cadenceRules: Array.isArray(found.cadenceRules) ? found.cadenceRules : [],
      });
      const dData = await dRes.json().catch(() => ({}));
      const all: WorkspaceCard[] = Array.isArray(dData?.cards) ? dData.cards : [];
      setCards(all.filter((c) => c.campaignId === campaignId));
    } catch {
      // Fail loud to the user; an empty workspace would read as "no campaign" misleadingly.
      toast({ title: 'Could not load the campaign', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [brandId, campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Progress, derived from the deliverables' editorial state (the only truth we have here — publish
  // state lives in the publish queue, not on the deliverable, so there's no fabricated "live" count).
  const progress = useMemo(() => {
    const count = (set: string[]) => cards.filter((c) => set.includes(c.editorialStatus || 'idea')).length;
    return {
      planned: cards.length,
      inProgress: count(['idea', 'drafting']),
      inReview: count(['generated', 'in_review', 'changes_requested']),
      approved: count(['approved']),
    };
  }, [cards]);

  // Cadence preview: where the campaign's rules would land over the next two weeks. Same engine the
  // server uses for auto-fill, so the preview matches what actually gets created.
  const previewByDay = useMemo(() => {
    if (!campaign) return new Map<string, string[]>();
    const from = startOfDay(new Date());
    const to = addDays(from, PREVIEW_DAYS - 1);
    const proposals = proposeCadenceCards(campaign.cadenceRules, { from, to });
    const map = new Map<string, string[]>();
    for (const p of proposals) {
      const key = p.date.slice(0, 10);
      const arr = map.get(key) ?? [];
      arr.push(p.platform);
      map.set(key, arr);
    }
    return map;
  }, [campaign]);

  const previewDays = useMemo(() => {
    const from = startOfDay(new Date());
    return Array.from({ length: PREVIEW_DAYS }, (_, i) => addDays(from, i));
  }, []);

  const trends = useMemo(() => {
    const seen = new Map<string, string>();
    for (const c of cards) {
      const t = c.trendContext?.title?.trim();
      if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
    }
    return Array.from(seen.values()).slice(0, 6);
  }, [cards]);

  // On-demand live trend discovery (the route hits Gemini/Apify, so never auto-fired).
  const findTrends = useCallback(async () => {
    if (!brandId) return;
    setTrendsBusy(true);
    try {
      const params = new URLSearchParams({ brandId });
      if (trendLocation) params.set('location', trendLocation);
      const res = await fetch(`/api/services/calos/trends?${params.toString()}`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      setDiscovered(Array.isArray(data?.trends) ? data.trends : []);
      if (data?.note) toast({ title: data.note });
    } catch {
      setDiscovered([]);
      toast({ title: 'Could not load trends', variant: 'destructive' });
    } finally {
      setTrendsBusy(false);
    }
  }, [brandId, trendLocation]);

  const runFill = useCallback(
    async (kind: 'auto' | 'ai') => {
      if (!brandId) return;
      setPending(kind);
      try {
        const { from, to } = periodRange(period);
        const url = kind === 'auto' ? '/api/services/calos/auto-fill' : '/api/services/calos/ai-plan';
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(kind === 'ai' ? { brandId, campaignId, from, to, trendLocation } : { brandId, campaignId, from, to }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast({
            title: data?.error || `${kind === 'auto' ? 'Auto-fill' : 'AI plan'} failed (${res.status})`,
            description: data?.hint,
            variant: 'destructive',
          });
          return;
        }
        const created = data?.created ?? 0;
        const market =
          kind === 'ai' && typeof data?.trendLocation === 'string' && data.trendLocation
            ? ` - ${data.trendLocation}`
            : '';
        toast({
          title: `${kind === 'auto' ? 'Filled' : 'Drafted'} ${created} card${created === 1 ? '' : 's'}`,
          description: `${PERIOD_LABELS[period]}${market}`,
        });
        await load();
      } catch (err) {
        toast({
          title: 'Something went wrong',
          description: err instanceof Error ? err.message : 'Unknown error',
          variant: 'destructive',
        });
      } finally {
        setPending('');
      }
    },
    [brandId, campaignId, period, trendLocation, load]
  );

  const card = 'bg-[#0F0F0E] border border-[#1C1B19] rounded-xl';
  const selectCls =
    'h-8 min-w-0 bg-[#0F0F0E] border border-[#1C1B19] text-[#ECE9E1] text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#5CCCB8]/40 disabled:opacity-50';
  const controlBtn =
    'inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

  if (loading && !campaign) {
    return (
      <div className="w-full h-full min-h-[60vh] flex items-center justify-center bg-[#0B0B0A] text-[#7A776E] text-sm">
        Loading…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="w-full h-full min-h-[60vh] flex flex-col items-center justify-center gap-3 bg-[#0B0B0A]">
        <p className="text-[#ECE9E1] text-sm">Campaign not found.</p>
        <Link href="/dashboard/calos" className="text-[#5CCCB8] text-xs hover:underline">
          Back to calendar
        </Link>
      </div>
    );
  }

  const busy = pending !== '';
  const waitingForTrendLocation = trendMarket === LOCAL_TREND_MARKET && trendLocationLoading;

  return (
    <div className="w-full min-h-full bg-[#0B0B0A] text-[#ECE9E1]">
      <div className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 border-b border-[#1C1B19]/60 bg-[#0B0B0A]/95 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard/calos')}
            aria-label="Back to calendar"
            className="text-[#7A776E] hover:text-[#ECE9E1] text-sm"
          >
            ←
          </button>
          <h1 className="text-sm font-semibold text-[#ECE9E1]">{campaign?.name}</h1>
          {campaign?.objective && (
            <span className="text-[11px] capitalize rounded-full px-2.5 py-0.5 bg-[#D4A652]/12 border border-[#D4A652]/30 text-[#D4A652]">
              {campaign.objective}
            </span>
          )}
        </div>
        <button
          onClick={() => setEditorOpen(true)}
          className="text-[11px] rounded-lg border border-[#1C1B19] px-2.5 py-1.5 text-[#ECE9E1] hover:bg-[#1C1B19]/60"
        >
          Edit campaign
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-6">
        {campaign?.theme ? (
          <p className="text-sm text-[#B8B4A8] border-l-2 border-[#D4A652] pl-3 leading-relaxed">
            “{campaign.theme}”
          </p>
        ) : (
          <p className="text-xs text-[#7A776E]">No theme set yet. Add one in Edit campaign so the AI plan has a through-line.</p>
        )}
        {campaign?.objective && (
          <p className="text-[11px] text-[#7A776E] leading-relaxed">{intentBriefFor(campaign.objective)}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            { label: 'Planned', value: progress.planned, color: '#ECE9E1' },
            { label: 'In progress', value: progress.inProgress, color: '#D4A652' },
            { label: 'In review', value: progress.inReview, color: '#B08CE0' },
            { label: 'Approved', value: progress.approved, color: '#5DCAA5' },
          ].map((m) => (
            <div key={m.label} className={`${card} px-3.5 py-3`}>
              <div className="text-xl font-medium" style={{ color: m.color }}>
                {m.value}
              </div>
              <div className="text-[10.5px] text-[#7A776E] mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <div className="text-[11px] text-[#7A776E] uppercase tracking-wide mb-2.5">Cadence — next two weeks</div>
            <div className={`${card} p-3`}>
              <div className="grid grid-cols-7 gap-1.5">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <div key={i} className="text-[9px] text-[#7A776E] text-center pb-1">
                    {d}
                  </div>
                ))}
                {/* pad to the weekday the preview starts on so columns line up */}
                {Array.from({ length: previewDays[0].getDay() }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {previewDays.map((d) => {
                  const key = format(d, 'yyyy-MM-dd');
                  const plats = previewByDay.get(key) ?? [];
                  return (
                    <div
                      key={key}
                      className="aspect-square rounded-md border border-[#1C1B19] bg-[#0D0D0C] flex flex-col items-center justify-center relative"
                    >
                      <span className="text-[9px] text-[#56524a]">{format(d, 'd')}</span>
                      {plats.length > 0 && (
                        <div className="flex gap-0.5 mt-0.5">
                          {plats.slice(0, 3).map((p, i) => (
                            <span
                              key={i}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ background: platformDot(p) }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 text-[10px] text-[#7A776E]">
                {campaign && campaign.cadenceRules.length > 0 ? (
                  campaign.cadenceRules.map((r, i) => (
                    <span key={i} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: platformDot(r.platform) }} />
                      <span className="capitalize">{r.platform}</span> {r.perWeek}/wk
                    </span>
                  ))
                ) : (
                  <span>No cadence yet — add platforms in Edit campaign.</span>
                )}
              </div>
            </div>

            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as Period)}
                  disabled={busy}
                  aria-label="Generation period"
                  className={selectCls}
                >
                  {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                    <option key={p} value={p}>
                      {PERIOD_LABELS[p]}
                    </option>
                  ))}
                </select>
                <TrendMarketSelector
                  value={trendMarket}
                  onChange={setTrendMarket}
                  disabled={busy}
                  className={selectCls}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => runFill('ai')}
                  disabled={busy || waitingForTrendLocation}
                  title="Draft on-brand ideas from cadence, brand context, and the selected market trends"
                  className={`${controlBtn} bg-[#D4A652]/15 border-[#D4A652]/40 text-[#D4A652] hover:bg-[#D4A652]/25`}
                >
                  {pending === 'ai' ? 'Working…' : 'AI plan'}
                </button>
                <button
                  onClick={() => runFill('auto')}
                  disabled={busy}
                  title="Create cadence placeholders without using AI"
                  className={`${controlBtn} bg-[#5CCCB8]/12 border-[#5CCCB8]/35 text-[#5CCCB8] hover:bg-[#5CCCB8]/22`}
                >
                  {pending === 'auto' ? 'Working…' : 'Auto-fill'}
                </button>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] text-[#7A776E] uppercase tracking-wide">Content ({cards.length})</span>
              <Link href="/dashboard/calos" className="text-[10.5px] text-[#5CCCB8] hover:underline">
                View on calendar
              </Link>
            </div>
            {cards.length === 0 ? (
              <div className={`${card} px-3.5 py-6 text-center text-[#7A776E] text-xs`}>
                No content yet. Run AI plan for on-brand ideas, or Auto-fill cadence placeholders.
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {cards.map((c) => {
                  const sm = stageMeta(c.editorialStatus);
                  const when = c.plannedDates?.[0] || c.date;
                  return (
                    <div key={c.id} className={`${card} px-3 py-2.5 flex items-center gap-3`}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: platformDot(c.platform) }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-[#ECE9E1] truncate">{c.title}</div>
                        <div className="text-[10.5px] text-[#7A776E] mt-0.5 capitalize">
                          {c.platform || 'generic'}
                          {c.contentFormat ? ` · ${c.contentFormat}` : ''}
                          {when ? ` · ${format(new Date(when), 'MMM d')}` : ''}
                        </div>
                      </div>
                      {sm && (
                        <span className={`text-[10px] rounded-md border px-1.5 py-0.5 shrink-0 ${sm.chip}`}>
                          {sm.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="text-[11px] text-[#7A776E] uppercase tracking-wide">Trends ({trendLocation ?? 'Global'})</span>
                <button
                  onClick={findTrends}
                  disabled={trendsBusy || waitingForTrendLocation}
                  className="inline-flex h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-[#D4A652]/35 bg-[#D4A652]/10 px-2.5 text-[10.5px] font-medium text-[#D4A652] transition-colors hover:bg-[#D4A652]/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {trendsBusy ? 'Finding…' : 'Discover trends'}
                </button>
              </div>
              {discovered && discovered.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {discovered.map((t, i) => (
                    <div key={i} className={`${card} px-3 py-2`}>
                      <div className="text-[12px] text-[#ECE9E1]">{t.title}</div>
                      {t.summary && (
                        <div className="text-[10.5px] text-[#7A776E] mt-0.5 line-clamp-2">{t.summary}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {discovered && discovered.length === 0 && (
                <div className="text-[11px] text-[#7A776E] mb-3">
                  No live trends found for this market. AI plan can still draft from brand context.
                </div>
              )}
              {trends.length > 0 && (
                <>
                  <div className="text-[10px] text-[#7A776E] uppercase tracking-wide mb-1.5">In this campaign</div>
                  <div className="flex flex-wrap gap-1.5">
                    {trends.map((t) => (
                      <span
                        key={t}
                        className="text-[11px] rounded-full px-2.5 py-1 bg-[#0F0F0E] border border-[#1C1B19] text-[#B8B4A8]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {editorOpen && campaign && brandId && (
        <CadenceEditor
          campaignId={campaign._id}
          brandId={brandId}
          campaignName={campaign.name}
          initialRules={campaign.cadenceRules}
          initialObjective={campaign.objective}
          initialTheme={campaign.theme}
          onClose={() => setEditorOpen(false)}
          onSaved={() => {
            setEditorOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}
