import {
  buildSemanticMgCandidateLedger,
  type SemanticMgCandidateLedger,
  type SemanticMgSourceSpan,
} from '@/lib/editron/motion-graphics/engine/semantic-mg-candidates';

interface TimedWord {
  word: string;
  startMs: number;
  endMs: number;
}

interface ExtractMotionGraphicSemanticFactsInput {
  tokens?: TimedWord[];
  text?: string;
  textSources?: Array<{ text: string; source: string }>;
  maxFacts?: number;
}

export interface ExtractedMotionGraphicSemanticFact {
  factKind: string;
  params: Record<string, unknown>;
  sourceSpan: SemanticMgSourceSpan;
  salience: number;
  score: number;
  licensed: boolean;
  ledger: SemanticMgCandidateLedger;
  reasons: string[];
}

interface TextChunk {
  text: string;
  sourceSpan: SemanticMgSourceSpan;
}

interface NumericFact {
  exactText: string;
  value: number;
  index: number;
  endIndex: number;
  kind: 'percent' | 'fraction' | 'ratio' | 'currency' | 'rate' | 'magnitude' | 'number';
  unit?: string;
  denominator?: number;
  bounded?: boolean;
}

const NUMERIC_TOKEN_RE = /[$\u20ac\u00a3\u00a5\u20b9]?\s*(?:\d[\d,]*(?:\.\d+)?(?:\s*[KMBTkmbt])?(?:\s*[%xX\u00d7])?|\d+(?:\/|:)\d+)/gi;
const STOPWORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'before', 'being', 'could',
  'doesnt', 'dont', 'from', 'have', 'himself', 'herself', 'isnt', 'itself',
  'probably', 'should', 'their', 'there', 'theres', 'these', 'they', 'them',
  'theyre', 'thing', 'things', 'want', 'wanna', 'wants', 'were', 'what', 'will',
  'every', 'first', 'from', 'have', 'into', 'just', 'like', 'more', 'most',
  'only', 'other', 'people', 'really', 'same', 'that', 'their', 'then',
  'there', 'these', 'they', 'this', 'those', 'through', 'when', 'where',
  'which', 'while', 'with', 'would', 'your',
]);
const VAGUE_CONCEPT_WORDS = new Set(['good', 'lots', 'many', 'mostly', 'place', 'places', 'stuff', 'thing', 'things']);

export function extractMotionGraphicSemanticFacts(
  input: ExtractMotionGraphicSemanticFactsInput,
): ExtractedMotionGraphicSemanticFact[] {
  const chunks = buildTextChunks(input);
  const facts = chunks.flatMap(extractFactsFromChunk);
  const uniqueFacts = dedupeFacts(facts)
    .sort((a, b) => b.score - a.score || a.sourceSpan.text.localeCompare(b.sourceSpan.text));
  return uniqueFacts.slice(0, input.maxFacts ?? 8);
}

function buildTextChunks(input: ExtractMotionGraphicSemanticFactsInput): TextChunk[] {
  const chunks: TextChunk[] = [];
  if (input.tokens?.length) {
    chunks.push(...chunksFromTokens(input.tokens));
  }

  const text = cleanText(input.text);
  if (text) {
    chunks.push({
      text,
      sourceSpan: { text, source: 'semantic-text' },
    });
  }

  for (const source of input.textSources ?? []) {
    const sourceText = cleanText(source.text);
    if (!sourceText) continue;
    chunks.push({
      text: sourceText,
      sourceSpan: { text: sourceText, source: source.source },
    });
  }

  return chunks;
}

function chunksFromTokens(tokens: TimedWord[]): TextChunk[] {
  const chunks: TextChunk[] = [];
  let current: TimedWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const text = current.map((token) => cleanToken(token.word)).filter(Boolean).join(' ').trim();
    if (text) {
      chunks.push({
        text,
        sourceSpan: {
          text,
          startMs: Math.round(current[0].startMs),
          endMs: Math.round(current[current.length - 1].endMs),
          wordStart: tokens.indexOf(current[0]),
          wordEnd: tokens.indexOf(current[current.length - 1]),
          source: 'voiceover-transcript',
        },
      });
    }
    current = [];
  };

  for (const token of tokens) {
    current.push(token);
    if (endsSentence(token.word) || current.length >= 18) flush();
  }
  flush();
  return chunks;
}

function extractFactsFromChunk(chunk: TextChunk): ExtractedMotionGraphicSemanticFact[] {
  const facts: ExtractedMotionGraphicSemanticFact[] = [];
  const comparison = extractComparisonFact(chunk);
  if (comparison) facts.push(comparison);

  const numericFacts = extractNumericFacts(chunk.text);
  if (numericFacts.length >= 2) {
    const relation = inferNumericRelation(chunk.text, numericFacts);
    if (relation) {
      facts.push(makeFact({
        from: relation.from,
        to: relation.to,
        relation: relation.relation,
        relationKind: relation.kind,
        contextPhrase: chunk.text,
        sourceSpan: chunk.sourceSpan,
        salience: salienceForText(chunk.text, 0.78),
      }, chunk.sourceSpan));
    }
  }

  for (const numeric of numericFacts) {
    facts.push(makeNumericFact(chunk, numeric));
  }

  const quote = extractQuoteFact(chunk);
  if (quote) facts.push(quote);

  const concept = extractConceptFact(chunk);
  if (concept) facts.push(concept);

  return facts;
}

function makeNumericFact(chunk: TextChunk, fact: NumericFact): ExtractedMotionGraphicSemanticFact {
  const label = labelForNumericFact(chunk.text, fact);
  const salience = salienceForNumericFact(chunk.text, fact);
  const params: Record<string, unknown> = {
    kind: 'numeric',
    value: fact.exactText,
    ...(label ? { label } : {}),
    quantityKind: fact.kind,
    ...(fact.unit ? { unit: fact.unit } : {}),
    ...(fact.denominator !== undefined ? { denominator: fact.denominator } : {}),
    ...(fact.bounded !== undefined ? { bounded: fact.bounded } : {}),
    salience,
    contextPhrase: chunk.text,
    sourceSpan: chunk.sourceSpan,
    semanticAtoms: {
      quantity: {
        displayText: fact.exactText,
        value: fact.exactText,
        kind: fact.kind,
        ...(label ? { label } : {}),
        ...(fact.unit ? { unit: fact.unit } : {}),
        ...(fact.denominator !== undefined ? { denominator: fact.denominator } : {}),
        ...(fact.bounded !== undefined ? { bounded: fact.bounded } : {}),
      },
      evidencePhrase: chunk.text,
      salience,
    },
  };
  return makeFact(params, chunk.sourceSpan);
}

function extractComparisonFact(chunk: TextChunk): ExtractedMotionGraphicSemanticFact | null {
  const text = chunk.text;
  const fromTo = text.match(/\bfrom\s+([^.!?;,:]{2,44}?)\s+(?:to|into)\s+([^.!?;,:]{2,44})(?:[.!?;,:]|$)/i);
  if (fromTo) {
    return makeFact({
      kind: 'comparison',
      from: cleanComparisonSide(fromTo[1]),
      to: cleanComparisonSide(fromTo[2]),
      relation: 'arrow',
      contextPhrase: text,
      sourceSpan: chunk.sourceSpan,
      salience: salienceForText(text, 0.78),
      semanticAtoms: {
        relation: {
          from: cleanComparisonSide(fromTo[1]),
          to: cleanComparisonSide(fromTo[2]),
          relation: 'arrow',
          kind: 'change',
        },
        evidencePhrase: text,
      },
    }, chunk.sourceSpan);
  }

  const vs = text.match(/\b([^.!?;,:]{2,44}?)\s+(?:vs\.?|versus|compared with|compared to)\s+([^.!?;,:]{2,44})(?:[.!?;,:]|$)/i);
  if (!vs) return null;
  return makeFact({
    kind: 'comparison',
    from: cleanComparisonSide(vs[1]),
    to: cleanComparisonSide(vs[2]),
    relation: 'vs',
    contextPhrase: text,
    sourceSpan: chunk.sourceSpan,
    salience: salienceForText(text, 0.76),
    semanticAtoms: {
      relation: {
        from: cleanComparisonSide(vs[1]),
        to: cleanComparisonSide(vs[2]),
        relation: 'vs',
        kind: 'comparison',
      },
      evidencePhrase: text,
    },
  }, chunk.sourceSpan);
}

function extractQuoteFact(chunk: TextChunk): ExtractedMotionGraphicSemanticFact | null {
  const quote = chunk.text.match(/["\u201c]([^"\u201d]{12,140})["\u201d]/);
  if (!quote) return null;
  const quoteText = quote[1].trim();
  return makeFact({
    kind: 'quotation',
    quote: quoteText,
    contextPhrase: chunk.text,
    sourceSpan: chunk.sourceSpan,
    salience: salienceForText(chunk.text, 0.78),
    semanticAtoms: {
      quote: { text: quoteText },
      evidencePhrase: chunk.text,
    },
  }, chunk.sourceSpan);
}

function extractConceptFact(chunk: TextChunk): ExtractedMotionGraphicSemanticFact | null {
  const text = chunk.text;
  if (extractNumericFacts(text).length > 0) return null;
  if (!/\b(because|means|meaning|reason|problem|important|truth|actually|instead|rather than|this is why|what happens)\b/i.test(text)) {
    return null;
  }
  const keyword = extractKeyword(text);
  if (!keyword) return null;
  return makeFact({
    kind: 'structured',
    keyword,
    title: keyword,
    body: text,
    contextPhrase: text,
    sourceSpan: chunk.sourceSpan,
    salience: salienceForText(text, 0.72),
    semanticAtoms: {
      concept: keyword,
      claim: text,
      evidencePhrase: text,
      text: { primary: keyword, secondary: text, phrase: text, keyword },
      salience: salienceForText(text, 0.72),
    },
  }, chunk.sourceSpan);
}

function makeFact(params: Record<string, unknown>, sourceSpan: SemanticMgSourceSpan): ExtractedMotionGraphicSemanticFact {
  const ledger = buildSemanticMgCandidateLedger({ content: params, sourceSpan });
  const selected = ledger.candidates[0] ?? ledger.suppressed[0];
  const salience = numberValue(params.salience) ?? 0.5;
  const evidenceStrength = selected?.scoreInputs.evidenceStrength ?? 0;
  const structuralStrength = selected?.scoreInputs.structuralStrength ?? 0;
  const score = clamp01(salience * 0.35 + evidenceStrength * 0.35 + structuralStrength * 0.3);
  return {
    factKind: selected?.factKind ?? 'none',
    params,
    sourceSpan,
    salience,
    score,
    licensed: ledger.candidates.length > 0,
    ledger,
    reasons: selected?.hardGate.reasons ?? ['semantic-fact:no-candidate'],
  };
}

function extractNumericFacts(context: string): NumericFact[] {
  const facts: NumericFact[] = [];
  for (const match of context.matchAll(NUMERIC_TOKEN_RE)) {
    const raw = match[0].trim();
    const index = match.index ?? 0;
    const parsed = parseNumericToken(raw, context, index);
    if (parsed) facts.push(parsed);
  }
  return facts;
}

function parseNumericToken(raw: string, context: string, index: number): NumericFact | null {
  const token = raw.replace(/\s+/g, '');
  const fraction = token.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
    return { exactText: token, value: numerator / denominator, index, endIndex: index + raw.length, kind: 'fraction', denominator, bounded: true };
  }

  const ratio = token.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (ratio) {
    const left = Number(ratio[1]);
    const right = Number(ratio[2]);
    if (!Number.isFinite(left) || !Number.isFinite(right) || right === 0) return null;
    return { exactText: token, value: left / right, index, endIndex: index + raw.length, kind: 'ratio' };
  }

  const currency = /^[\u20ac\u00a3\u00a5\u20b9$]/.test(token);
  const percent = /%$/.test(token);
  const magnitude = token.match(/[KMBTkmbt]$/);
  const multiplier = magnitude ? magnitudeMultiplier(magnitude[0]) : 1;
  const numeric = Number(token.replace(/[$\u20ac\u00a3\u00a5\u20b9,%xX\u00d7KMBTkmbt]/g, '').replace(/,/g, '')) * multiplier;
  if (!Number.isFinite(numeric)) return null;

  const after = context.slice(index + raw.length).toLowerCase();
  const rateUnit = after.match(/\b(?:per|\/)\s+([a-z]+(?:\s+[a-z]+)?)/i)?.[1]?.trim();
  return {
    exactText: token,
    value: numeric,
    index,
    endIndex: index + raw.length,
    kind: percent ? 'percent' : currency ? 'currency' : rateUnit ? 'rate' : magnitude ? 'magnitude' : 'number',
    ...(rateUnit ? { unit: `per ${rateUnit}` } : {}),
    ...(percent ? { bounded: true } : {}),
  };
}

function inferNumericRelation(
  context: string,
  facts: NumericFact[],
): { from: string; to: string; relation: 'vs' | 'arrow'; kind: string } | null {
  if (facts.length < 2) return null;
  const lower = context.toLowerCase();
  const first = facts[0];
  const second = facts[1];
  const between = lower.slice(first.endIndex, second.index);
  if (/\b(to|into|from)\b/.test(between) || /\bfrom\b/.test(lower)) {
    return { from: first.exactText, to: second.exactText, relation: 'arrow', kind: 'change' };
  }
  if (/\b(vs|versus|compared|than|over|under)\b/.test(between)) {
    return { from: first.exactText, to: second.exactText, relation: 'vs', kind: 'comparison' };
  }
  return null;
}

function labelForNumericFact(context: string, fact: NumericFact): string | undefined {
  const before = context.slice(0, fact.index).replace(/[$\u20ac\u00a3\u00a5\u20b9]\s*$/, '').trim();
  const after = context.slice(fact.endIndex).replace(/^[%xX\u00d7]/, '').trim();
  const label = [before, after]
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^(is|are|was|were|of|to|from|about)\s+/i, '')
    .trim();
  return label || undefined;
}

function salienceForNumericFact(text: string, fact: NumericFact): number {
  const base = fact.kind === 'percent' || fact.kind === 'fraction' || fact.kind === 'ratio'
    ? 0.76
    : fact.kind === 'magnitude' || fact.kind === 'currency'
      ? 0.7
      : fact.kind === 'rate' && Math.abs(fact.value) < 1
        ? 0.48
        : 0.58;
  return salienceForText(text, base);
}

function salienceForText(text: string, base: number): number {
  let salience = base;
  if (/\b(only|never|not|no|but|instead|rather than|because|therefore|actually|problem|truth|important|critical|massive)\b/i.test(text)) {
    salience += 0.08;
  }
  if (/\b(grew|growth|drop|dropped|increase|decrease|change|changed|from|to|versus|vs)\b/i.test(text)) {
    salience += 0.05;
  }
  if (text.length > 120) salience -= 0.08;
  return clamp01(salience);
}

function extractKeyword(text: string): string | undefined {
  const focus = conceptFocusPhrase(text) ?? text;
  const words = cleanText(focus)
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9-]/gi, '').toLowerCase())
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));
  if (words.length === 0) return undefined;
  const keyword = words.slice(0, 3).map(titleWord).join(' ');
  if (!hasUsefulConceptKeyword(keyword)) return undefined;
  return keyword;
}

function conceptFocusPhrase(text: string): string | undefined {
  const cleaned = cleanText(text);
  const problemExplanation = cleaned.match(/\bproblem\s+(?:here\s+)?(?:is|was)\s+that\s+([^.!?;,:]{8,96})/i);
  if (problemExplanation) return cleanConceptPhrase(problemExplanation[1]);

  const problem = cleaned.match(/\b(?:that'?s|this is|it'?s)?\s*(?:an?\s+)?([a-z][^.!?;,:]{2,64}?\s+problem)\b/i);
  if (problem) return cleanConceptPhrase(problem[1]);

  const connector = cleaned.match(/\b(?:because|means|meaning|reason|important|truth|actually|instead|rather than|this is why|what happens)\b[:,]?\s+([^.!?;,:]{8,96})/i);
  if (connector) return cleanConceptPhrase(connector[1]);

  return undefined;
}

function cleanConceptPhrase(value: string): string {
  return value
    .replace(/\b(?:he|she|it|they|we|you|i)\s+(?:doesn'?t|don'?t|isn'?t|aren'?t|wasn'?t|weren'?t)\s+/gi, '')
    .replace(/\b(?:he|she|it|they|we|you|i)\s+/gi, '')
    .replace(/\b(?:are|is|was|were|be|being|been|a|an|the)\s+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasUsefulConceptKeyword(keyword: string): boolean {
  const words = keyword.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.every((word) => VAGUE_CONCEPT_WORDS.has(word.toLowerCase()))) return false;
  if (words.length >= 2) return true;
  const [only] = words;
  return !!only && only.length >= 7 && !/^(Theyre|Doesnt|Dont|Isnt|Because|Actually)$/i.test(only);
}

function titleWord(word: string): string {
  return word ? word[0].toUpperCase() + word.slice(1) : word;
}

function stableFactEvidenceKey(fact: ExtractedMotionGraphicSemanticFact): string {
  const title = typeof fact.params.title === 'string' ? fact.params.title : '';
  const body = typeof fact.params.body === 'string' ? fact.params.body : '';
  const value = typeof fact.params.value === 'string' ? fact.params.value : '';
  const from = typeof fact.params.from === 'string' ? fact.params.from : '';
  const to = typeof fact.params.to === 'string' ? fact.params.to : '';
  const quote = typeof fact.params.quote === 'string' ? fact.params.quote : '';
  return [
    fact.factKind,
    normalizedEvidenceText(title || value || quote || `${from}->${to}`),
    fact.factKind === 'concept' ? '' : normalizedEvidenceText(body || fact.sourceSpan.text),
  ].join('|');
}

function dedupeFacts(facts: ExtractedMotionGraphicSemanticFact[]): ExtractedMotionGraphicSemanticFact[] {
  const seen = new Set<string>();
  const deduped: ExtractedMotionGraphicSemanticFact[] = [];
  for (const fact of facts) {
    const key = stableFactEvidenceKey(fact);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(fact);
  }
  return deduped;
}

function cleanComparisonSide(value: string): string {
  return value
    .replace(/^(a|an|the)\s+/i, '')
    .replace(/[,.!?;:]+$/g, '')
    .trim();
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizedEvidenceText(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9%$:/.-]+/g, ' ')
    .split(/\s+/)
    .filter((word, index, words) => word && words.indexOf(word) === index)
    .join(' ');
}

function cleanToken(value: unknown): string {
  return String(value ?? '').replace(/^[\s"'`([{]+|[\s"'`)\]}]+$/g, '').trim();
}

function endsSentence(value: unknown): boolean {
  return /[.!?]\s*$/.test(String(value ?? ''));
}

function magnitudeMultiplier(suffix: string): number {
  switch (suffix.toLowerCase()) {
    case 'k': return 1000;
    case 'm': return 1000000;
    case 'b': return 1000000000;
    case 't': return 1000000000000;
    default: return 1;
  }
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
