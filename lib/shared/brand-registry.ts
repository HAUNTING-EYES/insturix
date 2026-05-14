/**
 * Brand Registry — Read-Only Unified View
 *
 * Merges ThinkForge BrandDNA (voice, content preferences) with
 * Editron Brand (visual identity) into a single UnifiedBrand view.
 *
 * Does NOT persist data — reads from both databases and merges on demand.
 * ThinkForge uses Mongoose (thinkforge_db), Editron uses native MongoDB driver.
 *
 * Why registry, not merge: different databases, different schemas,
 * different technologies. Migration would break production data.
 */

import { getUserBrandDNA, type BrandDNA } from '@/lib/thinkforge/services/db';
import { getDatabase } from '@/lib/editron/db/mongodb';

// ==================== Types ====================

export interface UnifiedBrand {
  brandId: string;
  userId: string;
  name: string;
  voice: {
    voiceLock?: string;
    nicheMap?: string;
    killList: string[];
    hookArchetypes: string[];
    structuralHabits: string[];
  };
  visual: {
    industry?: string;
    colors: string[];
    visualStyle?: string;
    typography?: string;
  };
  learning: {
    banditProjectCount: number;
    lastLearnedAt?: Date;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

interface EditronBrand {
  brandId: string;
  userId: string;
  name: string;
  industry: string;
  colors: string[];
  voiceDescription: string;
  visualStyle: string;
  typography: string;
  createdAt: Date;
  updatedAt: Date;
}

const BRANDS_COLLECTION = 'brands';

// ==================== Cache ====================

// 5-minute TTL — balances freshness with DB load in serverless
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  data: UnifiedBrand[];
  expiresAt: number;
}

const brandCache = new Map<string, CacheEntry>();

function getCached(userId: string): UnifiedBrand[] | null {
  const entry = brandCache.get(userId);
  if (!entry || Date.now() > entry.expiresAt) {
    brandCache.delete(userId);
    return null;
  }
  return entry.data;
}

function setCache(userId: string, data: UnifiedBrand[]): void {
  brandCache.set(userId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateCache(userId: string): void {
  brandCache.delete(userId);
}

// ==================== Core Functions ====================

export async function getUnifiedBrand(
  userId: string,
  brandId: string,
): Promise<UnifiedBrand | null> {
  try {
    const [editronBrand, brandDNA] = await Promise.all([
      fetchEditronBrand(userId, brandId),
      fetchBrandDNA(userId),
    ]);

    if (!editronBrand) return null;

    return mergeToUnified(editronBrand, brandDNA);
  } catch (error) {
    console.error(`[BrandRegistry] getUnifiedBrand failed for ${brandId}:`, error);
    return null;
  }
}

export async function listUnifiedBrands(userId: string): Promise<UnifiedBrand[]> {
  const cached = getCached(userId);
  if (cached) return cached;

  try {
    const [editronBrands, brandDNA] = await Promise.all([
      fetchEditronBrands(userId),
      fetchBrandDNA(userId),
    ]);

    const unified = editronBrands.map((eb) => mergeToUnified(eb, brandDNA));
    setCache(userId, unified);
    return unified;
  } catch (error) {
    console.error(`[BrandRegistry] listUnifiedBrands failed:`, error);
    return [];
  }
}

export async function getDefaultBrand(userId: string): Promise<UnifiedBrand | null> {
  try {
    const brands = await listUnifiedBrands(userId);
    if (brands.length > 0) {
      return brands.sort((a, b) =>
        (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0),
      )[0];
    }

    const brandDNA = await fetchBrandDNA(userId);
    if (!brandDNA || (!brandDNA.voiceLock && !brandDNA.nicheMap)) {
      return null;
    }

    return {
      brandId: `default_${userId}`,
      userId,
      name: 'Default Brand',
      voice: {
        voiceLock: brandDNA.voiceLock,
        nicheMap: brandDNA.nicheMap,
        killList: brandDNA.killList || [],
        hookArchetypes: brandDNA.hookArchetypes || [],
        structuralHabits: brandDNA.structuralHabits || [],
      },
      visual: {
        industry: undefined,
        colors: [],
        visualStyle: undefined,
        typography: undefined,
      },
      learning: {
        banditProjectCount: 0,
      },
    };
  } catch (error) {
    console.error(`[BrandRegistry] getDefaultBrand failed:`, error);
    return null;
  }
}

// ==================== Data Fetchers ====================

async function fetchEditronBrand(
  userId: string,
  brandId: string,
): Promise<EditronBrand | null> {
  try {
    const db = await getDatabase();
    return await db
      .collection(BRANDS_COLLECTION)
      .findOne({ brandId, userId }) as unknown as EditronBrand | null;
  } catch (error) {
    console.warn('[BrandRegistry] Editron brand fetch failed:', error);
    return null;
  }
}

async function fetchEditronBrands(userId: string): Promise<EditronBrand[]> {
  try {
    const db = await getDatabase();
    return await db
      .collection(BRANDS_COLLECTION)
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray() as unknown as EditronBrand[];
  } catch (error) {
    console.warn('[BrandRegistry] Editron brands list failed:', error);
    return [];
  }
}

async function fetchBrandDNA(userId: string): Promise<BrandDNA | null> {
  try {
    return await getUserBrandDNA(userId);
  } catch (error) {
    console.warn('[BrandRegistry] ThinkForge BrandDNA fetch failed:', error);
    return null;
  }
}

// ==================== Merge Logic ====================

function mergeToUnified(
  editron: EditronBrand,
  dna: BrandDNA | null,
): UnifiedBrand {
  return {
    brandId: editron.brandId,
    userId: editron.userId,
    name: editron.name,
    voice: {
      voiceLock: dna?.voiceLock,
      nicheMap: dna?.nicheMap,
      killList: dna?.killList || [],
      hookArchetypes: dna?.hookArchetypes || [],
      structuralHabits: dna?.structuralHabits || [],
    },
    visual: {
      industry: editron.industry,
      colors: editron.colors || [],
      visualStyle: editron.visualStyle,
      typography: editron.typography,
    },
    learning: {
      banditProjectCount: 0,
      lastLearnedAt: undefined,
    },
    createdAt: editron.createdAt,
    updatedAt: editron.updatedAt,
  };
}
