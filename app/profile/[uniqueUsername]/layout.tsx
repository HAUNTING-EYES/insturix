import { Metadata } from "next";
import { getBaseUrl } from "@/lib/env";
import { getSocializeUserData } from "@/lib/seo/socialize";

type ProfileParams = Promise<{ uniqueUsername: string }>;

interface UserData {
  username?: string;
  bio?: string;
  profileImage?: string;
  banner?: {
    type: "image" | "color" | "gradient";
    value: string;
  };
}

export async function generateMetadata({
  params,
}: {
  params: ProfileParams;
}): Promise<Metadata> {
  const { uniqueUsername } = await params;
  const userData: UserData | null = await getSocializeUserData(uniqueUsername);

  if (!userData) {
    return {
      title: "Profile Not Found | Insturix",
      description: "This public profile does not exist or has been removed.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const { username, bio, profileImage, banner } = userData;
  const displayName = username || uniqueUsername;
  const userBio = bio || "Insturix public profile.";
  const title = `${displayName} Public Profile | Insturix`;
  const description =
    userBio.length > 150 ? `${userBio.substring(0, 147)}...` : userBio;
  const profileUrl = `${getBaseUrl()}/profile/${uniqueUsername}`;

  return {
    title,
    description,
    keywords: `${displayName}, public profile, content links, Insturix profile`,
    alternates: {
      canonical: profileUrl,
    },
    openGraph: {
      siteName: "Insturix",
      title,
      description,
      type: "profile",
      url: profileUrl,
      images: (() => {
        if (banner?.type === "image" && banner.value) {
          return [
            {
              url: banner.value,
              width: 1200,
              height: 400,
              alt: `${displayName}'s public profile banner`,
            },
          ];
        }

        if (profileImage) {
          return [
            {
              url: profileImage,
              width: 800,
              height: 800,
              alt: `${displayName}'s public profile`,
            },
          ];
        }

        return [
          {
            url: "/brand/insturix_black.png",
            width: 1200,
            height: 630,
            alt: "Insturix public profile",
          },
        ];
      })(),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: (() => {
        if (banner?.type === "image" && banner.value) {
          return [banner.value];
        }

        if (profileImage) {
          return [profileImage];
        }

        return ["/brand/insturix_black.png"];
      })(),
      site: "@insturix",
      creator: displayName,
    },
    other: {
      "profile:username": displayName,
    },
  };
}

export default function PublicProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
