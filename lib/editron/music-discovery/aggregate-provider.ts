import {
  MusicDiscoveryProviderError,
  musicDiscoverySearchQuerySchema,
  type MusicDiscoveryAction,
  type MusicDiscoveryIdentity,
  type MusicDiscoveryProvider,
  type MusicDiscoveryProviderErrorCode,
  type MusicDiscoveryProviderFailure,
  type MusicDiscoveryProviderName,
  type MusicDiscoverySearchQuery,
  type MusicDiscoverySearchResult,
  type MusicDiscoverySource,
  type MusicTrendEvidence,
} from './types';

interface RankedIdentity {
  identity: MusicDiscoveryIdentity;
  providerOrder: number;
  resultOrder: number;
  flatOrder: number;
}

const DISPLAY_PROVIDER_PRIORITY: Record<MusicDiscoveryProviderName, number> = {
  'apple-music': 0,
  musicbrainz: 1,
  spotify: 2,
  youtube: 3,
  'epidemic-sound': 4,
  soundstripe: 5,
};

const ACTION_ORDER: MusicDiscoveryAction[] = [
  'official-preview',
  'provider-link-out',
  'supply-reference-audio',
  'add-on-platform',
  'ingest-export-cleared',
];

export class MusicDiscoveryAggregateError extends MusicDiscoveryProviderError {
  constructor(
    code: MusicDiscoveryProviderErrorCode,
    message: string,
    readonly failures: MusicDiscoveryProviderFailure[],
    retryAfterSeconds?: number,
  ) {
    super(code, message, undefined, retryAfterSeconds);
    this.name = 'MusicDiscoveryAggregateError';
  }
}

export class MusicDiscoveryAggregator {
  constructor(private readonly providers: readonly MusicDiscoveryProvider[]) {}

  async search(input: MusicDiscoverySearchQuery): Promise<MusicDiscoverySearchResult> {
    const parsed = musicDiscoverySearchQuerySchema.safeParse(input);
    if (!parsed.success) {
      throw new MusicDiscoveryProviderError(
        'INVALID_QUERY',
        'The music discovery query is invalid',
        undefined,
        undefined,
        { cause: parsed.error },
      );
    }

    const query = parsed.data;
    const activeProviders = this.providers.filter((provider) => provider.available());
    if (activeProviders.length === 0) {
      throw new MusicDiscoveryProviderError(
        'NOT_CONFIGURED',
        'No music discovery providers are configured',
      );
    }

    const settled = await Promise.allSettled(
      activeProviders.map((provider) => provider.search(query)),
    );
    const successfulProviders: MusicDiscoveryProviderName[] = [];
    const failures: MusicDiscoveryProviderFailure[] = [];
    const ranked: RankedIdentity[] = [];

    settled.forEach((result, providerOrder) => {
      const provider = activeProviders[providerOrder];
      if (!provider) return;
      if (result.status === 'rejected') {
        failures.push(toFailure(provider.name, result.reason));
        return;
      }

      successfulProviders.push(provider.name);
      result.value.forEach((identity, resultOrder) => {
        ranked.push({
          identity,
          providerOrder,
          resultOrder,
          flatOrder: ranked.length,
        });
      });
    });

    if (successfulProviders.length === 0) {
      throw aggregateFailure(failures);
    }

    return {
      providers: successfulProviders,
      identities: mergeIdentities(ranked).slice(0, query.limit),
      query,
      failures,
    };
  }
}

function mergeIdentities(entries: RankedIdentity[]): MusicDiscoveryIdentity[] {
  const parents = entries.map((_, index) => index);
  const groupIsrcs = entries.map(({ identity }) => new Set(
    identity.isrcs.map(normalizeIsrc).filter(isString),
  ));
  const root = (index: number): number => {
    let cursor = index;
    while (parents[cursor] !== cursor) {
      parents[cursor] = parents[parents[cursor] ?? cursor] ?? cursor;
      cursor = parents[cursor] ?? cursor;
    }
    return cursor;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = root(left);
    const rightRoot = root(right);
    if (leftRoot === rightRoot) return;
    const leftIsrcs = groupIsrcs[leftRoot] ?? new Set<string>();
    const rightIsrcs = groupIsrcs[rightRoot] ?? new Set<string>();
    if (
      leftIsrcs.size > 0
      && rightIsrcs.size > 0
      && ![...rightIsrcs].some((isrc) => leftIsrcs.has(isrc))
    ) return;

    parents[rightRoot] = leftRoot;
    groupIsrcs[leftRoot] = new Set([...leftIsrcs, ...rightIsrcs]);
  };

  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const leftIdentity = entries[left]?.identity;
      const rightIdentity = entries[right]?.identity;
      if (leftIdentity && rightIdentity && identitiesMatch(leftIdentity, rightIdentity)) {
        union(left, right);
      }
    }
  }

  const groups = new Map<number, RankedIdentity[]>();
  entries.forEach((entry, index) => {
    const key = root(index);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });

  return [...groups.values()]
    .sort((left, right) => minimumFlatOrder(left) - minimumFlatOrder(right))
    .map(mergeGroup);
}

function identitiesMatch(
  left: MusicDiscoveryIdentity,
  right: MusicDiscoveryIdentity,
): boolean {
  const leftIsrcs = new Set(left.isrcs.map(normalizeIsrc).filter(isString));
  const rightIsrcs = new Set(right.isrcs.map(normalizeIsrc).filter(isString));
  if ([...rightIsrcs].some((isrc) => leftIsrcs.has(isrc))) return true;
  if (leftIsrcs.size > 0 && rightIsrcs.size > 0) return false;

  if (normalizeTitle(left.title) !== normalizeTitle(right.title)) return false;
  if (left.durationMs === null || right.durationMs === null) return false;
  if (Math.abs(left.durationMs - right.durationMs) > 2_000) return false;

  const leftArtists = new Set(left.artists.map(normalizeText).filter(Boolean));
  return right.artists.some((artist) => leftArtists.has(normalizeText(artist)));
}

function mergeGroup(entries: RankedIdentity[]): MusicDiscoveryIdentity {
  const displayEntries = [...entries].sort(compareDisplayPriority);
  const display = displayEntries[0]?.identity;
  if (!display) throw new Error('Cannot merge an empty music identity group');

  const isrcs = uniqueSorted(entries.flatMap(({ identity }) => identity.isrcs)
    .map(normalizeIsrc)
    .filter(isString));
  const sources = uniqueSources(entries.flatMap(({ identity }) => identity.sources));
  const actions = new Set(entries.flatMap(({ identity }) => identity.actions));
  const identityId = isrcs[0]
    ? `isrc:${isrcs[0]}`
    : preferredProviderIdentityId(entries);
  const canonical = isrcs.length > 0
    || entries.some(({ identity }) => identity.identityConfidence === 'canonical');

  return {
    identityId,
    identityConfidence: canonical
      ? 'canonical'
      : entries.length > 1
        ? 'matched'
        : display.identityConfidence,
    title: display.title,
    artists: firstNonEmpty(displayEntries.map(({ identity }) => identity.artists)) ?? [],
    durationMs: firstDefined(displayEntries.map(({ identity }) => identity.durationMs)),
    artworkUrl: firstDefined(displayEntries.map(({ identity }) => identity.artworkUrl)),
    explicit: mergedExplicit(entries),
    isrcs,
    languages: uniqueSorted(entries.flatMap(({ identity }) => identity.languages)),
    sources,
    trendEvidence: uniqueTrendEvidence(
      entries.flatMap(({ identity }) => identity.trendEvidence),
    ),
    availability: mergedAvailability(entries),
    actions: ACTION_ORDER.filter((action) => actions.has(action)),
  };
}

function compareDisplayPriority(left: RankedIdentity, right: RankedIdentity): number {
  const leftProvider = left.identity.sources[0]?.provider;
  const rightProvider = right.identity.sources[0]?.provider;
  const priority = (leftProvider ? DISPLAY_PROVIDER_PRIORITY[leftProvider] : 99)
    - (rightProvider ? DISPLAY_PROVIDER_PRIORITY[rightProvider] : 99);
  return priority
    || left.providerOrder - right.providerOrder
    || left.resultOrder - right.resultOrder
    || left.identity.identityId.localeCompare(right.identity.identityId);
}

function preferredProviderIdentityId(entries: RankedIdentity[]): string {
  return [...entries].sort(compareDisplayPriority)[0]?.identity.identityId
    ?? 'music-discovery:unknown';
}

function mergedExplicit(entries: RankedIdentity[]): boolean | null {
  const values = entries.map(({ identity }) => identity.explicit);
  if (values.includes(true)) return true;
  if (values.includes(false)) return false;
  return null;
}

function mergedAvailability(entries: RankedIdentity[]): MusicDiscoveryIdentity['availability'] {
  const acquisitions = entries.map(({ identity }) => identity.availability.audioAcquisition);
  if (acquisitions.includes('export-cleared')) {
    return {
      audioAcquisition: 'export-cleared',
      renderEligibility: 'requires-entitlement-and-ingest',
    };
  }
  if (acquisitions.includes('user-supplied-reference')) {
    return {
      audioAcquisition: 'user-supplied-reference',
      renderEligibility: 'requires-user-reference-upload',
    };
  }
  return {
    audioAcquisition: 'not-provided',
    renderEligibility: entries.every(
      ({ identity }) => identity.availability.renderEligibility === 'not-renderable',
    )
      ? 'not-renderable'
      : 'requires-user-reference-upload',
  };
}

function uniqueSources(sources: MusicDiscoverySource[]): MusicDiscoverySource[] {
  const seen = new Set<string>();
  return sources
    .filter((source) => {
      const key = `${source.provider}:${source.providerId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => (
      DISPLAY_PROVIDER_PRIORITY[left.provider] - DISPLAY_PROVIDER_PRIORITY[right.provider]
      || left.providerId.localeCompare(right.providerId)
    ));
}

function uniqueTrendEvidence(evidence: MusicTrendEvidence[]): MusicTrendEvidence[] {
  const seen = new Set<string>();
  return evidence
    .filter((item) => {
      const key = JSON.stringify(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => (
      right.observedAt.localeCompare(left.observedAt)
      || left.source.localeCompare(right.source)
    ));
}

function firstNonEmpty<T>(values: T[][]): T[] | undefined {
  return values.find((value) => value.length > 0);
}

function firstDefined<T>(values: Array<T | null>): T | null {
  return values.find((value): value is T => value !== null) ?? null;
}

function minimumFlatOrder(entries: RankedIdentity[]): number {
  return Math.min(...entries.map((entry) => entry.flatOrder));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function normalizeIsrc(value: string): string | null {
  const normalized = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return /^[A-Z0-9]{12}$/.test(normalized) ? normalized : null;
}

function isString(value: string | null): value is string {
  return value !== null;
}

function normalizeTitle(value: string): string {
  return normalizeText(value.replace(
    /\s*[\[(](?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visuali[sz]er)[\])]\s*/giu,
    ' ',
  ));
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en')
    .replace(/&/g, ' and ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function toFailure(
  provider: MusicDiscoveryProviderName,
  error: unknown,
): MusicDiscoveryProviderFailure {
  if (error instanceof MusicDiscoveryProviderError) {
    return {
      provider,
      code: error.code,
      ...(error.detailCode === undefined ? {} : { detailCode: error.detailCode }),
      message: error.message,
      ...(error.providerStatus === undefined ? {} : { providerStatus: error.providerStatus }),
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    };
  }
  return {
    provider,
    code: 'UPSTREAM_UNAVAILABLE',
    message: `${provider} music discovery failed`,
  };
}

function aggregateFailure(
  failures: MusicDiscoveryProviderFailure[],
): MusicDiscoveryAggregateError {
  const codes = failures.map((failure) => failure.code);
  const code: MusicDiscoveryProviderErrorCode = codes.every(
    (candidate) => candidate === 'UPSTREAM_RATE_LIMITED',
  )
    ? 'UPSTREAM_RATE_LIMITED'
    : codes.every((candidate) => candidate === 'UPSTREAM_TIMEOUT')
      ? 'UPSTREAM_TIMEOUT'
      : codes.every((candidate) => candidate === 'NOT_CONFIGURED')
        ? 'NOT_CONFIGURED'
        : 'UPSTREAM_UNAVAILABLE';
  const retryAfterSeconds = Math.max(
    0,
    ...failures.flatMap((failure) => (
      failure.retryAfterSeconds === undefined ? [] : [failure.retryAfterSeconds]
    )),
  ) || undefined;
  return new MusicDiscoveryAggregateError(
    code,
    'All configured music discovery providers failed',
    failures,
    retryAfterSeconds,
  );
}
