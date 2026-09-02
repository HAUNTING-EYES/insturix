import type { ScriptSidecarV3 } from './script-sidecar-v3';
import type { VideoTreatment } from './video-treatment';

export function findVideoTreatmentScriptReadinessIssues(treatment: VideoTreatment): string[] {
  const decision = treatment.resolvedAudiovisualDecision;
  if (decision.origin !== 'model') return [];

  const issues: string[] = [];
  const unresolved = [
    ['audible_speech', decision.audibleSpeech.presence],
    ['on_camera_speech', decision.onCameraSpeech.presence],
    ['visible_people', decision.visiblePeople.presence],
    ['physical_capture', decision.physicalCapture.need],
    ['graphics', decision.materials.graphics],
    ['generated_imagery', decision.materials.generatedImagery],
    ['supplied_footage', decision.materials.suppliedFootage],
    ['screen_material', decision.materials.screenMaterial],
    ['source_material', decision.materials.sourceMaterial],
  ] as const;
  unresolved.forEach(([field, value]) => {
    if (value === 'unresolved') issues.push(`audiovisual_decision_unresolved:${field}`);
  });

  return issues;
}

export function findScriptSidecarV3AudiovisualEventIssues(input: {
  sidecar: ScriptSidecarV3;
  treatment: VideoTreatment;
}): string[] {
  const treatmentEventsById = new Map(
    input.treatment.visualEvents.map((event) => [event.id, event]),
  );
  const issues = new Set<string>(findVideoTreatmentScriptReadinessIssues(input.treatment));
  let spokenLineCount = 0;
  let voiceoverLineCount = 0;
  let synchronousDialogueLineCount = 0;
  let diegeticSpeechLineCount = 0;
  let onCameraSpokenLineCount = 0;
  const visibleCharacterIds = new Set<string>();

  input.sidecar.acts.forEach((act) => act.narrativeScenes.forEach((scene) => {
    scene.charactersPresent.forEach((characterId) => visibleCharacterIds.add(characterId));
    scene.beats.forEach((beat) => {
      const selectedEvents = beat.visualEvents.flatMap((selection) => {
        const event = treatmentEventsById.get(selection.treatmentEventId);
        return event ? [event] : [];
      });
      const hasOnCameraSpeech = beat.lines.some(
        (line) => line.delivery !== 'on-screen-text' && line.onCamera,
      );
      beat.lines.forEach((line) => {
        if (line.delivery === 'on-screen-text') return;
        spokenLineCount += 1;
        if (line.onCamera) onCameraSpokenLineCount += 1;
        if (line.delivery === 'voiceover') {
          voiceoverLineCount += 1;
          if (line.onCamera) issues.add(`audiovisual_voiceover_marked_on_camera:${line.id}`);
        }
        if (line.delivery === 'sync-dialogue') synchronousDialogueLineCount += 1;
        if (line.delivery === 'diegetic-speech') {
          diegeticSpeechLineCount += 1;
          if (line.onCamera) issues.add(`audiovisual_diegetic_speech_marked_on_camera:${line.id}`);
        }
      });

      if (hasOnCameraSpeech && selectedEvents.length === 0) {
        issues.add(`audiovisual_on_camera_event_missing:${beat.id}`);
      } else if (
        hasOnCameraSpeech
        && selectedEvents.every((event) => event.visiblePerson === 'forbidden')
      ) {
        issues.add(`audiovisual_on_camera_event_forbids_person:${beat.id}`);
      }

      selectedEvents.forEach((event) => {
        if (event.visiblePerson === 'required' && scene.charactersPresent.length === 0) {
          issues.add(`audiovisual_visible_person_event_cast_missing:${event.id}`);
        }
      });
    });
  }));

  const decision = input.treatment.resolvedAudiovisualDecision;
  if (decision.origin === 'model') {
    const speechPresent = ['sparse', 'present', 'mixed'].includes(decision.audibleSpeech.presence);
    if (!speechPresent && spokenLineCount > 0) {
      issues.add(`audiovisual_speech_forbidden:${spokenLineCount}`);
    }
    if (speechPresent && spokenLineCount === 0) issues.add('audiovisual_speech_required');

    if (decision.onCameraSpeech.presence === 'absent' && onCameraSpokenLineCount > 0) {
      issues.add(`audiovisual_on_camera_speech_forbidden:${onCameraSpokenLineCount}`);
    }
    if (decision.onCameraSpeech.presence === 'present' && onCameraSpokenLineCount === 0) {
      issues.add('audiovisual_on_camera_speech_required');
    }

    if (decision.visiblePeople.presence === 'absent' && visibleCharacterIds.size > 0) {
      issues.add(`audiovisual_visible_person_forbidden:${visibleCharacterIds.size}`);
    }
    if (decision.visiblePeople.presence === 'present' && visibleCharacterIds.size === 0) {
      issues.add('audiovisual_visible_person_required');
    }

    const expectedSources = new Set(decision.audibleSpeech.sources);
    if (!expectedSources.has('voice-over') && voiceoverLineCount > 0) {
      issues.add(`audiovisual_speech_source_forbidden:voice-over:${voiceoverLineCount}`);
    }
    if (expectedSources.has('voice-over') && voiceoverLineCount === 0) {
      issues.add('audiovisual_speech_source_required:voice-over');
    }
    if (!expectedSources.has('synchronous-dialogue') && synchronousDialogueLineCount > 0) {
      issues.add(`audiovisual_speech_source_forbidden:synchronous-dialogue:${synchronousDialogueLineCount}`);
    }
    if (expectedSources.has('synchronous-dialogue') && synchronousDialogueLineCount === 0) {
      issues.add('audiovisual_speech_source_required:synchronous-dialogue');
    }
    if (!expectedSources.has('diegetic-speech') && diegeticSpeechLineCount > 0) {
      issues.add(`audiovisual_speech_source_forbidden:diegetic-speech:${diegeticSpeechLineCount}`);
    }
    if (expectedSources.has('diegetic-speech') && diegeticSpeechLineCount === 0) {
      issues.add('audiovisual_speech_source_required:diegetic-speech');
    }
  }

  return [...issues];
}
