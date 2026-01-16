/**
 * Ultra-light intent classifier prompt.
 * Returns a single label with no reasoning to keep latency minimal.
 */
export function buildIntentClassifierPrompt(input: {
  message: string;
  hasScript: boolean;
  hasSelection: boolean;
  context?: {
    editorFocused?: boolean;
    workspaceMode?: "script" | "whiteboard" | "unknown";
    lastUserAction?: string;
  };
}): string {
  const { message, hasScript, hasSelection, context } = input;
  return [
    "You classify user intent for a script editor.",
    "Return a JSON object with fields:",
    '{"intent":"chat|draft|edit|hybrid","confidence":0-1,"scope":"selection|section|document"}',
    "",
    "Context:",
    `- Has existing script: ${hasScript}`,
    `- Has selection: ${hasSelection}`,
    `- Editor focused: ${context?.editorFocused ? "yes" : "no"}`,
    `- Workspace mode: ${context?.workspaceMode || "unknown"}`,
    `- Last user action: ${context?.lastUserAction || "unknown"}`,
    "",
    'User message:',
    `"${message}"`,
    "",
    "Return JSON only."
  ].join("\n");
}

