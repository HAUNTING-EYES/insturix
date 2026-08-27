import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { deepFreezeV1, hashCanonicalJsonV1 } from './contracts-v1';
import {
  assertStage25Rhc02PreviewMediaFixtureReceiptV1,
  materializeStage25Rhc02PreviewMediaFixtureV1,
} from './stage25-rhc02-preview-media-fixture-v1';

export const STAGE25_RHC02_PREVIEW_MEDIA_FIXTURE_VERSION_V2 =
  'EDITRON_OE_STAGE25_RHC02_PREVIEW_MEDIA_FIXTURE_V2' as const;

export async function materializeStage25Rhc02PreviewMediaFixtureV2(input: {
  outputDir: string;
  createdAt: string;
}) {
  const predecessor = await materializeStage25Rhc02PreviewMediaFixtureV1(input);
  assertStage25Rhc02PreviewMediaFixtureReceiptV1(predecessor);
  const fontBytes = await readFile(predecessor.hostPaths.fontPath);
  const metadata = inspectSfntWeightClassV1(fontBytes);
  if (metadata.usWeightClass !== 400) fail('FONT_WEIGHT_NOT_REGULAR_400');

  const {
    hostPaths,
    receiptSha256: predecessorReceiptSha256,
    version: predecessorVersion,
    artifactType: _predecessorArtifactType,
    fixtureId: _predecessorFixtureId,
    font: predecessorFont,
    ...inherited
  } = predecessor;
  const portable = {
    ...inherited,
    version: STAGE25_RHC02_PREVIEW_MEDIA_FIXTURE_VERSION_V2,
    artifactType: 'Stage25Rhc02PreviewMediaFixtureReceiptV2' as const,
    fixtureId: 'RHC-02-PREVIEW-MEDIA-V2' as const,
    font: {
      ...predecessorFont,
      weight: metadata.usWeightClass,
    },
    fontMetadataProof: metadata,
    correction: {
      kind: 'DECLARED_FONT_WEIGHT_CORRECTION' as const,
      predecessorVersion,
      predecessorReceiptSha256,
      predecessorDeclaredWeight: predecessorFont.weight,
      correctedDeclaredWeight: metadata.usWeightClass,
      reason: 'SFNT_OS2_US_WEIGHT_CLASS_IS_AUTHORITATIVE' as const,
    },
  };
  return deepFreezeV1({
    ...portable,
    receiptSha256: hashCanonicalJsonV1(portable),
    hostPaths,
  });
}

export type Stage25Rhc02PreviewMediaFixtureReceiptV2 = Awaited<
  ReturnType<typeof materializeStage25Rhc02PreviewMediaFixtureV2>
>;

export function assertStage25Rhc02PreviewMediaFixtureReceiptV2(
  receipt: Stage25Rhc02PreviewMediaFixtureReceiptV2,
): void {
  const { hostPaths: _hostPaths, receiptSha256, ...portable } = receipt;
  if (receipt.version !== STAGE25_RHC02_PREVIEW_MEDIA_FIXTURE_VERSION_V2
    || receipt.receiptSha256 !== hashCanonicalJsonV1(portable)
    || receipt.font.weight !== 400
    || receipt.fontMetadataProof.usWeightClass !== 400
    || receipt.correction.predecessorDeclaredWeight !== 700
    || receipt.correction.correctedDeclaredWeight !== 400
    || !/^[a-f0-9]{64}$/.test(receipt.correction.predecessorReceiptSha256)
    || !/^[a-f0-9]{64}$/.test(receiptSha256)) {
    fail('RECEIPT_INVALID');
  }
}

export function inspectSfntWeightClassV1(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < 12) fail('FONT_SFNT_HEADER_INVALID');
  const tableCount = buffer.readUInt16BE(4);
  const directoryEnd = 12 + tableCount * 16;
  if (tableCount < 1 || directoryEnd > buffer.length) fail('FONT_SFNT_DIRECTORY_INVALID');
  for (let index = 0; index < tableCount; index += 1) {
    const recordOffset = 12 + index * 16;
    if (buffer.toString('ascii', recordOffset, recordOffset + 4) !== 'OS/2') continue;
    const tableOffset = buffer.readUInt32BE(recordOffset + 8);
    const tableLength = buffer.readUInt32BE(recordOffset + 12);
    const tableEnd = tableOffset + tableLength;
    if (tableLength < 8 || tableEnd > buffer.length || tableEnd < tableOffset) {
      fail('FONT_OS2_TABLE_INVALID');
    }
    const table = buffer.subarray(tableOffset, tableEnd);
    return deepFreezeV1({
      kind: 'SFNT_OS2_US_WEIGHT_CLASS' as const,
      sfntVersionHex: buffer.readUInt32BE(0).toString(16).padStart(8, '0'),
      os2TableSha256: createHash('sha256').update(table).digest('hex'),
      os2TableLength: tableLength,
      usWeightClass: table.readUInt16BE(4),
    });
  }
  return fail('FONT_OS2_TABLE_MISSING');
}

function fail(code: string): never {
  throw new Error(`STAGE25_RHC02_PREVIEW_MEDIA_V2_${code}`);
}
