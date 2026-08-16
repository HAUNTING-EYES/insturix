import type { Script } from "@/app/dashboard/thinkforge/types";
import type { ScriptModel } from "@/lib/thinkforge/json";

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildDisplayBody(title: string | null | undefined, content: string | null | undefined): string | undefined {
  const sections: string[] = [];
  if (title) sections.push(`<h1>${escapeHtml(title)}</h1>`);
  if (content) {
    sections.push(...content
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`));
  }
  return sections.length > 0 ? sections.join('\n') : undefined;
}

export function scriptModelToUiScript(model: ScriptModel | null): Script | null {
  if (!model) return null;
  const body = buildDisplayBody(model.title, model.content);

  return {
    ...(model.sessionId !== undefined ? { sessionId: model.sessionId } : {}),
    ...(model.scriptId !== undefined ? { scriptId: model.scriptId } : {}),
    ...(model.title !== undefined ? { title: model.title } : {}),
    ...(model.version !== undefined ? { version: model.version } : {}),
    ...(model.content !== undefined ? { content: model.content } : {}),
    ...(model.blocks !== undefined ? { blocks: model.blocks as Script['blocks'] } : {}),
    ...(model.richText !== undefined ? { richText: model.richText as Script['richText'] } : {}),
    ...(model.documentType !== undefined ? { documentType: model.documentType as Script['documentType'] } : {}),
    ...(model.contentContract !== undefined ? { contentContract: model.contentContract } : {}),
    ...(model.metadata !== undefined ? { metadata: model.metadata as Script['metadata'] } : {}),
    ...(body !== undefined ? { body } : {}),
  };
}

export function uiScriptToScriptModel(script: Script | null): ScriptModel | null {
  if (!script) return null;

  return {
    ...(script.sessionId !== undefined ? { sessionId: script.sessionId } : {}),
    ...(script.scriptId !== undefined ? { scriptId: script.scriptId } : {}),
    ...(script.title !== undefined ? { title: script.title } : {}),
    ...(script.version !== undefined ? { version: script.version } : {}),
    ...(script.content !== undefined ? { content: script.content } : {}),
    ...(script.blocks !== undefined ? { blocks: script.blocks as ScriptModel['blocks'] } : {}),
    ...(script.richText !== undefined ? { richText: script.richText as ScriptModel['richText'] } : {}),
    ...(script.documentType !== undefined ? { documentType: script.documentType } : {}),
    ...(script.contentContract !== undefined ? { contentContract: script.contentContract } : {}),
    ...(script.metadata !== undefined ? { metadata: script.metadata } : {}),
  };
}
