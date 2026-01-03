import { BaseAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import type { NarrativeContract } from './script-contract-agent';

export interface SectionInput extends AgentInput {
  section: {
    id: string;
    title: string;
    goal: string;
    role?: string;
    knowledge_role?: 'Architect' | 'Operator' | 'Strategist' | 'Analyst';
    operational_goal?: 'Action' | 'Decision' | 'Constraint';
    level?: string;
    parent_id?: string | null;
    knowledge_layer?: string;
    mode?: string;
    primary_actions?: string;
    required_inputs?: string;
    expected_outputs?: string;
    risks?: string;
    audience_state_after?: string;
    intensity_level?: number;
    tone?: string | null;
    estimated_length?: string | null;
  };
  outlineTitle?: string | null;
  contract: NarrativeContract;
  priorSections?: Array<{ id: string; title: string; summary: string; role?: string }>;
  siblingTitles?: string;
}

export interface SectionOutput {
  sectionId: string;
  prose: string;
}

export class ScriptSectionAgent extends BaseAgent {
  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    const modelName = 'gemini-2.5-flash';
    super({
      ...config,
      agentType: 'script_section',
      modelName,
      maxTokens: config?.maxTokens ?? 1800,
      temperature: config?.temperature ?? 0.35,
    });
  }

  buildPrompt(input: AgentInput): string {
    const { context, userPrompt, section, outlineTitle, contract, priorSections, siblingTitles } = input as SectionInput;
    const prior = (priorSections || []).map((p) => `${p.id} ${p.title}: ${p.summary}`).join('\n') || 'None (this is first section)';
    const forbidden = contract.forbidden?.join(', ') || 'slides, screen references, camera directions, meta commentary';
    const generationMode = (input as any).generationMode || 'manual';
    const knowledgeRole = section.knowledge_role || 'Operator';
    const operationalGoal = section.operational_goal || 'Action';
    return `You write one section of a ThinkForge manual ("script" is a legacy alias) as a dense, instructional procedure (Generation mode: ${generationMode}). No narrative or inspirational prose.

  ## Operational Contract
Medium: ${contract.medium}
Narrator voice: ${contract.narrator_voice}
Tone: ${contract.tone}
Forbidden: ${forbidden}
Allowed metaphors: ${(contract.allowed_metaphors || []).join(', ') || 'keep minimal and consistent'}
Style notes: ${(contract.style_notes || []).join('; ')}
  Mode A usage: ${contract.mode_a_usage}
  Mode B usage: ${contract.mode_b_usage}
  Switching rules: ${contract.mode_switch_rules}

## Section
ID: ${section.id}
Title: ${section.title}
Role in arc: ${section.role || 'unspecified'}
Level: ${section.level || 'section'}
Parent: ${section.parent_id || 'none'}
  Knowledge layer: ${section.knowledge_layer || 'unspecified'}
  Mode: ${section.mode || 'Mode B: Builder Blueprint'}
Goal: ${section.goal}
Audience state after: ${section.audience_state_after || 'understood goal'}
Intensity level (1-5, do NOT exceed): ${section.intensity_level ?? 3}
Tone: ${section.tone || 'match contract tone'}
Estimated length: ${section.estimated_length || 'medium'}
  Primary actions (what the creator does): ${section.primary_actions || 'spell out concrete steps'}
  Required inputs (data/APIs/assets): ${section.required_inputs || 'list tangible inputs'}
  Expected outputs (artifacts/results): ${section.expected_outputs || 'name the deliverables'}
  Risks/pitfalls: ${section.risks || 'highlight failure modes to avoid'}
Batch siblings (titles only, avoid overlap): ${siblingTitles || 'none'}

Knowledge Role (governs tone/perspective): ${knowledgeRole}
Operational Goal (must be Action | Decision | Constraint): ${operationalGoal}

## Prior sections (do NOT restate)
${prior}

## Project Context
${context.projectSummary || '(No project context)'}

## User Request
${userPrompt}

## Rules
- GenerationMode=manual: expository instructional tone, neutral voice, declarative sentences, minimal adjectives, no rhetorical questions; write as a reference document, not to be performed aloud.
- Metaphors only if they clarify a system. No theatrical visual framing, storytelling, emotional language, or self-referential meta statements (e.g., "This section", "This framework", "This analysis").
- Output must begin with two lines exactly: "Knowledge Role: ${knowledgeRole}" and "Operational Goal: ${operationalGoal}"; if either header is missing, regenerate and fail the output.
- Use the knowledge role to set voice (e.g., Architect = systems design constraints; Operator = procedural commands; Strategist = decision matrices; Analyst = diagnostics).
- Bullet-first: default to bullets; paragraphs only when a bullet cannot convey the idea and must be ≤2 sentences.
- Canonical Instruction Representation (CIR) ONLY: plain text sections labelled Action, Execution Guidance, Example, Next; bullets (-) and numbered steps (1.) allowed. No HTML, no markdown tables, no bold/italic/code ticks, no BlockNote JSON, no inline styling.
- Write only this section; do not summarize or restate earlier sections. Every paragraph must introduce a new concept, step, constraint, validation, or transition condition.
- Enforce medium locking: no slides/screen/meta/camera language if not appropriate for ${contract.medium}.
- No placeholders. Include concrete actions, inputs, expected outputs, constraints, and failure modes.
- Prefer headings, bullet lists, numbered steps, and checklists; if a list communicates the idea, do not write paragraphs.
- For every Action, immediately include inline execution guidance with this structure (no extra sections):
- For every Action group (cluster related steps under ONE Action), include inline execution guidance with this structure (no extra sections):
  Action: <command grouping 3–5 related steps>
  Execution Guidance: <attention cue and validation check with timing/perception and cause-effect references>
  Why: <one short causal explanation for the group (optional if obvious)>
  Next: <transition condition>
- Execution guidance must be concrete and observational (framing, timing, perception, cause-effect). No narratives, metaphors, or framework explanations.
- Include at least one clearly labeled drop-in example marked optional ("Example (Use As-Is):", "Sample Output:", or "Worked Example:") that a user can copy directly; align the example with the section's knowledge_role and knowledge_layer.
- Remove any sentence that explains the framework/system itself instead of user action. Use imperative verbs and user-oriented cues ("Do", "Check", "Adjust", "You should see...").
- Ban expository padding such as "This phase establishes", "The purpose of this step", "Ensures alignment with", "Provides clarity"; replace with direct imperatives.
- Action density: at least one actionable instruction every 2–3 lines; no more than 3 consecutive lines without an action/check/decision.
- Stop once the section enables action; avoid repetition and padding.
- Obey intensity cap: stay at or below the provided level; only climax sections reach level 5.
- Vary sentence rhythm without fluff; avoid reusing metaphors or phrasing from prior sections.
- No JSON, no tags—return plain prose with headings respected if present.`;
  }

  async generateSection(input: SectionInput, overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>): Promise<SectionOutput> {
    let attempts = 0;
    let lastProse = '';
    let previousLength = 0;
    const knowledgeRole = (input as SectionInput).section.knowledge_role || 'Operator';
    while (attempts < 2) {
      const { text } = await this.runComplete(input, overrides);
      const prose = text.trim();
      lastProse = prose;
      previousLength = prose.length;
      const validation = this.validateTeachingPresence(prose);

      const sanitized = this.stripHTMLTags(this.stripMetaLanguage(prose));
      const normalized = this.normalizeStructure(sanitized);
      const compressed = this.compressForSkim(normalized);

      // Non-fatal fixes handled locally (no retry): missing example, minor structure, over-length, HTML
      if (!validation.metaDetected && !validation.actionMissing && !validation.formattingDetected) {
        const withExample = validation.missingExample
          ? `${compressed}\n\n${this.buildFallbackExample(knowledgeRole, (input as SectionInput).section.knowledge_layer || '')}`
          : compressed;
        return {
          sectionId: input.section.id,
          prose: withExample,
        };
      }

      // Fatal: meta or missing Action -> single retry with reduction
      const canRetry = attempts === 0 && (validation.metaDetected || validation.actionMissing || validation.formattingDetected);
      if (canRetry) {
        attempts += 1;
        console.warn(`[ThinkForge] Validation retry (meta=${validation.metaDetected}, actionMissing=${validation.actionMissing}); reducing verbosity for section ${input.section.id}`);
        overrides = {
          ...(overrides || {}),
          temperature: Math.min(0.25, overrides?.temperature ?? 0.35),
          maxTokens: Math.min(1200, overrides?.maxTokens ?? 1400),
        };
        (input as any).userPrompt = `${(input as any).userPrompt}\n\nREDUCE: Remove meta language; collapse multiple Actions into one grouped Action with shared Execution Guidance; omit redundant Why if obvious; output must be shorter than previous length ${previousLength}.`;
        continue;
      }

      // Hard stop: no further retries; apply local fixes
      const withExample = validation.missingExample
        ? `${compressed}\n\n${this.buildFallbackExample(knowledgeRole, (input as SectionInput).section.knowledge_layer || '')}`
        : compressed;
      return {
        sectionId: input.section.id,
        prose: withExample,
      };
    }

    // Final fallback: sanitized, normalized, compressed, example-safe
    const fallbackBase = this.compressForSkim(this.normalizeStructure(this.stripHTMLTags(this.stripMetaLanguage(lastProse || (input as any).userPrompt || ''))));
    const fallback = `${fallbackBase}\n\n${this.buildFallbackExample(knowledgeRole, (input as SectionInput).section.knowledge_layer || '')}`;
    return {
      sectionId: input.section.id,
      prose: fallback,
    };
  }

  /**
   * Rule-based validator to ensure every Action has execution guidance inline.
   * No model calls; if invalid, caller retries with stricter constraints.
   */
  private validateTeachingPresence(text: string): {
    ok: boolean;
    metaDetected: boolean;
    missingExample: boolean;
    htmlDetected: boolean;
    actionMissing: boolean;
    formattingDetected: boolean;
  } {
    const actionMatches = text.match(/Action:/gi)?.length ?? 0;
    const guidanceMatches = text.match(/Execution Guidance:/gi)?.length ?? 0;
    const whyMatches = text.match(/Why:/gi)?.length ?? 0;
    const nextMatches = text.match(/Next:/gi)?.length ?? 0;
    const metaDetected = this.hasMetaLanguage(text);
    const htmlDetected = /<[^>]+>/g.test(text);
    const inlineFormattingDetected = /`|\*\*|__/.test(text);
    const tableDetected = /\|[^\n]*\|/g.test(text);
    const formattingDetected = inlineFormattingDetected || tableDetected;
    const missingExample = !/(Example \(Use As-Is\):|Sample Output:|Worked Example:)/i.test(text);
    const actionMissing = actionMatches === 0;
    const structureOk = actionMatches > 0 && guidanceMatches >= actionMatches && nextMatches >= actionMatches; // Why optional per clustered action
    const densityOk = this.hasActionDensity(text);
    return {
      ok: structureOk && densityOk && !metaDetected && !htmlDetected && !missingExample && !formattingDetected,
      metaDetected,
      missingExample,
      htmlDetected,
      actionMissing,
      formattingDetected,
    };
  }

  /**
   * Detect meta or self-referential language that explains the framework instead of instructing action.
   */
  private hasMetaLanguage(text: string): boolean {
    const patterns = [
      /this section/i,
      /this framework/i,
      /this analysis/i,
      /this protocol/i,
      /the objective of/i,
      /is designed to/i,
      /this guide/i,
      /this phase establishes/i,
      /the purpose of this step/i,
      /ensures alignment with/i,
      /provides clarity/i,
    ];
    return patterns.some((p) => p.test(text));
  }

  /**
   * Remove sentences containing meta-language while leaving instructional content intact.
   */
  private stripMetaLanguage(text: string): string {
    const sentences = text.split(/(?<=[.!?])\s+/);
    const keep: string[] = [];
    for (const s of sentences) {
      if (this.hasMetaLanguage(s)) continue;
      keep.push(s);
    }
    return keep.join(' ').trim();
  }

  /**
   * Strip all HTML tags from text to prevent block validation errors.
   */
  private stripHTMLTags(text: string): string {
    return text.replace(/<[^>]+>/g, '');
  }

  /**
   * Normalize structure by ensuring each Action has Execution Guidance and Next, and at most one Why per cluster.
   */
  private normalizeStructure(text: string): string {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const normalized: string[] = [];
    let pendingWhy = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^Action:/i.test(line)) {
        normalized.push(line);
        if (!/^Execution Guidance:/i.test(lines[i + 1] || '')) {
          normalized.push('Execution Guidance: Focus on observable state; if expected change is absent, adjust inputs and timing.');
        }
        pendingWhy = true;
        continue;
      }
      if (/^Why:/i.test(line)) {
        if (pendingWhy) {
          normalized.push(line);
          pendingWhy = false;
        }
        continue;
      }
      if (/^Execution Guidance:/i.test(line) || /^Next:/i.test(line) || /^Example \(Use As-Is\):/i.test(line) || /^Sample Output:/i.test(line) || /^Worked Example:/i.test(line)) {
        normalized.push(line);
        continue;
      }
      normalized.push(line);
    }
    // Ensure every action cluster ends with Next
    for (let i = 0; i < normalized.length; i++) {
      if (/^Action:/i.test(normalized[i])) {
        let hasNext = false;
        for (let j = i + 1; j < normalized.length && j <= i + 5; j++) {
          if (/^Action:/i.test(normalized[j])) break;
          if (/^Next:/i.test(normalized[j])) { hasNext = true; break; }
        }
        if (!hasNext) {
          normalized.splice(i + 1, 0, 'Next: Proceed when the grouped outputs match expected thresholds.');
        }
      }
    }
    return normalized.join('\n');
  }

  /**
   * Enforce action density: at least one actionable line per ~3 lines and no long runs without action/check.
   */
  private hasActionDensity(text: string): boolean {
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return false;
    const isActionLine = (line: string) => /^(Action:|Execution Guidance:|Why:|Next:|\-|\u2022)/i.test(line) || /\b(check|verify|adjust|compare|measure|set|run|apply|execute|observe|confirm|proceed)\b/i.test(line);
    let actionCount = 0;
    let run = 0;
    for (const line of lines) {
      if (isActionLine(line)) {
        actionCount += 1;
        run = 0;
      } else {
        run += 1;
        if (run > 3) return false;
      }
    }
    const required = Math.ceil(lines.length / 3);
    return actionCount >= required;
  }

  /**
   * Compress content to a skim length (~200-300 words) by removing low-action sentences first.
   */
  private compressForSkim(text: string): string {
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount <= 300) return text;
    const sentences = text.split(/(?<=[.!?])\s+/);
    const keep: string[] = [];
    const isHighValue = (s: string) => /(Action:|Execution Guidance:|Why:|Next:|Example \(Use As-Is\):|Sample Output:|Worked Example:|check|verify|adjust|compare|measure|set|run|apply|execute|observe|confirm|proceed)/i.test(s);
    for (const s of sentences) {
      if (isHighValue(s)) keep.push(s.trim());
    }
    if (keep.length === 0) return text; // fallback if parsing failed
    return keep.join(' ').trim();
  }

  /**
   * Provide a minimal, copy-ready example aligned to the knowledge role/layer.
   */
  private buildFallbackExample(role: string, layer: string): string {
    const label = 'Example (Use As-Is):';
    const layerLower = (layer || '').toLowerCase();
    if (role === 'Operator' || layerLower.includes('execution')) {
      return `${label} Step-by-step: 1) Run action with input A; 2) Observe output B within 30s; 3) If B < threshold, increase A by 10% and retry.`;
    }
    if (role === 'Strategist' || layerLower.includes('distribution')) {
      return `${label} Sample post: "Title - Key result in 12 words" + bullet CTA + link. Schedule at HH:MM UTC, platform tags: [platform1, platform2].`;
    }
    if (role === 'Analyst' || layerLower.includes('data')) {
      return `${label} Sample query: SELECT metric, SUM(value) FROM table WHERE ts >= NOW() - INTERVAL '24 hours' GROUP BY metric ORDER BY SUM(value) DESC LIMIT 5; Expected pattern: top metric stabilizes within 5% across two runs.`;
    }
    // Architect or default
    return `${label} Minimal blueprint: Inputs [A, B], Process [Step1: validate A; Step2: transform B with rule R], Output [O1 numeric, O2 log]. Proceed only when O1 within tolerance ±2%.`;
  }
}

export function createScriptSectionAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptSectionAgent {
  return new ScriptSectionAgent(config);
}
