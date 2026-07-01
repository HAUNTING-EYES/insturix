import type { ThinkToClickHandoffState } from "@/lib/thinkforge/clickatron-handoff-state";

export function buildClickatronPromptFromHandoff(handoffState: ThinkToClickHandoffState): string {
  const payload = handoffState.payloadPreview;
  if (!payload?.prompt.trim()) {
    throw new Error("Clickatron handoff is missing a generated visual prompt.");
  }

  const choices = handoffState.display.visualChoices;
  const choiceLines = [
    choices?.kind ? `Output type: ${choices.kind}` : "",
    choices?.platform ? `Platform: ${choices.platform}` : "",
    choices?.aspectRatio ? `Aspect ratio: ${choices.aspectRatio}` : "",
    choices?.visualMode ? `Visual mode: ${choices.visualMode}` : "",
    choices?.textDensity ? `Text density: ${choices.textDensity}` : "",
    choices?.vibe ? `Vibe: ${choices.vibe}` : "",
    choices?.imageStyle ? `Image style: ${choices.imageStyle}` : "",
    choices?.notes ? `User notes: ${choices.notes}` : "",
  ].filter(Boolean);

  return [
    payload.prompt,
    choiceLines.length > 0 ? `User visual choices:\n${choiceLines.join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

export function buildClickatronMetadataFromHandoff(handoffState: ThinkToClickHandoffState): Record<string, unknown> {
  return {
    ...(handoffState.payloadPreview?.metadata || {}),
    clickatronHandoff: {
      status: handoffState.status,
      visualChoices: handoffState.display.visualChoices,
      requiredUserInput: handoffState.requiredUserInput,
      sourceBlockIds: handoffState.debug.sourceBlockIds,
      contentHash: handoffState.debug.contentHash,
      contentCardId: handoffState.debug.contentCardId,
      campaignId: handoffState.debug.campaignId,
    },
  };
}

export function buildClickatronSessionFormData(handoffState: ThinkToClickHandoffState): FormData {
  const payload = handoffState.payloadPreview;
  if (!payload) {
    throw new Error("Clickatron handoff is missing a session payload.");
  }
  if (!handoffState.canSendToClickatron) {
    throw new Error(`Clickatron handoff is not ready to send: ${handoffState.status}`);
  }

  const formData = new FormData();
  formData.append("prompt", buildClickatronPromptFromHandoff(handoffState));
  formData.append("aspectRatio", handoffState.display.visualChoices?.aspectRatio || payload.aspectRatio);
  appendContextField(formData, "brandId", payload.brandId);
  appendContextField(formData, "projectId", payload.projectId);
  appendContextField(formData, "universalId", payload.universalId);
  appendContextField(formData, "sourceService", payload.sourceService);
  appendContextField(formData, "sourceSessionId", payload.sourceSessionId);
  appendContextField(formData, "sourceScriptId", payload.sourceScriptId);
  formData.append("metadata", JSON.stringify(buildClickatronMetadataFromHandoff(handoffState)));
  return formData;
}

function appendContextField(formData: FormData, key: string, value: unknown) {
  if (typeof value === "string" && value.trim().length > 0) {
    formData.append(key, value.trim());
  }
}
