import type {
  CharacterCasting,
  ProductionBrief,
} from '@/lib/editron/production-brief/production-brief';
import { WRITER_CAPABILITIES } from '../writer-capabilities';

type CastingEntry = [characterId: string, binding: CharacterCasting];

export function getAvatarCastingEntries(productionBrief?: ProductionBrief | null): CastingEntry[] {
  const castingMap = productionBrief?.casting?.map;
  if (!castingMap) return [];
  return Object.entries(castingMap)
    .filter((entry): entry is CastingEntry => {
      const [characterId, binding] = entry;
      return characterId.trim().length > 0 && typeof binding?.avatarProfileId === 'string'
        && binding.avatarProfileId.trim().length > 0;
    });
}

export function formatCastingBriefForPrompt(productionBrief?: ProductionBrief | null): string {
  const entries = getAvatarCastingEntries(productionBrief);
  if (entries.length === 0) return '';

  const characters = entries.map(([characterId, binding]) => {
    return `- characterId "${characterId}" -> Avatar Vault profile "${binding.avatarProfileId}" (${describeVoice(binding.voice)})`;
  });

  return [
    '## Avatar Casting Contract',
    'ProductionBrief already resolved avatar and voice bindings. Do not invent avatar IDs, provider IDs, or alternate character IDs.',
    'Avatar-cast characters:',
    ...characters,
    'Mandatory sidecar rules:',
    '- Add each listed character to sidecar.characters using exactly the listed characterId. Use role "host" unless the narrative clearly needs "subject", "expert", or "interviewee".',
    '- If an avatar-cast character is visible in a scene, include that characterId in scene.charactersPresent.',
    '- If an avatar-cast character speaks, set that line to the same speakerId, onCamera: true, delivery: "sync-dialogue". Use "narrator" only for VO-over-visuals.',
    '- Choose on-camera sync dialogue only when it serves the explicit brief, character role, and narrative beat. Never target an arbitrary on-camera ratio or move required cast speech to voiceover to reduce lip-sync work.',
    `- For every avatar sync-dialogue scene, visualDescription must be relip-safe: face visible, front/on-camera framing, no more than ${WRITER_CAPABILITIES.relipSafe.maxOcclusion} occlusion, and ${WRITER_CAPABILITIES.relipSafe.motionDuringLines} motion or calmer.`,
    `- Each avatar sync-dialogue sidecar.scene is one real lip-sync job. When a spoken beat exceeds ${WRITER_CAPABILITIES.maxSpeakingSegmentSec}s, split it into consecutive complete sidecar.scenes of ${WRITER_CAPABILITIES.maxSpeakingSegmentSec}s or less. Each split scene needs its own duration, visual direction, line data, relip safety data, and shotIntent; subShots do not split a lip-sync job.`,
  ].join('\n');
}

function describeVoice(voice: CharacterCasting['voice']): string {
  if (voice.mode === 'cloned') return 'cloned voice';
  if (voice.mode === 'preset') return `preset voice ${voice.ttsVoiceId}`;
  return 'no speaking voice';
}
