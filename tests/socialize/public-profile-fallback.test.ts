import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const connectToDatabase = vi.fn();
  const socializeLean = vi.fn();
  const socializeFindOne = vi.fn(() => ({ lean: socializeLean }));
  const userLean = vi.fn();
  const userSelect = vi.fn(() => ({ lean: userLean }));
  const userFindOne = vi.fn(() => ({ select: userSelect }));

  return {
    connectToDatabase,
    socializeFindOne,
    socializeLean,
    userFindOne,
    userSelect,
    userLean,
  };
});

vi.mock('@/schemas/ConnectToDatabase', () => ({
  default: mocks.connectToDatabase,
}));

vi.mock('@/schemas/Socialize', () => ({
  default: {
    findOne: mocks.socializeFindOne,
  },
}));

vi.mock('@/schemas/user', () => ({
  User: {
    findOne: mocks.userFindOne,
  },
}));

describe('public Socialize profile resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectToDatabase.mockResolvedValue(undefined);
    mocks.socializeFindOne.mockReturnValue({ lean: mocks.socializeLean });
    mocks.userFindOne.mockReturnValue({ select: mocks.userSelect });
    mocks.userSelect.mockReturnValue({ lean: mocks.userLean });
  });

  it('returns the configured Socialize profile when it exists', async () => {
    const { getPublicSocializeUser } = await import('@/lib/socialize/main');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    mocks.socializeLean.mockResolvedValue({
      clerkUserId: 'user_1',
      username: 'nimit_jain',
      profileImage: 'https://cdn.example/avatar.png',
      bio: 'Content producer',
      status: 'Available',
      accentColor: 'cyan',
      links: [{ platform: 'website', url: 'https://example.com' }],
      notifications: [
        { message: 'expired', duration: 1, timestamp: '2000-01-01T00:00:00.000Z' },
        { message: 'live', duration: 0 },
      ],
      createdAt,
      updatedAt: createdAt,
    });

    const profile = await getPublicSocializeUser('nimit_jain');

    expect(mocks.socializeFindOne).toHaveBeenCalledWith({ username: 'nimit_jain' });
    expect(mocks.userFindOne).not.toHaveBeenCalled();
    expect(profile).toMatchObject({
      clerkUserId: 'user_1',
      username: 'nimit_jain',
      uniqueUsername: 'nimit_jain',
      bio: 'Content producer',
      notifications: [{ message: 'live', duration: 0 }],
    });
  });

  it('falls back to a real User record when the Socialize profile is missing', async () => {
    const { getPublicSocializeUser } = await import('@/lib/socialize/main');
    const createdAt = new Date('2026-01-01T00:00:00.000Z');

    mocks.socializeLean.mockResolvedValue(null);
    mocks.userLean.mockResolvedValue({
      clerkUserId: 'user_1',
      username: 'nimit_jain',
      createdAt,
      updatedAt: createdAt,
    });

    const profile = await getPublicSocializeUser(' nimit_jain ');

    expect(mocks.socializeFindOne).toHaveBeenCalledWith({ username: 'nimit_jain' });
    expect(mocks.userFindOne).toHaveBeenCalledWith({ username: 'nimit_jain' });
    expect(mocks.userSelect).toHaveBeenCalledWith('clerkUserId username createdAt updatedAt');
    expect(profile).toMatchObject({
      clerkUserId: 'user_1',
      username: 'nimit_jain',
      uniqueUsername: 'nimit_jain',
      profileImage: '',
      bio: '',
      status: '',
      accentColor: 'gold',
      links: [],
      notifications: [],
      banner: {
        type: 'color',
        value: '#0e6b9c',
        gradientType: 'linear',
        gradientColors: [],
      },
    });
  });

  it('keeps true missing users as a 404 from fetchSocializeUser', async () => {
    const { fetchSocializeUser } = await import('@/lib/socialize/main');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    mocks.socializeLean.mockResolvedValue(null);
    mocks.userLean.mockResolvedValue(null);

    await expect(fetchSocializeUser('missing_user')).rejects.toMatchObject({
      message: 'Socialize profile not found',
      status: 404,
    });

    consoleError.mockRestore();
  });
});
