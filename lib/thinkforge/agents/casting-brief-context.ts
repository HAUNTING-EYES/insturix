import type {
  CharacterCasting,
  ProductionBrief,
} from '@/lib/editron/production-brief/production-brief';

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
    '- If an avatar-cast character is visible in a narrative scene, include that characterId in narrativeScene.charactersPresent and describe the intended performance in the relevant beat.shotIntent.',
    '- If an avatar-cast character speaks, use the same characterId as line.speakerId and describe the actual delivery honestly: sync-dialogue only for speech captured on camera, voiceover for off-camera speech.',
    '- Every spoken line declares its actual languageCode. A character whose voice mode is "none" must not receive a spoken line.',
    '- Choose on-camera speech only when it serves the explicit brief, character role, and narrative beat. Never target an arbitrary on-camera ratio.',
    '- Do not split, shorten, translate, or move speech merely to satisfy a renderer. Author the coherent narrative; the technical production planner will produce compatibility choices and render segments later.',
  ].join('\n');
}

function describeVoice(voice: CharacterCasting['voice']): string {
  if (voice.mode === 'cloned') return 'cloned voice';
  if (voice.mode === 'preset') return `preset voice ${voice.ttsVoiceId}`;
  return 'no speaking voice';
}
