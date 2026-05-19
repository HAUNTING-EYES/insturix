/**
 * build-writing-graph.mjs
 *
 * Parses docs/creative-content-knowledge.md → writing-knowledge.json
 * Run: node lib/thinkforge/data/build-writing-graph.mjs
 *
 * The creative doc is the source of truth. This script extracts structured
 * data (signals, techniques, constraints, platforms) into flat JSON that
 * writing-graph-query.ts and ThinkForge agents consume.
 *
 * Editing graph equivalent: lib/editron/data/merge-graph.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DOC_PATH = join(__dirname, '../../../docs/creative-content-knowledge.md');
const OUTPUT_PATH = join(__dirname, 'writing-knowledge.json');


// ─── Code Block Extraction ──────────────────────────────────────────────────

function extractCodeBlocks(lines) {
  const blocks = [];
  let inBlock = false;
  let current = [];
  let start = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('```') && !inBlock) {
      inBlock = true;
      current = [];
      start = i + 1;
    } else if (trimmed.startsWith('```') && inBlock) {
      blocks.push({ lines: current, startLine: start + 1, endLine: i + 1 });
      inBlock = false;
      current = [];
    } else if (inBlock) {
      current.push(lines[i]);
    }
  }

  return blocks;
}

function findCurrentPart(docLines, lineIndex) {
  for (let i = lineIndex; i >= 0; i--) {
    const match = docLines[i].match(/^#\s+PART\s+(\d+)/);
    if (match) return parseInt(match[1]);
  }
  return -1;
}

function findCurrentSection(docLines, lineIndex) {
  for (let i = lineIndex; i >= 0; i--) {
    const match = docLines[i].match(/^##\s+(\d+\.\d+)\s+(.+)/);
    if (match) return { id: match[1], title: match[2].trim() };
  }
  return null;
}


// ─── Field Extraction Utilities ─────────────────────────────────────────────

function extractField(text, fieldName) {
  const regex = new RegExp(`^\\s*${escapeRegex(fieldName)}:\\s+(.+)$`, 'm');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function extractMultilineField(blockLines, fieldName) {
  let collecting = false;
  const value = [];

  for (let i = 0; i < blockLines.length; i++) {
    const line = blockLines[i];
    const fieldMatch = line.match(new RegExp(`^\\s*${escapeRegex(fieldName)}:\\s+(.+)$`));

    if (fieldMatch) {
      collecting = true;
      value.push(fieldMatch[1].trim());
      continue;
    }

    if (collecting) {
      const isFieldLine = /^\s{2,8}\w[\w\s-]*:(?:\s|$)/.test(line);
      const isListItem = /^\s+-\s/.test(line);
      if (!isFieldLine && !isListItem && /^\s{5,}/.test(line) && line.trim()) {
        value.push(line.trim());
      } else {
        break;
      }
    }
  }

  return value.length > 0 ? value.join(' ') : null;
}

function parseListField(blockLines, fieldName) {
  let collecting = false;
  const items = [];

  for (const line of blockLines) {
    if (line.trim().startsWith(`${fieldName}:`)) {
      collecting = true;
      const inlineValue = line.trim().replace(`${fieldName}:`, '').trim();
      if (inlineValue && !inlineValue.startsWith('-')) {
        return []; // Field has inline value, not a list
      }
      continue;
    }

    if (collecting) {
      const itemMatch = line.match(/^\s+-\s+(.+)$/);
      if (itemMatch) {
        items.push(itemMatch[1].trim());
      } else if (items.length > 0 && /^\s{6,}/.test(line) && line.trim()) {
        items[items.length - 1] += ' ' + line.trim();
      } else if (line.trim() && !/^\s*$/.test(line)) {
        break;
      }
    }
  }

  return items;
}

function parseWeightResponse(blockLines) {
  let collecting = false;
  const result = {};

  for (const line of blockLines) {
    if (line.trim().startsWith('Weight response:')) {
      collecting = true;
      continue;
    }

    if (collecting) {
      if (/^\s*$/.test(line)) continue;
      const stopFields = ['Why:', 'Anti-patterns:', 'Example:', 'When to use:'];
      if (stopFields.some(f => line.trim().startsWith(f))) break;

      const itemMatch = line.match(/^\s+(\S.*?):\s+(.+)$/);
      if (itemMatch) {
        result[itemMatch[1].trim()] = itemMatch[2].trim();
      } else {
        break;
      }
    }
  }

  return result;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}


// ─── Signal Parser ──────────────────────────────────────────────────────────

function parseSignal(blockLines) {
  const text = blockLines.join('\n');

  const nameMatch = text.match(/^Signal:\s+(.+)$/m);
  if (!nameMatch) return null;
  const name = nameMatch[1].trim();
  if (name === 'name') return null;

  const axis = extractField(text, 'Axis');
  const rangeRaw = extractMultilineField(blockLines, 'Range');
  const scope = extractField(text, 'Scope');
  const inferenceRaw = extractField(text, 'Inference');
  const lockableRaw = extractField(text, 'CampaignLockable');
  const grounding = extractField(text, 'Grounding');
  const primaryRaw = extractField(text, 'Primary');

  return {
    id: name,
    axis: axis?.toUpperCase() || null,
    range: parseRange(rangeRaw),
    scope: scope?.toUpperCase() || null,
    inference: inferenceRaw?.match(/TIER_[123]/)?.[0] || null,
    campaignLockable: lockableRaw?.toUpperCase().startsWith('YES') ?? false,
    primary: primaryRaw?.toUpperCase().startsWith('YES') ?? false,
    anchors: parseAnchors(blockLines),
    grounding: grounding || null,
  };
}

function parseRange(raw) {
  if (!raw) return null;

  const continuousMatch = raw.match(/([-\d.]+)[–\-]([\d.]+)\s*\(continuous\)/);
  if (continuousMatch) {
    return { type: 'continuous', min: parseFloat(continuousMatch[1]), max: parseFloat(continuousMatch[2]) };
  }

  const bipolarMatch = raw.match(/([-+\d.]+)\s+to\s+([-+\d.]+)\s*\(bipolar/);
  if (bipolarMatch) {
    return { type: 'bipolar', min: parseFloat(bipolarMatch[1]), max: parseFloat(bipolarMatch[2]) };
  }

  const enumPipeMatch = raw.match(/enum:\s*(.+)/);
  if (enumPipeMatch) {
    return { type: 'enum', values: enumPipeMatch[1].split('|').map(v => v.trim()) };
  }

  if (raw.toLowerCase().includes('enum')) {
    const valuesMatch = raw.match(/\(([^)]+)\)/);
    const values = valuesMatch
      ? valuesMatch[1].split(',').map(v => v.trim().replace(/^['"]|['"]$/g, ''))
      : [];
    return { type: 'enum', values };
  }

  return { type: 'unknown', raw };
}

function parseAnchors(blockLines) {
  const anchors = {};
  let inAnchors = false;
  let currentLevel = null;
  let currentLines = [];

  for (const line of blockLines) {
    if (line.trim().startsWith('Anchors:')) {
      inAnchors = true;
      continue;
    }
    if (!inAnchors) continue;

    // Numeric: "    0.00:", "    -1.0:", "    +0.5:", "     0.0:"
    // Text:    "    remember:", "    unaware:", "    problem_aware:"
    const anchorMatch = line.match(/^\s{4,}([-+]?\d+\.?\d{0,2}|[a-z][\w_]*):\s+(.+)$/);
    if (anchorMatch) {
      if (currentLevel !== null) {
        anchors[currentLevel] = currentLines.join(' ').trim();
      }
      currentLevel = anchorMatch[1].trim();
      currentLines = [anchorMatch[2].trim()];
      continue;
    }

    if (currentLevel !== null && /^\s{10,}/.test(line) && line.trim()) {
      currentLines.push(line.trim());
      continue;
    }

    if (/^\s{2,8}\w[\w\s]*:\s/.test(line)) {
      if (currentLevel !== null) {
        anchors[currentLevel] = currentLines.join(' ').trim();
      }
      break;
    }
  }

  if (currentLevel !== null && !anchors[currentLevel]) {
    anchors[currentLevel] = currentLines.join(' ').trim();
  }

  return anchors;
}


// ─── Technique Parser ───────────────────────────────────────────────────────

function parseTechnique(blockLines) {
  const text = blockLines.join('\n');

  const nameMatch = text.match(/^Technique:\s+(.+?)(?:\s+\(.+\))?$/m);
  if (!nameMatch) return null;

  let name = nameMatch[1].trim();
  if (name === 'descriptive_name') return null;

  const parenthetical = text.match(/^Technique:\s+.+?\s+\((.+?)\)/m);
  if (parenthetical) {
    name = name.replace(/\s+\(.+\)$/, '').trim();
  }

  const category = extractField(text, 'Category');
  const activation = parseActivation(text);
  const inhibitors = parseInhibitors(text);
  const primary = extractMultilineField(blockLines, 'Primary');
  const complements = extractMultilineField(blockLines, 'Complements');
  const antiPatterns = parseListField(blockLines, 'Anti-patterns');
  const weightResponse = parseWeightResponse(blockLines);
  const why = extractMultilineField(blockLines, 'Why');
  const example = extractMultilineField(blockLines, 'Example');
  const whenToUse = extractMultilineField(blockLines, 'When to use');

  const result = {
    id: name,
    category: category?.trim() || null,
    activation,
    inhibitors,
    primary: primary || null,
  };

  if (complements) result.complements = complements;
  if (antiPatterns.length > 0) result.antiPatterns = antiPatterns;
  if (Object.keys(weightResponse).length > 0) result.weightResponse = weightResponse;
  if (why) result.why = why;
  if (example) result.example = example;
  if (whenToUse) result.whenToUse = whenToUse;

  return result;
}

function parseActivation(text) {
  const match = text.match(/Activation:\s*\[([\s\S]*?)\]/);
  if (!match) return [];

  const conditions = [];
  const objRegex = /\{([^}]+)\}/g;
  let objMatch;
  while ((objMatch = objRegex.exec(match[1])) !== null) {
    const obj = parseInlineObject(objMatch[1]);
    if (obj) conditions.push(obj);
  }

  return conditions;
}

function parseInhibitors(text) {
  const match = text.match(/Inhibitors:\s*\[([\s\S]*?)\]/);
  if (!match) return [];

  const content = match[1].trim();
  if (!content) return [];

  const conditions = [];
  const objRegex = /\{([^}]+)\}/g;
  let objMatch;
  while ((objMatch = objRegex.exec(content)) !== null) {
    const obj = parseInlineObject(objMatch[1]);
    if (obj) conditions.push(obj);
  }

  return conditions;
}

function parseInlineObject(content) {
  content = content.replace(/\/\/.*$/gm, '').trim();

  const result = {};
  const pairs = content.split(',').map(p => p.trim()).filter(Boolean);

  for (const pair of pairs) {
    const colonIdx = pair.indexOf(':');
    if (colonIdx === -1) continue;

    const key = pair.substring(0, colonIdx).trim();
    let value = pair.substring(colonIdx + 1).trim();
    value = value.replace(/^['"]|['"]$/g, '');

    const num = parseFloat(value);
    result[key] = isNaN(num) ? value : num;
  }

  return Object.keys(result).length > 0 ? result : null;
}


// ─── Constraint Parser ──────────────────────────────────────────────────────

function parseConstraintBlock(blockLines) {
  const text = blockLines.join('\n');
  const parts = text.split(/(?=^Constraint:\s)/m);
  const constraints = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith('Constraint:')) continue;

    const partLines = trimmed.split('\n');
    const nameMatch = trimmed.match(/^Constraint:\s+(.+)$/m);
    if (!nameMatch) continue;

    const name = nameMatch[1].trim();
    if (name === 'name') continue;

    const severityRaw = extractField(trimmed, 'Severity');
    const detection = extractMultilineField(partLines, 'Detection');
    const autoCorrection = extractMultilineField(partLines, 'Auto-correction');
    const why = extractMultilineField(partLines, 'Why');
    const overridableRaw = extractField(trimmed, 'Overridable');
    const platforms = extractField(trimmed, 'Platforms');

    const severityMatch = severityRaw?.match(/(critical|warning|info)\s*\((-?\d+)\)/);

    const constraint = {
      id: name,
      severity: severityMatch ? severityMatch[1] : (severityRaw?.trim() || null),
      deduction: severityMatch ? Math.abs(parseInt(severityMatch[2])) : null,
      detection: detection || null,
      autoCorrection: autoCorrection || null,
      why: why || null,
    };

    if (overridableRaw != null) {
      const lower = overridableRaw.toLowerCase();
      constraint.overridable = lower.startsWith('yes') ? true
        : lower.startsWith('no ') || lower === 'no' ? false
        : overridableRaw.trim();
    }

    if (platforms) constraint.platforms = platforms;

    constraints.push(constraint);
  }

  return constraints;
}


// ─── Platform Parser ────────────────────────────────────────────────────────

function parsePlatformBlock(blockLines, sectionTitle) {
  const text = blockLines.join('\n');

  const platform = {
    name: sectionTitle?.replace(/^\d+\.\d+\s+/, '').trim() || 'unknown',
    lastVerified: null,
    characterLimits: {},
    durationLimits: {},
    sweetSpots: [],
    raw: text,
  };

  const verifiedMatch = text.match(/Last verified:\s*(.+)/);
  if (verifiedMatch) platform.lastVerified = verifiedMatch[1].trim();

  const charLines = text.match(/^.+:\s*[\d,]+\s*characters.*$/gm);
  if (charLines) {
    for (const line of charLines) {
      const match = line.match(/(\w[\w\s]*?):\s*([\d,]+)\s*characters/);
      if (match) {
        platform.characterLimits[match[1].trim().toLowerCase()] = parseInt(match[2].replace(/,/g, ''));
      }
    }
  }

  const durMinMatch = text.match(/Minimum:\s*(\d+)\s*seconds/);
  if (durMinMatch) platform.durationLimits.minSeconds = parseInt(durMinMatch[1]);

  const durMaxMatch = text.match(/(?:Maximum|Uploaded video):\s*(?:up to\s*)?(\d+)\s*(seconds|minutes|hours)/);
  if (durMaxMatch) {
    const val = parseInt(durMaxMatch[1]);
    const unit = durMaxMatch[2];
    platform.durationLimits.maxSeconds = unit === 'hours' ? val * 3600 : unit === 'minutes' ? val * 60 : val;
  }

  const sweetMatch = text.match(/(?:sweet spot|Algorithm favors|Optimal):\s*(.+)/gi);
  if (sweetMatch) {
    platform.sweetSpots = sweetMatch.map(s => s.replace(/^.*?:\s*/, '').trim());
  }

  return platform;
}


// ─── Main Parser ────────────────────────────────────────────────────────────

function parse() {
  const markdown = readFileSync(DOC_PATH, 'utf-8');
  const docLines = markdown.split('\n');
  const codeBlocks = extractCodeBlocks(docLines);

  const signals = [];
  const techniques = [];
  const constraints = [];
  const platforms = [];

  const stats = { blocksTotal: codeBlocks.length, blocksSkipped: 0 };

  for (const block of codeBlocks) {
    const part = findCurrentPart(docLines, block.startLine - 1);
    const section = findCurrentSection(docLines, block.startLine - 1);
    const text = block.lines.join('\n');

    if (part === 2 && text.trim().startsWith('Signal:')) {
      const signal = parseSignal(block.lines);
      if (signal) {
        signal.sourceLines = [block.startLine, block.endLine];
        signals.push(signal);
      } else {
        stats.blocksSkipped++;
      }
    } else if (part === 4 && text.trim().startsWith('Technique:')) {
      const technique = parseTechnique(block.lines);
      if (technique) {
        technique.sourceLines = [block.startLine, block.endLine];
        techniques.push(technique);
      } else {
        stats.blocksSkipped++;
      }
    } else if (part === 6 && text.includes('Constraint:')) {
      const parsed = parseConstraintBlock(block.lines);
      for (const c of parsed) {
        c.sourceLines = [block.startLine, block.endLine];
        c.section = section?.title || null;
      }
      constraints.push(...parsed);
    } else if (part === 8 && block.lines.length > 2) {
      const plat = parsePlatformBlock(block.lines, section?.title);
      plat.sourceLines = [block.startLine, block.endLine];
      platforms.push(plat);
    } else {
      stats.blocksSkipped++;
    }
  }

  const result = {
    version: '1.0.0',
    source: 'docs/creative-content-knowledge.md',
    extractedAt: new Date().toISOString().split('T')[0],
    stats: {
      signals: signals.length,
      techniques: techniques.length,
      constraints: constraints.length,
      platforms: platforms.length,
      ...stats,
    },
    selectionAlgorithm: {
      description: 'Deterministic scoring: sum(signal_match * weight) for activation conditions. Inhibitors = hard reject (-Infinity). Return top N per category with score > 0.',
      priorityRules: [
        'Part 6 constraints ALWAYS override mappings',
        'Brand Rulebook (Part 1) overrides technique-suggested vocabulary',
        'Inhibitors are absolute — one firing kills the technique',
        'Higher activation score wins ties within same category',
        'PatternBreak re-runs selection with break-adjusted signal values',
        'Voice Signature modifies technique EXECUTION, not selection',
      ],
      qualityScoring: {
        startScore: 100,
        autoReviewThreshold: 70,
        belowStandard: 50,
        hardReject: 0,
      },
    },
    signals,
    techniques,
    constraints,
    platforms,
  };

  return result;
}


// ─── Run ────────────────────────────────────────────────────────────────────

const result = parse();
writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 2), 'utf-8');

console.log(`✅ writing-knowledge.json generated`);
console.log(`   Signals:     ${result.stats.signals}`);
console.log(`   Techniques:  ${result.stats.techniques}`);
console.log(`   Constraints: ${result.stats.constraints}`);
console.log(`   Platforms:   ${result.stats.platforms}`);
console.log(`   Blocks:      ${result.stats.blocksTotal} total, ${result.stats.blocksSkipped} skipped`);
console.log(`   Output:      ${OUTPUT_PATH}`);
