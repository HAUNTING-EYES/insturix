import { describe, expect, it } from 'vitest';
import { exceedsPresignedUploadCap, MAX_PRESIGNED_UPLOAD_BYTES } from '../../lib/editron/services/upload-size-guard';

describe('presigned upload size cap', () => {
  it('caps at 3GB (matches multipart-init limit — not an invented number)', () => {
    expect(MAX_PRESIGNED_UPLOAD_BYTES).toBe(3 * 1024 * 1024 * 1024);
  });

  it('rejects objects over the cap', () => {
    expect(exceedsPresignedUploadCap(MAX_PRESIGNED_UPLOAD_BYTES + 1)).toBe(true);
    expect(exceedsPresignedUploadCap(4 * 1024 * 1024 * 1024)).toBe(true);
  });

  it('allows objects at or under the cap', () => {
    expect(exceedsPresignedUploadCap(MAX_PRESIGNED_UPLOAD_BYTES)).toBe(false); // exactly 3GB
    expect(exceedsPresignedUploadCap(100 * 1024 * 1024)).toBe(false); // 100MB
    expect(exceedsPresignedUploadCap(0)).toBe(false);
  });

  it('fails OPEN when size is unknown (a transient storage error must not block a legit upload)', () => {
    expect(exceedsPresignedUploadCap(null)).toBe(false);
    expect(exceedsPresignedUploadCap(undefined)).toBe(false);
  });
});
