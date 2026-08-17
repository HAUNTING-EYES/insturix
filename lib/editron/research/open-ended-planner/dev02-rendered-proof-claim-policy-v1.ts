type JsonRecord = Record<string, unknown>;

export interface Dev02RenderedProofClaimBindingsV1 {
  settledGeometry: readonly string[];
  titleForm: readonly string[];
  opposedMotion: readonly string[];
  phaseStructure: readonly string[];
  fullCanvasRelease: readonly string[];
  boundaryContinuity: readonly string[];
}

export function resolveDev02RenderedProofClaimBindingsV1(input: {
  expectedMeasurementRefs: readonly string[];
  referenceBlueprint: unknown;
}): Readonly<Dev02RenderedProofClaimBindingsV1> {
  const expected = new Set(input.expectedMeasurementRefs);
  const claims = records(record(input.referenceBlueprint).targetClaims)
    .filter((claim) => expected.has(text(claim.claimId)));
  const missing: string[] = [];

  const panelLayout = first(claims, (claim) => {
    const kind = normalizedKind(claim); const value = serialized(claim);
    return kind === 'SETTLED_PANEL_COUNT'
      || ((kind === 'MOSAIC_GRID_LAYOUT' || kind === 'HELD_LAYOUT_STRUCTURE')
        && (strings(claim.subjects).length === 5
          || /\b(?:five|5)\b[^\n]{0,60}panels?|panels?[^\n]{0,60}\b(?:five|5)\b/i.test(value)));
  }, 'FIVE_PANEL_LAYOUT', missing);
  const blackGutters = first(claims, (claim) => {
    const kind = normalizedKind(claim);
    return (kind === 'PANEL_SEPARATION' || kind === 'MOSAIC_GRID_LAYOUT'
      || kind === 'NEGATIVE_SPACE_TREATMENT')
      && /black[^\n]{0,80}gutter|gutter[^\n]{0,80}black/i.test(serialized(claim));
  }, 'BLACK_GUTTERS', missing);

  const legacyTitle = claims.find((claim) => normalizedKind(claim) === 'REFERENCE_TITLE_FORM'
    && /yellow/i.test(serialized(claim)) && /two.?line/i.test(serialized(claim)));
  const titleCentre = legacyTitle ?? first(claims, (claim) => /TITLE_(HORIZONTAL_)?CENT|TITLE_PLACEMENT/.test(normalizedKind(claim)), 'TITLE_CENTRED', missing);
  const titleShape = legacyTitle ?? first(claims, (claim) => {
    const kind = normalizedKind(claim); const value = serialized(claim);
    return /TITLE.*TWO.*LINE|TWO.*LINE.*TITLE/.test(kind)
      || (kind === 'TITLE_BAND_STRUCTURE_AND_COLOUR'
        && /\b(?:two|2)\b[^\n]{0,60}bands?|bands?[^\n]{0,60}\b(?:two|2)\b/i.test(value));
  }, 'TITLE_TWO_LINE', missing);
  const titleYellow = legacyTitle ?? first(claims, (claim) => {
    const kind = normalizedKind(claim);
    return /TITLE.*(?:COLOU?R|YELLOW|TREATMENT)|COLOU?R.*TITLE/.test(kind)
      && /yellow/i.test(serialized(claim));
  }, 'TITLE_YELLOW', missing);

  const opposedMotion = first(claims, (claim) => {
    const kind = normalizedKind(claim); const value = serialized(claim);
    return (kind === 'RELATIONAL_PANEL_MOTION' || /OPPOSED.*MOTION|PANEL.*(MOTION|DIRECTION)/.test(kind))
      && /cent(?:er|re)/i.test(value) && /side/i.test(value)
      && /(rise|rises|upward|moves? up)/i.test(value) && /(descend|descends|downward|moves? down)/i.test(value);
  }, 'OPPOSED_PANEL_MOTION', missing);

  const takeover = first(claims, (claim) => {
    const kind = normalizedKind(claim); const value = serialized(claim);
    return /CENT(?:ER|RE)(?:_PANEL)?_TAKEOVER/.test(kind)
      || (kind === 'CENTER_PANEL_EXIT_STATE'
        && /CONTINUES_INTO/.test(value)
        && /entire frame|full[- ]?frame|fills? (?:the )?frame/i.test(value));
  }, 'CENTRE_PANEL_TAKEOVER', missing);
  const legacyProgression = claims.find((claim) => normalizedKind(claim) === 'REFERENCE_TEMPORAL_PROGRESSION');
  const build = legacyProgression ?? first(claims, (claim) => /ENTRANCE_COMPLETION|PANEL_BUILD|LAYOUT_BUILD_TIMING/.test(normalizedKind(claim)), 'BUILD_PHASE', missing);
  const hold = legacyProgression ?? first(claims, (claim) => /HOLD_STATIC|LAYOUT_HOLD/.test(normalizedKind(claim)), 'HOLD_PHASE', missing);

  if (missing.length) {
    throw new Error(`DEV02_RENDERED_PROOF_SEMANTIC_CLAIMS_MISSING:${[...new Set(missing)].sort().join(',')}`);
  }
  return Object.freeze({
    settledGeometry: uniqueIds([panelLayout, blackGutters]),
    titleForm: uniqueIds([titleCentre, titleShape, titleYellow]),
    opposedMotion: uniqueIds([opposedMotion]),
    phaseStructure: uniqueIds([build, hold, takeover]),
    fullCanvasRelease: uniqueIds([takeover]),
    boundaryContinuity: uniqueIds([takeover]),
  });
}

function first(claims: JsonRecord[], predicate: (claim: JsonRecord) => boolean, diagnostic: string, missing: string[]): JsonRecord | undefined {
  const claim = claims.find(predicate);
  if (!claim) missing.push(diagnostic);
  return claim;
}
function uniqueIds(claims: Array<JsonRecord | undefined>): readonly string[] {
  return Object.freeze([...new Set(claims.map((claim) => text(claim?.claimId)).filter(Boolean))]);
}
function normalizedKind(claim: JsonRecord): string { return text(claim.claimKind).trim().replace(/[^A-Za-z0-9]+/g, '_').toUpperCase(); }
function serialized(claim: JsonRecord): string { return JSON.stringify(claim); }
function record(value: unknown): JsonRecord { return value != null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.map(record) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
