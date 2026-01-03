/**
 * CIR ↔ BlockNote rendering adapter.
 *
 * Converts Canonical Instruction Representation (plain text sections) into
 * BlockNote display blocks and back. Formatting is presentation-only; the
 * adapter never returns styled content to the canonical layer.
 */

import type { Block as BlockNoteBlock } from "@blocknote/core";
import { ensureCIR, type CIRDocument, type CIRSection, type CIRSectionLabel, validateCIRDocument, sanitizeForRender } from "../schemas/cir";

function textNode(text: string) {
  return { type: "text", text } as const;
}

function nextId(prefix: string, idx: number) {
  return `${prefix}_${idx}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitBody(body: string): string[] {
  return body.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function lineToBlock(line: string, fallbackType: string, id: string): BlockNoteBlock {
  const bulletMatch = /^[-*]\s+(.+)/.exec(line);
  if (bulletMatch) {
    return {
      id,
      type: "bulletListItem" as any,
      content: [textNode(bulletMatch[1])],
    } as BlockNoteBlock;
  }

  const numberedMatch = /^\d+\.\s+(.+)/.exec(line);
  if (numberedMatch) {
    return {
      id,
      type: "numberedListItem" as any,
      content: [textNode(numberedMatch[1])],
    } as BlockNoteBlock;
  }

  return {
    id,
    type: fallbackType as any,
    content: [textNode(line)],
  } as BlockNoteBlock;
}

function sectionToBlocks(section: CIRSection, index: number): BlockNoteBlock[] {
  const bodyLines = splitBody(section.body);
  const blocks: BlockNoteBlock[] = [];
  const baseId = section.id || nextId(section.label.toLowerCase(), index);

  // Label block as subtle marker for the section
  blocks.push({
    id: `${baseId}_label`,
    type: "paragraph" as any,
    content: [textNode(`${section.label}`)],
  } as BlockNoteBlock);

  switch (section.label) {
    case "Action": {
      if (bodyLines.length === 0) {
        blocks.push(lineToBlock("", "paragraph", `${baseId}_0`));
        break;
      }
      bodyLines.forEach((line, idx) => {
        blocks.push(lineToBlock(line, "paragraph", `${baseId}_${idx}`));
      });
      break;
    }
    case "Execution Guidance": {
      if (bodyLines.length === 0) {
        blocks.push({ id: `${baseId}_0`, type: "quote" as any, content: [textNode("")] } as BlockNoteBlock);
        break;
      }
      bodyLines.forEach((line, idx) => {
        blocks.push({ id: `${baseId}_${idx}`, type: "quote" as any, content: [textNode(line)] } as BlockNoteBlock);
      });
      break;
    }
    case "Example": {
      const body = bodyLines.join("\n") || "";
      blocks.push({
        id: `${baseId}_0`,
        type: "code" as any,
        content: [textNode(body)],
      } as BlockNoteBlock);
      break;
    }
    case "Next": {
      blocks.push({ id: `${baseId}_div`, type: "divider" as any, content: [textNode("")] } as BlockNoteBlock);
      bodyLines.forEach((line, idx) => {
        blocks.push({ id: `${baseId}_${idx}`, type: "paragraph" as any, content: [textNode(line)] } as BlockNoteBlock);
      });
      break;
    }
    default: {
      bodyLines.forEach((line, idx) => {
        blocks.push(lineToBlock(line, "paragraph", `${baseId}_${idx}`));
      });
    }
  }

  return blocks;
}

function extractPlainText(block: BlockNoteBlock): string {
  const content = (block as any).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((node: any) => {
      if (node && typeof node.text === "string") {
        return node.text;
      }
      return "";
    })
    .join("")
    .trim();
}

function normalizeLineFromBlock(block: BlockNoteBlock): string {
  const text = extractPlainText(block);
  if (!text) return "";

  if (block.type === "bulletListItem") {
    return `- ${text}`;
  }
  if (block.type === "numberedListItem") {
    return `1. ${text}`;
  }
  return text;
}

function pushSection(sections: CIRSection[], label: CIRSectionLabel, lines: string[]) {
  const body = lines.join("\n").trim();
  if (!body) return;
  sections.push({ label, body });
}

export function cirToBlockNote(cir: CIRDocument): BlockNoteBlock[] {
  const doc = ensureCIR(cir);
  const blocks: BlockNoteBlock[] = [];

  doc.sections.forEach((section, idx) => {
    blocks.push(...sectionToBlocks(section, idx));
  });

  return blocks;
}

export function blockNoteToCIR(blocks: BlockNoteBlock[]): CIRDocument {
  const sections: CIRSection[] = [];
  let currentLabel: CIRSectionLabel = "Action";
  let buffer: string[] = [];
  let hasContent = false;

  const flush = () => {
    pushSection(sections, currentLabel, buffer);
    buffer = [];
  };

  for (const block of blocks || []) {
    if (!block || typeof block !== "object") continue;
    let text = normalizeLineFromBlock(block);
    
    // Always sanitize text before processing (fail-open)
    text = sanitizeForRender(text);

    if (block.type === "quote") {
      flush();
      currentLabel = "Execution Guidance";
      if (text) {
        buffer.push(text);
        hasContent = true;
      }
      continue;
    }

    if (block.type === "codeBlock") {
      flush();
      currentLabel = "Example";
      if (text) {
        buffer.push(text);
        hasContent = true;
      }
      continue;
    }

    if (block.type === "divider") {
      flush();
      currentLabel = "Next";
      continue;
    }

    // Preserve explicit label markers in text (e.g., "Action: ...")
    const labelMatch = /^(Action|Execution Guidance|Example|Next):\s*(.*)$/i.exec(text || "");
    if (labelMatch) {
      flush();
      currentLabel = labelMatch[1] as CIRSectionLabel;
      if (labelMatch[2]) {
        buffer.push(labelMatch[2]);
        hasContent = true;
      }
      continue;
    }

    if (text) {
      buffer.push(text);
      hasContent = true;
    }
  }

  flush();

  // If no content was extracted, return fallback
  if (!hasContent || sections.length === 0) {
    return {
      sections: [{ label: "Action", body: "(Empty—awaiting content)" }],
    };
  }

  // Use lenient mode (strict=false) to avoid throws during assembly
  return validateCIRDocument({ sections }, false);
}
