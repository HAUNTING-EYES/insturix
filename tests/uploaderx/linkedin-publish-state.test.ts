import { describe, expect, it } from "vitest";
import {
  getExistingLinkedInPublishedPost,
  linkedinOrganizationMetadataKey,
  normalizeLinkedInPostTarget,
} from "@/lib/uploaderx/linkedin-publish-state";

describe("linkedin publish state", () => {
  it("normalizes unknown post targets to personal", () => {
    expect(normalizeLinkedInPostTarget("organization")).toBe("organization");
    expect(normalizeLinkedInPostTarget("company")).toBe("personal");
    expect(normalizeLinkedInPostTarget(undefined)).toBe("personal");
  });

  it("returns an existing personal post", () => {
    const existing = getExistingLinkedInPublishedPost(
      {
        linkedin: {
          personal: {
            postId: "urn:li:share:1",
            postUrl: "https://www.linkedin.com/feed/update/urn:li:share:1",
            mediaType: "video",
          },
        },
      },
      "personal",
    );

    expect(existing).toEqual({
      target: "personal",
      postId: "urn:li:share:1",
      postUrl: "https://www.linkedin.com/feed/update/urn:li:share:1",
      mediaType: "video",
      assetUrn: undefined,
      organizationId: null,
    });
  });

  it("returns a mapped organization post for the requested organization", () => {
    const existing = getExistingLinkedInPublishedPost(
      {
        linkedin: {
          organizations: {
            "123": {
              postId: "urn:li:share:org-123",
              postUrl: "https://www.linkedin.com/feed/update/urn:li:share:org-123",
              assetUrn: "urn:li:digitalmediaAsset:abc",
              mediaType: "image",
            },
          },
        },
      },
      "organization",
      "123",
    );

    expect(existing).toMatchObject({
      target: "organization",
      postId: "urn:li:share:org-123",
      assetUrn: "urn:li:digitalmediaAsset:abc",
      mediaType: "image",
      organizationId: "123",
    });
  });

  it("uses legacy organization metadata only when the organization matches", () => {
    const metadata = {
      linkedin: {
        organization: {
          postId: "urn:li:share:legacy",
          postUrl: "https://www.linkedin.com/feed/update/urn:li:share:legacy",
          organizationId: "org-a",
        },
      },
    };

    expect(getExistingLinkedInPublishedPost(metadata, "organization", "org-a")?.postId).toBe(
      "urn:li:share:legacy",
    );
    expect(getExistingLinkedInPublishedPost(metadata, "organization", "org-b")).toBeNull();
  });

  it("sanitizes organization ids before using them as metadata paths", () => {
    expect(linkedinOrganizationMetadataKey("acme.org$west")).toBe("acme_org_west");
  });
});
