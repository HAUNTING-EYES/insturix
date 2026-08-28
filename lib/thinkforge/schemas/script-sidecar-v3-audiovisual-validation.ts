import type { ScriptSidecarV3 } from './script-sidecar-v3';
import type { VideoTreatment } from './video-treatment';

export function findScriptSidecarV3AudiovisualEventIssues(input: {
  sidecar: ScriptSidecarV3;
  treatment: VideoTreatment;
}): string[] {
  const treatmentEventsById = new Map(
    input.treatment.visualEvents.map((event) => [event.id, event]),
  );
  const issues = new Set<string>();

  input.sidecar.acts.forEach((act) => act.narrativeScenes.forEach((scene) => {
    scene.beats.forEach((beat) => {
      const selectedEvents = beat.visualEvents.flatMap((selection) => {
        const event = treatmentEventsById.get(selection.treatmentEventId);
        return event ? [event] : [];
      });
      const hasOnCameraSpeech = beat.lines.some(
        (line) => line.delivery !== 'on-screen-text' && line.onCamera,
      );

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

  return [...issues];
}
