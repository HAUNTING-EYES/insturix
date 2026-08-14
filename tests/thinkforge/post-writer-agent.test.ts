import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const writerMocks = vi.hoisted(() => ({
  generateStructured: vi.fn(),
}));

vi.mock('@/lib/thinkforge/services/gemini-writing-context-cache', () => ({
  generateStructuredWithWritingContextCache: writerMocks.generateStructured,
}));

import {
  assertUsablePostWriterResult,
  PostWriterAgent,
  type PostWriterInput,
  type PostWriterResult,
} from '@/lib/thinkforge/agents/post-writer-agent';
import { resolveContentSignalProfile } from '@/lib/thinkforge/signals';
import { buildThinkForgeSourceLedger } from '@/lib/thinkforge/provenance/source-ledger';

const baseInput: PostWriterInput = {
  context: {
    projectSummary: 'Platform: LinkedIn. Audience: agency founders. Topic: content approval bottlenecks.',
  },
  userPrompt: 'Write a LinkedIn post for agency founders about reducing approval loops and send it to Clickatron.',
};

function completeLinkedInPost(): string {
  return [
    'Your approval loop is not slow because the creative team lacks effort.',
    '',
    'It is slow because every asset has three half-owners, five comment threads, and no single person allowed to say final.',
    '',
    'The fix is not another status meeting. Pick one approval owner before production starts, route every note through that person, and make the final decision visible to the team.',
    '',
    'That one change gives editors fewer contradictions, gives account leads a cleaner client conversation, and gives the brand a real publish line instead of a pile of almost-approved drafts.',
    '',
    'Try this on your next campaign: assign the approval owner before the first draft leaves the editor.',
    '',
    '#CreativeOps #AgencyOps #ContentWorkflow',
  ].join('\n');
}

function makeResult(overrides: Partial<PostWriterResult> = {}): PostWriterResult {
  return {
    content: completeLinkedInPost(),
    hashtags: ['#CreativeOps', '#AgencyOps', '#ContentWorkflow'],
    contentAnalysis: {
      tone: 'direct',
      vibe: 'operational',
      theme: 'approval ownership',
      qualityScore: 91,
      violations: [],
    },
    clickatron: {
      singleImagePrompt: 'A restrained editorial workflow scene with one clear approval lane replacing scattered abstract comment threads, generous headline-safe negative space, no readable UI labels.',
    },
    metadata: {
      platform: 'linkedin',
      charCount: completeLinkedInPost().length,
    },
    ...overrides,
  };
}

function flowLedgerInput(): PostWriterInput {
  const userPrompt = 'Write a LinkedIn post for FlowLedger about SOC 2 readiness. Mention that the beta cut evidence-chasing time by 37% across 12 pilot teams. Target CFOs and RevOps leaders.';
  return {
    context: {
      projectSummary: 'FlowLedger is workflow automation for finance teams preparing audit evidence.',
      systemBrief: 'Brand: FlowLedger. Voice: precise, calm, operator-led.',
    },
    userPrompt,
    contentSignalProfile: resolveContentSignalProfile({
      userPrompt,
      documentType: 'post',
      project: { platform: 'LinkedIn', format: 'post' },
    }),
    sourceLedger: buildThinkForgeSourceLedger({ userPrompt }),
  };
}

function claimSentences(content: string): string[] {
  return content
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)
    .filter((sentence) => !/^(?:#[\p{L}\p{N}_]+\s*)+$/u.test(sentence))
    .filter((sentence) => !sentence.endsWith('?'))
    .filter((sentence) => !/https?:\/\/|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/i.test(sentence))
    .filter((sentence) => !/^(?:please\s+)?(?:apply|ask|book|buy|call|claim|comment|compare|contact|dm|donate|download|get|join|keep|learn|map|message|pick|register|reply|repost|reserve|route|save|schedule|send|share|shop|sign\s+up|tag|try|visit|watch)\b/i.test(sentence));
}

function claimSupportFromSource(
  content: string,
  sourceRef: string,
  sourceExcerpt: string,
): NonNullable<PostWriterResult['contentAnalysis']['claimSupport']> {
  return claimSentences(content).map((sentence) => ({
    sentence,
    sourceRef,
    sourceExcerpt,
    relationship: 'paraphrase' as const,
  }));
}

function withClaimSupport(
  result: PostWriterResult,
  sourceRef: string,
  sourceExcerpt: string,
): PostWriterResult {
  result.contentAnalysis.claimSupport = claimSupportFromSource(
    result.content,
    sourceRef,
    sourceExcerpt,
  );
  return result;
}

function completeFlowLedgerPost(): string {
  return [
    "CFOs and RevOps leaders: the beta's 37% cut belongs to 12 pilot teams, not every SOC 2 workflow.",
    '',
    'The beta cut evidence-chasing time by 37% across 12 pilot teams.',
    '',
    'FlowLedger is workflow automation for finance teams preparing audit evidence. Treat the beta as a measured reference point, not a forecast for another team.',
    '',
    "Map your own evidence-chasing before making a comparison: where requests enter, who owns each item, which handoff waits, and what must be ready for review. Compare that workflow with the beta's measured scope rather than borrowing its result.",
    '',
    'Keep the question narrow enough to answer: one evidence handoff, one owner, and one point where follow-up stalls. The beta gives you a reference for that review, while the 12-team boundary stays visible.',
    '',
    'CFOs and RevOps leaders: where does SOC 2 evidence-chasing slow your finance team down?',
    '',
    '#SOC2 #FinanceOps #RevOps #AuditReadiness',
  ].join('\n');
}

function makeFlowLedgerResult(content = completeFlowLedgerPost()): PostWriterResult {
  const result = makeResult({
    content,
    hashtags: ['#SOC2', '#FinanceOps', '#RevOps', '#AuditReadiness'],
    clickatron: {
      singleImagePrompt: 'A CFO and a RevOps lead cross-check a physical evidence packet against an abstract SOC 2 audit workflow, with evidence folders, calm directional light, and generous headline-safe negative space on the left. No readable text.',
    },
  });
  const input = flowLedgerInput();
  result.contentAnalysis.claimSupport = claimSentences(content).map((sentence) => {
    const usesProjectSummary = sentence.includes('FlowLedger is workflow automation');
    const bounded = /\b(?:boundary|forecast|measured|reference)\b/i.test(sentence);
    return {
      sentence,
      sourceRef: usesProjectSummary ? 'project_summary' : 'brief_user',
      sourceExcerpt: usesProjectSummary
        ? input.context.projectSummary
        : input.userPrompt,
      relationship: bounded ? 'bounded_implication' as const : 'paraphrase' as const,
    };
  });
  return result;
}

describe('assertUsablePostWriterResult', () => {
  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    writerMocks.generateStructured.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps the post writer source valid UTF-8 for Vercel webpack/SWC', () => {
    const source = readFileSync(resolve(process.cwd(), 'lib/thinkforge/agents/post-writer-agent.ts'));
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(source)).not.toThrow();
  });
  it('authors visual-only Clickatron prompts and leaves exact copy to editable layers', () => {
    const prompt = new PostWriterAgent().buildPrompt(baseInput);

    expect(prompt).toContain('Keep every image prompt visual-only.');
    expect(prompt).toContain('Exact copy remains in content and is derived into editable Clickatron text layers downstream.');
    expect(prompt).toContain('abstract or defocused shapes with no legible text or invented brand marks');
    expect(prompt).toContain('ThinkForge derives final editable copy from the post content downstream.');
    expect(prompt).toContain('A supplied number alone is not a hook');
    expect(prompt).toContain('Never invent an outreach route.');
    expect(prompt).toContain('Ground each prompt in at least two supplied visual cues');
    expect(prompt).toContain('<post_length_contract>');
    expect(prompt).toContain('Body minimum: 500 characters.');
    expect(prompt).not.toContain('exact overlay text');
    expect(prompt).not.toContain('what exact text should be editable');
    expect(prompt).not.toContain('include editable overlay text when text appears');
  });

  it('uses post craft defaults when no resolved signal profile is available', () => {
    const prompt = new PostWriterAgent().buildPrompt({
      context: {
        projectSummary: 'FlowLedger is workflow automation for finance teams preparing audit evidence.',
      },
      userPrompt: 'Write a LinkedIn post about SOC 2 evidence. Our beta cut evidence chasing by 37% across 12 pilot teams.',
    });

    expect(prompt).toContain('<writing_knowledge>');
    expect(prompt).not.toContain('HOOK: question_hook');
    expect(prompt).not.toContain('NARRATION_MODE: narration_complement');
  });

  it('places resolved proof, audience, and explicit claim sources inside the isolated writer data', () => {
    const input = flowLedgerInput();
    const prompt = new PostWriterAgent().buildPrompt(input);

    expect(prompt).toContain('Required brief claim: the beta cut evidence-chasing time by 37% across 12 pilot teams');
    expect(prompt).toContain('Required audience anchor: CFOs and RevOps leaders');
    expect(prompt).toContain('brandContext is a style directive, never factual evidence');
    expect(prompt).toContain('"claimSources": [');
    expect(prompt).toContain('"sourceRef": "brief_user"');
    expect(prompt).toContain(`"sourceText": "${input.userPrompt}"`);
    expect(prompt).toContain('"sourceRef": "project_summary"');
    expect(prompt).not.toContain('"sourceRef": "brand_context"');
    expect(prompt).toContain('Body minimum: 500 characters.');
    expect(prompt).toContain('Target: 600 characters. Platform max: 1100.');
    expect(prompt).toContain('ThinkForge resolves sourceExcerpt from that authoritative sourceRef');
    expect(prompt).not.toContain('HOOK: outcome_hook');
    expect(prompt).not.toContain('CTA: hard_cta');
  });

  it('rejects a stale hidden claim ledger instead of accepting a different visible post', () => {
    const input = flowLedgerInput();
    const result = makeFlowLedgerResult();
    result.contentAnalysis.claimSupport?.push({
      sentence: 'This stale sentence was never published.',
      sourceRef: 'brief_user',
      sourceExcerpt: input.userPrompt,
      relationship: 'paraphrase',
    });

    expect(() => assertUsablePostWriterResult(result, input)).toThrow('claim_support_stale_sentence');
  });

  it('replaces model-supplied source excerpts with canonical claim-source evidence', async () => {
    const input = flowLedgerInput();
    const modelResult = makeFlowLedgerResult();
    modelResult.contentAnalysis.claimSupport?.forEach((entry) => {
      entry.sourceExcerpt = 'model-authored evidence that must never reach the audit ledger';
    });
    writerMocks.generateStructured.mockResolvedValue({
      result: modelResult,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new PostWriterAgent().runStructured(input, { temperature: 0.45 });
    const briefEntry = output.result.contentAnalysis.claimSupport?.find(
      (entry) => entry.sourceRef === 'brief_user',
    );
    const projectEntry = output.result.contentAnalysis.claimSupport?.find(
      (entry) => entry.sourceRef === 'project_summary',
    );

    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(1);
    expect(briefEntry?.sourceExcerpt).toBe(input.userPrompt);
    expect(projectEntry?.sourceExcerpt).toBe(input.context.projectSummary);
    expect(output.result.contentAnalysis.claimSupport?.some((entry) => (
      entry.sourceExcerpt?.includes('model-authored evidence')
    ))).toBe(false);
  });

  it('uses the metric-bearing claim as the evidence spine when a webinar is also supplied', () => {
    const userPrompt = [
      'Write a LinkedIn post for CivicDesk.',
      'Pilot detail: Maple County reduced duplicate ticket handling by 18% over six weeks, but we cannot promise every city will get the same result.',
      'Mention the webinar on July 8 with former 311 director Priya Menon.',
    ].join(' ');
    const prompt = new PostWriterAgent().buildPrompt({
      context: { projectSummary: 'CivicDesk is case-management software for local service desks.' },
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({
        userPrompt,
        documentType: 'post',
        project: { platform: 'LinkedIn', format: 'post' },
      }),
    });

    expect(prompt).toContain(
      '"requiredClaim": "Maple County reduced duplicate ticket handling by 18% over six weeks, but we cannot promise every city will get the same result"',
    );
    expect(prompt).not.toContain(
      '"requiredClaim": "the webinar on July 8 with former 311 director Priya Menon"',
    );
  });

  it('passes a source-only event plan to the writer without inventing visual form', () => {
    const userPrompt = 'Write a Facebook post recruiting volunteers for a neighborhood cleanup on April 22. We have 500 cleanup kits, check-in starts at 8:30am, and registration is at community.example/cleanup.';
    const prompt = new PostWriterAgent().buildPrompt({
      context: { projectSummary: 'A local nonprofit coordinates neighborhood volunteer days.' },
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({
        userPrompt,
        documentType: 'post',
        project: { platform: 'Facebook', format: 'post' },
      }),
      sourceLedger: buildThinkForgeSourceLedger({ userPrompt }),
    });

    expect(prompt).toContain('"editorialShape": "event_action"');
    expect(prompt).toContain('"sourceBoundary": "source_only"');
    expect(prompt).toContain('unsupplied causes, conditions, or community problems');
    expect(prompt).toContain('Use only source-supplied event evidence');
    expect(prompt).toContain('Body minimum: 150 characters.');
    expect(prompt).toContain('Aim for 450 characters');
    expect(prompt).not.toContain('HOOK: outcome_hook');
    expect(prompt).not.toContain('STRUCTURE: problem_agitate_solve');
    expect(prompt).toContain('When sourceBoundary is source_only');
    expect(prompt).toContain('Every entry in forbiddenNarrativeExpansions is binding');
  });

  it('rejects unsupplied causal and impact claims in a source-only event post', () => {
    const userPrompt = 'Write a Facebook post recruiting volunteers for a neighborhood cleanup on April 22 at Pier 9. We have 500 cleanup kits, check-in starts at 8:30am, families are welcome, and registration is at community.example/cleanup.';
    const input: PostWriterInput = {
      context: { projectSummary: 'A local nonprofit coordinates neighborhood volunteer days.' },
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({
        userPrompt,
        documentType: 'post',
        project: { platform: 'Facebook', format: 'post' },
      }),
    };
    const inventedImpact = [
      'Pier 9 needs us on April 22.',
      '',
      'The river is vital, and litter impacts local wildlife. This cleanup will restore the public space and make a tangible difference for every family.',
      '',
      'Check-in starts at 8:30am. RiverAid has 500 cleanup kits, and families are welcome.',
      '',
      'Register at community.example/cleanup.',
      '',
      '#CommunityCleanup #Pier9 #Volunteer',
    ].join('\n');

    expect(() => assertUsablePostWriterResult(makeResult({
      content: inventedImpact,
      hashtags: ['#CommunityCleanup', '#Pier9', '#Volunteer'],
      clickatron: {
        singleImagePrompt: 'Volunteers at a neighborhood cleanup beside Pier 9 with cleanup kits and families checking in, plus clear headline-safe negative space and no readable text.',
      },
    }), input)).toThrow(/source_only_unsupported_claim:(?:impact|outcome|importance)_expansion/);
  });

  it('allows an impact claim when that exact claim family is supplied by the brief', () => {
    const userPrompt = 'Write a Facebook post about a cleanup on April 22 at Pier 9. The cleanup protects local wildlife. Check-in starts at 8:30am and register at community.example/cleanup.';
    const input: PostWriterInput = {
      context: { projectSummary: 'A local nonprofit coordinates neighborhood volunteer days.' },
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({
        userPrompt,
        documentType: 'post',
        project: { platform: 'Facebook', format: 'post' },
      }),
    };
    const suppliedImpact = [
      'Protect local wildlife at Pier 9 on April 22.',
      '',
      'The cleanup protects local wildlife. Check-in starts at 8:30am.',
      '',
      'Register at community.example/cleanup.',
      '',
      '#Pier9 #LocalWildlife #CommunityCleanup',
    ].join('\n');

    try {
      assertUsablePostWriterResult(withClaimSupport(makeResult({
        content: suppliedImpact,
        hashtags: ['#Pier9', '#LocalWildlife', '#CommunityCleanup'],
        clickatron: {
          singleImagePrompt: 'A Pier 9 cleanup for local wildlife with volunteers checking in, cleanup supplies, and clear headline-safe negative space with no readable text.',
        },
      }), 'brief_user', userPrompt), input);
    } catch (error) {
      expect(String(error)).not.toContain('source_only_unsupported_claim');
    }
  });

  it('allows grounded Spanish event copy and still rejects invented Spanish impact', () => {
    const userPrompt = 'Escribe un post de Instagram para un taller de plantas este sabado a las 11am en Calle Prado 14. Hay 20 plazas y cafe gratis. Inscripcion: lunaverde.es/taller.';
    const input: PostWriterInput = {
      context: { projectSummary: 'Una cafeteria organiza talleres pequenos de barrio.' },
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({
        userPrompt,
        documentType: 'post',
        project: { platform: 'Instagram', format: 'post' },
      }),
      sourceLedger: buildThinkForgeSourceLedger({ userPrompt }),
    };
    const groundedContent = [
      'Este sabado, taller de plantas para principiantes en Calle Prado 14.',
      '',
      'Empezamos a las 11am. Hay 20 plazas y cafe gratis para quienes se apunten.',
      '',
      'Guarda la fecha y reserva tu plaza en lunaverde.es/taller.',
      '',
      '#TallerDePlantas #Madrid #LunaVerde #Plantas #CafeDeBarrio',
    ].join('\n');
    const visual = 'Una mesa de taller con plantas pequenas, veinte macetas agrupadas y tazas de cafe en Calle Prado, con espacio negativo seguro para texto y sin letras legibles.';

    expect(() => assertUsablePostWriterResult(withClaimSupport(makeResult({
      content: groundedContent,
      hashtags: ['#TallerDePlantas', '#Madrid', '#LunaVerde', '#Plantas', '#CafeDeBarrio'],
      clickatron: { singleImagePrompt: visual },
      metadata: { platform: 'instagram', charCount: groundedContent.length },
    }), 'brief_user', userPrompt), input)).not.toThrow();

    const inventedImpact = groundedContent.replace(
      'Empezamos a las 11am.',
      'Este taller mejora la salud mental y transforma el barrio. Empezamos a las 11am.',
    );
    expect(() => assertUsablePostWriterResult(makeResult({
      content: inventedImpact,
      hashtags: ['#TallerDePlantas', '#Madrid', '#LunaVerde', '#Plantas', '#CafeDeBarrio'],
      clickatron: { singleImagePrompt: visual },
      metadata: { platform: 'instagram', charCount: inventedImpact.length },
    }), input)).toThrow(/source_only_unsupported_claim:(?:impact|outcome)_expansion/);
  });

  it('resolves Spanish from the brief and rejects the captured English eval output', () => {
    const userPrompt = 'Escribe un post de Instagram en espanol para Luna Verde. Evento: taller de plantas para principiantes este sabado a las 11am en Calle Prado 14, Madrid. Hay 20 plazas y cafe gratis. Inscripcion: lunaverde.es/taller.';
    const contentSignalProfile = resolveContentSignalProfile({
      userPrompt,
      documentType: 'post',
      project: { platform: 'Instagram', format: 'post' },
    });
    const input: PostWriterInput = {
      context: {
        projectSummary: 'Luna Verde is a cafe and plant shop in Madrid running small neighborhood events.',
        systemBrief: 'Marca: Luna Verde. Voz: cercana, tranquila, de barrio.',
      },
      userPrompt,
      contentSignalProfile,
      sourceLedger: buildThinkForgeSourceLedger({ userPrompt }),
    };
    const capturedEnglishOutput = [
      'The scent of fresh coffee and damp earth fills Calle Prado 14, Madrid.',
      '',
      'This Saturday at 11am, Luna Verde invites you to our beginner plant workshop. It is the perfect chance to learn the basics and bring home some green joy. We are offering free coffee too.',
      '',
      'With only 20 spots available, you will get personalized guidance to kickstart your plant journey. Discover simple care tips and connect with fellow enthusiasts in our cozy neighborhood space.',
      '',
      'Secure your spot now at lunaverde.es/taller.',
      '',
      '#LunaVerde #PlantWorkshop #MadridEvents #BeginnerPlants #CafeYPlantas',
    ].join('\n');
    const result = withClaimSupport(makeResult({
      content: capturedEnglishOutput,
      hashtags: ['#LunaVerde', '#PlantWorkshop', '#MadridEvents', '#BeginnerPlants', '#CafeYPlantas'],
      clickatron: {
        singleImagePrompt: 'A Luna Verde beginner plant workshop in Madrid with small plants, coffee cups, and Calle Prado neighborhood details, plus generous text-safe negative space and no readable text.',
      },
      metadata: { platform: 'instagram', charCount: capturedEnglishOutput.length },
    }), 'brief_user', userPrompt);

    expect(contentSignalProfile.profile.constraints.language).toBe('es');
    expect(new PostWriterAgent().buildPrompt(input)).toMatch(/"language":\s*"es"/);
    expect(() => assertUsablePostWriterResult(result, input))
      .toThrow(/output_language_mismatch:en\/es/);
  });

  it('rejects soft event padding that has low support in the authorized sources', () => {
    const userPrompt = 'Write a Facebook post for RiverAid recruiting volunteers for a cleanup on April 22 at Pier 9. We have 500 cleanup kits, check-in starts at 8:30am, families are welcome, and registration is at riveraid.org/cleanup.';
    const input: PostWriterInput = {
      context: { projectSummary: 'RiverAid organizes city river cleanup drives and youth education.' },
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({
        userPrompt,
        documentType: 'post',
        project: { platform: 'Facebook', format: 'post' },
      }),
      sourceLedger: buildThinkForgeSourceLedger({ userPrompt }),
    };
    const paddedEvent = [
      'Join RiverAid for a city river cleanup on April 22 at Pier 9!',
      '',
      "We're recruiting volunteers for a community cleanup at Pier 9. This is a practical way to participate, and we're making it easy for everyone.",
      '',
      'Check-in starts at 8:30am on April 22. We have 500 cleanup kits ready, ensuring all volunteers are equipped for the task. Families are welcome to join us for a productive morning.',
      '',
      'Register now at riveraid.org/cleanup.',
      '',
      '#RiverAid #Cleanup',
    ].join('\n');

    expect(() => assertUsablePostWriterResult(makeResult({
      content: paddedEvent,
      hashtags: ['#RiverAid', '#Cleanup'],
      clickatron: {
        singleImagePrompt: 'RiverAid volunteers check in at a Pier 9 cleanup with 500 cleanup kits and families, plus clear headline-safe negative space and no readable text.',
      },
    }), input)).toThrow(/source_only_low_support_sentence/);
  });

  it('accepts natural event phrasing when at least three source anchors support the sentence', () => {
    const userPrompt = 'Write a Facebook post for RiverAid recruiting volunteers for a cleanup on April 22 at Pier 9. We have 500 cleanup kits, check-in starts at 8:30am, families are welcome, and registration is at riveraid.org/cleanup.';
    const input: PostWriterInput = {
      context: { projectSummary: 'RiverAid organizes city river cleanup drives and youth education.' },
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({
        userPrompt,
        documentType: 'post',
        project: { platform: 'Facebook', format: 'post' },
      }),
    };
    const content = [
      'RiverAid is recruiting volunteers for its April 22 cleanup at Pier 9.',
      '',
      'The cleanup is set up so families can take part alongside other neighborhood volunteers. RiverAid will provide 500 cleanup kits at check-in, which starts at 8:30am.',
      '',
      'Register at riveraid.org/cleanup.',
      '',
      '#RiverAid #Cleanup',
    ].join('\n');

    expect(() => assertUsablePostWriterResult(withClaimSupport(makeResult({
      content,
      hashtags: ['#RiverAid', '#Cleanup'],
      clickatron: {
        singleImagePrompt: 'RiverAid volunteers and families checking in beside grouped cleanup kits at Pier 9, with generous negative space on the left and no readable text.',
      },
      metadata: { platform: 'facebook', charCount: content.length },
    }), 'brief_user', userPrompt), input)).not.toThrow();
  });

  it('repairs low-support event padding through the existing single repair pass', async () => {
    const userPrompt = 'Write a Facebook post for RiverAid recruiting volunteers for a cleanup on April 22 at Pier 9. We have 500 cleanup kits, check-in starts at 8:30am, families are welcome, and registration is at riveraid.org/cleanup.';
    const input: PostWriterInput = {
      context: { projectSummary: 'RiverAid organizes city river cleanup drives and youth education.' },
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({
        userPrompt,
        documentType: 'post',
        project: { platform: 'Facebook', format: 'post' },
      }),
      sourceLedger: buildThinkForgeSourceLedger({ userPrompt }),
    };
    const paddedEvent = [
      'Join RiverAid for a city river cleanup on April 22 at Pier 9!',
      '',
      "We're recruiting volunteers for a community cleanup at Pier 9. This is a practical way to participate, and we're making it easy for everyone.",
      '',
      'Check-in starts at 8:30am on April 22. We have 500 cleanup kits ready, ensuring all volunteers are equipped for the task. Families are welcome to join us for a productive morning.',
      '',
      'Register now at riveraid.org/cleanup.',
      '',
      '#RiverAid #Cleanup',
    ].join('\n');
    const repairedEvent = [
      'RiverAid is recruiting volunteers for its April 22 cleanup at Pier 9.',
      '',
      'Check-in starts at 8:30am. RiverAid will have 500 cleanup kits for volunteers, and families are welcome at the Pier 9 cleanup.',
      '',
      'For volunteers and families, the event details are April 22 at Pier 9, with check-in at 8:30am and 500 cleanup kits available.',
      '',
      'Register at riveraid.org/cleanup.',
      '',
      '#RiverAid #Cleanup',
    ].join('\n');
    const clickatron = {
      singleImagePrompt: 'RiverAid volunteers check in at a Pier 9 cleanup with 500 cleanup kits and families, plus clear headline-safe negative space and no readable text.',
    };
    writerMocks.generateStructured
      .mockResolvedValueOnce({
        result: makeResult({ content: paddedEvent, hashtags: ['#RiverAid', '#Cleanup'], clickatron }),
        cacheStatus: 'hit',
        modelName: 'models/gemini-2.5-flash',
      })
      .mockResolvedValueOnce({
        result: withClaimSupport(
          makeResult({ content: repairedEvent, hashtags: ['#RiverAid', '#Cleanup'], clickatron }),
          'brief_user',
          userPrompt,
        ),
        cacheStatus: 'created',
        modelName: 'models/gemini-2.5-flash',
      });

    const output = await new PostWriterAgent().runStructured(input, { temperature: 0.45 });

    expect(output.result.content).toBe(repairedEvent);
    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(2);
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].systemInstruction).toContain(
      'source_only_low_support_sentence',
    );
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].prompt).toContain('validatorDiagnostics');
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].prompt).toContain(
      'This is a practical way to participate',
    );
    expect(output.metadata?.notes).toContain('post_contract_repair:applied');
  });

  it('rejects unsupported generalized outcomes in a thin evidence post', () => {
    const content = completeFlowLedgerPost().replace(
      'FlowLedger is workflow automation for finance teams preparing audit evidence. Treat the beta as a measured reference point, not a forecast for another team.',
      'This streamlines finance operations and enables teams to optimize revenue work with greater confidence.',
    );

    expect(() => assertUsablePostWriterResult(makeFlowLedgerResult(content), flowLedgerInput()))
      .toThrow(/thin_evidence_unsupported_sentence/);
  });

  it('rejects invented efficiency outcomes even when they reuse supplied workflow nouns', () => {
    const content = completeFlowLedgerPost().replace(
      'FlowLedger is workflow automation for finance teams preparing audit evidence. Treat the beta as a measured reference point, not a forecast for another team.',
      'This capability helps finance teams manage audit evidence more efficiently. By automatically grouping requests, teams can dedicate their effort to higher-value reviews.',
    );

    expect(() => assertUsablePostWriterResult(makeFlowLedgerResult(content), flowLedgerInput()))
      .toThrow(/thin_evidence_unsupported_sentence/);
  });

  it('rejects the captured B2B eval output when source nouns mask invented outcomes', () => {
    const capturedOutput = [
      'For CFOs and RevOps leaders, the Q4 audit season brings the challenge of SOC 2 evidence preparation. The beta cut evidence-chasing time by 37% across 12 pilot teams.',
      '',
      'This result means finance teams spent 37% less time on the specific task of chasing audit evidence during the beta. The manual collection and verification of SOC 2 evidence is a known friction point before Q4 audit season.',
      '',
      'The reduction in this specific workflow step means less reactive effort is dedicated to locating individual documents. This shifts the operational burden away from extensive manual evidence collection.',
      '',
      'CFOs and RevOps leaders: Which SOC 2 evidence handoff needs a clear owner before Q4 audit season?',
      '',
      '#FlowLedger #SOC2 #AuditPrep #FinanceTeams #WorkflowAutomation',
    ].join('\n');

    expect(() => assertUsablePostWriterResult(
      makeFlowLedgerResult(capturedOutput),
      flowLedgerInput(),
    )).toThrow(/claim_support_(?:low_overlap|unbounded_implication)/);
  });

  it('requires proof attribution in the hook for measured beta evidence', () => {
    const content = completeFlowLedgerPost().replace(
      "CFOs and RevOps leaders: the beta's 37% cut belongs to 12 pilot teams, not every SOC 2 workflow.",
      'A 37% result changes SOC 2 evidence-chasing before Q4.',
    );

    expect(() => assertUsablePostWriterResult(makeFlowLedgerResult(content), flowLedgerInput()))
      .toThrow(/hook_missing_proof_attribution/);
  });

  it('requires the exact supplied destination in the CTA', () => {
    const userPrompt = [
      'Write a LinkedIn post for CivicDesk.',
      'Maple County reduced duplicate ticket handling by 18% over six weeks.',
      'Mention the webinar with Priya Menon.',
      'Registration URL: civicdesk.com/webinar.',
    ].join(' ');
    const input: PostWriterInput = {
      context: { projectSummary: 'CivicDesk supports local service desks.' },
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({
        userPrompt,
        documentType: 'post',
        project: { platform: 'LinkedIn', format: 'post' },
      }),
    };
    const content = completeFlowLedgerPost()
      .replace(/FlowLedger/g, 'CivicDesk')
      .replace(/37%/g, '18%')
      .replace('the beta cut evidence-chasing time by 18% across 12 pilot teams.', 'Maple County reduced duplicate ticket handling by 18% over six weeks.')
      .replace(
        'CFOs and RevOps leaders: where does SOC 2 evidence-chasing slow your finance team down?',
        'Join the webinar with Priya Menon.com/webinar.',
      );

    expect(() => assertUsablePostWriterResult(makeResult({ content }), input))
      .toThrow(/cta_missing_supplied_destination|unsupplied_destination/);
  });

  it('accepts a complete publishable social post with Clickatron visual instructions', () => {
    expect(() => assertUsablePostWriterResult(makeResult(), baseInput)).not.toThrow();
    expect(() => assertUsablePostWriterResult(makeFlowLedgerResult(), flowLedgerInput())).not.toThrow();
  });

  it('rejects weak fallback output with no CTA', () => {
    const noCta = [
      'Approval loops become expensive when every stakeholder leaves notes in a different lane and no single person owns the final decision.',
      '',
      'The result is slower review, nervous editors, and a final asset shaped by the loudest thread instead of the clearest campaign priority.',
      '',
      'Teams notice the cost only after publish windows pass, client confidence drops, and the same debate appears during the next launch cycle.',
      '',
      'A stronger operating rhythm begins with one accountable owner, a visible decision log, and fewer private revision channels across the campaign.',
      '',
      '#CreativeOps #AgencyOps',
    ].join('\n');

    expect(() => assertUsablePostWriterResult(makeResult({ content: noCta }), baseInput)).toThrow(
      /missing_action_cta/,
    );
  });

  it('rejects a generic CTA until the existing repair path makes it actionable', () => {
    const genericCta = completeLinkedInPost().replace(
      'Try this on your next campaign: assign the approval owner before the first draft leaves the editor.',
      'Discover how approval ownership changes your workflow.',
    );

    expect(() => assertUsablePostWriterResult(makeResult({ content: genericCta }), baseInput)).toThrow(
      /generic_cta/,
    );
  });

  it('rejects stock Clickatron office visuals', () => {
    expect(() => assertUsablePostWriterResult(makeResult({
      clickatron: {
        singleImagePrompt: 'A modern office team around a sleek dashboard with soft light and no readable text.',
      },
    }), baseInput)).toThrow(/generic_clickatron_visual/);
  });

  it('rejects a bare required-proof hook, generic status question, or visual without safe space', () => {
    const weakFlowPost = completeFlowLedgerPost()
      .replace(
        "CFOs and RevOps leaders: the beta's 37% cut belongs to 12 pilot teams, not every SOC 2 workflow.",
        'The beta cut evidence-chasing time by 37% across 12 pilot teams.',
      )
      .replace(
        'CFOs and RevOps leaders: where does SOC 2 evidence-chasing slow your finance team down?',
        'How is your team preparing for SOC 2 audit season?',
      );

    expect(() => assertUsablePostWriterResult(makeResult({
      content: weakFlowPost,
      clickatron: {
        singleImagePrompt: 'A document review table with evidence folders and an abstract audit workflow, no readable text.',
      },
    }), flowLedgerInput())).toThrow(/bare_required_claim_hook/);
  });

  it('rejects an invented DM route when the brief does not supply one', () => {
    const inventedOutreach = completeLinkedInPost().replace(
      'Try this on your next campaign: assign the approval owner before the first draft leaves the editor.',
      'DM us to discuss how approval ownership changes your workflow.',
    );

    expect(() => assertUsablePostWriterResult(makeResult({ content: inventedOutreach }), baseInput)).toThrow(
      /generic_cta/,
    );
  });

  it('rejects a post that alters an explicit required proof or omits its target audience', () => {
    expect(() => assertUsablePostWriterResult(makeResult({
      content: completeLinkedInPost(),
    }), flowLedgerInput())).toThrow(/profile_missing_required_brief_claim/);
  });

  it('rejects non-twitter posts without hashtags', () => {
    const noHashtags = completeLinkedInPost().replace('\n\n#CreativeOps #AgencyOps #ContentWorkflow', '');

    expect(() => assertUsablePostWriterResult(makeResult({ content: noHashtags }), baseInput)).toThrow(
      /missing_hashtags/,
    );
  });

  it('rejects outputs that cannot be handed to Clickatron', () => {
    expect(() => assertUsablePostWriterResult(makeResult({ clickatron: {} }), baseInput)).toThrow(
      /missing_clickatron_prompt/,
    );
  });

  it('allows concise x/twitter posts without hashtags when they have a CTA and visual prompt', () => {
    const twitterInput: PostWriterInput = {
      context: { projectSummary: 'Platform: X. Topic: approval loops.' },
      userPrompt: 'Write an X post about approval loops.',
    };

    expect(() =>
      assertUsablePostWriterResult(
        makeResult({
          content: 'Approval loops rarely need another meeting. Pick one final owner before the draft leaves the editor. Try it on the next campaign.',
          metadata: { platform: 'twitter', charCount: 123 },
        }),
        twitterInput,
      ),
    ).not.toThrow();
  });

  it('does not turn the X character ceiling into a minimum for concise posts', () => {
    const userPrompt = 'Write a short, honest X post: Streaky just passed 1,000 paying users after 8 months. No growth hack, just shipping every week and reading every support email. Thank the early users.';
    const twitterInput: PostWriterInput = {
      context: { projectSummary: 'Streaky is a solo-founder habit-tracking app.' },
      userPrompt,
      contentSignalProfile: resolveContentSignalProfile({
        userPrompt,
        documentType: 'post',
        project: { platform: 'X', format: 'post' },
      }),
    };
    const content = 'Streaky passed 1,000 paying users after 8 months. No growth hack. Just shipping every week and reading every support email. Thank you to the early users. What should I improve next?';

    expect(new PostWriterAgent().buildPrompt(twitterInput)).toContain('Body minimum: 165 characters.');
    expect(() => assertUsablePostWriterResult(withClaimSupport(makeResult({
      content,
      hashtags: [],
      clickatron: {
        singleImagePrompt: 'A solo founder reviewing a Streaky habit-tracking workflow beside support notes and a weekly shipping checklist, with generous negative space and no readable text.',
      },
      metadata: { platform: 'twitter', charCount: content.length },
    }), 'brief_user', userPrompt), twitterInput)).not.toThrow();
  });

  it('removes readable metric labels and brand marks from Clickatron prompts without another model call', async () => {
    const modelResult = makeResult({
      clickatron: {
        singleImagePrompt: "A Shopify owner studies a dashboard displaying a clear 'Repeat Purchase Rate' metric, beside a panel labeled Weekly View, transitioning to a DataPulse logo and website URL, with generous negative space on the left.",
      },
    });
    writerMocks.generateStructured.mockResolvedValue({
      result: modelResult,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new PostWriterAgent().runStructured(baseInput);
    const visualPrompt = output.result.clickatron.singleImagePrompt ?? '';

    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(1);
    expect(visualPrompt).not.toMatch(/Repeat Purchase Rate|Weekly View|DataPulse logo|website URL/i);
    expect(visualPrompt).not.toMatch(/(?:labeled|labelled|text[-\s]?overlay)/i);
    expect(visualPrompt).toContain('No readable text');
    expect(output.metadata?.notes).toContain('clickatron_visual_contract:applied');
  });

  it('repairs filler through one replacement structured result', async () => {
    const fillerPost = completeLinkedInPost().replace('The fix is not another status meeting.', 'Leverage the next status meeting.');
    writerMocks.generateStructured
      .mockResolvedValueOnce({
        result: makeResult({ content: fillerPost }),
        cacheStatus: 'hit',
        modelName: 'models/gemini-2.5-flash',
      })
      .mockResolvedValueOnce({
        result: makeResult(),
        cacheStatus: 'created',
        modelName: 'models/gemini-2.5-flash',
      });

    const output = await new PostWriterAgent().runStructured(baseInput);

    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(2);
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].systemInstruction).toContain('banned_phrase');
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].prompt).toContain('previousModelOutput');
    expect(output.result.content).toBe(completeLinkedInPost());
    expect(output.result.metadata.charCount).toBe(completeLinkedInPost().length);
    expect(output.metadata?.notes).toBe('writing_context_cache:hit;post_contract_repair:applied');
  });

  it('performs one constrained repair for a generic CTA', async () => {
    const genericCta = completeLinkedInPost().replace(
      'Try this on your next campaign: assign the approval owner before the first draft leaves the editor.',
      'Discover how approval ownership changes your workflow.',
    );
    writerMocks.generateStructured
      .mockResolvedValueOnce({
        result: makeResult({ content: genericCta }),
        cacheStatus: 'hit',
        modelName: 'models/gemini-2.5-flash',
      })
      .mockResolvedValueOnce({
        result: makeResult(),
        cacheStatus: 'created',
        modelName: 'models/gemini-2.5-flash',
      });

    await new PostWriterAgent().runStructured(baseInput, { temperature: 0.45 });

    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(2);
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].systemInstruction).toContain('generic_cta');
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].systemInstruction).toContain(
      'question that names a supplied audience, workflow, entity, or outcome',
    );
  });

  it('rejects an out-of-range non-twitter hashtag plan', () => {
    const content = completeFlowLedgerPost().replace(
      '#SOC2 #FinanceOps #RevOps #AuditReadiness',
      '#SOC2',
    );

    expect(() => assertUsablePostWriterResult(makeFlowLedgerResult(content), flowLedgerInput())).toThrow(
      /hashtag_count_out_of_range:1\/3-5/,
    );
  });

  it('repairs critical explicit-proof and audience omissions before returning the post', async () => {
    writerMocks.generateStructured
      .mockResolvedValueOnce({
        result: makeResult({ content: completeLinkedInPost() }),
        cacheStatus: 'hit',
        modelName: 'models/gemini-2.5-flash',
      })
      .mockResolvedValueOnce({
        result: makeFlowLedgerResult(),
        cacheStatus: 'created',
        modelName: 'models/gemini-2.5-flash',
      });

    const output = await new PostWriterAgent().runStructured(flowLedgerInput(), { temperature: 0.45 });

    expect(output.result.content).toBe(completeFlowLedgerPost());
    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(2);
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].systemInstruction).toContain(
      'profile_missing_required_brief_claim',
    );
  });

  it('uses the resolved post length target as a publishability floor', async () => {
    const tooShort = [
      'CFOs and RevOps leaders: a 37% cut in SOC 2 evidence-chasing changes Q4 readiness.',
      '',
      'The beta cut evidence-chasing time by 37% across 12 pilot teams.',
      '',
      'CFOs and RevOps leaders: where does SOC 2 evidence-chasing slow your finance team down before Q4?',
      '',
      '#SOC2 #FinanceOps #RevOps #AuditReadiness',
    ].join('\n');
    writerMocks.generateStructured
      .mockResolvedValueOnce({
        result: makeFlowLedgerResult(tooShort),
        cacheStatus: 'hit',
        modelName: 'models/gemini-2.5-flash',
      })
      .mockResolvedValueOnce({
        result: makeFlowLedgerResult(),
        cacheStatus: 'created',
        modelName: 'models/gemini-2.5-flash',
      });

    const output = await new PostWriterAgent().runStructured(flowLedgerInput(), { temperature: 0.45 });

    expect(output.result.content.length).toBeGreaterThanOrEqual(500);
    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(2);
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].systemInstruction).toContain('content_under_500_chars');
  });

  it('assembles the typed hashtag plan into the final publishable post', async () => {
    const contentWithoutTags = completeFlowLedgerPost().replace(
      '\n\n#SOC2 #FinanceOps #RevOps #AuditReadiness',
      '',
    );
    const modelResult = makeFlowLedgerResult(contentWithoutTags);
    modelResult.hashtags = ['#SOC2', '#FinanceOps', '#RevOps', '#AuditReadiness'];
    writerMocks.generateStructured.mockResolvedValue({
      result: modelResult,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new PostWriterAgent().runStructured(flowLedgerInput(), { temperature: 0.45 });

    expect(output.result.content).toMatch(/\n\n#SOC2 #FinanceOps #RevOps #AuditReadiness$/);
    expect(output.result.hashtags).toEqual(['#SOC2', '#FinanceOps', '#RevOps', '#AuditReadiness']);
    expect(output.result.metadata.charCount).toBe(output.result.content.length);
    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(1);
  });

  it('trims an over-limit typed hashtag plan without spending a repair call', async () => {
    const contentWithoutTags = completeFlowLedgerPost().replace(
      '\n\n#SOC2 #FinanceOps #RevOps #AuditReadiness',
      '',
    );
    const modelResult = makeFlowLedgerResult(contentWithoutTags);
    modelResult.hashtags = ['#SOC2', '#FinanceOps', '#RevOps', '#AuditReadiness', '#Compliance', '#B2BSaaS'];
    writerMocks.generateStructured.mockResolvedValue({
      result: modelResult,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new PostWriterAgent().runStructured(flowLedgerInput(), { temperature: 0.45 });

    expect(output.result.hashtags).toEqual(['#SOC2', '#FinanceOps', '#RevOps', '#AuditReadiness', '#Compliance']);
    expect(output.result.content).toMatch(/#SOC2 #FinanceOps #RevOps #AuditReadiness #Compliance$/);
    expect(output.metadata?.notes).toContain('hashtag_plan_trimmed');
    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(1);
  });

  it('enforces the platform maximum even when a profile requests more characters', () => {
    const input = flowLedgerInput();
    input.userPrompt += ' Write 5000 characters.';
    input.contentSignalProfile = {
      ...input.contentSignalProfile!,
      profile: {
        ...input.contentSignalProfile!.profile,
        constraints: {
          ...input.contentSignalProfile!.profile.constraints,
          target_length: { value: 5_000, unit: 'characters' },
        },
      },
    };
    const hashtags = '#SOC2 #FinanceOps #RevOps #AuditReadiness';
    const oversized = completeFlowLedgerPost().replace(
      hashtags,
      `${'A named owner keeps the evidence handoff visible before review. '.repeat(48)}\n\n${hashtags}`,
    );

    try {
      assertUsablePostWriterResult(makeFlowLedgerResult(oversized), input);
      throw new Error('Expected the LinkedIn maximum to be enforced');
    } catch (error) {
      expect(String(error)).toContain('content_over_3000_chars');
      expect(String(error)).not.toContain('content_under_3750_chars');
    }
  });

  it('repairs missing source claims and audience labels with a complete replacement object', async () => {
    const missingClaimAndAudience = completeFlowLedgerPost()
      .replace(
        "CFOs and RevOps leaders: the beta's 37% cut belongs to 12 pilot teams, not every SOC 2 workflow.",
        "The beta's 37% cut belongs to 12 pilot teams, not every SOC 2 workflow.",
      )
      .replace('The beta cut evidence-chasing time by 37% across 12 pilot teams.\n\n', '')
      .replace(
        'CFOs and RevOps leaders: where does SOC 2 evidence-chasing slow your finance team down?',
        'Where does SOC 2 evidence-chasing slow your finance team down?',
      );
    writerMocks.generateStructured
      .mockResolvedValueOnce({
        result: makeFlowLedgerResult(missingClaimAndAudience),
        cacheStatus: 'hit',
        modelName: 'models/gemini-2.5-flash',
      })
      .mockResolvedValueOnce({
        result: makeFlowLedgerResult(),
        cacheStatus: 'created',
        modelName: 'models/gemini-2.5-flash',
      });

    const output = await new PostWriterAgent().runStructured(flowLedgerInput(), { temperature: 0.45 });

    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(2);
    expect(output.result.content).toContain('The beta cut evidence-chasing time by 37% across 12 pilot teams.');
    expect(output.result.content).toContain('CFOs and RevOps leaders: where does SOC 2 evidence-chasing');
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].systemInstruction).toContain(
      'profile_missing_required_brief_claim',
    );
  });

  it('accepts a source-specific bottleneck question without a repair call', async () => {
    const broadCta = completeFlowLedgerPost().replace(
      'CFOs and RevOps leaders: where does SOC 2 evidence-chasing slow your finance team down?',
      "CFOs and RevOps leaders, what's the single biggest bottleneck your finance teams face in SOC 2 evidence preparation?",
    );
    writerMocks.generateStructured.mockResolvedValue({
      result: makeFlowLedgerResult(broadCta),
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    const output = await new PostWriterAgent().runStructured(flowLedgerInput(), { temperature: 0.45 });

    expect(output.result.content).toContain(
      "CFOs and RevOps leaders, what's the single biggest bottleneck your finance teams face in SOC 2 evidence preparation?",
    );
    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(1);
  });

  it('rejects a thin-evidence paraphrase that replaces the supplied proof with an unsupplied pain', () => {
    const unsupportedParaphrase = completeFlowLedgerPost().replace(
      "CFOs and RevOps leaders: the beta's 37% cut belongs to 12 pilot teams, not every SOC 2 workflow.",
      'CFOs and RevOps leaders: SOC 2 evidence preparation creates a significant drain on resources before Q4.',
    );

    expect(() => assertUsablePostWriterResult(
      makeFlowLedgerResult(unsupportedParaphrase),
      flowLedgerInput(),
    )).toThrow(/claim_support_missing_required_anchor/);
  });

  it('allows a leading discourse label on a verbatim thin-evidence claim', () => {
    const content = completeFlowLedgerPost().replace(
      'The beta cut evidence-chasing time by 37% across 12 pilot teams.',
      'Specifically, the beta cut evidence-chasing time by 37% across 12 pilot teams.',
    );
    const result = makeFlowLedgerResult(content);
    const verbatimEntry = result.contentAnalysis.claimSupport?.find((entry) => (
      entry.sentence.startsWith('Specifically,')
    ));
    if (!verbatimEntry) throw new Error('Expected a claim-support entry for the proof sentence');
    verbatimEntry.relationship = 'verbatim';

    expect(() => assertUsablePostWriterResult(result, flowLedgerInput())).not.toThrow();
  });

  it('repairs an unsupported thin-evidence implication by replacing the complete result', async () => {
    const unsupportedImplication = completeFlowLedgerPost().replace(
      'Treat the beta as a measured reference point, not a forecast for another team.',
      'This reduction directly supports finance teams preparing SOC 2 evidence before Q4 audit season.',
    );
    const rejectedResult = makeFlowLedgerResult(unsupportedImplication);
    const implicationEntry = rejectedResult.contentAnalysis.claimSupport?.find((entry) => (
      entry.sentence.startsWith('This reduction directly supports')
    ));
    if (!implicationEntry) throw new Error('Expected a claim-support entry for the implication');
    implicationEntry.relationship = 'bounded_implication';
    writerMocks.generateStructured
      .mockResolvedValueOnce({
        result: rejectedResult,
        cacheStatus: 'hit',
        modelName: 'models/gemini-2.5-flash',
      })
      .mockResolvedValueOnce({
        result: makeFlowLedgerResult(),
        cacheStatus: 'created',
        modelName: 'models/gemini-2.5-flash',
      });

    const output = await new PostWriterAgent().runStructured(flowLedgerInput(), { temperature: 0.45 });

    expect(output.result.content).toBe(completeFlowLedgerPost());
    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(2);
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].systemInstruction).toContain(
      'claim_support_unbounded_implication',
    );
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].systemInstruction).toContain(
      'delete the implication unless an authorized source explicitly states it',
    );
  });

  it('repairs a paraphrased numeric claim with a complete replacement object', async () => {
    const paraphrasedClaim = completeFlowLedgerPost().replace(
      'The beta cut evidence-chasing time by 37% across 12 pilot teams.',
      'The beta reduced evidence-chasing time by 37% across 12 pilot teams.',
    );
    writerMocks.generateStructured
      .mockResolvedValueOnce({
        result: makeFlowLedgerResult(paraphrasedClaim),
        cacheStatus: 'hit',
        modelName: 'models/gemini-2.5-flash',
      })
      .mockResolvedValueOnce({
        result: makeFlowLedgerResult(),
        cacheStatus: 'created',
        modelName: 'models/gemini-2.5-flash',
      });

    const output = await new PostWriterAgent().runStructured(flowLedgerInput(), { temperature: 0.45 });

    expect(output.result.content).toContain('The beta cut evidence-chasing time by 37% across 12 pilot teams.');
    expect(output.result.content).not.toContain('The beta reduced evidence-chasing time by 37%');
    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(2);
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].systemInstruction).toContain(
      'profile_missing_required_brief_claim',
    );
  });

  it('replaces a stock Clickatron setting with source-grounded operational direction', async () => {
    const modelResult = makeFlowLedgerResult();
    modelResult.clickatron.singleImagePrompt = "A modern office workspace where CFOs and RevOps leaders sort SOC 2 evidence folders for Q4 audit season, with a subtle 'Q4' indicator, binders labeled 'Audit', and clear negative space on the left for text overlay. No readable text.";
    writerMocks.generateStructured.mockResolvedValue({
      result: modelResult,
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });
    const output = await new PostWriterAgent().runStructured(flowLedgerInput(), { temperature: 0.45 });

    expect(output.result.content).toBe(completeFlowLedgerPost());
    expect(output.result.clickatron.singleImagePrompt).toContain('source-grounded operational scene');
    expect(output.result.clickatron.singleImagePrompt).not.toContain('Make the Write a LinkedIn post');
    expect(output.result.clickatron.singleImagePrompt).toContain('before/after evidence queue');
    expect(output.result.clickatron.singleImagePrompt).not.toMatch(/(?:indicator|labeled|text overlay)/i);
    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(1);
    expect(output.metadata?.notes).toContain('clickatron_visual_contract:applied');
  });

  it('repairs filler without desynchronizing the final source ledger', async () => {
    const flowPostWithFiller = completeFlowLedgerPost().replace(
      'FlowLedger is workflow automation for finance teams preparing audit evidence.',
      'FlowLedger gives finance teams leverage over audit evidence.',
    );
    writerMocks.generateStructured
      .mockResolvedValueOnce({
        result: makeFlowLedgerResult(flowPostWithFiller),
        cacheStatus: 'hit',
        modelName: 'models/gemini-2.5-flash',
      })
      .mockResolvedValueOnce({
        result: makeFlowLedgerResult(),
        cacheStatus: 'created',
        modelName: 'models/gemini-2.5-flash',
      });
    const output = await new PostWriterAgent().runStructured(flowLedgerInput(), { temperature: 0.45 });

    expect(output.result.content).toBe(completeFlowLedgerPost());
    expect(output.result.contentAnalysis.claimSupport?.every((entry) => (
      output.result.content.includes(entry.sentence)
    ))).toBe(true);
    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(2);
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].systemInstruction).toContain(
      'banned_phrase:leverage',
    );
  });

  it('performs one schema-constrained repair after a publishability contract failure', async () => {
    const noCta = completeLinkedInPost().replace(
      'Try this on your next campaign: assign the approval owner before the first draft leaves the editor.',
      'The team now has one accountable owner and one visible decision log.',
    );
    writerMocks.generateStructured
      .mockResolvedValueOnce({
        result: makeResult({ content: noCta }),
        cacheStatus: 'hit',
        modelName: 'models/gemini-2.5-flash',
      })
      .mockResolvedValueOnce({
        result: makeResult(),
        cacheStatus: 'created',
        modelName: 'models/gemini-2.5-flash',
      });

    const output = await new PostWriterAgent().runStructured(baseInput, { temperature: 0.45 });

    expect(writerMocks.generateStructured).toHaveBeenCalledTimes(2);
    expect(writerMocks.generateStructured.mock.calls[1]?.[0]).toMatchObject({
      temperature: 0.25,
      systemInstruction: expect.stringContaining('missing_action_cta'),
      prompt: expect.stringContaining('<post_contract_repair_input>'),
    });
    expect(writerMocks.generateStructured.mock.calls[1]?.[0].prompt).toContain('previousModelOutput');
    expect(output.result.content).toBe(completeLinkedInPost());
    expect(output.metadata?.notes).toBe('writing_context_cache:hit;post_contract_repair:applied');
  });

  it('captures final rejected output only for an explicit eval diagnostic', async () => {
    const noCta = completeLinkedInPost().replace(
      'Try this on your next campaign: assign the approval owner before the first draft leaves the editor.',
      'The team now has one accountable owner and one visible decision log.',
    );
    writerMocks.generateStructured.mockResolvedValue({
      result: makeResult({ content: noCta }),
      cacheStatus: 'hit',
      modelName: 'models/gemini-2.5-flash',
    });

    let productionError: unknown;
    try {
      await new PostWriterAgent().runStructured(baseInput, { temperature: 0.45 });
    } catch (error) {
      productionError = error;
    }
    expect(productionError).toBeInstanceOf(Error);
    expect((productionError as Error & { rejectedOutput?: unknown }).rejectedOutput).toBeUndefined();

    vi.stubEnv('THINKFORGE_EVAL_CAPTURE_REJECTED_OUTPUT', '1');
    let evalError: unknown;
    try {
      await new PostWriterAgent().runStructured(baseInput, { temperature: 0.45 });
    } catch (error) {
      evalError = error;
    }
    expect(evalError).toBeInstanceOf(Error);
    expect((evalError as Error & { rejectedOutput?: PostWriterResult }).rejectedOutput?.content).toBe(noCta);
    expect(Object.keys(evalError as Error)).not.toContain('rejectedOutput');
  });
});
