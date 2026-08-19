import { describe, expect, it } from 'vitest';

import { hashCanonicalJsonV1 } from '@/lib/editron/research/open-ended-planner/contracts-v1';
import { buildV2RResearchExecutionContract } from '@/lib/editron/research/open-ended-planner/v2r-research-execution-contract';

function catalog(...operators: Array<{ operatorId: string; compilerEligibility: string }>) {
  return { operators };
}

describe('V2R research execution contract', () => {
  it('distinguishes registered proxy support from production certification', () => {
    const contract = buildV2RResearchExecutionContract({
      taskId: 'DEV-01',
      operatorCatalog: catalog(
        { operatorId: 'read_project_file', compilerEligibility: 'RESEARCH_READ_ONLY' },
        { operatorId: 'cut_section', compilerEligibility: 'ISOLATED_PROXY_ONLY' },
        { operatorId: 'generated_composition_program', compilerEligibility: 'ISOLATED_PROXY_ONLY' },
        { operatorId: 'imaginary_blocked', compilerEligibility: 'NOT_COMPILABLE' },
      ),
    });
    expect(contract.authority).toBe('RESEARCH_BENCHMARK_EXECUTION_TRUTH_NOT_PRODUCTION_CERTIFICATION');
    expect(contract.taskAdapter?.adapterId).toBe('DEV01_CAUSAL_NATIVE_PROXY_V2R');
    expect(contract.operators.map(({ operatorId, executionDisposition }) => [operatorId, executionDisposition]))
      .toEqual([
        ['read_project_file', 'EXECUTABLE_VIA_REGISTERED_RESEARCH_PROXY'],
        ['cut_section', 'EXECUTABLE_VIA_REGISTERED_RESEARCH_PROXY'],
        ['generated_composition_program', 'NOT_EXECUTABLE_TASK_PROXY_OPERATOR_GAP'],
        ['imaginary_blocked', 'NOT_EXECUTABLE_COMPILER_INELIGIBLE'],
      ]);
    expect(contract.semantics.productionCertificationImpact).toBe('NONE');
    expect(Object.isFrozen(contract)).toBe(true);
    const { contractSha256, ...material } = contract;
    expect(contractSha256).toBe(hashCanonicalJsonV1(material));
  });

  it('marks every operator non-executable when the task has no registered proxy', () => {
    const contract = buildV2RResearchExecutionContract({
      taskId: 'DEV-02',
      operatorCatalog: catalog(
        { operatorId: 'inspect_user_asset', compilerEligibility: 'RESEARCH_READ_ONLY' },
        { operatorId: 'generated_composition_program', compilerEligibility: 'ISOLATED_PROXY_ONLY' },
      ),
    });
    expect(contract.taskAdapter).toBeNull();
    expect(contract.operators.every(({ executionDisposition }) => (
      executionDisposition === 'NOT_EXECUTABLE_NO_REGISTERED_TASK_PROXY'
    ))).toBe(true);
  });

  it('fails loudly for empty, malformed, or duplicate operator sets', () => {
    expect(() => buildV2RResearchExecutionContract({ taskId: '', operatorCatalog: catalog() }))
      .toThrow('V2R_RESEARCH_EXECUTION_TASK_ID_MISSING');
    expect(() => buildV2RResearchExecutionContract({ taskId: 'DEV-01', operatorCatalog: catalog() }))
      .toThrow('V2R_RESEARCH_EXECUTION_OPERATOR_SET_INVALID');
    expect(() => buildV2RResearchExecutionContract({
      taskId: 'DEV-01',
      operatorCatalog: catalog(
        { operatorId: 'cut_section', compilerEligibility: 'ISOLATED_PROXY_ONLY' },
        { operatorId: 'cut_section', compilerEligibility: 'ISOLATED_PROXY_ONLY' },
      ),
    })).toThrow('V2R_RESEARCH_EXECUTION_OPERATOR_SET_DUPLICATE');
  });
});
