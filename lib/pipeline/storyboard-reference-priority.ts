type SceneReferenceIntent = {
  logo: boolean;
};

export type StoryboardReferencePriorityInput = {
  subjectId?: string;
  name?: string;
  category?: string;
  visualDescription?: string;
  imageUrl?: string;
  source?: string;
  referenceProvenance?: string;
  requiresBrandEvidence?: boolean;
  brandEvidenceStatus?: string;
  weight?: number;
};

const LOGO_CUES = [
  'logo',
  'logomark',
  'wordmark',
  'brandmark',
  'brand mark',
  'brand signature',
  'brand emblem',
];

function normalize(value: unknown): string {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
    : '';
}

function containsCue(text: string, cue: string): boolean {
  const normalizedCue = normalize(cue);
  return normalizedCue.length > 0 && ` ${text} `.includes(` ${normalizedCue} `);
}

function sceneText(scene: unknown): string {
  const source = scene as Record<string, unknown>;
  return normalize([
    source?.title,
    source?.sceneType,
    source?.visualDescription,
    source?.description,
    source?.action,
    source?.cameraNotes,
    source?.motionPrompt,
  ].filter((value) => typeof value === 'string').join(' '));
}

function referenceText(reference: StoryboardReferencePriorityInput): string {
  return normalize([
    reference.name,
    reference.category,
    reference.visualDescription,
    reference.source,
    reference.referenceProvenance,
  ].filter(Boolean).join(' '));
}

function getSceneReferenceIntent(scene: unknown): SceneReferenceIntent {
  const text = sceneText(scene);
  return {
    logo: LOGO_CUES.some((cue) => containsCue(text, cue)),
  };
}

export function isLogoReference(reference: StoryboardReferencePriorityInput): boolean {
  const category = normalize(reference.category);
  if (category === 'logo') return true;
  const text = referenceText(reference);
  return LOGO_CUES.some((cue) => containsCue(text, cue));
}

function referencePriorityScore(
  reference: StoryboardReferencePriorityInput,
  intent: SceneReferenceIntent,
): number {
  let score = 0;
  const provenance = normalize(reference.referenceProvenance);
  const source = normalize(reference.source);
  const logoRef = isLogoReference(reference);

  if (intent.logo && logoRef) score += 1080;

  const scoreEvidenceMetadata = !logoRef || intent.logo;
  if (scoreEvidenceMetadata && (provenance === 'uploaded' || source === 'user upload')) score += 60;
  if (scoreEvidenceMetadata && (provenance === 'brand vault' || source === 'brand vault logo')) score += 50;
  if (scoreEvidenceMetadata && (reference.requiresBrandEvidence || reference.brandEvidenceStatus === 'resolved')) score += 30;
  if (!logoRef && normalize(reference.category) === 'product') score += 20;

  return score;
}

export function prioritizeStoryboardReferencesForScene<T extends StoryboardReferencePriorityInput>(
  scene: unknown,
  references: T[],
): T[] {
  const intent = getSceneReferenceIntent(scene);
  return references
    .map((reference, index) => ({
      reference,
      index,
      score: referencePriorityScore(reference, intent),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.reference);
}

export function hasStrictLogoReferenceForScene(
  scene: unknown,
  references: StoryboardReferencePriorityInput[],
): boolean {
  const intent = getSceneReferenceIntent(scene);
  return Boolean(intent.logo && references.some(isLogoReference));
}