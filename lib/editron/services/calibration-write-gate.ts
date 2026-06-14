export type CalibrationArtifactStatus = 'pass' | 'warn' | 'fail' | 'missing' | 'not-run';

export interface CalibrationWriteGateInput {
  dryRun?: boolean;
  allowBanditWrite?: boolean;
  artifactStatus?: CalibrationArtifactStatus;
}

export interface CalibrationWriteGateDecision {
  allowed: boolean;
  mode: 'dry-run' | 'blocked' | 'allowed';
  reason: string;
}

export function evaluateCalibrationWriteGate(
  input: CalibrationWriteGateInput,
): CalibrationWriteGateDecision {
  if (input.dryRun) {
    return {
      allowed: false,
      mode: 'dry-run',
      reason: 'dry-run skips calibration bandit writes',
    };
  }

  if (input.artifactStatus && input.artifactStatus !== 'pass') {
    return {
      allowed: false,
      mode: 'blocked',
      reason: `rendered artifact status is ${input.artifactStatus}; calibration writes require pass`,
    };
  }

  if (!input.allowBanditWrite) {
    return {
      allowed: false,
      mode: 'blocked',
      reason: 'non-dry-run calibration requires --allow-bandit-write after reviewed rendered evidence',
    };
  }

  return {
    allowed: true,
    mode: 'allowed',
    reason: 'explicit --allow-bandit-write provided',
  };
}

export function formatCalibrationWriteGateDecision(
  decision: CalibrationWriteGateDecision,
): string {
  const label = decision.allowed ? 'BANDIT WRITE ALLOWED' : 'BANDIT WRITE BLOCKED';
  return `${label} - ${decision.reason}`;
}
