import { describe, expect, it } from 'vitest';
import { createBrandVaultConnectedSocialEvidence } from '../../lib/shared/brand-vault-connected-social-ingestion';

describe('Brand Vault connected social ingestion', () => {
  it('enriches explicit YouTube post URLs with public metadata and captions even when Google is connected', async () => {
    const fetchedUrls: string[] = [];
    const ocrImageUrls: string[] = [];
    const playerResponse = {
      videoDetails: {
        title: 'Build one reviewed brand system before the edit starts',
        author: 'Insturix',
        shortDescription: 'Stop losing brand consistency between strategy and delivery. Trusted by 80 creative teams.',
        lengthSeconds: '84',
        viewCount: '1200',
        thumbnail: {
          thumbnails: [
            { url: 'https://img.youtube.com/vi/abc123/default.jpg' },
            { url: 'https://img.youtube.com/vi/abc123/maxresdefault.jpg' },
          ],
        },
      },
      microformat: {
        playerMicroformatRenderer: {
          publishDate: '2026-06-16',
          category: 'Software',
        },
      },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              languageCode: 'en',
              baseUrl: 'https://www.youtube.com/api/timedtext?v=abc123&lang=en',
            },
          ],
        },
      },
    };

    const fetchFn = async (url: string): Promise<Response> => {
      fetchedUrls.push(url);
      if (url.includes('/oembed')) {
        return jsonResponse({
          title: 'OEmbed fallback title',
          author_name: 'Insturix channel',
          thumbnail_url: 'https://img.youtube.com/vi/abc123/hqdefault.jpg',
        });
      }
      if (url.includes('/api/timedtext')) {
        return new Response(
          '<transcript><text start="0">Book a demo this week.</text><text start="2">See the brand system in action.</text></transcript>',
          { status: 200, headers: { 'content-type': 'text/xml' } },
        );
      }
      return new Response(
        `<html><head><meta property="og:image" content="https://img.youtube.com/vi/abc123/sddefault.jpg"></head><body><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script></body></html>`,
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    };

    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.youtube.com/watch?v=abc123'],
      uploaderXUser: null,
      youtubeConnection: {
        provider: 'clerk_external_account',
        status: 'connected',
        accountName: 'Personal Google',
        canReadProfile: true,
        canReadPosts: false,
        canReadPinned: false,
        matchStatus: 'unverified',
      },
      fetchFn,
      ocrProvider: {
        async readTextFromImage(input) {
          ocrImageUrls.push(input.imageUrl);
          return { text: 'Limited beta\nBook a demo from the thumbnail.' };
        },
      },
    });

    expect(fetchedUrls).toHaveLength(3);
    expect(fetchedUrls[0]).toContain('https://www.youtube.com/oembed');
    expect(fetchedUrls[1]).toBe('https://www.youtube.com/watch?v=abc123');
    expect(fetchedUrls[2]).toContain('https://www.youtube.com/api/timedtext');
    expect(ocrImageUrls).toEqual(['https://img.youtube.com/vi/abc123/maxresdefault.jpg']);
    const youtubePost = result.sourceEvidence.find((source) => source.kind === 'social_post' && source.platform === 'youtube');
    expect(youtubePost).toMatchObject({
      evidenceOrigin: 'public_fallback',
      publishedAt: '2026-06-16',
      text: expect.stringContaining('Stop losing brand consistency between strategy and delivery'),
      media: {
        mediaType: 'video',
        thumbnailUrl: 'https://img.youtube.com/vi/abc123/maxresdefault.jpg',
        ocrText: 'Limited beta\nBook a demo from the thumbnail.',
        durationSeconds: 84,
        transcript: 'Book a demo this week. See the brand system in action.',
      },
      metrics: {
        viewCount: 1200,
      },
      profile: {
        bio: 'Insturix',
        category: 'Software',
      },
    });
    expect(result.warnings).toContain('Brand Vault fetched youtube public oEmbed, watch metadata, and captions as review-only social evidence.');
    expect(result.warnings).toContain('Brand Vault OCR extracted readable text from 1 social media image for draft evidence review.');
    expect(result.warnings).toContain('Brand Vault added 1 connected social evidence source from existing platform integrations.');
    expect(result.warnings).toContain('Brand Vault staged 1 public social fallback source for review-only enrichment.');
  });

  it('warns when an Apify-supported social profile has no configured actor', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.instagram.com/vaultline'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: {},
      fetchFn: async () => {
        throw new Error('fetch should not be called without an actor id');
      },
    });

    expect(result.sourceEvidence).toEqual([]);
    expect(result.warnings).toContain('Brand Vault skipped instagram Apify fallback: no Apify actor is configured for this platform.');
  });

  it('warns when an Apify-supported social profile has no API key', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.facebook.com/vaultline'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyActors: { facebook: 'apify/facebook-posts-scraper' },
      fetchFn: async () => {
        throw new Error('fetch should not be called without an API key');
      },
    });

    expect(result.sourceEvidence).toEqual([]);
    expect(result.warnings).toContain('Brand Vault skipped facebook Apify fallback: APIFY_API_KEY is not configured.');
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}
