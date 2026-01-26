function stripCodeFences(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```[a-zA-Z]*\n?/,'').replace(/```$/,'').trim();
  }
  return input;
}

function extractFirstJsonObject(input: string): string | null {
  const text = stripCodeFences(input);
  let inString = false;
  let escape = false;
  let depth = 0;
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === '\\') {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}

export function parseAgentJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {}

  const extracted = extractFirstJsonObject(trimmed);
  if (extracted) {
    try {
      return JSON.parse(extracted) as T;
    } catch (error) {
      throw new Error(`Invalid JSON after extraction: ${(error as Error).message}`);
    }
  }

  throw new Error('Invalid JSON: unable to extract JSON object');
}
