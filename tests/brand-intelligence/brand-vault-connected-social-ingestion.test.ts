import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BRAND_VAULT_DEFAULT_APIFY_ACTORS,
  createBrandVaultConnectedSocialEvidence,
} from '../../lib/shared/brand-vault-connected-social-ingestion';
import { encryptUserOAuthToken } from '../../lib/calos/publish/token-crypto';

describe('Brand Vault connected social ingestion', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

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
          ocrImageUrls.push(input.imageUrl ?? '');
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
      name: 'Build one reviewed brand system before the edit starts',
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
    expect(youtubePost?.text).not.toContain('Insturix');
    expect(youtubePost?.text).toContain('Book a demo this week. See the brand system in action.');
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

  it('filters generic YouTube boilerplate from public video text evidence while keeping the sourced title', async () => {
    const fetchFn = async (url: string): Promise<Response> => {
      if (url.includes('/oembed')) {
        return jsonResponse({
          title: 'This is how businesses get robbed',
          author_name: 'Nimit Jain',
          thumbnail_url: 'https://img.youtube.com/vi/generic123/hqdefault.jpg',
        });
      }
      const playerResponse = {
        videoDetails: {
          title: 'This is how businesses get robbed',
          author: 'Nimit Jain',
          shortDescription: 'Enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on YouTube.',
          thumbnail: { thumbnails: [{ url: 'https://img.youtube.com/vi/generic123/maxresdefault.jpg' }] },
        },
      };
      return new Response(
        `<html><body><script>var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};</script></body></html>`,
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    };

    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.youtube.com/watch?v=generic123'],
      uploaderXUser: null,
      youtubeConnection: null,
      fetchFn,
      ocrProvider: null,
    });

    const youtubePost = result.sourceEvidence.find((source) => source.kind === 'social_post' && source.platform === 'youtube');
    expect(youtubePost?.name).toBe('This is how businesses get robbed');
    expect(youtubePost?.profile?.bio).toBe('Nimit Jain');
    expect(youtubePost?.text).toBe('This is how businesses get robbed');
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

  it('can disable paid Apify public fallbacks while keeping free YouTube evidence', async () => {
    const fetchedUrls: string[] = [];
    const channelHtml = '<html><body><script>var ytInitialData = {"contents":[{"videoId":"tea001"}]};</script></body></html>';

    const fetchFn = async (url: string): Promise<Response> => {
      fetchedUrls.push(url);
      if (url.includes('api.apify.com')) throw new Error('Apify should not be called when platform policy disables it');
      if (url === 'https://www.youtube.com/@chaayos') {
        return new Response(channelHtml, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      if (url.includes('/oembed')) {
        return jsonResponse({
          title: 'Fresh chai stories from Chaayos',
          author_name: 'Chaayos',
          thumbnail_url: 'https://img.youtube.com/vi/tea001/hqdefault.jpg',
        });
      }
      return new Response(
        '<html><body><script>var ytInitialPlayerResponse = {"videoDetails":{"title":"Fresh chai stories from Chaayos","author":"Chaayos","shortDescription":"Behind the scenes of chai, snacks, and cafe moments.","thumbnail":{"thumbnails":[{"url":"https://img.youtube.com/vi/tea001/maxresdefault.jpg"}]}}};</script></body></html>',
        { status: 200, headers: { 'content-type': 'text/html' } },
      );
    };

    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: [
        'https://www.instagram.com/chaayos',
        'https://www.linkedin.com/company/sunshine-teahouse',
        'https://www.youtube.com/@chaayos',
      ],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: BRAND_VAULT_DEFAULT_APIFY_ACTORS,
      apifyEnabledPlatforms: [],
      fetchFn,
      ocrProvider: null,
    });

    expect(fetchedUrls).toEqual([
      'https://www.youtube.com/@chaayos',
      expect.stringContaining('https://www.youtube.com/oembed'),
      'https://www.youtube.com/watch?v=tea001',
    ]);
    expect(result.sourceEvidence.filter((source) => source.kind === 'social_post' && source.platform === 'youtube')).toHaveLength(1);
    expect(result.sourceEvidence.some((source) => source.platform === 'instagram' || source.platform === 'linkedin')).toBe(false);
    expect(result.warnings).toContain('Brand Vault skipped instagram Apify fallback: platform disabled by BRAND_VAULT_APIFY_PUBLIC_FALLBACK_PLATFORMS.');
    expect(result.warnings).toContain('Brand Vault skipped linkedin Apify fallback: platform disabled by BRAND_VAULT_APIFY_PUBLIC_FALLBACK_PLATFORMS.');
    expect(result.warnings).toContain('Brand Vault fetched 1 recent YouTube public video from channel page as review-only social evidence.');
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
          ocrImageUrls.push(input.imageUrl ?? '');
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

  it('decrypts connected Facebook credentials before fetching Page posts', async () => {
    vi.stubEnv('CALOS_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 8).toString('base64'));
    const storedPageAccessToken = encryptUserOAuthToken('page_token');
    const fetchedUrls: string[] = [];

    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.facebook.com/vaultline'],
      uploaderXUser: {
        facebookTokens: {
          userAccessToken: encryptUserOAuthToken('fb_user_token'),
          userName: 'Owner',
          pages: [{
            pageId: 'page_1',
            pageName: 'vaultline',
            pageAccessToken: storedPageAccessToken,
          }],
        },
      },
      youtubeConnection: null,
      fetchFn: async (url) => {
        fetchedUrls.push(url);
        return jsonResponse({
          data: [{
            id: 'page_1_post_1',
            message: 'Connected Facebook evidence',
            permalink_url: 'https://www.facebook.com/vaultline/posts/page_1_post_1',
            created_time: '2026-07-30T08:00:00.000Z',
          }],
        });
      },
      ocrProvider: null,
    });

    expect(fetchedUrls).toHaveLength(1);
    expect(new URL(fetchedUrls[0]).searchParams.get('access_token')).toBe('page_token');
    expect(fetchedUrls[0]).not.toContain(storedPageAccessToken);
    expect(result.sourceEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'social_post',
          platform: 'facebook',
          text: 'Connected Facebook evidence',
          evidenceOrigin: 'connected_fetch',
        }),
      ]),
    );
  });

  it('fails closed before Facebook Graph work when Page ciphertext is unreadable', async () => {
    vi.stubEnv('CALOS_TOKEN_ENCRYPTION_KEY', Buffer.alloc(32, 8).toString('base64'));
    const fetchFn = vi.fn(async () => {
      throw new Error('Facebook Graph must not receive unreadable ciphertext');
    });

    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.facebook.com/vaultline'],
      uploaderXUser: {
        facebookTokens: {
          userAccessToken: encryptUserOAuthToken('fb_user_token'),
          userName: 'Owner',
          pages: [{
            pageId: 'page_1',
            pageName: 'vaultline',
            pageAccessToken: 'oauth:v1:not-valid-ciphertext',
          }],
        },
      },
      youtubeConnection: null,
      fetchFn,
      ocrProvider: null,
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.sourceEvidence).toEqual([
      expect.objectContaining({
        kind: 'social_profile',
        platform: 'facebook',
        connection: expect.objectContaining({
          canReadPosts: false,
        }),
      }),
    ]);
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

  it('matches Instagram Apify rows when identity is only present in profile URLs', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.instagram.com/insturix'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { instagram: 'apify/instagram-scraper' },
      fetchFn: async () => jsonResponse([
        {
          inputUrl: 'https://www.instagram.com/insturix/',
          postUrl: 'https://www.instagram.com/p/brand_post/',
          caption: 'Content production is broken. One platform. Not ten.',
          ownerProfileUrl: 'https://www.instagram.com/insturix/',
          displayUrl: 'https://cdn.example.com/insturix-frame.jpg',
          likesCount: 42,
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
      media: {
        mediaType: 'image',
        mediaUrl: 'https://cdn.example.com/insturix-frame.jpg',
        thumbnailUrl: 'https://cdn.example.com/insturix-frame.jpg',
      },
      metrics: {
        likeCount: 42,
        engagementCount: 42,
      },
      connection: expect.objectContaining({
        accountHandle: 'insturix',
        matchStatus: 'matched',
      }),
    });
    expect(result.warnings).toContain('Brand Vault fetched 1 instagram public Apify item for review-only social evidence.');
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
    expect(result.warnings).toContain('Brand Vault discarded 1 linkedin Apify item because they were unreadable, actor error rows, hollow, or did not match the submitted account.');
    expect(result.warnings).toContain('Brand Vault linkedin Apify rejection reasons: hollow_item=1.');
  });

  it('matches LinkedIn Apify rows when company identity is returned as a nested profile URL', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.linkedin.com/company/insturix'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { linkedin: 'atomus/linkedin-posts-scraper-pro' },
      fetchFn: async () => jsonResponse([
        {
          textContent: 'Your content operation should move from brief to publish in one system.',
          activityUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:789/',
          company: {
            name: 'Insturix',
            url: 'https://www.linkedin.com/company/insturix/',
            description: 'Automated content production platform.',
          },
          document: {
            coverImageUrl: 'https://media.licdn.com/insturix-cover.jpg',
          },
          stats: {
            totalReactions: 17,
            comments: 3,
            reposts: 2,
          },
        },
      ]),
    });

    const publicPosts = result.sourceEvidence.filter((source) => source.kind === 'social_post');
    expect(publicPosts).toHaveLength(1);
    expect(publicPosts[0]).toMatchObject({
      platform: 'linkedin',
      evidenceOrigin: 'public_fallback',
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:789/',
      text: 'Your content operation should move from brief to publish in one system.',
      media: {
        mediaType: 'image',
        mediaUrl: 'https://media.licdn.com/insturix-cover.jpg',
        thumbnailUrl: 'https://media.licdn.com/insturix-cover.jpg',
      },
      metrics: {
        likeCount: 17,
        commentCount: 3,
        repostCount: 2,
        engagementCount: 22,
      },
      profile: {
        bio: 'Automated content production platform.',
        website: 'https://www.linkedin.com/company/insturix/',
      },
      connection: expect.objectContaining({
        accountHandle: 'insturix',
        accountName: 'Insturix',
        matchStatus: 'matched',
      }),
    });
    expect(result.warnings).toContain('Brand Vault fetched 1 linkedin public Apify item for review-only social evidence.');
  });

  it('expands nested LinkedIn actor post arrays while preserving company identity', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.linkedin.com/company/insturix'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { linkedin: BRAND_VAULT_DEFAULT_APIFY_ACTORS.linkedin },
      fetchFn: async () => jsonResponse([
        {
          company: {
            name: 'Insturix',
            url: 'https://www.linkedin.com/company/insturix/',
            description: 'AI-assisted content production platform.',
          },
          posts: [
            {
              textContent: 'Stop losing brand consistency between brief, edit, and publish.',
              activityUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:900/',
              stats: {
                totalReactions: '11',
                comments: '2',
                reposts: '1',
              },
              document: {
                coverImageUrl: 'https://media.licdn.com/insturix-nested-cover.jpg',
              },
              postedAt: '2026-06-17T10:00:00.000Z',
            },
          ],
        },
      ]),
    });

    const publicPosts = result.sourceEvidence.filter((source) => source.kind === 'social_post');
    expect(publicPosts).toHaveLength(1);
    expect(publicPosts[0]).toMatchObject({
      platform: 'linkedin',
      evidenceOrigin: 'public_fallback',
      url: 'https://www.linkedin.com/feed/update/urn:li:activity:900/',
      text: 'Stop losing brand consistency between brief, edit, and publish.',
      publishedAt: '2026-06-17T10:00:00.000Z',
      media: {
        mediaType: 'image',
        mediaUrl: 'https://media.licdn.com/insturix-nested-cover.jpg',
        thumbnailUrl: 'https://media.licdn.com/insturix-nested-cover.jpg',
      },
      metrics: {
        likeCount: 11,
        commentCount: 2,
        repostCount: 1,
        engagementCount: 14,
      },
      profile: {
        bio: 'AI-assisted content production platform.',
        website: 'https://www.linkedin.com/company/insturix/',
      },
      connection: expect.objectContaining({
        accountHandle: 'insturix',
        accountName: 'Insturix',
        matchStatus: 'matched',
      }),
    });
  });

  it('normalizes Facebook Apify posts with permalink, page identity, media, and metrics', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.facebook.com/insturix'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { facebook: BRAND_VAULT_DEFAULT_APIFY_ACTORS.facebook },
      fetchFn: async () => jsonResponse([
        {
          message: 'Content production is broken. One platform. Not ten.',
          permalink_url: 'https://www.facebook.com/insturix/posts/123',
          pageName: 'Insturix',
          pageUrl: 'https://www.facebook.com/insturix',
          attachments: {
            data: [
              {
                type: 'photo',
                url: 'https://www.facebook.com/insturix/photos/123',
                media: {
                  image: {
                    src: 'https://cdn.example.com/facebook-post-frame.jpg',
                  },
                },
              },
            ],
          },
          likes: 7,
          comments: 2,
          shares: 1,
          created_time: '2026-06-17T11:00:00.000Z',
        },
      ]),
    });

    const publicPosts = result.sourceEvidence.filter((source) => source.kind === 'social_post');
    expect(publicPosts).toHaveLength(1);
    expect(publicPosts[0]).toMatchObject({
      platform: 'facebook',
      evidenceOrigin: 'public_fallback',
      url: 'https://www.facebook.com/insturix/posts/123',
      text: 'Content production is broken. One platform. Not ten.',
      publishedAt: '2026-06-17T11:00:00.000Z',
      media: {
        mediaType: 'image',
        mediaUrl: 'https://cdn.example.com/facebook-post-frame.jpg',
        thumbnailUrl: 'https://cdn.example.com/facebook-post-frame.jpg',
      },
      metrics: {
        likeCount: 7,
        commentCount: 2,
        shareCount: 1,
        engagementCount: 10,
      },
      profile: {
        website: 'https://www.facebook.com/insturix',
      },
      connection: expect.objectContaining({
        accountName: 'Insturix',
        matchStatus: 'matched',
      }),
    });
  });

  it('emits bounded Apify diagnostics without copying rejected post text into warnings', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.instagram.com/insturix'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { instagram: BRAND_VAULT_DEFAULT_APIFY_ACTORS.instagram },
      fetchFn: async () => jsonResponse([
        {
          url: 'https://www.instagram.com/p/personal_post/',
          caption: 'private wrong-account caption should not appear in warning diagnostics',
          ownerUsername: 'nimitgotnolimit',
          ownerFullName: 'Nimit Jain',
          displayUrl: 'https://cdn.example.com/personal-frame.jpg',
          likesCount: 12,
        },
        {
          url: 'https://www.instagram.com/insturix',
          type: 'actor_error',
          error_kind: 'login_required',
          reason: 'Actor returned no public posts without a fresh session.',
        },
      ]),
    });

    const diagnostic = result.warnings.find((warning) => warning.includes('Apify rejected item diagnostics'));
    expect(diagnostic).toContain('actor=apify/instagram-scraper');
    expect(diagnostic).toContain('identity_mismatch');
    expect(diagnostic).toContain('actor_error');
    expect(diagnostic).toContain('identityCandidates=[nimitgotnolimit,Nimit Jain]');
    expect(diagnostic).toContain('actorErrorKind=login_required');
    expect(diagnostic).toContain('actorReason=Actor returned no public posts without a fresh session.');
    expect(diagnostic).toContain('textFields=[caption]');
    expect(diagnostic).toContain('mediaFields=[displayUrl]');
    expect(diagnostic).not.toContain('private wrong-account caption');
    expect(result.warnings).toContain('Brand Vault instagram Apify actor apify/instagram-scraper returned provider error rows (login_required); check the actor run before judging social coverage.');
    expect(result.warnings).toContain('Brand Vault instagram Apify rejection reasons: actor_error=1, identity_mismatch=1.');
  });

  it('classifies Apify quota rows separately from empty social content', async () => {
    const result = await createBrandVaultConnectedSocialEvidence({
      socialLinks: ['https://www.linkedin.com/company/insturix/'],
      uploaderXUser: null,
      youtubeConnection: null,
      apifyApiKey: 'apify_key',
      apifyActors: { linkedin: BRAND_VAULT_DEFAULT_APIFY_ACTORS.linkedin },
      fetchFn: async () => jsonResponse([
        {
          url: 'https://www.linkedin.com/company/insturix/',
          type: 'actor_error',
          error_kind: 'free_tier_limit',
          reason: 'Actor free tier limit reached before posts could be fetched.',
        },
      ]),
    });

    const diagnostic = result.warnings.find((warning) => warning.includes('Apify rejected item diagnostics'));
    expect(result.warnings).toContain('Brand Vault linkedin Apify actor atomus/linkedin-posts-scraper-pro reported quota or capacity exhaustion (free_tier_limit); retry after quota reset or increase Apify capacity before judging social coverage.');
    expect(result.warnings).toContain('Brand Vault linkedin Apify rejection reasons: quota_exhausted=1.');
    expect(diagnostic).toContain('quota_exhausted');
    expect(diagnostic).toContain('actorErrorKind=free_tier_limit');
    expect(diagnostic).toContain('actorReason=Actor free tier limit reached before posts could be fetched.');
  });

  it('stages related Apify public posts from a different identity when they mention the submitted account', async () => {
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
      ]),
    });

    const publicPosts = result.sourceEvidence.filter((source) => source.kind === 'social_post');
    expect(publicPosts).toHaveLength(1);
    expect(publicPosts[0]).toMatchObject({
      platform: 'instagram',
      evidenceOrigin: 'public_fallback',
      url: 'https://www.instagram.com/p/personal_post/',
      text: 'Made with Insturix, personal behind-the-scenes copy.',
      note: expect.stringContaining('related identity'),
      connection: expect.objectContaining({
        accountHandle: 'nimitgotnolimit',
        accountName: 'Nimit Jain',
        matchStatus: 'unverified',
      }),
    });
    expect(result.warnings).toContain('Brand Vault staged 1 instagram public Apify item from a related identity that mentioned the submitted account; review before accepting.');
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
          caption: 'Personal behind-the-scenes copy for a different project.',
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
    expect(result.warnings).toContain('Brand Vault instagram Apify rejection reasons: identity_mismatch=1.');
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
}
