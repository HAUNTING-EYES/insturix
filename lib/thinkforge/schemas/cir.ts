/**
 * Canonical Instruction Representation (CIR)
 * -----------------------------------------
 * CORE RULE (LOCK THIS):
 * - Generation must fail closed (strict validation, retries on violations)
 * - Assembly and rendering must fail open (sanitize and continue)
 *
 * Plain-text only instructional schema used for storage and generation.
 * BlockNote formatting is presentation-only and must never be persisted here.
 */

export type CIRSectionLabel = "Header" | "Action" | "Why" | "Example" | "Execution Guidance" | "Next";

export interface CIRSection {
  id?: string;
  label: CIRSectionLabel;
  body: string; // Plain text only (bullets/numbered steps allowed)
}

export interface CIRDocument {
  title?: string;
  sections: CIRSection[];
}

const LABELS: CIRSectionLabel[] = ["Header", "Action", "Why", "Example", "Execution Guidance", "Next"];
const INLINE_FORMATTING_PATTERNS = [
  /\*\*/, // bold markers
  /__/, // alternative bold
  /`/, // inline code
  /\|/, // table/pipe separators
];

// ============================================================================
// SANITIZATION LAYER (Fail-Open): Strip violations instead of throwing
// ============================================================================

/**
 * Strip HTML tags (used during assembly/rendering, never throws)
 */
export function stripHTML(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, "");
}

/**
 * Strip markdown inline formatting: **bold**, __underline__, `code`
 */
export function stripInlineFormatting(text: string): string {
  return text
    .replace(/\*\*/g, "") // bold
    .replace(/__/g, "") // underline
    .replace(/`/g, "") // inline code
    .replace(/~/g, ""); // strikethrough
}

/**
 * Flatten markdown tables to bullet points (used during assembly)
 */
export function flattenMarkdownTables(text: string): string {
  return text
    .split("\n")
    .filter((line) => !line.match(/^\s*\|.*\|\s*$/)) // Remove pipe-bordered lines
    .filter((line) => line.trim()) // Remove empty lines
    .join("\n");
}

/**
 * Strip markdown emphasis: *italic*, _underline_, ~~strikethrough~~
 */
export function stripMarkdownEmphasis(text: string): string {
  return text
    .replace(/\*([^\*]+)\*/g, "$1") // *italic* → italic
    .replace(/_([^_]+)_/g, "$1") // _underline_ → underline
    .replace(/~~([^~]+)~~/g, "$1"); // ~~strikethrough~~ → strikethrough
}

/**
 * Final guaranteed-safe sanitization pass (deterministic, non-throwing, cheap)
 * Used before rendering or saving to ensure no formatting violations remain.
 */
export function sanitizeForRender(text: string): string {
  return stripHTML(stripMarkdownEmphasis(stripInlineFormatting(flattenMarkdownTables(text))));
}

// ============================================================================
// DETECTION LAYER (used for logging/retry decisions, not for throwing)
// ============================================================================

function hasHTML(text: string): boolean {
  return /<[^>]+>/.test(text) || text.includes("<") || text.includes(">");
}

function hasTable(text: string): boolean {
  // Detect markdown-style tables or grid-like pipes
  return /\n?\s*\|.*\|\s*/.test(text);
}

function hasInlineFormatting(text: string): boolean {
  return INLINE_FORMATTING_PATTERNS.some((p) => p.test(text));
}

function normalizeBody(body: string): string {
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

/**
 * Core Control-Flow Invariant:
 * ============================
 * - validateCIRDocument(doc, strict=true): Fail-closed during generation. Throws on any violation.
 *   Used by script-section-agent to enforce CIR discipline and trigger retries.
 *
 * - validateCIRDocument(doc, strict=false): Fail-open during assembly/rendering. Warns and sanitizes.
 *   Used by blockNoteToCIR, cirToBlockNoteSafe, and editor to ensure scripts always display.
 *
 * - ensureCIR(doc, strict=false): Assembly default. Never throws. Returns safe fallback on error.
 *
 * - sanitizeForRender(text): Guaranteed-safe deterministic pass. Applied before display.
 *
 * Never fail closed at the presentation boundary. Better imperfect text than no text.
 */

/**
 * validateCIRDocument (STRICT MODE - used for generation, fails closed)
 * Throws on any CIR violations. This ensures generators retry when needed.
 * Only called during AI generation, not during assembly/rendering.
 */
export function validateCIRDocument(doc: unknown, strict: boolean = true): CIRDocument {
  if (!doc || typeof doc !== "object") {
    throw new Error("CIR must be an object with sections");
  }

  const { title, sections } = doc as Partial<CIRDocument>;

  // Allow empty sections array and provide fallback
  if (!Array.isArray(sections)) {
    if (strict) {
      throw new Error("CIR.sections must be an array");
    }
    return {
      title: typeof title === "string" ? title.trim() : undefined,
      sections: [{ label: "Action", body: "(Empty—awaiting content)" }],
    };
  }

  if (sections.length === 0) {
    if (strict) {
      throw new Error("CIR.sections must be a non-empty array");
    }
    return {
      title: typeof title === "string" ? title.trim() : undefined,
      sections: [{ label: "Action", body: "(Empty—awaiting content)" }],
    };
  }

  const validated: CIRSection[] = sections
    .map((section, idx) => {
      if (!section || typeof section !== "object") {
        if (strict) {
          throw new Error(`CIR section ${idx} is not an object`);
        }
        return null; // Skip invalid sections in lenient mode
      }

      const label = (section as any).label as CIRSectionLabel;
      let bodyRaw = typeof (section as any).body === "string" ? (section as any).body : "";
      let body = normalizeBody(bodyRaw);

      // Validate label
      if (!LABELS.includes(label)) {
        if (strict) {
          throw new Error(`CIR section ${idx} has invalid label`);
        }
        return null;
      }

      // Validate body not empty
      if (!body) {
        if (strict) {
          throw new Error(`CIR section ${idx} body is empty`);
        }
        return null;
      }

      // Check for violations (detect only, not fatal in lenient mode)
      const violations = [];
      if (hasHTML(body)) violations.push("HTML");
      if (hasTable(body)) violations.push("table");
      if (hasInlineFormatting(body)) violations.push("inline formatting");

      // In strict mode, throw immediately; in lenient mode, warn and sanitize
      if (violations.length > 0) {
        if (strict) {
          throw new Error(`CIR section ${idx} contains ${violations.join(", ")}; rejected`);
        }
        // Lenient: log warning and sanitize
        console.warn(`⚠️ CIR section ${idx} contains ${violations.join(", ")}—sanitizing for render`);
        body = sanitizeForRender(body);
      }

      return {
        id: typeof (section as any).id === "string" && (section as any).id.trim() ? (section as any).id : undefined,
        label,
        body,
      };
    })
    .filter((s) => s !== null) as CIRSection[];

  // Ensure at least one valid section even after filtering
  if (validated.length === 0) {
    if (strict) {
      throw new Error("CIR document has no valid sections after validation");
    }
    return {
      title: typeof title === "string" ? title.trim() : undefined,
      sections: [{ label: "Action", body: "(Content sanitized—review before use)" }],
    };
  }

  return {
    title: typeof title === "string" ? title.trim() : undefined,
    sections: validated,
  };
}

export function serializeCIR(doc: CIRDocument): string {
  const validated = validateCIRDocument(doc);
  const parts: string[] = [];
  if (validated.title) {
    parts.push(validated.title.trim());
  }
  for (const section of validated.sections) {
    parts.push(`${section.label}:\n${normalizeBody(section.body)}`);
  }
  return parts.join("\n\n").trim();
}

/**
 * parseCIRText (LENIENT MODE - used for assembly)
 * Always returns a valid CIRDocument, never throws.
 */
export function parseCIRText(text: string, strict: boolean = false): CIRDocument {
  const normalized = normalizeBody(text);
  if (!normalized) {
    // Return fallback for empty input
    return {
      sections: [{ label: "Action", body: "(Empty—awaiting content)" }],
    };
  }

  const regex = /(Header|Action|Why|Example|Execution Guidance|Next):\s*([\s\S]*?)(?=\n(?:Header|Action|Why|Example|Execution Guidance|Next):|$)/gi;
  const sections: CIRSection[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    const label = match[1] as CIRSectionLabel;
    let body = normalizeBody(match[2] || "");
    if (body) {
      // In lenient mode, sanitize violations
      if (!strict) {
        body = sanitizeForRender(body);
      }
      sections.push({ label, body });
    }
  }

  if (sections.length === 0) {
    // Fallback: treat entire text as one Action block
    const sanitized = !strict ? sanitizeForRender(normalized) : normalized;
    sections.push({ label: "Action", body: sanitized });
  }

  return validateCIRDocument({ sections }, strict);
}

/**
 * ensureCIR (LENIENT MODE - used for assembly/rendering, fails open)
 * Always returns a valid CIRDocument, never throws.
 * Sanitizes violations instead of rejecting.
 */
export function ensureCIR(textOrDoc: string | CIRDocument, strict: boolean = false): CIRDocument {
  try {
    if (typeof textOrDoc === "string") {
      return parseCIRText(textOrDoc, strict);
    }
    return validateCIRDocument(textOrDoc, strict);
  } catch (error) {
    // Fallback: return minimal safe document
    console.error("CIR validation failed; returning safe fallback:", error);
    return {
      sections: [{ label: "Action", body: "(Script content unavailable; review generation)" }],
    };
  }
}
