export interface TrendBrandFitTerm {
  value: string;
  signalPath: string;
}

export interface TrendBrandFitGroup {
  code: string;
  terms: readonly TrendBrandFitTerm[];
}

export interface TrendBrandFitConceptMatch {
  coverage: number;
  matchedSignalPaths: string[];
}

type ConceptKind = "domain" | "capability" | "audience";

interface ConceptFamily {
  id: string;
  kind: ConceptKind;
  aliases: readonly string[];
}

const CONCEPT_FAMILIES: readonly ConceptFamily[] = [
  {
    id: "creative_production",
    kind: "domain",
    aliases: [
      "content creation", "content production", "creative production", "media production",
      "video", "video editing", "filmmaking", "footage", "scriptwriting", "copywriting",
      "graphic design", "image generation", "short form video",
    ],
  },
  {
    id: "workflow_automation",
    kind: "domain",
    aliases: [
      "workflow", "workflow automation", "business automation", "process automation",
      "orchestration", "operational efficiency", "productivity platform",
    ],
  },
  {
    id: "marketing_growth",
    kind: "domain",
    aliases: [
      "marketing", "advertising", "campaign", "brand strategy", "growth marketing",
      "lead generation", "social media marketing", "demand generation",
    ],
  },
  {
    id: "software_product",
    kind: "domain",
    aliases: ["saas", "software", "developer tool", "software platform", "technology platform"],
  },
  {
    id: "commerce_retail",
    kind: "domain",
    aliases: ["ecommerce", "e commerce", "retail", "online store", "shopping", "marketplace"],
  },
  {
    id: "recruiting_hr",
    kind: "domain",
    aliases: ["recruiting", "recruitment", "hiring", "talent acquisition", "human resources", "hr tech"],
  },
  {
    id: "education_learning",
    kind: "domain",
    aliases: ["education", "learning", "teaching", "student", "school", "university", "edtech"],
  },
  {
    id: "nonprofit_social_impact",
    kind: "domain",
    aliases: ["nonprofit", "non profit", "charity", "fundraising", "donation", "social impact"],
  },
  {
    id: "finance_accounting",
    kind: "domain",
    aliases: ["finance", "fintech", "banking", "accounting", "investment", "trading", "payments"],
  },
  {
    id: "healthcare_wellness",
    kind: "domain",
    aliases: ["healthcare", "health care", "medical", "patient", "wellness", "mental health", "healthtech"],
  },
  {
    id: "cybersecurity_privacy",
    kind: "domain",
    aliases: ["cybersecurity", "cyber security", "data privacy", "information security", "fraud prevention"],
  },
  {
    id: "data_analytics",
    kind: "domain",
    aliases: ["analytics", "business intelligence", "data platform", "data analysis", "reporting dashboard"],
  },
  {
    id: "customer_experience",
    kind: "domain",
    aliases: ["customer support", "customer service", "customer success", "customer experience", "contact center"],
  },
  {
    id: "real_estate",
    kind: "domain",
    aliases: ["real estate", "property", "property management", "realtor", "mortgage"],
  },
  {
    id: "travel_hospitality",
    kind: "domain",
    aliases: ["travel", "tourism", "hotel", "hospitality", "vacation", "booking"],
  },
  {
    id: "legal_compliance",
    kind: "domain",
    aliases: ["legal", "law firm", "compliance", "contract management", "regulation", "regtech"],
  },
  {
    id: "supply_chain_logistics",
    kind: "domain",
    aliases: ["supply chain", "logistics", "shipping", "warehouse", "inventory", "fulfillment"],
  },
  {
    id: "ai_assistance",
    kind: "capability",
    aliases: [
      "ai", "artificial intelligence", "generative ai", "machine learning", "ai powered",
      "automated", "automation", "copilot", "intelligent assistant",
    ],
  },
  {
    id: "localization_personalization",
    kind: "capability",
    aliases: [
      "localization", "localized", "multilingual", "translation", "personalization",
      "personalized", "variants at scale", "versioning",
    ],
  },
  {
    id: "team_collaboration",
    kind: "capability",
    aliases: ["collaboration", "team workspace", "approval workflow", "handoff", "shared workspace"],
  },
  {
    id: "creator_agency_audience",
    kind: "audience",
    aliases: [
      "creator", "content team", "creative team", "agency", "filmmaker", "video editor",
      "marketing team", "in house team", "production house",
    ],
  },
  {
    id: "business_team_audience",
    kind: "audience",
    aliases: ["business", "enterprise", "small business", "startup", "professional team", "operations team"],
  },
] as const;

const CONCEPT_KIND = new Map(CONCEPT_FAMILIES.map((family) => [family.id, family.kind]));

/**
 * Adds provider-free semantic evidence only when the trend and accepted brand terms share
 * a concrete business domain. Generic capabilities such as "AI" cannot qualify alone.
 */
export function scoreTrendBrandConcepts(
  candidateText: string,
  groups: readonly TrendBrandFitGroup[],
): Map<string, TrendBrandFitConceptMatch> {
  const candidateConcepts = resolveConcepts(candidateText);
  if (candidateConcepts.size === 0) return new Map();

  const termConcepts = groups.flatMap((group) => group.terms.map((term) => ({
    groupCode: group.code,
    term,
    concepts: resolveConcepts(term.value),
  })));
  const sharedDomainConcepts = new Set<string>();
  for (const evidence of termConcepts) {
    for (const conceptId of evidence.concepts) {
      if (candidateConcepts.has(conceptId) && CONCEPT_KIND.get(conceptId) === "domain") {
        sharedDomainConcepts.add(conceptId);
      }
    }
  }
  if (sharedDomainConcepts.size === 0) return new Map();

  const matches = new Map<string, TrendBrandFitConceptMatch>();
  for (const group of groups) {
    let bestCoverage = 0;
    const matchedSignalPaths = new Set<string>();
    for (const evidence of termConcepts) {
      if (evidence.groupCode !== group.code) continue;
      const shared = [...evidence.concepts].filter((conceptId) => candidateConcepts.has(conceptId));
      if (shared.length === 0) continue;
      const domainCount = shared.filter((conceptId) => CONCEPT_KIND.get(conceptId) === "domain").length;
      const capabilityCount = shared.filter((conceptId) => CONCEPT_KIND.get(conceptId) === "capability").length;
      const audienceCount = shared.filter((conceptId) => CONCEPT_KIND.get(conceptId) === "audience").length;
      const coverage = domainCount > 0
        ? Math.min(1, 0.85 + capabilityCount * 0.1 + audienceCount * 0.05)
        : capabilityCount > 0
          ? Math.min(0.65, 0.5 + audienceCount * 0.1)
          : 0.55;
      if (coverage > bestCoverage) {
        bestCoverage = coverage;
        matchedSignalPaths.clear();
        matchedSignalPaths.add(evidence.term.signalPath);
      } else if (coverage === bestCoverage && coverage > 0) {
        matchedSignalPaths.add(evidence.term.signalPath);
      }
    }
    if (bestCoverage > 0) {
      matches.set(group.code, { coverage: bestCoverage, matchedSignalPaths: [...matchedSignalPaths] });
    }
  }
  return matches;
}

function resolveConcepts(value: string): Set<string> {
  const normalized = normalize(value);
  const tokens = new Set(normalized.split(" ").filter(Boolean));
  const concepts = new Set<string>();
  for (const family of CONCEPT_FAMILIES) {
    if (family.aliases.some((alias) => aliasMatches(normalized, tokens, alias))) concepts.add(family.id);
  }
  return concepts;
}

function aliasMatches(text: string, tokens: Set<string>, alias: string): boolean {
  const normalizedAlias = normalize(alias);
  if (!normalizedAlias) return false;
  if (!normalizedAlias.includes(" ")) return tokens.has(normalizedAlias);
  return (` ${text} `).includes(` ${normalizedAlias} `);
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
