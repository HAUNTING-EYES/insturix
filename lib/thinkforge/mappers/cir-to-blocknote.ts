/**
 * CIR ↔ BlockNote rendering adapter.
 *
 * Converts Canonical Instruction Representation (plain text sections) into
 * BlockNote display blocks and back. Formatting is presentation-only; the
 * adapter never returns styled content to the canonical layer.
 */

import type { Block as BlockNoteBlock } from "@blocknote/core";
import { ensureCIR, type CIRDocument, type CIRSection, type CIRSectionLabel, validateCIRDocument, sanitizeForRender } from "../schemas/cir";

function sanitizeCanonicalText(text: string): string {
  return (text || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[`*_>#]/g, "")
    .replace(/^\s*[-\d+\.]+\s+/gm, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function textNode(text: string) {
  return { type: "text", text } as const;
}

function nextId(prefix: string, idx: number) {
  return `${prefix}_${idx}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitBody(body: string): string[] {
  return body.split(/\n+/).map((line) => line.trim()).filter(Boolean);
}

function stripLabelPrefix(line: string, label: CIRSectionLabel): string {
  if (!line) return "";
  const patterns: Record<CIRSectionLabel, RegExp> = {
    Header: /^Header:\s*/i,
    Action: /^Action:\s*/i,
    Why: /^Why:\s*/i,
    "Execution Guidance": /^(Execution Guidance:|Do this:)\s*/i,
    Example: /^(Example \(Use As-Is\):|Sample Output:|Worked Example:)\s*/i,
    Next: /^Next:\s*/i,
  };
  const rx = patterns[label];
  return rx ? line.replace(rx, "").trim() : line;
}

function stripMetaLine(line: string): string {
  if (!line) return "";
  if (/^Knowledge Role:/i.test(line)) return "";
  if (/^Operational Goal:/i.test(line)) return "";
  if (/^Why:/i.test(line)) return line.replace(/^Why:\s*/i, "").trim();
  return line;
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
  const bodyLines = splitBody(sanitizeCanonicalText(section.body));
  const blocks: BlockNoteBlock[] = [];
  const baseId = section.id || nextId(section.label.toLowerCase(), index);

  const metaProps = { cirLabel: section.label } as any;

  switch (section.label) {
    case "Header": {
      const body = bodyLines.join(" ") || "";
      blocks.push({
        id: `${baseId}_0`,
        type: "heading" as any,
        content: [textNode(body)],
        props: { ...metaProps, level: 3 },
      } as BlockNoteBlock);
      break;
    }
    case "Action": {
      if (bodyLines.length === 0) {
        blocks.push({ ...lineToBlock("", "paragraph", `${baseId}_0`), props: metaProps });
        break;
      }
      bodyLines.forEach((line, idx) => {
        const clean = stripMetaLine(stripLabelPrefix(line, "Action"));
        blocks.push({ ...lineToBlock(clean, "paragraph", `${baseId}_${idx}`), props: metaProps });
      });
      break;
    }
    case "Why": {
      if (bodyLines.length === 0) {
        blocks.push({ id: `${baseId}_0`, type: "quote" as any, content: [textNode("")], props: metaProps } as BlockNoteBlock);
        break;
      }
      bodyLines.forEach((line, idx) => {
        const clean = stripMetaLine(stripLabelPrefix(line, "Why"));
        blocks.push({ id: `${baseId}_${idx}`, type: "quote" as any, content: [textNode(clean)], props: metaProps } as BlockNoteBlock);
      });
      break;
    }
    case "Execution Guidance": {
      if (bodyLines.length === 0) {
        blocks.push({ id: `${baseId}_0`, type: "quote" as any, content: [textNode("")], props: metaProps } as BlockNoteBlock);
        break;
      }
      bodyLines.forEach((line, idx) => {
        const clean = stripMetaLine(stripLabelPrefix(line, "Execution Guidance"));
        blocks.push({ id: `${baseId}_${idx}`, type: "quote" as any, content: [textNode(clean)], props: metaProps } as BlockNoteBlock);
      });
      break;
    }
    case "Example": {
      const body = bodyLines.map((l) => stripMetaLine(stripLabelPrefix(l, "Example"))).join("\n") || "";
      blocks.push({
        id: `${baseId}_0`,
        type: "code" as any,
        content: [textNode(body)],
        props: metaProps,
      } as BlockNoteBlock);
      break;
    }
    case "Next": {
      blocks.push({ id: `${baseId}_div`, type: "divider" as any, content: [textNode("")], props: metaProps } as BlockNoteBlock);
      bodyLines.forEach((line, idx) => {
        const clean = stripMetaLine(stripLabelPrefix(line, "Next"));
        blocks.push({ id: `${baseId}_${idx}`, type: "paragraph" as any, content: [textNode(clean)], props: metaProps } as BlockNoteBlock);
      });
      break;
    }
    default: {
      throw new Error(`Unhandled CIR label: ${section.label}`);
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

  // Generator may be imperfect. Renderer must never fail.

  const flush = () => {
    pushSection(sections, currentLabel, buffer);
    buffer = [];
  };

  for (const block of blocks || []) {
    if (!block || typeof block !== "object") continue;
    let text = normalizeLineFromBlock(block);

    // Always sanitize text before processing (fail-open)
    text = sanitizeCanonicalText(sanitizeForRender(text));

    if (block.type === "heading") {
      flush();
      currentLabel = "Header";
      if (text) {
        buffer.push(text);
        hasContent = true;
      }
      continue;
    }

    if (block.type === "quote") {
      flush();
      currentLabel = "Why";
      if (text) {
        buffer.push(text);
        hasContent = true;
      }
      continue;
    }

    if (block.type === "codeBlock" || block.type === "code") {
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
    const labelMatch = /^(Header|Action|Why|Execution Guidance|Example|Next):\s*(.*)$/i.exec(text || "");
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
  try {
    return validateCIRDocument({ sections }, false);
  } catch (err) {
    console.warn('blockNoteToCIR fallback (lenient mode):', err);
    return { sections: [{ label: "Action", body: sanitizeForRender(buffer.join("\n")) || "(Empty—awaiting content)" }] };
  }
}
