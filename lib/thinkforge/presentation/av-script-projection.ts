import {
  assertMaterializedScriptSidecarV3Treatment,
  type ScriptSidecarV3,
} from '../schemas/script-sidecar-v3';
import type {
  CaptureRequirement,
  VideoTreatment,
} from '../schemas/video-treatment';

export const AV_SCRIPT_PRESENTATION_VERSION = 1 as const;

type AVScriptHeardDelivery = Exclude<
  ScriptSidecarV3['acts'][number]['narrativeScenes'][number]['beats'][number]['lines'][number]['delivery'],
  'on-screen-text'
>;

type AVScriptCaptureRequirement = Pick<
  CaptureRequirement,
  'objective' | 'whyRequired' | 'captureKind' | 'unresolvedCapabilityQuestions'
>;

export type AVScriptPresentation = {
  version: typeof AV_SCRIPT_PRESENTATION_VERSION;
  status: 'available';
  document: {
    title: string;
    version: number;
  };
  treatment: {
    audienceOutcome: string;
    viewerPromise: string;
    narrativeArc: string;
    visualVerbalRelationship: VideoTreatment['visualVerbalRelationship'];
    visualRhythm: string;
    informationHierarchy: string[];
    brandBoundaries: string[];
    referenceSynthesis: string[];
    continuityStrategy: string;
    audioVoiceStrategy: string;
    userConstraints: string[];
    unresolvedAssumptions: string[];
    decisions: Array<{
      decision: string;
      rationale: string;
      confidence: number;
      evidenceCount: number;
    }>;
  };
  acts: Array<{
    title: string;
    narrativePurpose: string;
    scenes: Array<{
      title: string;
      narrativePurpose: string;
      durationIntentSeconds?: number;
      mood?: string;
      beats: Array<{
        kind: ScriptSidecarV3['acts'][number]['narrativeScenes'][number]['beats'][number]['kind'];
        narrativePurpose: string;
        durationIntentSeconds?: number;
        heard: Array<{
          speaker: string;
          delivery: AVScriptHeardDelivery;
          text: string;
          onCamera: boolean;
        }>;
        onScreenText: string[];
        visualLayers: Array<{
          audienceJob: string;
          visualThesis: string;
          audioRelationship: VideoTreatment['visualEvents'][number]['audioRelationship'];
          timingNote: string;
          continuityNotes: string[];
          brandBoundaries: string[];
          accessibilityRequirements: string[];
          approvedSourceCount: number;
          creativeReferenceCount: number;
          captureRequirements: AVScriptCaptureRequirement[];
        }>;
      }>;
    }>;
  }>;
};

export class AVScriptProjectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AVScriptProjectionError';
  }
}

function uniqueCount(values: readonly string[]): number {
  return new Set(values.filter((value) => value.trim().length > 0)).size;
}

function heardDelivery(
  delivery: ScriptSidecarV3['acts'][number]['narrativeScenes'][number]['beats'][number]['lines'][number]['delivery'],
): AVScriptHeardDelivery | null {
  switch (delivery) {
    case 'sync-dialogue':
    case 'voiceover':
    case 'diegetic-speech':
      return delivery;
    case 'on-screen-text':
      return null;
  }
}

/**
 * Projects an already-authoritative V3 script into the user-facing AV reading
 * surface. It intentionally carries semantic narrative information only.
 */
export function buildAVScriptPresentation(input: {
  title?: string | null;
  documentVersion: number;
  sidecar: ScriptSidecarV3;
  treatment: VideoTreatment;
}): AVScriptPresentation {
  try {
    assertMaterializedScriptSidecarV3Treatment({
      sidecar: input.sidecar,
      treatment: input.treatment,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown semantic contract error';
    throw new AVScriptProjectionError(`The saved AV script contract is inconsistent: ${detail}`);
  }

  const charactersById = new Map(input.sidecar.characters.map((character) => [character.id, character.name]));
  const captureRequirementsById = new Map(
    input.treatment.captureRequirements.map((requirement) => [requirement.id, requirement]),
  );

  return {
    version: AV_SCRIPT_PRESENTATION_VERSION,
    status: 'available',
    document: {
      title: input.title?.trim() || 'Untitled video script',
      version: input.documentVersion,
    },
    treatment: {
      audienceOutcome: input.treatment.audienceOutcome,
      viewerPromise: input.treatment.viewerPromise,
      narrativeArc: input.treatment.narrativeArc,
      visualVerbalRelationship: input.treatment.visualVerbalRelationship,
      visualRhythm: input.treatment.visualRhythm,
      informationHierarchy: [...input.treatment.informationHierarchy],
      brandBoundaries: [...input.treatment.brandBoundaries],
      referenceSynthesis: [...input.treatment.referenceSynthesis],
      continuityStrategy: input.treatment.continuityStrategy,
      audioVoiceStrategy: input.treatment.audioVoiceStrategy,
      userConstraints: [...input.treatment.userConstraints],
      unresolvedAssumptions: [...input.treatment.decisionTrace.unresolvedAssumptions],
      decisions: input.treatment.decisionTrace.decisions.map((decision) => ({
        decision: decision.decision,
        rationale: decision.rationale,
        confidence: decision.confidence,
        evidenceCount: uniqueCount(decision.evidenceIds),
      })),
    },
    acts: input.sidecar.acts.map((act) => ({
      title: act.title,
      narrativePurpose: act.narrativePurpose,
      scenes: act.narrativeScenes.map((scene) => ({
        title: scene.title,
        narrativePurpose: scene.narrativePurpose,
        ...(scene.durationIntentSeconds === undefined
          ? {}
          : { durationIntentSeconds: scene.durationIntentSeconds }),
        ...(scene.mood ? { mood: scene.mood } : {}),
        beats: scene.beats.map((beat) => {
          const heard = beat.lines.flatMap((line) => {
            const delivery = heardDelivery(line.delivery);
            return delivery
              ? [{
                  speaker: line.speakerId ? charactersById.get(line.speakerId) ?? 'Unidentified speaker' : 'Narration',
                  delivery,
                  text: line.text,
                  onCamera: line.onCamera,
                }]
              : [];
          });
          const onScreenText = beat.lines
            .filter((line) => line.delivery === 'on-screen-text')
            .map((line) => line.text);
          const visualLayers = beat.visualEvents.map((event) => ({
            audienceJob: event.audienceJob,
            visualThesis: event.visualThesis,
            audioRelationship: event.audioRelationship,
            timingNote: event.timingNote,
            continuityNotes: [...event.continuityNotes],
            brandBoundaries: [...event.brandConstraints],
            accessibilityRequirements: [...event.accessibilityRequirements],
            approvedSourceCount: uniqueCount(event.sourceRefs),
            creativeReferenceCount: uniqueCount(event.creativeReferenceIds),
            captureRequirements: event.captureRequirementIds.flatMap((requirementId) => {
              const requirement = captureRequirementsById.get(requirementId);
              return requirement
                ? [{
                    objective: requirement.objective,
                    whyRequired: requirement.whyRequired,
                    captureKind: requirement.captureKind,
                    unresolvedCapabilityQuestions: [...requirement.unresolvedCapabilityQuestions],
                  }]
                : [];
            }),
          }));

          return {
            kind: beat.kind,
            narrativePurpose: beat.narrativePurpose,
            ...(beat.durationIntentSeconds === undefined
              ? {}
              : { durationIntentSeconds: beat.durationIntentSeconds }),
            heard,
            onScreenText,
            visualLayers,
          };
        }),
      })),
    })),
  };
}
