import type { GenerateParams, GenerateResult } from "../contract";
import { isVideoFormat } from "../route-map";
import { runPostWriter } from "./_post-writer";
import { runScriptWriter } from "./_script-writer";

/**
 * ThinkForge writer: produces a planned card's text deliverable. For VIDEO formats that's a SCRIPT
 * (ScriptWriterAgent) — CalOS writes the script, then the user takes it into Editron or shoots their
 * own footage; for everything else it's post copy (PostWriterAgent). Returns the draft as assetText.
 */
export async function thinkforgeGenerator(params: GenerateParams): Promise<GenerateResult> {
  try {
    const content = isVideoFormat(params.format ?? "")
      ? await runScriptWriter(params)
      : await runPostWriter(params);
    if (!content) return { ok: false, error: "Writer returned empty content" };
    return { ok: true, assetText: content };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "ThinkForge generation failed" };
  }
}
