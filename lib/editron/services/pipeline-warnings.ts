/**
 * Pipeline Warning Collector
 *
 * Centralized error visibility for the entire pipeline.
 * Every fallback, every swallowed error, every default-value substitution
 * gets logged here so debugging doesn't require watching the video.
 *
 * Usage:
 *   import { pipelineWarnings } from './pipeline-warnings';
 *   pipelineWarnings.fallbackUsed('finalize', 'scene duration', 5);
 *   pipelineWarnings.errorSwallowed('director', error, 'caption pre-warming');
 *   // In API response:
 *   return { success: true, warnings: pipelineWarnings.getAll() };
 */

export interface PipelineWarning {
  severity: 'info' | 'warning' | 'error';
  phase: 'parse' | 'storyboard' | 'video-gen' | 'voiceover' | 'bgm' | 'sfx' | 'finalize' | 'director' | 'render' | 'analysis';
  message: string;
  details?: Record<string, any>;
  timestamp: number;
  autoFixed?: boolean;
  autoFixDescription?: string;
}

type Phase = PipelineWarning['phase'];

class PipelineWarningCollector {
  private warnings: PipelineWarning[] = [];

  add(warning: Omit<PipelineWarning, 'timestamp'>): void {
    this.warnings.push({ ...warning, timestamp: Date.now() });
    // Also log to console for Vercel log visibility
    const prefix = `[Pipeline:${warning.phase}:${warning.severity.toUpperCase()}]`;
    if (warning.severity === 'error') {
      console.error(prefix, warning.message, warning.details || '');
    } else if (warning.severity === 'warning') {
      console.warn(prefix, warning.message, warning.details || '');
    } else {
      console.log(prefix, warning.message);
    }
  }

  /** Call everywhere a fallback/default value is substituted */
  fallbackUsed(phase: Phase, what: string, fallbackValue: any): void {
    this.add({
      severity: 'warning',
      phase,
      message: `Fallback used: ${what} → ${JSON.stringify(fallbackValue)}`,
      details: { what, fallbackValue },
    });
  }

  /** Call everywhere an error is caught and execution continues */
  errorSwallowed(phase: Phase, error: Error | string, context: string): void {
    const msg = typeof error === 'string' ? error : error.message;
    const stack = typeof error === 'string' ? undefined : error.stack?.split('\n').slice(0, 3).join('\n');
    this.add({
      severity: 'error',
      phase,
      message: `Error in ${context}: ${msg}`,
      details: { context, stack },
    });
  }

  /** Call when something succeeds but with degraded quality */
  degraded(phase: Phase, what: string, reason: string): void {
    this.add({
      severity: 'warning',
      phase,
      message: `Degraded: ${what} — ${reason}`,
      details: { what, reason },
    });
  }

  /** Call when an auto-fix is applied */
  autoFixed(phase: Phase, what: string, description: string): void {
    this.add({
      severity: 'info',
      phase,
      message: `Auto-fixed: ${what}`,
      autoFixed: true,
      autoFixDescription: description,
    });
  }

  getAll(): PipelineWarning[] { return [...this.warnings]; }
  getErrors(): PipelineWarning[] { return this.warnings.filter(w => w.severity === 'error'); }
  getWarnings(): PipelineWarning[] { return this.warnings.filter(w => w.severity === 'warning'); }
  hasErrors(): boolean { return this.warnings.some(w => w.severity === 'error'); }
  count(): { errors: number; warnings: number; info: number } {
    return {
      errors: this.warnings.filter(w => w.severity === 'error').length,
      warnings: this.warnings.filter(w => w.severity === 'warning').length,
      info: this.warnings.filter(w => w.severity === 'info').length,
    };
  }
  getSummary(): string {
    const c = this.count();
    return `Pipeline: ${c.errors} errors, ${c.warnings} warnings, ${c.info} info`;
  }
  clear(): void { this.warnings = []; }
}

/** Singleton instance — shared across the pipeline for one request */
export function createPipelineWarnings(): PipelineWarningCollector {
  return new PipelineWarningCollector();
}

/** Type export for consumers */
export type { PipelineWarningCollector };
