import type {
  CreativeReferenceSet,
  VideoTreatment,
} from '@/lib/thinkforge/schemas/video-treatment';

const commonTrace = {
  inputFingerprint: 'fixture_input_fingerprint',
  contentSignalProfileVersion: 'signals-v1',
  writingKnowledgeVersion: 'creative-content-knowledge-v1',
  editronCreativeGraphVersion: 'creative-graph-v1',
  sourceRefs: ['src_brief'],
  creativeReferenceIds: [],
  appliedConstraintIds: ['brand.no_unreadable_text'],
  unresolvedAssumptions: [],
  decisions: [{
    id: 'decision_1',
    decision: 'Use complementary visuals rather than duplicate narration.',
    rationale: 'The brief explains an abstract process that needs a concrete visual counterpart.',
    evidenceIds: ['src_brief'],
    confidence: 0.86,
  }],
};

function treatment(input: {
  treatmentId: string;
  audienceOutcome: string;
  viewerPromise: string;
  narrativeArc: string;
  visualVerbalRelationship: VideoTreatment['visualVerbalRelationship'];
  visualRhythm: string;
  visualEvents: VideoTreatment['visualEvents'];
  captureRequirements?: VideoTreatment['captureRequirements'];
  decisionTrace?: Partial<VideoTreatment['decisionTrace']>;
  referenceSynthesis?: string[];
}): VideoTreatment {
  return {
    version: 1,
    treatmentId: input.treatmentId,
    audienceOutcome: input.audienceOutcome,
    viewerPromise: input.viewerPromise,
    narrativeArc: input.narrativeArc,
    visualVerbalRelationship: input.visualVerbalRelationship,
    visualRhythm: input.visualRhythm,
    informationHierarchy: ['Core claim', 'Proof', 'Practical consequence'],
    brandBoundaries: ['Use restrained, data-first visual language.', 'Do not invent logos or product proof.'],
    referenceSynthesis: input.referenceSynthesis ?? [],
    continuityStrategy: 'Repeat the core visual motif only when the argument advances.',
    audioVoiceStrategy: 'Clear narration carries the reasoning; sound supports transitions without masking speech.',
    userConstraints: ['Respect the requested platform and runtime.'],
    visualEvents: input.visualEvents,
    captureRequirements: input.captureRequirements ?? [],
    decisionTrace: {
      ...commonTrace,
      ...input.decisionTrace,
    },
  };
}

export const referenceLedCreativeReferenceSet: CreativeReferenceSet = {
  version: 1,
  referenceSetId: 'reference_set_1',
  references: [{
    id: 'ref_explainer',
    kind: 'video',
    title: 'User-provided editorial explainer reference',
    sourceUrl: 'https://example.com/reference',
    rightsStatus: 'user-provided',
    analysisStatus: 'available',
    analysis: {
      visualRhythm: 'Alternate a stable explanatory voice with brief visual expansions at argument turns.',
      informationHierarchy: 'Show the system before the consequence, then return to the human decision.',
      visualVerbalRelationship: 'Visuals complement the spoken explanation instead of repeating it.',
      composition: 'Use clear focal hierarchy and generous negative space for complex information.',
      textBehavior: 'Use sparse labels only when they add a new fact.',
      graphicFootageRelationship: 'Graphics clarify abstract mechanisms while people remain emotionally grounding.',
      audioEnergy: 'Measured build, then a quiet release at the conclusion.',
      recurringMotifs: ['layered system map'],
      evidence: [{
        id: 'evidence_1',
        observation: 'A visual map expands exactly when the narration moves from symptom to system cause.',
        startSeconds: 18,
        endSeconds: 25,
      }],
      nonCopyConstraints: ['Borrow the relationship between explanation and image, not the reference creator\'s identifiable assets or layouts.'],
    },
  }],
};

export const abstractExplainerTreatment = treatment({
  treatmentId: 'treatment_abstract',
  audienceOutcome: 'Understand how an invisible workflow bottleneck creates visible delay.',
  viewerPromise: 'A clear explanation that makes the hidden system legible.',
  narrativeArc: 'Start with friction, reveal the hidden cause, show the operational consequence, then close with a practical next step.',
  visualVerbalRelationship: 'complement',
  visualRhythm: 'Deliberate explanatory progress with visual expansion at each causal turn.',
  visualEvents: [{
    id: 'event_system_map',
    momentId: 'moment_hidden_cause',
    audienceJob: 'Make the invisible handoff bottleneck understandable.',
    visualThesis: 'Reveal the relationship between disconnected steps without repeating the narration as on-screen text.',
    audioRelationship: 'complement',
    timingNote: 'Build alongside the explanation and resolve as the causal chain becomes clear.',
    continuityNotes: ['Introduce the map motif for later reuse.'],
    sourceRefs: ['src_brief'],
    creativeReferenceIds: [],
    brandConstraints: ['Keep the visual language restrained and evidence-led.'],
    accessibilityRequirements: ['Do not rely on color alone to explain the relationship.'],
    captureRequirementIds: [],
  }],
});

export const mixedPresenterCutawayTreatment = treatment({
  treatmentId: 'treatment_mixed_presenter',
  audienceOutcome: 'Feel the operational cost before seeing the system behind it.',
  viewerPromise: 'A human explanation supported by an immediate visual reveal.',
  narrativeArc: 'Open with a credible host claim, expose the hidden process during the same claim, then return to the host for the decision.',
  visualVerbalRelationship: 'counterpoint',
  visualRhythm: 'Stable human presence interrupted by brief explanatory visual counterpoints.',
  captureRequirements: [{
    id: 'capture_host_opening',
    objective: 'Record a credible host delivering the opening claim.',
    whyRequired: 'The treatment deliberately uses human presence to establish trust before the conceptual cutaway.',
    subjectOrEvidence: 'The selected spokesperson.',
    sourceRefs: [],
    creativeReferenceIds: [],
    constraints: ['Keep the host visually clear enough for the opening argument.'],
    unresolvedCapabilityQuestions: ['Which device, room, and audio setup are available for the host?'],
  }],
  visualEvents: [{
    id: 'event_host_claim',
    momentId: 'moment_opening_claim',
    audienceJob: 'Establish authority and emotional stakes.',
    visualThesis: 'Keep the audience with the host while the claim lands.',
    audioRelationship: 'anchor',
    timingNote: 'Begins with the first spoken sentence and remains present through the turn.',
    continuityNotes: ['Return to the host after the counterpoint resolves.'],
    sourceRefs: [],
    creativeReferenceIds: [],
    brandConstraints: ['Avoid exaggerated performance or visual clutter.'],
    accessibilityRequirements: ['Keep spoken content intelligible without relying on the cutaway.'],
    captureRequirementIds: ['capture_host_opening'],
  }, {
    id: 'event_process_cutaway',
    momentId: 'moment_opening_claim',
    audienceJob: 'Make the abstract operational cost visible while the host continues speaking.',
    visualThesis: 'Create a counterpoint that reveals the process behind the confident human claim.',
    audioRelationship: 'counterpoint',
    timingNote: 'Appears during the middle of the host sentence, then clears before the final decision line.',
    continuityNotes: ['Reuse the visual vocabulary when the consequence returns later.'],
    sourceRefs: ['src_brief'],
    creativeReferenceIds: [],
    brandConstraints: ['Do not use unreadable text as a substitute for explanation.'],
    accessibilityRequirements: ['The visual should reinforce rather than replace the spoken claim.'],
    captureRequirementIds: [],
  }],
});

export const documentaryTreatment = treatment({
  treatmentId: 'treatment_documentary',
  audienceOutcome: 'Understand the lived consequence before hearing the institutional conclusion.',
  viewerPromise: 'A human, source-grounded narrative that leaves room for reflection.',
  narrativeArc: 'Open with lived detail, widen to the documented pattern, then return to an unresolved human question.',
  visualVerbalRelationship: 'counterpoint',
  visualRhythm: 'Patient observation with more active contextualization only when evidence changes the meaning.',
  visualEvents: [{
    id: 'event_archive_context',
    momentId: 'moment_context',
    audienceJob: 'Give the audience factual context without interrupting the human story.',
    visualThesis: 'Place documented material in tension with the narrator\'s restrained framing.',
    audioRelationship: 'counterpoint',
    timingNote: 'Arrives after the human detail has established stakes.',
    continuityNotes: ['Keep the human thread visible in the next moment.'],
    sourceRefs: ['src_brief'],
    creativeReferenceIds: [],
    brandConstraints: ['Do not sensationalize evidence.'],
    accessibilityRequirements: ['Label sourced material accessibly when it conveys a fact.'],
    captureRequirementIds: [],
  }],
});

export const productDemonstrationTreatment = treatment({
  treatmentId: 'treatment_product_demo',
  audienceOutcome: 'See the actual workflow and understand the resulting practical benefit.',
  viewerPromise: 'A concrete demonstration rather than an abstract product claim.',
  narrativeArc: 'State the job, demonstrate the action, isolate the useful outcome, then invite the next step.',
  visualVerbalRelationship: 'complement',
  visualRhythm: 'Follow the user action, pause only for the consequential result.',
  captureRequirements: [{
    id: 'capture_real_workflow',
    objective: 'Capture the actual product workflow that supports the claim.',
    whyRequired: 'The treatment requires direct evidence rather than a simulated product claim.',
    subjectOrEvidence: 'Approved product interface or physical product.',
    sourceRefs: ['src_brief'],
    creativeReferenceIds: [],
    constraints: ['Use only approved product states and factual labels.'],
    unresolvedCapabilityQuestions: ['Which approved environment can be shown?'],
  }],
  visualEvents: [{
    id: 'event_workflow_proof',
    momentId: 'moment_demo',
    audienceJob: 'Let the viewer verify the product claim through the actual workflow.',
    visualThesis: 'Reveal the decisive action and outcome rather than decorating the narration.',
    audioRelationship: 'complement',
    timingNote: 'Stays synchronized with the action being described.',
    continuityNotes: ['Hold the result long enough for recognition.'],
    sourceRefs: ['src_brief'],
    creativeReferenceIds: [],
    brandConstraints: ['Do not invent product UI or unsupported outcomes.'],
    accessibilityRequirements: ['Provide an equivalent verbal explanation of the visible result.'],
    captureRequirementIds: ['capture_real_workflow'],
  }],
});

export const referenceLedTreatment = treatment({
  treatmentId: 'treatment_reference_led',
  audienceOutcome: 'Understand a complex system through a visually coherent explanation.',
  viewerPromise: 'A branded explanation that takes inspiration from the supplied reference without copying it.',
  narrativeArc: 'Move from a visible symptom to a system explanation, then a practical implication.',
  visualVerbalRelationship: 'complement',
  visualRhythm: 'Alternate stable explanation with concise visual expansion at the argument turns.',
  referenceSynthesis: ['Use the reference\'s explanation-to-image relationship and pacing, not its assets, layouts, or identifying design.'],
  decisionTrace: {
    creativeReferenceIds: ['ref_explainer'],
    decisions: [{
      id: 'decision_reference',
      decision: 'Use visual counter-expansion at system turns.',
      rationale: 'The approved reference demonstrates this explanatory relationship without requiring copied artwork.',
      evidenceIds: ['ref_explainer', 'evidence_1'],
      confidence: 0.79,
    }],
  },
  visualEvents: [{
    id: 'event_reference_influenced',
    momentId: 'moment_system_turn',
    audienceJob: 'Help the viewer reframe the problem from a symptom to a system.',
    visualThesis: 'Expand the system relationship at the same moment the narration changes level of abstraction.',
    audioRelationship: 'complement',
    timingNote: 'Expand with the causal turn, then reduce visual complexity for the implication.',
    continuityNotes: ['Return to the system motif only when it clarifies a new relationship.'],
    sourceRefs: ['src_brief'],
    creativeReferenceIds: ['ref_explainer'],
    brandConstraints: ['Apply this brand\'s visual boundaries rather than copying the reference.'],
    accessibilityRequirements: ['Preserve a clear focal order.'],
    captureRequirementIds: [],
  }],
});

export const brandContrastTreatments = {
  brandA: treatment({
    treatmentId: 'treatment_brand_a',
    audienceOutcome: 'Trust a calm, evidence-led recommendation.',
    viewerPromise: 'Measured explanation with visual restraint.',
    narrativeArc: 'Evidence first, implication second.',
    visualVerbalRelationship: 'anchor',
    visualRhythm: 'Slow, sparse, and deliberate.',
    visualEvents: [{
      id: 'event_brand_a',
      momentId: 'moment_brand_contrast',
      audienceJob: 'Make one verified point memorable.',
      visualThesis: 'Use a restrained supporting visual without competing with the explanation.',
      audioRelationship: 'anchor',
      timingNote: 'Hold until the fact is understood.',
      continuityNotes: [],
      sourceRefs: ['src_brief'],
      creativeReferenceIds: [],
      brandConstraints: ['High formality and restrained motion.'],
      accessibilityRequirements: ['Avoid low-contrast decorative treatment.'],
      captureRequirementIds: [],
    }],
  }),
  brandB: treatment({
    treatmentId: 'treatment_brand_b',
    audienceOutcome: 'Feel the energy of a practical invitation.',
    viewerPromise: 'An approachable, active explanation.',
    narrativeArc: 'Invitation, demonstration, immediate next step.',
    visualVerbalRelationship: 'complement',
    visualRhythm: 'Warmer, more active changes at practical steps.',
    visualEvents: [{
      id: 'event_brand_b',
      momentId: 'moment_brand_contrast',
      audienceJob: 'Make the practical action feel approachable.',
      visualThesis: 'Use an active visual complement that carries a different piece of useful information.',
      audioRelationship: 'complement',
      timingNote: 'Move with the practical action and settle on the next step.',
      continuityNotes: [],
      sourceRefs: ['src_brief'],
      creativeReferenceIds: [],
      brandConstraints: ['Warmth and directness are allowed, but factual clarity remains required.'],
      accessibilityRequirements: ['Keep the action legible without sound.'],
      captureRequirementIds: [],
    }],
  }),
};

export const unknownSetupTreatment = treatment({
  treatmentId: 'treatment_unknown_setup',
  audienceOutcome: 'Receive useful presenter guidance without false technical certainty.',
  viewerPromise: 'A credible message with setup requirements deferred until the available environment is known.',
  narrativeArc: 'Presenter establishes the idea, then the visual explanation carries the rest.',
  visualVerbalRelationship: 'complement',
  visualRhythm: 'One stable opening followed by conceptual visual development.',
  captureRequirements: [{
    id: 'capture_unmeasured_host',
    objective: 'Capture the host for the opening message.',
    whyRequired: 'A human opening is explicitly part of the treatment.',
    subjectOrEvidence: 'The selected host.',
    sourceRefs: [],
    creativeReferenceIds: [],
    constraints: ['Do not estimate a lens, room depth, lighting layout, cost, or setup time.'],
    unresolvedCapabilityQuestions: ['What device is available?', 'Which room can be used?', 'What audio and lighting are available?'],
  }],
  visualEvents: [{
    id: 'event_unmeasured_host',
    momentId: 'moment_opening',
    audienceJob: 'Create a credible direct connection before the explanation expands.',
    visualThesis: 'Show the host only after a user-confirmed production profile exists.',
    audioRelationship: 'anchor',
    timingNote: 'Opening beat only.',
    continuityNotes: [],
    sourceRefs: [],
    creativeReferenceIds: [],
    brandConstraints: ['Do not overstate production readiness.'],
    accessibilityRequirements: ['Voice recording guidance must remain available even if capture is deferred.'],
    captureRequirementIds: ['capture_unmeasured_host'],
  }],
});

export const longFormTreatment = treatment({
  treatmentId: 'treatment_long_form',
  audienceOutcome: 'Follow a seven-minute argument without losing the central question or visual language.',
  viewerPromise: 'A coherent long-form explanation whose visual treatment evolves with the argument.',
  narrativeArc: 'Question, investigation, evidence, implication, and conclusion with a recurring visual anchor.',
  visualVerbalRelationship: 'complement',
  visualRhythm: 'Each major argument turn earns a distinct visual expansion; continuity preserves the central motif.',
  visualEvents: [{
    id: 'event_long_form_anchor',
    momentId: 'moment_chapter_one',
    audienceJob: 'Establish the central visual anchor that later chapters can transform.',
    visualThesis: 'Introduce a clear visual metaphor that evolves rather than restarting in each chapter.',
    audioRelationship: 'complement',
    timingNote: 'Establish early and revisit only when the argument changes state.',
    continuityNotes: ['Carry the motif across chapters without repeating the opening explanation.'],
    sourceRefs: [],
    creativeReferenceIds: [],
    brandConstraints: ['Maintain the approved visual language across every chapter.'],
    accessibilityRequirements: ['Each chapter must remain understandable without recalling visual-only details.'],
    captureRequirementIds: [],
  }],
});

export const videoTreatmentGoldenFixtures = [
  abstractExplainerTreatment,
  mixedPresenterCutawayTreatment,
  documentaryTreatment,
  productDemonstrationTreatment,
  referenceLedTreatment,
  brandContrastTreatments.brandA,
  unknownSetupTreatment,
  longFormTreatment,
] as const;
