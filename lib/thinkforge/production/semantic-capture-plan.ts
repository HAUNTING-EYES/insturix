import { z } from 'zod';

import {
  assertMaterializedScriptSidecarV3Treatment,
  type ScriptSidecarV3,
} from '../schemas/script-sidecar-v3';
import {
  resolveLongFormChapterSceneOwnership,
  type LongFormChapterSceneOwnership,
} from '../long-form/chapter-scene-ownership';
import {
  CaptureRequirementCapabilitySchema,
  CaptureRequirementKindSchema,
  parseVideoTreatment,
  VideoTreatmentSidecarBindingSchema,
  type CaptureRequirementCapability,
  type VideoTreatment,
} from '../schemas/video-treatment';
import {
  parseProductionCapabilityProfile,
  type ProductionCapabilityProfile,
} from './production-capability-profile';

export const TREATMENT_CAPTURE_PROJECTION_VERSION = 1 as const;

const IdentifierSchema = z.string().min(1);
const NonEmptyTextSchema = z.string().min(1);

const CaptureProjectionStatusSchema = z.enum([
  'no-physical-capture',
  'needs-acquisition-decision',
  'needs-capture-calibration',
  'capture-brief-ready',
]);

const CapabilityEvidenceStatusSchema = z.enum(['confirmed', 'missing', 'ambiguous']);

const CapabilityEvidenceSchema = z.object({
  capability: CaptureRequirementCapabilitySchema,
  status: CapabilityEvidenceStatusSchema,
  detail: NonEmptyTextSchema,
  evidenceIds: z.array(IdentifierSchema).default([]),
}).strict();

const LinkedNarrativeMomentSchema = z.object({
  actId: IdentifierSchema,
  actTitle: NonEmptyTextSchema,
  chapterId: IdentifierSchema.optional(),
  chapterTitle: NonEmptyTextSchema.optional(),
  narrativeSceneId: IdentifierSchema,
  beatId: IdentifierSchema,
  eventId: IdentifierSchema,
  narrativePurpose: NonEmptyTextSchema,
  timingNote: NonEmptyTextSchema,
  sourceRefs: z.array(IdentifierSchema).default([]),
  continuityNotes: z.array(NonEmptyTextSchema).default([]),
}).strict();

const CaptureRequirementChapterLinkSchema = z.object({
  actId: IdentifierSchema,
  actTitle: NonEmptyTextSchema,
  chapterId: IdentifierSchema,
  chapterTitle: NonEmptyTextSchema,
  narrativeSceneIds: z.array(IdentifierSchema).min(1),
}).strict();

const CaptureRequirementContinuitySchema = z.object({
  chapterScope: z.enum(['unmapped', 'single-chapter', 'cross-chapter']),
  actIds: z.array(IdentifierSchema).min(1),
  chapters: z.array(CaptureRequirementChapterLinkSchema).default([]),
  continuityNotes: z.array(NonEmptyTextSchema).default([]),
}).strict();

const TreatmentCaptureRequirementProjectionSchema = z.object({
  id: IdentifierSchema,
  captureKind: CaptureRequirementKindSchema,
  objective: NonEmptyTextSchema,
  whyRequired: NonEmptyTextSchema,
  subjectOrEvidence: NonEmptyTextSchema.optional(),
  sourceRefs: z.array(IdentifierSchema).default([]),
  creativeReferenceIds: z.array(IdentifierSchema).default([]),
  constraints: z.array(NonEmptyTextSchema).default([]),
  requiredCapabilities: z.array(CaptureRequirementCapabilitySchema).default([]),
  unresolvedCapabilityQuestions: z.array(NonEmptyTextSchema).default([]),
  capabilityEvidence: z.array(CapabilityEvidenceSchema).default([]),
  linkedNarrativeMoments: z.array(LinkedNarrativeMomentSchema).min(1),
  continuity: CaptureRequirementContinuitySchema,
}).strict();

const VoiceRecordingGuideSchema = z.object({
  required: z.boolean(),
  speakers: z.array(z.object({
    characterId: IdentifierSchema,
    characterName: NonEmptyTextSchema,
    languageCodes: z.array(NonEmptyTextSchema).default([]),
    deliveries: z.array(NonEmptyTextSchema).min(1),
    onCameraLineCount: z.number().int().nonnegative(),
    voiceoverLineCount: z.number().int().nonnegative(),
  }).strict()).default([]),
}).strict();

const TreatmentCapturePlanObjectSchema = z.object({
  version: z.number().int().default(TREATMENT_CAPTURE_PROJECTION_VERSION),
  kind: z.literal('treatment-capture-plan'),
  status: CaptureProjectionStatusSchema,
  treatment: VideoTreatmentSidecarBindingSchema,
  voiceRecording: VoiceRecordingGuideSchema,
  physicalCaptureRequirements: z.array(TreatmentCaptureRequirementProjectionSchema).default([]),
  nonPhysicalAcquisitionRequirements: z.array(TreatmentCaptureRequirementProjectionSchema).default([]),
  unclassifiedRequirements: z.array(TreatmentCaptureRequirementProjectionSchema).default([]),
  calibrationQuestions: z.array(NonEmptyTextSchema).default([]),
}).strict();

export const TreatmentCapturePlanSchema = TreatmentCapturePlanObjectSchema.superRefine((plan, ctx) => {
  if (plan.version !== TREATMENT_CAPTURE_PROJECTION_VERSION) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['version'],
      message: `Unsupported treatment capture projection version: ${plan.version}.`,
    });
  }
  if (plan.status === 'no-physical-capture' && plan.physicalCaptureRequirements.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['physicalCaptureRequirements'],
      message: 'No-physical-capture projections cannot include physical capture requirements.',
    });
  }
  if (plan.status === 'capture-brief-ready' && plan.calibrationQuestions.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['calibrationQuestions'],
      message: 'A capture brief cannot be ready while calibration questions remain.',
    });
  }
});

export type TreatmentCapturePlan = z.infer<typeof TreatmentCapturePlanSchema>;

export interface BuildTreatmentCapturePlanInput {
  sidecar: ScriptSidecarV3;
  treatment: unknown;
  profile?: unknown | null;
  /** Durable chapter hierarchy for a long-form script. Omitted for ordinary scripts. */
  chapterPlan?: unknown;
}

type CapabilityEvidence = z.infer<typeof CapabilityEvidenceSchema>;
type LinkedNarrativeMoment = z.infer<typeof LinkedNarrativeMomentSchema>;

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function capabilityQuestion(capability: CaptureRequirementCapability): string {
  const questions: Record<CaptureRequirementCapability, string> = {
    performer: 'Confirm who can perform or present for this capture requirement.',
    camera: 'Choose the exact camera or recording device available for this capture requirement.',
    space: 'Choose the exact space approved for this capture requirement.',
    audio: 'Choose the exact audio setup available for this capture requirement.',
    lighting: 'Confirm the available lighting source for this capture requirement.',
  };
  return questions[capability];
}

function selectableEquipmentEvidence(
  profile: ProductionCapabilityProfile | null,
  capability: 'camera' | 'audio',
): CapabilityEvidence {
  if (!profile) {
    return {
      capability,
      status: 'missing',
      detail: `No confirmed production profile declares an available ${capability}.`,
      evidenceIds: [],
    };
  }
  const candidates = profile.equipment.filter((item) => item.category === capability);
  const preferred = candidates.filter((item) => item.preferred);
  if (preferred.length === 1) {
    return {
      capability,
      status: 'confirmed',
      detail: `The confirmed preferred ${capability} is ${preferred[0]!.label}.`,
      evidenceIds: [preferred[0]!.id],
    };
  }
  if (candidates.length === 1) {
    return {
      capability,
      status: 'confirmed',
      detail: `The confirmed available ${capability} is ${candidates[0]!.label}.`,
      evidenceIds: [candidates[0]!.id],
    };
  }
  if (candidates.length > 1) {
    return {
      capability,
      status: 'ambiguous',
      detail: `More than one ${capability} is available and none is uniquely selected.`,
      evidenceIds: candidates.map((candidate) => candidate.id),
    };
  }
  return {
    capability,
    status: 'missing',
    detail: `No confirmed production profile declares an available ${capability}.`,
    evidenceIds: [],
  };
}

function capabilityEvidence(
  profile: ProductionCapabilityProfile | null,
  capability: CaptureRequirementCapability,
): CapabilityEvidence {
  if (capability === 'camera' || capability === 'audio') {
    return selectableEquipmentEvidence(profile, capability);
  }
  if (!profile) {
    return {
      capability,
      status: 'missing',
      detail: `No confirmed production profile supplies ${capability} evidence.`,
      evidenceIds: [],
    };
  }
  if (capability === 'performer') {
    return profile.people.performersAvailable > 0
      ? {
          capability,
          status: 'confirmed',
          detail: `${profile.people.performersAvailable} performer(s) are available in the confirmed production profile.`,
          evidenceIds: [],
        }
      : {
          capability,
          status: 'missing',
          detail: 'No performer is confirmed in the production profile.',
          evidenceIds: [],
        };
  }
  if (capability === 'space') {
    if (profile.spaces.length === 1) {
      return {
        capability,
        status: 'confirmed',
        detail: `The confirmed production space is ${profile.spaces[0]!.label}.`,
        evidenceIds: [profile.spaces[0]!.id],
      };
    }
    if (profile.spaces.length > 1) {
      return {
        capability,
        status: 'ambiguous',
        detail: 'More than one production space is available and none is selected.',
        evidenceIds: profile.spaces.map((space) => space.id),
      };
    }
    return {
      capability,
      status: 'missing',
      detail: 'No production space is confirmed.',
      evidenceIds: [],
    };
  }
  const lights = profile.equipment.filter((item) => item.category === 'light');
  const naturalLightIds = profile.spaces.flatMap((space) => space.naturalLightSources.map(
    (source) => `${space.id}_${source.id}`,
  ));
  if (lights.length > 0 || naturalLightIds.length > 0) {
    return {
      capability,
      status: 'confirmed',
      detail: 'The production profile declares a lighting source.',
      evidenceIds: [...lights.map((light) => light.id), ...naturalLightIds],
    };
  }
  return {
    capability,
    status: 'missing',
    detail: 'No lighting source is confirmed in the production profile.',
    evidenceIds: [],
  };
}

function linkedMoments(
  sidecar: ScriptSidecarV3,
  chapterOwnership: LongFormChapterSceneOwnership | null,
): Map<string, LinkedNarrativeMoment[]> {
  const result = new Map<string, LinkedNarrativeMoment[]>();
  sidecar.acts.forEach((act) => act.narrativeScenes.forEach((scene) => scene.beats.forEach((beat) => {
    beat.visualEvents.forEach((event) => event.captureRequirementIds.forEach((requirementId) => {
      const owner = chapterOwnership?.ownerByNarrativeSceneId.get(scene.id);
      const moments = result.get(requirementId) ?? [];
      moments.push({
        actId: act.id,
        actTitle: act.title,
        ...(owner ? { chapterId: owner.chapter.id, chapterTitle: owner.chapter.title } : {}),
        narrativeSceneId: scene.id,
        beatId: beat.id,
        eventId: event.treatmentEventId,
        narrativePurpose: beat.narrativePurpose,
        timingNote: event.timingNote,
        sourceRefs: [...event.sourceRefs],
        continuityNotes: [...event.continuityNotes],
      });
      result.set(requirementId, moments);
    }));
  })));
  return result;
}

function captureRequirementContinuity(
  moments: readonly LinkedNarrativeMoment[],
): z.infer<typeof CaptureRequirementContinuitySchema> {
  const chapters = new Map<string, z.infer<typeof CaptureRequirementChapterLinkSchema>>();
  moments.forEach((moment) => {
    if (!moment.chapterId || !moment.chapterTitle) return;
    const key = `${moment.actId}:${moment.chapterId}`;
    const current = chapters.get(key) ?? {
      actId: moment.actId,
      actTitle: moment.actTitle,
      chapterId: moment.chapterId,
      chapterTitle: moment.chapterTitle,
      narrativeSceneIds: [],
    };
    if (!current.narrativeSceneIds.includes(moment.narrativeSceneId)) {
      current.narrativeSceneIds.push(moment.narrativeSceneId);
    }
    chapters.set(key, current);
  });
  const chapterLinks = [...chapters.values()];
  return CaptureRequirementContinuitySchema.parse({
    chapterScope: chapterLinks.length === 0
      ? 'unmapped'
      : chapterLinks.length === 1
        ? 'single-chapter'
        : 'cross-chapter',
    actIds: uniqueStrings(moments.map((moment) => moment.actId)),
    chapters: chapterLinks,
    continuityNotes: uniqueStrings(moments.flatMap((moment) => moment.continuityNotes)),
  });
}

function voiceRecordingGuide(sidecar: ScriptSidecarV3): z.infer<typeof VoiceRecordingGuideSchema> {
  const characters = new Map(sidecar.characters.map((character) => [character.id, character]));
  const speakers = new Map<string, {
    characterId: string;
    characterName: string;
    languageCodes: string[];
    deliveries: string[];
    onCameraLineCount: number;
    voiceoverLineCount: number;
  }>();

  sidecar.acts.forEach((act) => act.narrativeScenes.forEach((scene) => scene.beats.forEach((beat) => {
    beat.lines.forEach((line) => {
      if (line.delivery === 'on-screen-text' || !line.speakerId) return;
      const character = characters.get(line.speakerId);
      if (!character) return;
      const current = speakers.get(character.id) ?? {
        characterId: character.id,
        characterName: character.name,
        languageCodes: [],
        deliveries: [],
        onCameraLineCount: 0,
        voiceoverLineCount: 0,
      };
      if (line.languageCode) current.languageCodes.push(line.languageCode);
      current.deliveries.push(line.delivery);
      if (line.onCamera) current.onCameraLineCount += 1;
      if (line.delivery === 'voiceover') current.voiceoverLineCount += 1;
      speakers.set(character.id, current);
    });
  })));

  return VoiceRecordingGuideSchema.parse({
    required: speakers.size > 0,
    speakers: [...speakers.values()].map((speaker) => ({
      ...speaker,
      languageCodes: uniqueStrings(speaker.languageCodes),
      deliveries: uniqueStrings(speaker.deliveries),
    })),
  });
}

export function buildTreatmentCapturePlan(input: BuildTreatmentCapturePlanInput): TreatmentCapturePlan {
  const treatment = parseVideoTreatment(input.treatment);
  const sidecar = assertMaterializedScriptSidecarV3Treatment({
    sidecar: input.sidecar,
    treatment,
  });
  const profile = input.profile === undefined || input.profile === null
    ? null
    : parseProductionCapabilityProfile(input.profile);
  const chapterOwnership = resolveLongFormChapterSceneOwnership({
    chapterPlan: input.chapterPlan,
    acts: sidecar.acts,
  });
  const momentsByRequirementId = linkedMoments(sidecar, chapterOwnership);
  const physicalCaptureRequirements: z.infer<typeof TreatmentCaptureRequirementProjectionSchema>[] = [];
  const nonPhysicalAcquisitionRequirements: z.infer<typeof TreatmentCaptureRequirementProjectionSchema>[] = [];
  const unclassifiedRequirements: z.infer<typeof TreatmentCaptureRequirementProjectionSchema>[] = [];
  const calibrationQuestions: string[] = [];

  treatment.captureRequirements.forEach((requirement) => {
    const linkedNarrativeMoments = momentsByRequirementId.get(requirement.id) ?? [];
    if (linkedNarrativeMoments.length === 0) return;
    const evidence = requirement.captureKind === 'physical-camera'
      ? requirement.requiredCapabilities.map((capability) => capabilityEvidence(profile, capability))
      : [];
    const projection = TreatmentCaptureRequirementProjectionSchema.parse({
      ...requirement,
      capabilityEvidence: evidence,
      linkedNarrativeMoments,
      continuity: captureRequirementContinuity(linkedNarrativeMoments),
    });

    if (requirement.captureKind === 'physical-camera') {
      physicalCaptureRequirements.push(projection);
      calibrationQuestions.push(...requirement.unresolvedCapabilityQuestions);
      evidence.filter((entry) => entry.status !== 'confirmed').forEach((entry) => {
        calibrationQuestions.push(capabilityQuestion(entry.capability));
      });
      return;
    }
    if (requirement.captureKind === 'unspecified') {
      unclassifiedRequirements.push(projection);
      calibrationQuestions.push(...requirement.unresolvedCapabilityQuestions);
      calibrationQuestions.push(`Choose how to acquire the evidence for "${requirement.objective}".`);
      return;
    }
    nonPhysicalAcquisitionRequirements.push(projection);
    calibrationQuestions.push(...requirement.unresolvedCapabilityQuestions);
  });

  const questions = uniqueStrings(calibrationQuestions);
  const status = unclassifiedRequirements.length > 0
    ? 'needs-acquisition-decision'
    : physicalCaptureRequirements.length === 0
      ? 'no-physical-capture'
      : questions.length === 0
        ? 'capture-brief-ready'
        : 'needs-capture-calibration';

  return TreatmentCapturePlanSchema.parse({
    version: TREATMENT_CAPTURE_PROJECTION_VERSION,
    kind: 'treatment-capture-plan',
    status,
    treatment: sidecar.treatment,
    voiceRecording: voiceRecordingGuide(sidecar),
    physicalCaptureRequirements,
    nonPhysicalAcquisitionRequirements,
    unclassifiedRequirements,
    calibrationQuestions: questions,
  });
}
