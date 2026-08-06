/**
 * Phase 7 (brief §8): HOUSE TASTE BANK — a versioned exemplar registry with a DETERMINISTIC metadata
 * filter+ranker (no retrieval infra exists → deterministic first, per §8). Exemplars are taste ANCHORS,
 * never templates; the coder stays free-form. No content-type tags — retrieval keys are local semantic
 * metadata (communicative job, text load, motion energy, taste axes, contract traits).
 *
 * No real founder-approved exemplars are programmatically importable yet → the registry starts EMPTY and
 * every exemplar must carry real provenance (registerTasteExemplar never fabricates).
 */
import type { TasteEvidenceRef } from './taste-schemas';

export const MG_TASTE_BANK_COLLECTION = 'mg_house_taste_bank';

export interface TasteBankExemplar {
  id: string;
  registeredAt: string;
  /** Where this exemplar came from (real asset/render reference — never fabricated). */
  provenance: string;
  summary: string;
  communicativeJob?: string;
  textLoad?: number; // 0..1
  motionEnergy?: number; // 0..1
  tasteAxes?: Record<string, string>;
  contractTraits?: string[];
  /** 'positive' | 'rejected' | 'good-concept-weak-execution' */
  disposition: 'positive' | 'rejected' | 'good-concept-weak-execution';
  rejectionReason?: string;
  renderRef?: string;
  evidence?: TasteEvidenceRef[];
}

export function houseTasteBankEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = (env.MG_HOUSE_TASTE_BANK_ENABLED ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Deterministic metadata ranker (§8): job match (+3), contract-trait overlap (+1.5 each), closeness of
 *  text-load / motion-energy (0..1 each). Positive disposition only. Token-bounded by `limit`. */
export function rankTasteExemplars(
  exemplars: TasteBankExemplar[],
  query: { communicativeJob?: string; textLoad?: number; motionEnergy?: number; contractTraits?: string[] },
  limit = 4,
): TasteBankExemplar[] {
  const traits = new Set((query.contractTraits ?? []).map((t) => t.toLowerCase()));
  return exemplars
    .filter((e) => e.disposition === 'positive')
    .map((e) => {
      let score = 0;
      if (query.communicativeJob && e.communicativeJob === query.communicativeJob) score += 3;
      if (e.contractTraits) {
        for (const t of e.contractTraits) if (traits.has(t.toLowerCase())) score += 1.5;
      }
      if (typeof query.textLoad === 'number' && typeof e.textLoad === 'number') score += 1 - Math.abs(query.textLoad - e.textLoad);
      if (typeof query.motionEnergy === 'number' && typeof e.motionEnergy === 'number') score += 1 - Math.abs(query.motionEnergy - e.motionEnergy);
      return { exemplar: e, score };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.exemplar);
}

/** Register a REAL exemplar (admin/CLI pathway). Never fabricates — `provenance` must reference a real asset. */
export async function registerTasteExemplar(
  deps: { save: (exemplar: TasteBankExemplar) => Promise<void> },
  exemplar: TasteBankExemplar,
): Promise<void> {
  if (!exemplar.provenance.trim()) throw new Error('taste-bank: an exemplar requires real provenance (never fabricate)');
  await deps.save(exemplar);
}
