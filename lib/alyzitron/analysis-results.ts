export type NormalizedAlyzitronMetric = {
  name: string;
  score: number;
  description: string;
};

export type NormalizedAlyzitronAnalysisCategory = {
  category_name: string;
  metrics: NormalizedAlyzitronMetric[];
};

export type NormalizedAlyzitronComplianceRisk = {
  name: string;
  score: number;
  description: string;
};

export type NormalizedAlyzitronAnalysisResults = Record<string, unknown> & {
  category: string;
  overall_score: number;
  overview: string;
  remarks: string;
  titles: string[];
  descriptions: string[];
  target_audience: string;
  strengths: string[];
  weaknesses: string[];
  creator_feedback: {
    strengths: string[];
    improvements: string[];
  };
  analysis: NormalizedAlyzitronAnalysisCategory[];
  compliance_risks: NormalizedAlyzitronComplianceRisk[];
};

const LEGACY_SECTION_SKIP_KEYS = new Set([
  "analysis",
  "analysisTime",
  "category",
  "compliance_risks",
  "contentWarnings",
  "creator_feedback",
  "descriptions",
  "extractedFromText",
  "full_transcript",
  "keyMoments",
  "modelUsed",
  "overall_score",
  "overview",
  "parseError",
  "qualityAssessment",
  "rawResponse",
  "recommendations",
  "remarks",
  "speaker_segments",
  "strengths",
  "summary",
  "target_audience",
  "titles",
  "videoUrl",
  "weaknesses",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(cleanString).filter((item): item is string => Boolean(item));
  }
  const single = cleanString(value);
  return single ? [single] : [];
}

function firstNonEmptyList(...lists: string[][]): string[] {
  return lists.find((list) => list.length > 0) ?? [];
}

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function score(value: unknown, fallback = 0): number {
  const parsed = finiteNumber(value);
  if (parsed === undefined) return fallback;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeMetric(name: string, value: unknown): NormalizedAlyzitronMetric | null {
  const record = asRecord(value);
  if (!record) return null;

  const metricName = cleanString(record.name) ?? cleanString(name);
  const description =
    cleanString(record.description) ??
    cleanString(record.notes) ??
    cleanString(record.summary);

  if (!metricName || !description) return null;

  return {
    name: metricName,
    score: score(record.score),
    description,
  };
}

function normalizeMetrics(value: unknown): NormalizedAlyzitronMetric[] {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => normalizeMetric(`Metric ${index + 1}`, item))
      .filter((item): item is NormalizedAlyzitronMetric => Boolean(item));
  }

  const record = asRecord(value);
  if (!record) return [];

  return Object.entries(record)
    .map(([name, item]) => normalizeMetric(name, item))
    .filter((item): item is NormalizedAlyzitronMetric => Boolean(item));
}

function normalizeAnalysisCategories(value: unknown): NormalizedAlyzitronAnalysisCategory[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => {
      const record = asRecord(item);
      if (!record) return null;

      const categoryName =
        cleanString(record.category_name) ??
        cleanString(record.category) ??
        `Analysis ${index + 1}`;
      const metrics = normalizeMetrics(record.metrics);

      if (metrics.length === 0) return null;
      return { category_name: categoryName, metrics };
    })
    .filter((item): item is NormalizedAlyzitronAnalysisCategory => Boolean(item));
}

function normalizeLegacyMetricSections(
  record: Record<string, unknown>,
): NormalizedAlyzitronAnalysisCategory[] {
  return Object.entries(record)
    .filter(([key]) => !LEGACY_SECTION_SKIP_KEYS.has(key))
    .map(([key, value]) => {
      const metrics = normalizeMetrics(value);
      if (metrics.length === 0) return null;
      return {
        category_name: key.replace(/_/g, " "),
        metrics,
      };
    })
    .filter((item): item is NormalizedAlyzitronAnalysisCategory => Boolean(item));
}

function normalizeComplianceRisks(value: unknown): NormalizedAlyzitronComplianceRisk[] {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        const risk = normalizeMetric(`Risk ${index + 1}`, item);
        return risk ? { name: risk.name, score: risk.score, description: risk.description } : null;
      })
      .filter((item): item is NormalizedAlyzitronComplianceRisk => Boolean(item));
  }

  const record = asRecord(value);
  if (!record) return [];

  return Object.entries(record)
    .map(([name, item]) => {
      const risk = normalizeMetric(name, item);
      return risk ? { name: risk.name, score: risk.score, description: risk.description } : null;
    })
    .filter((item): item is NormalizedAlyzitronComplianceRisk => Boolean(item));
}

export function normalizeAlyzitronAnalysisResults(
  input: unknown,
): NormalizedAlyzitronAnalysisResults | null {
  const record = asRecord(input);
  if (!record) return null;

  const creatorFeedback = asRecord(record.creator_feedback);
  const qualityAssessment = asRecord(record.qualityAssessment);

  const strengths = firstNonEmptyList(
    stringList(record.strengths),
    stringList(creatorFeedback?.strengths),
  );
  const weaknesses = firstNonEmptyList(
    stringList(record.weaknesses),
    stringList(creatorFeedback?.improvements),
    stringList(record.recommendations),
  );

  const analysis = [
    ...normalizeAnalysisCategories(record.analysis),
    ...normalizeLegacyMetricSections(record),
  ];

  const complianceRisks = [
    ...normalizeComplianceRisks(record.compliance_risks),
    ...stringList(record.contentWarnings).map((warning) => ({
      name: "Content warning",
      score: 100,
      description: warning,
    })),
  ];

  return {
    ...record,
    category: cleanString(record.category) ?? "Analysis",
    overall_score: score(record.overall_score, score(qualityAssessment?.score)),
    overview: cleanString(record.overview) ?? cleanString(record.summary) ?? "",
    remarks: cleanString(record.remarks) ?? cleanString(qualityAssessment?.notes) ?? "",
    titles: stringList(record.titles),
    descriptions: stringList(record.descriptions),
    target_audience:
      cleanString(record.target_audience) ??
      cleanString(record.targetAudience) ??
      "",
    strengths,
    weaknesses,
    creator_feedback: {
      strengths,
      improvements: weaknesses,
    },
    analysis,
    compliance_risks: complianceRisks,
  };
}
