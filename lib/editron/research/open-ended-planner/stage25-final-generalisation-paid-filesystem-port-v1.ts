import { mkdir, open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertStage25FinalGeneralisationPaidDispatchV1,
  assertStage25FinalGeneralisationPaidResponseV1,
  type Stage25FinalGeneralisationPaidDurablePortV1,
  type Stage25FinalGeneralisationPaidDurableStateV1,
  type Stage25FinalGeneralisationPaidRowResultV1,
} from './stage25-final-generalisation-paid-runner-contract-v1';

export async function createStage25FinalGeneralisationPaidFilesystemPortV1(input: {
  root: string;
  forbiddenSecrets?: readonly string[];
}): Promise<Readonly<Stage25FinalGeneralisationPaidDurablePortV1>> {
  const root = path.resolve(input.root);
  const rowsRoot = path.join(root, 'rows');
  const forbiddenSecrets = (input.forbiddenSecrets ?? [])
    .map((value) => value.trim()).filter(Boolean);
  await mkdir(rowsRoot, { recursive: true });

  const load = async (
    rowId: string,
  ): Promise<Readonly<Stage25FinalGeneralisationPaidDurableStateV1>> => {
    const paths = rowPaths(rowsRoot, rowId);
    if (await exists(paths.completed)) {
      const completedRow = (await readJson(paths.completed)) as
        Stage25FinalGeneralisationPaidRowResultV1;
      if (completedRow.rowId !== rowId) fail('COMPLETED_ROW_ID_MISMATCH');
      return { completedRow, attempts: [] };
    }
    const attempts: Stage25FinalGeneralisationPaidDurableStateV1['attempts'][number][] = [];
    for (const attempt of [1, 2] as const) {
      const dispatchPath = paths.dispatch(attempt);
      const responsePath = paths.response(attempt);
      const hasDispatch = await exists(dispatchPath);
      const hasResponse = await exists(responsePath);
      if (!hasDispatch && hasResponse) fail('RESPONSE_WITHOUT_DISPATCH');
      if (!hasDispatch) {
        if (attempt === 1 && await exists(paths.dispatch(2))) fail('ATTEMPT_GAP');
        continue;
      }
      if (attempt === 2 && !attempts[0]?.response) fail('SECOND_ATTEMPT_WITHOUT_RESPONSE');
      const dispatch = assertStage25FinalGeneralisationPaidDispatchV1(
        await readJson(dispatchPath),
      );
      if (dispatch.rowId !== rowId || dispatch.attempt !== attempt) {
        fail('DISPATCH_BINDING_INVALID');
      }
      const response = hasResponse
        ? assertStage25FinalGeneralisationPaidResponseV1({
            dispatch, response: await readJson(responsePath),
          })
        : undefined;
      attempts.push(response ? { dispatch, response } : { dispatch });
    }
    return { attempts };
  };

  return {
    load,
    commitDispatch: async ({ rowId, dispatch: value }) => {
      const dispatch = assertStage25FinalGeneralisationPaidDispatchV1(value);
      if (dispatch.rowId !== rowId) fail('DISPATCH_ROW_ID_MISMATCH');
      const current = await load(rowId);
      if (current.completedRow) fail('ROW_ALREADY_COMPLETED');
      if (dispatch.attempt !== current.attempts.length + 1) fail('DISPATCH_ORDER_INVALID');
      if (dispatch.attempt === 2 && !current.attempts[0]?.response) {
        fail('SECOND_ATTEMPT_WITHOUT_RESPONSE');
      }
      await writeDurableExclusiveJsonV1({
        filePath: rowPaths(rowsRoot, rowId).dispatch(dispatch.attempt),
        value: dispatch, forbiddenSecrets,
      });
    },
    commitResponse: async ({ rowId, response: value }) => {
      const current = await load(rowId);
      if (current.completedRow) fail('ROW_ALREADY_COMPLETED');
      const saved = current.attempts[value.attempt - 1];
      if (!saved) fail('RESPONSE_WITHOUT_DISPATCH');
      if (saved.response) fail('RESPONSE_ALREADY_COMMITTED');
      const response = assertStage25FinalGeneralisationPaidResponseV1({
        dispatch: saved.dispatch, response: value,
      });
      await writeDurableExclusiveJsonV1({
        filePath: rowPaths(rowsRoot, rowId).response(response.attempt),
        value: response, forbiddenSecrets,
      });
    },
    commitRow: async ({ rowId, row }) => {
      const current = await load(rowId);
      if (current.completedRow) fail('ROW_ALREADY_COMPLETED');
      if (row.rowId !== rowId || row.attempts.length !== current.attempts.length) {
        fail('ROW_BINDING_INVALID');
      }
      for (const [index, attempt] of row.attempts.entries()) {
        const saved = current.attempts[index];
        if (!saved || attempt.dispatchReceiptSha256 !== saved.dispatch.receiptSha256
          || attempt.responseReceiptSha256 !== (saved.response?.receiptSha256 ?? null)) {
          fail('ROW_ATTEMPT_BINDING_INVALID');
        }
      }
      await writeDurableExclusiveJsonV1({
        filePath: rowPaths(rowsRoot, rowId).completed,
        value: row, forbiddenSecrets,
      });
    },
  };
}

export async function writeDurableExclusiveJsonV1(input: {
  filePath: string;
  value: unknown;
  forbiddenSecrets?: readonly string[];
}): Promise<void> {
  const serialized = `${JSON.stringify(input.value, null, 2)}\n`;
  for (const secret of input.forbiddenSecrets ?? []) {
    if (secret.trim() && serialized.includes(secret.trim())) fail('SECRET_LEAK');
  }
  await mkdir(path.dirname(input.filePath), { recursive: true });
  const handle = await open(input.filePath, 'wx', 0o600);
  try {
    await handle.writeFile(serialized, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function rowPaths(rowsRoot: string, rowId: string) {
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(rowId)) fail('ROW_ID_INVALID');
  const stem = `${rowId.replace(/[^A-Za-z0-9._-]/g, '-')}`
    + `--${hashCanonicalJsonV1(rowId).slice(0, 16)}`;
  const rowRoot = path.join(rowsRoot, stem);
  return {
    completed: path.join(rowRoot, 'completed-row.json'),
    dispatch: (attempt: 1 | 2) => path.join(rowRoot, `attempt-${attempt}-dispatch.json`),
    response: (attempt: 1 | 2) => path.join(rowRoot, `attempt-${attempt}-response.json`),
  };
}
async function readJson(filePath: string): Promise<unknown> {
  try { return JSON.parse(await readFile(filePath, 'utf8')) as unknown; }
  catch { return fail('DURABLE_JSON_INVALID'); }
}
async function exists(filePath: string): Promise<boolean> {
  try { await stat(filePath); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
function fail(code: string): never {
  throw new Error(`STAGE25_FINAL_GENERALISATION_PAID_FILESYSTEM_${code}`);
}
