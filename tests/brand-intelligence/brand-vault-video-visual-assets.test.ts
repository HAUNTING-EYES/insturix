import { describe, expect, it } from 'vitest';
import { createBrandVaultConnectedSocialEvidence } from '../../lib/shared/brand-vault-connected-social-ingestion';
import { deriveBrandSignalProfile } from '../../lib/shared/brand-signal-profile';
import { createBrandVaultVisualIdentitySummary } from '../../lib/shared/brand-vault-visual-identity';

describe('Brand Vault video visual assets', () => {
  it('keeps playable social video urls distinct from poster and sampled frame images', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.instagram.com/insturix'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { instagram: 'apify/instagram-scraper' },
      fetchFn: async () => jsonResponse([
        {
          inputUrl: 'https://www.instagram.com/insturix/',
          postUrl: 'https://www.instagram.com/p/video_post/',
          caption: 'See the brand system in motion.',
          ownerProfileUrl: 'https://www.instagram.com/insturix/',
          videoUrl: 'https://cdn.example.com/video.mp4',
          thumbnailUrl: 'https://cdn.example.com/poster.jpg',
          videoThumbnails: [
            'https://cdn.example.com/frame-1.jpg',
            { url: 'https://cdn.example.com/frame-2.jpg' },
            'not-a-url',
          ],
        },
      ]),
      ocrProvider: null,
    });

    const post = result.sourceEvidence.find((source) => source.kind === 'social_post');
    expect(post?.media).toMatchObject({
      mediaType: 'video',
      mediaUrl: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/poster.jpg',
      sampledFrameUrls: [
        'https://cdn.example.com/frame-1.jpg',
        'https://cdn.example.com/frame-2.jpg',
      ],
    });

    const visual = createBrandVaultVisualIdentitySummary({
      profile: deriveBrandSignalProfile(null, { generatedAt: '2026-06-19T00:00:00.000Z' }),
      candidates: [],
      sourceEvidence: result.sourceEvidence,
    });
    const video = visual.images.find((asset) => asset.kind === 'video');

    expect(video).toMatchObject({
      kind: 'video',
      mediaType: 'video',
      url: 'https://cdn.example.com/video.mp4',
      thumbnailUrl: 'https://cdn.example.com/poster.jpg',
      sampledFrameUrls: [
        'https://cdn.example.com/frame-1.jpg',
        'https://cdn.example.com/frame-2.jpg',
      ],
    });
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
