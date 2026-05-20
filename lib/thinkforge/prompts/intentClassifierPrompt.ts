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
  // ─── Prompt: XML-structured per Rule 35 (2026-05-14) ────────────
  return [
    "<role>You classify user intent for a script editor.</role>",
    "",
    "<task>Classify the user message into one intent with confidence and scope.</task>",
    "",
    "<rules>",
    "INTENTS:",
    "- chat: general Q&A, how-to questions, explanations",
    "- draft: create/write/generate a new script",
    "- edit: modify existing content (rewrite, fix, refine)",
    "- hybrid: mix of edit + question or edit + draft",
    "- research: find trends, examples, references, ideas, sources, explore topics from the web",
    "",
    "SCOPE: selection (highlighted text), section (current section), document (whole script)",
    "</rules>",
    "",
    `<output_format>JSON only: {"intent":"chat|draft|edit|hybrid|research","confidence":0-1,"scope":"selection|section|document"}</output_format>`,
    "",
    "<input_data>",
    `Has existing script: ${hasScript}`,
    `Has selection: ${hasSelection}`,
    `Editor focused: ${context?.editorFocused ? "yes" : "no"}`,
    `Workspace: ${context?.workspaceMode || "unknown"}`,
    `Last action: ${context?.lastUserAction || "unknown"}`,
    `User message: "${message}"`,
    "</input_data>",
  ].join("\n");
}

