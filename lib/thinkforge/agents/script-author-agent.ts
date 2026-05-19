import { BaseAgent, type AgentConfig } from './base-agent';
import type { AgentInput } from './types';
import type { NarrativeContract } from './script-contract-agent';
import type { ScriptOutline } from './script-outline-agent';
import type { ThinkForgeBlock } from '../schemas/thinkforge-block';
import { ScriptIntent, type AgentScriptResponse } from '../protocol/intent';
import { parseAgentJson } from '../protocol/parse-agent-json';
import { selectAllTechniques, selectTechniques, getConstraints, type TechniqueResult } from '../data/writing-graph-query';
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
  const userLower = userPrompt.toLowerCase();
  const combined = `${projectSummary} ${userPrompt}`.toLowerCase();

  // Post/article/text content — check USER PROMPT first (overrides project context).
  // A user asking "write a LinkedIn post" means a post, even if the project is about video.
  if (docType === 'post' || docType === 'article' || /\b(linkedin\s*post|twitter\s*post|x\s*post|instagram\s*caption|facebook\s*post|social\s*media\s*post|blog\s*post|article|newsletter|email\s*campaign|email\s*copy|carousel\s*post)\b/i.test(userLower)) {
    return {
      role: 'a Senior Content Strategist and Copywriter',
      executionTest: 'A social media manager should be able to say: "I can publish this immediately — it fits the platform, hooks the audience, and drives the action I need."',
      outputFeeling: 'a polished, platform-ready post or article — not a brief, not a script, not an outline',
      sectionGuidance: '- Write the FINAL copy. Not a script. Not production notes. The actual words that will be published.\n- No scene headings. No **Visual:** or **Narration:** labels. This is TEXT content.\n- Use markdown for emphasis (**bold**, *italic*) but keep formatting minimal.\n- Match the platform voice: LinkedIn is professional-conversational, Twitter is punchy, Instagram is visual-first captions.',
      defaultVoice: 'author',
      defaultMedium: 'post',
    };
  }

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
  // Video: check USER PROMPT (not combined) with broad regex. Post detection already ran,
  // so "post about video" is filtered. "video" in user prompt = production intent.
  // "video" only in project summary = NOT production intent (falls through to generic).
  if (docType === 'video_script' || /video|ad\b|commercial|reel|short[- ]?form|youtube|tiktok|brand[- ]?film|product[- ]?ad|ugc/i.test(userLower)) {
    return {
      role: 'a Senior Creative Director and Video Scriptwriter',
      executionTest: 'A video editor should be able to say: "I know exactly what to show, say, and hear in every second."',
      outputFeeling: 'a professional video production script with scene-by-scene direction',
      sectionGuidance: `- Each scene is a ## heading (e.g., ## Scene 1: The Hook).
- Within each scene, use bold labels on separate lines for each element.
- **Visual:** describes what the camera shows — a single frozen moment, no motion verbs.
- **Narration:** is the voiceover or spoken words — this IS the core script.
- **Audio:** is music/SFX direction for this scene (modulations from the project-level music brief).
- **On-Screen Text:** is graphics, titles, or captions that appear on screen.
- Keep scenes tight. One clear moment per scene. If a scene has two distinct visuals, split it.
- The output_format block below specifies which labels to use — follow it exactly.`,
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
  if (docType === 'score_direction' || /score\s*direction|soundtrack\s*brief|music\s*(brief|supervision|cue)|cue\s*sheet|composer\s*(brief|notes)/i.test(combined)) {
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

  // ─── Writing Knowledge Injection ──────────────────────────────────
  private buildWritingKnowledgeBlock(
    signals: Partial<import('../../shared/signals/types').CreativeSignals>,
  ): string {
    try {
      const techniqueMap = selectAllTechniques(signals, 2);
      const antiAiConstraints = getConstraints('Anti-AI Constraints');

      if (techniqueMap.size === 0 && antiAiConstraints.length === 0) {
        console.log('[ThinkForge:WritingKnowledge] No techniques or constraints matched. Signals provided:', Object.keys(signals).length);
        return '';
      }

      const lines: string[] = ['<writing_knowledge>'];
      let techniqueCount = 0;

      techniqueMap.forEach((techniques: TechniqueResult[], category: string) => {
        const top = techniques[0];
        if (!top) return;
        techniqueCount++;
        lines.push(`${category.toUpperCase()} TECHNIQUE: ${top.id}`);
        if (top.primary) lines.push(`  DO: ${top.primary}`);
        if (top.example) lines.push(`  EXAMPLE: ${top.example}`);
        if (top.why) lines.push(`  WHY IT WORKS: ${top.why}`);
        if (top.antiPatterns && top.antiPatterns.length > 0) {
          lines.push(`  NEVER: ${top.antiPatterns.join(' | ')}`);
        }
        if (top.weightResponse) {
          for (const [k, v] of Object.entries(top.weightResponse)) {
            lines.push(`  IF ${k}: ${v}`);
          }
        }
        lines.push('');
      });

      if (antiAiConstraints.length > 0) {
        lines.push('WRITING QUALITY (non-negotiable):');
        lines.push('  - Every claim needs a SPECIFIC DETAIL. Not "saves time" but "cuts 3-hour edits to 12 minutes."');
        lines.push('  - Sound like a HUMAN copywriter. If a sentence could appear in any SaaS ad unchanged, rewrite it.');
        lines.push('  - Vary sentence rhythm. Short punch. Then a longer sentence that builds momentum. Then punch again.');
        for (const c of antiAiConstraints) {
          lines.push(`  - ${c.why || c.detection || ''}`);
        }
      }

      lines.push('</writing_knowledge>');
      console.log(`[ThinkForge:WritingKnowledge] Injected ${techniqueCount} techniques + ${antiAiConstraints.length} constraints`);
      return lines.join('\n');
    } catch (e) {
      console.error('[ThinkForge:WritingKnowledge] Failed to build knowledge block:', e);
      return '';
    }
  }

  // ─── Output Format (RC1+RC2: signal-driven, not hardcoded) ────────
  private buildOutputFormatBlock(params: {
    documentType?: string;
    medium?: string;
    signals: Partial<import('../../shared/signals/types').CreativeSignals>;
  }): string {
    const { documentType, medium, signals } = params;
    const docType = (documentType || medium || '').toLowerCase();

    const isVideo = /video|film|ad|commercial|reel|short.?form|youtube|tiktok|ugc/i.test(docType);
    const isShotList = /shot.?list|storyboard|pre.?viz/i.test(docType);

    if (!isVideo && !isShotList) {
      return `<output_format>
Return Markdown. Use ## for sections, ### for sub-sections.
Write as final copy — not a brief, outline, or commentary.
</output_format>`;
    }

    if (isShotList) {
      return `<output_format>
Return Markdown. Use ## for scene groups, ### for individual shots.
Labels per shot: **Shot:**, **Camera:**, **Framing:**, **Motion:**, **Audio:**, **Duration:**.
</output_format>`;
    }

    const narrationTechniques = selectTechniques(signals, 'narration_mode', 1);
    const narrationMode = narrationTechniques[0]?.id || 'narration_anchor';

    const labels: string[] = [];
    if (narrationMode !== 'narration_minimal') {
      labels.push('**Narration:** (the voiceover / spoken words — this IS the script)');
    }
    labels.push('**Visual:** (what the camera shows — a single frozen moment, no motion verbs)');
    labels.push('**Audio:** (music direction, ambient sound, SFX for this scene)');
    labels.push('**On-Screen Text:** (graphics, titles, captions that appear on screen)');
    if (narrationMode === 'narration_minimal') {
      labels.push('**Text Overlay:** (key messages shown visually — no voiceover in this content)');
    }

    return `<output_format>
Return Markdown only. No JSON. No block IDs.
Use ## for scene headings (e.g., ## Scene 1: The Hook).
Each scene MUST have these elements, each on its own line:
${labels.map(l => '  ' + l).join('\n')}
MUSIC DIRECTION: Write ONE project-level music brief BEFORE the first scene:
  ## Music Direction
  **Style:** (genre, mood, reference tracks)
  **Tempo:** (BPM range or feel)
  **Arc:** (how music evolves across the piece)
  Then per-scene, use **Audio:** for scene-specific modulations only.
</output_format>`;
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
- Do NOT start with an H1 title heading — the system renders the title separately. Begin directly with the content.
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

    const documentType = (input as ScriptAuthorInput).documentType;
    const medium = contract?.medium;
    const signals = extractSignalsFromContext({
      documentType,
      medium,
      projectSummary: context.projectSummary,
      userPrompt,
    });

    const writingBlock = this.buildWritingKnowledgeBlock(signals);
    const outputFormat = this.buildOutputFormatBlock({ documentType, medium, signals });

    return `${core}

${writingBlock}

${outputFormat}`;
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
