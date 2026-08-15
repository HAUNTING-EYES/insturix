import { describe, expect, it } from 'vitest';
import {
  buildAvatarVaultUploadStorageKey,
  createAvatarVaultUploadStorageFromEnvironment,
  normalizeAvatarVaultUploadContentType,
  parseAvatarVaultUploadRole,
  validateAvatarVaultUploadInput,
} from '../../lib/avatar/avatar-vault-upload';

describe('Avatar Vault upload route helpers', () => {
  it('accepts image references with an explicit avatar role', () => {
    expect(parseAvatarVaultUploadRole('face_front')).toBe('face_front');
    expect(normalizeAvatarVaultUploadContentType(undefined, 'founder-face.JPG')).toBe('image/jpeg');

    expect(validateAvatarVaultUploadInput({
      name: 'founder-full-body.webp',
      mimeType: 'image/webp',
      sizeBytes: 1024,
      role: 'full_body_front',
    })).toEqual({ ok: true, role: 'full_body_front', contentType: 'image/webp' });
  });

  it('rejects missing roles, unsupported files, empty files, and oversized images', () => {
    expect(validateAvatarVaultUploadInput({
      name: 'face.png',
      mimeType: 'image/png',
      sizeBytes: 1024,
      role: 'logo',
    })).toEqual(expect.objectContaining({ ok: false, code: 'invalid_role', status: 400 }));

    expect(validateAvatarVaultUploadInput({
      name: 'face.svg',
      mimeType: 'image/svg+xml',
      sizeBytes: 1024,
      role: 'face_front',
    })).toEqual(expect.objectContaining({ ok: false, code: 'unsupported_file_type', status: 415 }));

    expect(validateAvatarVaultUploadInput({
      name: 'face.png',
      mimeType: 'image/png',
      sizeBytes: 0,
      role: 'face_front',
    })).toEqual(expect.objectContaining({ ok: false, code: 'empty_file', status: 400 }));

    expect(validateAvatarVaultUploadInput({
      name: 'face.png',
      mimeType: 'image/png',
      sizeBytes: 13 * 1024 * 1024,
      role: 'face_front',
    })).toEqual(expect.objectContaining({ ok: false, code: 'file_too_large', status: 413 }));
  });

  it('builds avatar-specific R2 keys and refuses storage when public config is absent', () => {
    expect(buildAvatarVaultUploadStorageKey({
      userId: 'user avatar',
      role: 'full_body_front',
      assetId: 'avatar full body 1',
      contentType: 'image/png',
    })).toBe('avatar-vault/user_avatar/full_body_front/avatar_full_body_1.png');

    expect(createAvatarVaultUploadStorageFromEnvironment({
      env: {
        R2_ACCOUNT_ID: 'account',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
      },
    })).toBeNull();
  });
});
