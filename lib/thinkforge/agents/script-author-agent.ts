import { BaseAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import type { NarrativeContract } from './script-contract-agent';
import type { ScriptOutline } from './script-outline-agent';
import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { ScriptIntent, type AgentScriptResponse } from '../protocol/intent';
import { parseAgentJson } from '../protocol/parse-agent-json';
import { selectAllTechniques, getConstraints, type TechniqueResult } from '../data/writing-graph-query';
import { extractSignalsFromContext } from '../data/extract-signals';

export interface ScriptAuthorInput extends AgentInput {
  outline?: ScriptOutline;
  contract?: NarrativeContract;
  documentType?: string;
}

export interface ScriptAuthorIntentInput extends AgentInput {
  intent: ScriptIntent;
  instruction: string;
  currentScript?: ThinkForgeBlock[];
  recentBlocks?: ThinkForgeBlock[];
  documentType?: string;
}

interface DocumentRoleProfile {
  role: string;
  executionTest: string;
  outputFeeling: string;
  sectionGuidance: string;
  defaultVoice: string;
  defaultMedium: string;
}

function inferRoleFromContext(projectSummary: string, userPrompt: string, explicitDocType?: string): DocumentRoleProfile {
  const docType = (explicitDocType || '').toLowerCase();
  const combined = `${projectSummary} ${userPrompt}`.toLowerCase();

  if (docType === 'character_bible' || /character|backstor|bible|arc|motivation|relationship/i.test(combined)) {
    return {
      role: 'a Senior Narrative Designer and Character Architect',
      executionTest: 'A writer should be able to say: "I know exactly who this character is and how they behave."',
      outputFeeling: 'a professional character bible, narrative profile, or story design document',
      sectionGuidance: '- Use sections like: Background, Motivation, Personality, Relationships, Arc, Key Quotes, Visual Description.',
      defaultVoice: 'narrator',
      defaultMedium: 'written_document',
    };
  }
  if (docType === 'world_bible' || /world|universe|physics|lore|history|rules|magic system/i.test(combined)) {
    return {
      role: 'a Senior Worldbuilder and Lore Architect',
      executionTest: 'A creator should be able to say: "I know exactly how this world works and its rules."',
      outputFeeling: 'an encyclopedic worldbuilding bible or lore document',
      sectionGuidance: '- Use sections like: Overview, Rules/Physics, History, Geography, Factions, Key Locations, Edge Cases.',
      defaultVoice: 'historian',
      defaultMedium: 'written_document',
    };
  }
  if (docType === 'vfx_brief' || /vfx|visual effect|cgi|composite|green ?screen/i.test(combined)) {
    return {
      role: 'a Senior VFX Supervisor and Technical Director',
      executionTest: 'A VFX artist should be able to say: "I know exactly what needs to be built and composited."',
      outputFeeling: 'a professional VFX brief, technical specification, or effects breakdown',
      sectionGuidance: '- Use sections like: Scene, Effect Description, Technical Requirements, Reference, Complexity, Dependencies.',
      defaultVoice: 'technical_lead',
      defaultMedium: 'technical_brief',
    };
  }
  if (docType === 'budget' || /budget|cost|financ|resource|crew|location|schedul/i.test(combined)) {
    return {
      role: 'a Senior Line Producer and Production Planner',
      executionTest: 'A producer should be able to say: "I know exactly what this costs and what resources I need."',
      outputFeeling: 'a professional production budget, resource plan, or cost breakdown',
      sectionGuidance: '- Use sections like: Summary, Line Items, Cost Breakdown, Resources, Timeline, Contingency.\n- Use tables where appropriate for costs and quantities.',
      defaultVoice: 'producer',
      defaultMedium: 'production_plan',
    };
  }
  if (docType === 'interview_questions' || /interview|question|subject|testimony/i.test(combined)) {
    return {
      role: 'a Senior Documentary Producer and Interview Director',
      executionTest: 'An interviewer should be able to say: "I know exactly what to ask and in what order."',
      outputFeeling: 'a professional interview guide, question deck, or documentary prep doc',
      sectionGuidance: '- Use sections like: Subject Profile, Opening Questions, Deep-Dive Questions, Emotional Beats, Closing, Follow-Ups.',
      defaultVoice: 'interviewer',
      defaultMedium: 'interview_guide',
    };
  }
  if (docType === 'score_direction' || /score|music|sound|audio|soundtrack|composer/i.test(combined)) {
    return {
      role: 'a Senior Music Supervisor and Score Director',
      executionTest: 'A composer should be able to say: "I know exactly what emotion and texture each cue needs."',
      outputFeeling: 'a professional score direction document or music brief',
      sectionGuidance: '- Use sections like: Scene/Moment, Emotional Target, Genre/Style, Instrumentation, Tempo, Reference Tracks, Transition Notes.',
      defaultVoice: 'music_director',
      defaultMedium: 'score_direction',
    };
  }
  if (docType === 'research_brief' || /research|analysis|seo|repurpos|competitor/i.test(combined)) {
    return {
      role: 'a Senior Content Strategist and Research Analyst',
      executionTest: 'A content creator should be able to say: "I know exactly what angles to pursue and why."',
      outputFeeling: 'a professional research brief, content strategy deck, or competitive analysis',
      sectionGuidance: '- Use sections like: Executive Summary, Key Findings, Opportunities, Competitive Landscape, Recommendations, Data Sources.',
      defaultVoice: 'strategist',
      defaultMedium: 'research_brief',
    };
  }
  // V2: Video script — emit scene blocks with typed slots for Editron pipeline
  if (docType === 'video_script' || /video|ad|commercial|reel|short[- ]?form|youtube|tiktok|brand[- ]?film|product[- ]?ad|ugc/i.test(combined)) {
    return {
      role: 'a Senior Creative Director and Video Scriptwriter',
      executionTest: 'A video editor should be able to say: "I know exactly what to show, say, and hear in every second."',
      outputFeeling: 'a professional video production script with scene-by-scene direction',
      sectionGuidance: `- IMPORTANT: Use kind: "scene" blocks (NOT "paragraph") for each video scene.
- Each scene block MUST include a "scene" field with typed slots:
  - visualDescription: what the camera shows (a single frozen moment, no motion verbs like "zooms" or "pans")
  - subjects: array of {name, category} for every person/product/location in the scene. category must be one of: person, product, location, object, brand, other
  - mood: the emotional tone (e.g. "confident", "urgent", "warm")
  - onScreenText: array of text strings that appear as graphics/titles on screen (NOT part of narration)
- The scene block "content" field holds the NARRATION text (what the voiceover says)
- Use kind: "editorial" blocks for production notes like Emotional Target, Instrumentation, Pacing Notes
- Use kind: "header" with meta.level: 1 for the script title
- Use kind: "header" with meta.level: 2 ONLY for act/section boundaries (not for every scene)
- Do NOT use kind: "paragraph" for scene content — always use kind: "scene"`,
      defaultVoice: 'voiceover',
      defaultMedium: 'video_script',
    };
  }
  if (docType === 'shot_list' || /shot ?list|storyboard|pre-?viz|visual plan/i.test(combined)) {
    return {
      role: 'a Senior Storyboard Artist and Cinematographer',
      executionTest: 'A filmmaker should be able to say: "I know exactly what shots to capture and how to frame them."',
      outputFeeling: 'a professional shot list, storyboard document, or visual plan',
      sectionGuidance: '- Use sections like: Shot Number, Description, Camera, Framing, Motion, Duration, Audio, Transition.\n- Use labels like: "Purpose:", "Shot:", "Camera:", "Framing:", "Motion:", "Lighting:", "Audio:", "Timing:", "Feeling:".',
      defaultVoice: 'director',
      defaultMedium: 'visual_plan',
    };
  }

  return {
    role: 'a Senior Creative Director and Production Strategist',
    executionTest: 'A creator should be able to say: "I know exactly what to make and how to execute it."',
    outputFeeling: 'a professional creative brief, production document, or strategy deck',
    sectionGuidance: '- Use natural section formats appropriate to the project type.\n- Frequently use labels like: "Purpose:", "Direction:", "Why this works:", "Note:".',
    defaultVoice: 'director',
    defaultMedium: 'voiceover',
  };
}

export class ScriptAuthorAgent extends BaseAgent {
  constructor(config?: Partial<Omit<AgentConfig, 'agentType'>>) {
    super({
      ...config,
      agentType: 'script_author',
      modelName: config?.modelName ?? 'gemini-2.5-flash',
      maxTokens: config?.maxTokens ?? 2600,
      temperature: config?.temperature ?? 0.7,
    });
  }

  protected applyGlobalConstraints(prompt: string): string {
    return prompt;
  }

  // ─── Writing Knowledge Injection ──────────────────────────────────
  private buildWritingKnowledgeBlock(params: {
    documentType?: string;
    medium?: string;
    projectSummary?: string;
    userPrompt?: string;
  }): string {
    try {
      const signals = extractSignalsFromContext(params);
      const techniqueMap = selectAllTechniques(signals, 2);
      const antiAiConstraints = getConstraints('Anti-AI Constraints');

      if (techniqueMap.size === 0 && antiAiConstraints.length === 0) return '';

      const lines: string[] = ['<writing_knowledge>'];

      techniqueMap.forEach((techniques: TechniqueResult[], category: string) => {
        const top = techniques[0];
        if (!top) return;
        lines.push(`${category.toUpperCase()} — Use: ${top.id} (score ${top.score.toFixed(2)})`);
        if (top.primary) lines.push(`  Action: ${top.primary}`);
        if (top.antiPatterns && top.antiPatterns.length > 0) {
          lines.push('  Anti-patterns:');
          for (const ap of top.antiPatterns.slice(0, 3)) {
            lines.push(`    - ${ap}`);
          }
        }
        if (top.weightResponse) {
          const entries: string[] = [];
          for (const [k, v] of Object.entries(top.weightResponse)) {
            entries.push(`${k}: ${v}`);
          }
          if (entries.length > 0) lines.push(`  Intensity: ${entries[0]}`);
        }
        lines.push('');
      });

      if (antiAiConstraints.length > 0) {
        lines.push('CONSTRAINTS (mandatory — avoid these AI tells):');
        for (const c of antiAiConstraints.slice(0, 5)) {
          lines.push(`  - ${c.id.replace(/_/g, ' ')} (${c.severity}): ${c.detection || c.why || ''}`);
        }
      }

      lines.push('</writing_knowledge>');
      return lines.join('\n');
    } catch {
      return '';
    }
  }

  // ─── Shared prompt core (Rule 35: XML structure, DRY) ─────────────
  // Extracted from the two previously-duplicated builders.
  // Both buildStructuredPrompt and buildPrompt call this for the common
  // role/task/rules/contract/outline sections, then append their own
  // output format block.
  private buildCorePromptBlock(params: {
    roleProfile: DocumentRoleProfile;
    projectSummary: string;
    userRequest: string;
    contract?: NarrativeContract;
    outlineSummary: string;
    outlineTitle?: string;
    brandBlock?: string; // XML brand context from buildBrandContextBlock()
  }): string {
    const { roleProfile, projectSummary, userRequest, contract, outlineSummary, outlineTitle, brandBlock } = params;

    const contractBlock = contract
      ? `<contract>
Narrative voice: ${contract.narrator_voice || roleProfile.defaultVoice}
Tone: ${contract.tone || 'confident'}
Medium: ${contract.medium || roleProfile.defaultMedium}
Style notes: ${(contract.style_notes || []).map((n) => `- ${n}`).join('\n') || '- (none)'}
Forbidden: ${(contract.forbidden || []).map((n) => `- ${n}`).join('\n') || '- (none)'}
</contract>`
      : '';

    return `<role>
You are ${roleProfile.role}.
You create documents that tell another professional exactly what to do or make.
Your job is not to write essays. Your job is to translate ideas into clear, executable direction.
${roleProfile.executionTest}
Your output must feel like ${roleProfile.outputFeeling}.
</role>

<task>
Project: ${projectSummary || '(No project context)'}
User request: ${userRequest}
</task>

${contractBlock}

${brandBlock || ''}
<rules>
RULE 1 — CONTENT QUALITY:
- Every output must be usable by a professional without interpretation.
- If the document feels like prose instead of actionable content, it is incorrect.
- Documents must be modular and scannable. Prefer short sections over long narrative blocks.
- Headings are structural anchors, not literary chapter titles.
- Content must be written for reuse, clarity, and execution.
- Use this as the H1 title when possible: ${outlineTitle || 'Use a clear, professional title'}
${roleProfile.sectionGuidance}

RULE 2 — WHAT NOT TO DO:
- Do NOT write long continuous prose blocks or narrative essays.
- Do NOT write philosophical commentary.
- Do NOT prioritize emotional language over clarity.
- Do NOT write to impress. Write to enable execution.
- Do NOT mention internal systems, schemas, or validation rules.
- It must never feel like an article, blog post, or verbose AI ramble.

RULE 3 — OUTLINE GUIDANCE:
${outlineSummary}
</rules>`;
  }

  private buildStructuredPrompt(input: ScriptAuthorIntentInput): string {
    if (input.intent === ScriptIntent.FORK) {
      throw new Error('ScriptAuthorAgent does not support FORK intent');
    }

    const { context, instruction, intent } = input;
    const currentBlocks = Array.isArray(input.currentScript) ? input.currentScript : [];
    const recentBlocks = Array.isArray(input.recentBlocks) ? input.recentBlocks : [];

    const serializedCurrent = currentBlocks.length > 0
      ? JSON.stringify(currentBlocks, null, 2)
      : '[]';
    const serializedRecent = recentBlocks.length > 0
      ? JSON.stringify(recentBlocks, null, 2)
      : '[]';

    const intentGuidance = (() => {
      switch (intent) {
        case ScriptIntent.REWRITE:
          return `INTENT: REWRITE\nYou must return {"mode":"replace","blocks":[...]} with a full replacement.`;
        case ScriptIntent.CONTINUE:
          return `INTENT: CONTINUE\nYou must return {"mode":"insert","position":{"atEnd":true},"blocks":[...]} with only new blocks.`;
        case ScriptIntent.EDIT:
          return `INTENT: EDIT\nYou must return {"mode":"patch","patches":[{"blockId":"...","content":[...]}]} referencing existing blockIds.`;
        default:
          return 'INTENT: EDIT';
      }
    })();

    const scriptContextBlock = intent === ScriptIntent.EDIT
      ? `Current script blocks (with blockIds):\n${serializedCurrent}`
      : intent === ScriptIntent.CONTINUE
        ? `Recent blocks (with blockIds):\n${serializedRecent}`
        : '';

    const outline = (input as any).outline as ScriptOutline | undefined;
    const contract = (input as any).contract as NarrativeContract | undefined;
    const outlineSummary = outline
      ? outline.sections.map((s) => `- ${s.title}: ${s.goal}`).join('\n')
      : 'None';

    const roleProfile = inferRoleFromContext(context.projectSummary || '', instruction, input.documentType);

    // Brand context: use systemBrief from ThinkForge's 3-tier retrieval (BrandDNA, facts, patterns)
    const brandBlock = context.systemBrief
      ? `<brand_context>\n${context.systemBrief}\n</brand_context>`
      : '';

    const core = this.buildCorePromptBlock({
      roleProfile,
      projectSummary: context.projectSummary || '',
      userRequest: instruction,
      contract,
      outlineSummary,
      outlineTitle: outline?.title,
      brandBlock,
    });

    return `${core}

${intentGuidance}

${scriptContextBlock}

OUTPUT FORMAT REQUIREMENTS:
- You must output valid JSON matching the AgentScriptResponse schema.
- Do not include markdown.
- Do not include commentary.
- Do not include backticks.
- The response must be a single JSON object.

${contract ? `Narrative voice: ${contract.narrator_voice || roleProfile.defaultVoice}
Tone: ${contract.tone || 'confident'}
Medium: ${contract.medium || roleProfile.defaultMedium}

Style notes:
${(contract.style_notes || []).map((n) => `- ${n}`).join('\n') || '- (none)'}

Forbidden:
${(contract.forbidden || []).map((n) => `- ${n}`).join('\n') || '- (none)'}
` : ''}

Outline (for guidance only):
${outlineSummary}

## Output Requirements
- Return JSON only. No Markdown.
- Include blockIds in patches.
- Headings are structural anchors, not literary chapter titles.
- Use this as the H1 title when possible: ${outline?.title || 'Use a clear, professional title'}
${roleProfile.sectionGuidance}
${['vfx_brief', 'budget', 'shot_list', 'research'].includes(input.documentType || '')
  ? `- Documents must be modular and scannable. Prefer short sections over long narrative blocks.
- Content must be written for reuse, clarity, and execution.
- Do not write long continuous prose blocks.
- Do not prioritize emotional language over clarity.
- Do not write to impress, write to enable execution.`
  : `- Write with voice and personality. The script should sound like a talented human, not a template.
- Use vivid, specific language. Replace generic phrases with concrete imagery.
- Let narrative breathe — short sections are fine but don't chop sentences that need flow.
- Emotion and energy are assets, not liabilities. Use them when the content calls for it.`}
- Do not mention internal systems, schemas, or validation rules.

Final rule: This must feel like something a professional would use immediately — ${['vfx_brief', 'budget', 'shot_list', 'research'].includes(input.documentType || '') ? 'clear and executable.' : 'engaging, production-ready, and worth reading.'}
`;
  }

  buildPrompt(input: AgentInput): string {
    if ((input as ScriptAuthorIntentInput)?.intent) {
      return this.buildStructuredPrompt(input as ScriptAuthorIntentInput);
    }

    const { context, userPrompt } = input;
    const outline = (input as ScriptAuthorInput).outline;
    const contract = (input as ScriptAuthorInput).contract;
    const outlineSummary = outline
      ? outline.sections
        .map((s) => `- ${s.title}: ${s.goal}`)
        .join('\n')
      : 'None';

    const roleProfile = inferRoleFromContext(
      context.projectSummary || '',
      userPrompt,
      (input as ScriptAuthorInput).documentType
    );

    // Brand context: use systemBrief from ThinkForge's 3-tier retrieval
    const brandBlock = context.systemBrief
      ? `<brand_context>\n${context.systemBrief}\n</brand_context>`
      : '';

    const core = this.buildCorePromptBlock({
      roleProfile,
      projectSummary: context.projectSummary || '',
      userRequest: userPrompt,
      contract,
      outlineSummary,
      outlineTitle: outline?.title,
      brandBlock,
    });

    const writingBlock = this.buildWritingKnowledgeBlock({
      documentType: (input as ScriptAuthorInput).documentType,
      medium: contract?.medium,
      projectSummary: context.projectSummary,
      userPrompt,
    });

    return `${core}

${writingBlock}

<output_format>
Return Markdown only. No JSON. No block IDs. No schema objects.
Use ## for major section headings (e.g., ## Scene 1: The Hook).
Use ### for sub-sections only when needed.
Use **bold** for labels like **Visual:**, **Audio:**, **Shot 1:**, **On-Screen Text:**.
Put each element (visual, audio, camera, etc.) on its own line.
</output_format>`;
  }

  async writeDocument(
    input: ScriptAuthorInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal
  ): Promise<string> {
    const { text } = await this.runComplete(input, overrides, abortSignal);
    return text.trim();
  }

  async writeStructuredResponse(
    input: ScriptAuthorIntentInput,
    overrides?: Partial<Pick<AgentConfig, 'maxTokens' | 'temperature'>>,
    abortSignal?: AbortSignal
  ): Promise<AgentScriptResponse> {
    const { text } = await this.runComplete(
      {
        ...input,
        userPrompt: input.instruction,
      },
      overrides,
      abortSignal
    );

    let parsed: unknown;
    try {
      parsed = parseAgentJson(text.trim());
    } catch (error) {
      throw new Error(`Invalid JSON from ScriptAuthorAgent: ${(error as Error).message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid AgentScriptResponse: not an object');
    }
    const result = parsed as any;
    if (result.mode !== 'replace' && result.mode !== 'insert' && result.mode !== 'patch') {
      throw new Error('Invalid AgentScriptResponse: missing or invalid mode');
    }
    if (result.mode === 'replace' || result.mode === 'insert') {
      if (!Array.isArray(result.blocks) || result.blocks.length === 0) {
        throw new Error('Invalid AgentScriptResponse: blocks required');
      }
    }
    if (result.mode === 'insert') {
      if (!result.position || typeof result.position !== 'object') {
        throw new Error('Invalid AgentScriptResponse: position required for insert');
      }
    }
    if (result.mode === 'patch') {
      if (!Array.isArray(result.patches) || result.patches.length === 0) {
        throw new Error('Invalid AgentScriptResponse: patches required');
      }
    }

    return result as AgentScriptResponse;
  }
}

export function createScriptAuthorAgent(
  config?: Partial<Omit<AgentConfig, 'agentType'>>
): ScriptAuthorAgent {
  return new ScriptAuthorAgent(config);
}
