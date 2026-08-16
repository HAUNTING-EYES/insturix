import type { Script } from "@/app/dashboard/thinkforge/types";
import type { ScriptModel } from "@/lib/thinkforge/json";
import {
  matchesThinkForgeDocumentIdentity,
  type ThinkForgeDocumentIdentity,
} from "@/lib/thinkforge/client-document-identity";

export type ThinkForgeInitialHydrationDecision =
  | { status: 'waiting' }
  | { status: 'identity_mismatch' }
  | { status: 'ready'; source: 'rich_text'; value: NonNullable<Script['richText']> }
  | { status: 'ready'; source: 'blocks'; value: NonNullable<Script['blocks']> }
  | { status: 'ready'; source: 'content'; value: string }
  | { status: 'ready'; source: 'empty' };

export function resolveThinkForgeInitialHydration(input: {
  isLoading: boolean;
  script: Script | null;
  identity: ThinkForgeDocumentIdentity;
}): ThinkForgeInitialHydrationDecision {
  if (input.isLoading) return { status: 'waiting' };
  if (!input.script) return { status: 'ready', source: 'empty' };
  if (!matchesThinkForgeDocumentIdentity(input.script, input.identity)) {
    return { status: 'identity_mismatch' };
  }

  if (input.script.richText !== undefined && input.script.richText !== null) {
    return { status: 'ready', source: 'rich_text', value: input.script.richText };
  }
  if (input.script.blocks !== undefined && input.script.blocks !== null) {
    if (!Array.isArray(input.script.blocks) || input.script.blocks.length > 0) {
      return { status: 'ready', source: 'blocks', value: input.script.blocks };
    }
  }
  if (typeof input.script.content === 'string' && input.script.content.length > 0) {
    return { status: 'ready', source: 'content', value: input.script.content };
  }
  return { status: 'ready', source: 'empty' };
}

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
