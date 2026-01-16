/**
 * Protocol Module - Barrel Export
 * 
 * Output protocol for ThinkForge agents.
 * Agents produce output in protocol-bound formats.
 * AI output is untrusted input - always validate.
 */

export {
  OUTPUT_TAGS,
  hasTag,
  hasScriptUpdate,
  extractTagContent,
  extractScriptUpdate,
  extractThinking,
  stripAllTags,
  stripThinking,
  findTagPositions,
  wrapInTag,
  validateScriptUpdate,
  type OutputTagName,
} from './output-tags';

export {
  parseResponse,
  StreamParser,
  createParsingStream,
  parseStream,
  type ParsedResponse,
} from './stream-parser';
