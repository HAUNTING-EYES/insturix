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

  it('samples public YouTube channel videos when connected Google can only provide metadata', async () => {
    const fetchedUrls: string[] = [];
    const channelHtml = '<html><body><script>var ytInitialData = {"contents":[{"videoId":"chan001"},{"videoId":"chan002"},{"videoId":"chan001"}]};</script></body></html>';

    const fetchFn = async (url: string): Promise<Response> => {
      fetchedUrls.push(url);
      if (url === 'https://www.youtube.com/@insturix') {
        return new Response(channelHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (url.includes('/oembed')) {
        const videoId = new URL(url).searchParams.get('url')?.split('v=')[1] ?? 'unknown';
        return jsonResponse({
          title: `OEmbed title ${videoId}`,
          author_name: 'Insturix',
          thumbnail_url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        });
      }
      const videoId = new URL(url).searchParams.get('v') ?? 'unknown';
      const playerResponse = {
        videoDetails: {
          title: `Reviewed brand system ${videoId}`,
          author: 'Insturix',
          shortDescription: `Video ${videoId} shows how agencies keep production on brand.`,
          thumbnail: { thumbnails: [{ url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` }] },
          viewCount: '450',
        },
        microformat: {
          playerMicroformatRenderer: {
            publishDate: '2026-06-15',
            category: 'Software',
          },
        },
      };
      return new Response(
        `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script></body></html>`,
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    };

    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.youtube.com/@insturix'],
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
      ocrProvider: null,
    });

    const youtubePosts = result.sourceEvidence.filter((source) => source.kind === 'social_post' && source.platform === 'youtube');
    expect(youtubePosts).toHaveLength(2);
    expect(youtubePosts[0]).toMatchObject({
      url: 'https://www.youtube.com/watch?v=chan001',
      evidenceOrigin: 'public_fallback',
      text: expect.stringContaining('agencies keep production on brand'),
      media: expect.objectContaining({
        mediaType: 'video',
        thumbnailUrl: 'https://img.youtube.com/vi/chan001/maxresdefault.jpg',
      }),
      metrics: { viewCount: 450 },
    });
    expect(result.sourceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'social_profile',
          platform: 'youtube',
          evidenceOrigin: 'connected_metadata',
        }),
      ]),
    );
    expect(fetchedUrls).toEqual([
      'https://www.youtube.com/@insturix',
      expect.stringContaining('https://www.youtube.com/oembed'),
      'https://www.youtube.com/watch?v=chan001',
      expect.stringContaining('https://www.youtube.com/oembed'),
      'https://www.youtube.com/watch?v=chan002',
    ]);
    expect(result.warnings).toContain('Brand Vault fetched 2 recent YouTube public videos from channel page as review-only social evidence.');
    expect(result.warnings).toContain('Brand Vault added 1 connected social evidence source from existing platform integrations.');
    expect(result.warnings).toContain('Brand Vault staged 2 public social fallback sources for review-only enrichment.');
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

  it('keeps connected Instagram media without captions so OCR can provide brand text', async () => {
    const ocrImageUrls: string[] = [];
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.instagram.com/vaultline'],
      uploaderXUser: {
        instagramTokens: {
          userAccessToken: 'ig_token',
          userName: 'vaultline',
          accounts: [{ instagramAccountId: 'ig_account_1', instagramUsername: 'vaultline' }],
        },
      },
      youtubeConnection: null,
      fetchFn: async () => jsonResponse({
        data: [
          {
            id: 'ig_media_without_caption',
            media_type: 'IMAGE',
            media_url: 'https://cdn.example.com/ig_media_without_caption.jpg',
            permalink: 'https://www.instagram.com/p/ig_media_without_caption/',
            timestamp: '2026-06-16T10:00:00.000Z',
          },
        ],
      }),
      ocrProvider: {
        async readTextFromImage(input) {
          ocrImageUrls.push(input.imageUrl);
          return { text: 'Stop losing brand consistency between strategy and delivery.' };
        },
      },
    });

    expect(ocrImageUrls).toEqual(['https://cdn.example.com/ig_media_without_caption.jpg']);
    expect(result.warnings).toContain('Brand Vault fetched 1 recent Instagram media item for draft social evidence review.');
    expect(result.warnings).toContain('Brand Vault OCR extracted readable text from 1 social media image for draft evidence review.');
    expect(result.sourceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'social_post',
          platform: 'instagram',
          url: 'https://www.instagram.com/p/ig_media_without_caption/',
          text: undefined,
          evidenceOrigin: 'connected_fetch',
          media: expect.objectContaining({
            mediaType: 'image',
            mediaUrl: 'https://cdn.example.com/ig_media_without_caption.jpg',
            ocrText: 'Stop losing brand consistency between strategy and delivery.',
          }),
        }),
      ]),
    );
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

  it('reports when Apify returns zero dataset items for a public profile fallback', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.instagram.com/vaultline'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { instagram: 'apify/instagram-scraper' },
      fetchFn: async () => jsonResponse([]),
    });

    expect(result.sourceEvidence).toEqual([
      expect.objectContaining({
        kind: 'social_profile',
        platform: 'instagram',
        evidenceOrigin: 'public_fallback',
        url: 'https://www.instagram.com/vaultline',
      }),
    ]);
    expect(result.warnings).toContain('Brand Vault ran instagram Apify fallback, but Apify returned 0 dataset items.');
  });

  it('keeps Apify public posts from a submitted representative account', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.instagram.com/nimitgotnolimit'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { instagram: 'apify/instagram-scraper' },
      fetchFn: async () => jsonResponse([
        {
          url: 'https://www.instagram.com/p/founder_post/',
          caption: 'Insturix exists because content production is broken.',
          ownerUsername: 'nimitgotnolimit',
          ownerFullName: 'Nimit Jain',
        },
      ]),
    });

    const publicPosts = result.sourceEvidence.filter((source) => source.kind === 'social_post');
    expect(publicPosts).toHaveLength(1);
    expect(publicPosts[0]).toMatchObject({
      platform: 'instagram',
      evidenceOrigin: 'public_fallback',
      url: 'https://www.instagram.com/p/founder_post/',
      text: 'Insturix exists because content production is broken.',
      connection: expect.objectContaining({
        accountHandle: 'nimitgotnolimit',
        matchStatus: 'matched',
      }),
    });
  });

  it('normalizes nested Apify actor posts and drops hollow public rows', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.linkedin.com/company/vaultline'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { linkedin: 'atomus/linkedin-posts-scraper-pro' },
      fetchFn: async () => jsonResponse([
        {
          type: 'post',
          url: 'https://www.linkedin.com/company/vaultline',
        },
        {
          post: {
            content: 'Stop shipping off-brand content. Build one reviewed brand system before production starts.',
            url: 'https://www.linkedin.com/feed/update/urn:li:activity:456/',
          },
          actor: {
            handle: 'vaultline',
            name: 'Vaultline',
          },
          author: {
            headline: 'Brand operations platform for agencies',
          },
          images: [{ url: 'https://cdn.example.com/linkedin-post-frame.jpg' }],
          engagement: {
            total_reactions: '18',
            comments: '4',
            shares: '2',
          },
          postedAt: '2026-06-10T10:00:00.000Z',
        },
      ]),
    });

    const publicPosts = result.sourceEvidence.filter((source) => source.kind === 'social_post');
    expect(publicPosts).toHaveLength(1);
    expect(publicPosts[0]).toMatchObject({
      platform: 'linkedin',
      evidenceOrigin: 'public_fallback',
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:456/',
      text: 'Stop shipping off-brand content. Build one reviewed brand system before production starts.',
      publishedAt: '2026-06-10T10:00:00.000Z',
      media: {
        mediaType: 'image',
        mediaUrl: 'https://cdn.example.com/linkedin-post-frame.jpg',
        thumbnailUrl: 'https://cdn.example.com/linkedin-post-frame.jpg',
      },
      metrics: {
        likeCount: 18,
        commentCount: 4,
        shareCount: 2,
      },
      profile: {
        bio: 'Brand operations platform for agencies',
      },
      connection: expect.objectContaining({
        accountHandle: 'vaultline',
        accountName: 'Vaultline',
        matchStatus: 'matched',
      }),
    });
    expect(result.sourceEvidence.filter((source) => source.url === 'https://www.linkedin.com/company/vaultline')).toHaveLength(1);
    expect(result.warnings).toContain('Brand Vault discarded 1 linkedin Apify item because they were unreadable, hollow, or did not match the submitted account.');
  });

  it('drops Apify public posts whose author does not match the submitted social account', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.instagram.com/insturix'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { instagram: 'apify/instagram-scraper' },
      fetchFn: async () => jsonResponse([
        {
          url: 'https://www.instagram.com/p/personal_post/',
          caption: 'Made with Insturix, personal behind-the-scenes copy.',
          ownerUsername: 'nimitgotnolimit',
          ownerFullName: 'Nimit Jain',
        },
        {
          url: 'https://www.instagram.com/p/brand_post/',
          caption: 'Content production is broken. One platform. Not ten.',
          ownerUsername: 'insturix',
          ownerFullName: 'Insturix',
        },
      ]),
    });

    const publicPosts = result.sourceEvidence.filter((source) => source.kind === 'social_post');
    expect(publicPosts).toHaveLength(1);
    expect(publicPosts[0]).toMatchObject({
      platform: 'instagram',
      evidenceOrigin: 'public_fallback',
      url: 'https://www.instagram.com/p/brand_post/',
      text: 'Content production is broken. One platform. Not ten.',
      connection: expect.objectContaining({
        accountHandle: 'insturix',
        matchStatus: 'matched',
      }),
    });
    expect(result.sourceEvidence.some((source) => source.url === 'https://www.instagram.com/p/personal_post/')).toBe(false);
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}
