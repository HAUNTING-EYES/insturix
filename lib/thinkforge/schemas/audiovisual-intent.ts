import { z } from 'zod';

export const THINKFORGE_AUDIOVISUAL_INTENT_VERSION = 1 as const;

export const AudiovisualConstraintSchema = z.enum([
  'required',
  'forbidden',
  'unspecified',
]);

export type AudiovisualConstraint = z.infer<typeof AudiovisualConstraintSchema>;

const AudiovisualIntentObjectSchema = z.object({
  // Server-owned; the numeric default is safe for model-facing response schemas.
  version: z.number().int().default(THINKFORGE_AUDIOVISUAL_INTENT_VERSION),
  audibleSpeech: AudiovisualConstraintSchema,
  onCameraSpeech: AudiovisualConstraintSchema,
  visiblePerson: AudiovisualConstraintSchema,
  physicalCapture: AudiovisualConstraintSchema,
}).strict();

export const ThinkForgeAudiovisualIntentSchema = AudiovisualIntentObjectSchema.superRefine(
  (intent, ctx) => {
    if (intent.version !== THINKFORGE_AUDIOVISUAL_INTENT_VERSION) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['version'],
        message: `Expected audiovisual intent version ${THINKFORGE_AUDIOVISUAL_INTENT_VERSION}.`,
      });
    }
    if (intent.onCameraSpeech === 'required' && intent.audibleSpeech !== 'required') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['audibleSpeech'],
        message: 'On-camera speech requires audible speech.',
      });
    }
    if (intent.onCameraSpeech === 'required' && intent.visiblePerson !== 'required') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['visiblePerson'],
        message: 'On-camera speech requires a visible person.',
      });
    }
  },
);

export type ThinkForgeAudiovisualIntent = z.infer<typeof ThinkForgeAudiovisualIntentSchema>;

export function createUnspecifiedAudiovisualIntent(): ThinkForgeAudiovisualIntent {
  return {
    version: THINKFORGE_AUDIOVISUAL_INTENT_VERSION,
    audibleSpeech: 'unspecified',
    onCameraSpeech: 'unspecified',
    visiblePerson: 'unspecified',
    physicalCapture: 'unspecified',
  };
}
