/**
 * Context Module - Barrel Export
 * 
 * Central context management for ThinkForge agents.
 * Agents consume context, they never build it themselves.
 */

export { 
  assembleContext, 
  quickAssembleContext, 
  formatContextString,
  hasContent,
  getContextSize,
  type ContextDataSources 
} from './assembleContext';

export { 
  selectProjectSummary, 
  selectScriptContent, 
  selectChatMessages,
  selectKeyBlocks,
  extractTextFromBlocks,
  type SelectionResult 
} from './selectors';

export { 
  truncateString, 
  truncateMiddle, 
  truncateBlocks,
  truncateMessages,
  willFit,
  remainingCapacity,
  type TruncationOptions,
  type PrioritizedContent 
} from './truncation';
