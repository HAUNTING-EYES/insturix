import { Metadata } from "next";
import { getSocializeUserData } from "@/lib/seo/socialize";
import { getBaseUrl } from "@/lib/env";

// Define param type as a Promise like in the blogs example
type SocializeParams = Promise<{ uniqueUsername: string }>;

// Define the return type of getSocializeUserData for better type safety
interface UserData {
  username?: string;
  bio?: string;
  profileImage?: string;
  banner?: {
    type: 'image' | 'color' | 'gradient';
    value: string;
    gradientType?: 'linear' | 'radial';
    gradientColors?: Array<{
      color: string;
      position: number;
    }>;
  };
  // Add other properties that might be returned by getSocializeUserData
}

// Define generateMetadata using Next.js's expected Promise types
export async function generateMetadata({
  params,
}: {
  params: SocializeParams;
}): Promise<Metadata> {
  // Get the username from route params - must await the params since it's a Promise
  const resolvedParams = await params;
  const { uniqueUsername } = resolvedParams;

  // Fetch user data using the utility function that returns a promise
  const userData: UserData | null = await getSocializeUserData(uniqueUsername);

  // If no user data is found, return a not found page metadata
  if (!userData) {
    return {
      title: "User Not Found | Socialize",
      description: "This Socialize profile doesn't exist or has been removed.",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  // Extract user profile data with proper type safety
  const { username, bio, profileImage, banner } = userData;
  const displayName = username || uniqueUsername;
  const userBio = bio || "Socialize profile.";
  const title = `${displayName} Socialize Profile `;
  const description =
    userBio.length > 150 ? `${userBio.substring(0, 147)}...` : userBio;

  // Create SEO optimized metadata for this specific user's profile
  return {
    title,
    description,
    keywords: `${displayName}, social profile, creator links, Socialize profile`,
    openGraph: {
      title,
      description,
      type: "profile",
      url: `${getBaseUrl()}/socialize/${uniqueUsername}`,
      images: (() => {
        // Prioritize banner image if it's an image type
        if (banner?.type === 'image' && banner.value) {
          return [
            {
              url: banner.value,
              width: 1200,
              height: 400,
              alt: `${displayName}'s Socialize profile banner`,
            },
          ];
        }
        // Fall back to profile image
        if (profileImage) {
          return [
            {
              url: profileImage,
              width: 800,
              height: 800,
              alt: `${displayName}'s Socialize profile`,
            },
          ];
        }
        // Default image
        return [
          {
            url: "/icons/products/socialize-og-image.jpg",
            width: 1200,
            height: 630,
            alt: `${displayName}'s Socialize profile`,
          },
        ];
      })(),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: (() => {
        // Prioritize banner image if it's an image type
        if (banner?.type === 'image' && banner.value) {
          return [banner.value];
        }
        // Fall back to profile image
        if (profileImage) {
          return [profileImage];
        }
        // Default image
        return ["/icons/products/socialize-og-image.jpg"];
      })(),
      site: "@insturix",
      creator: displayName,
    },
    other: {
      "profile:username": displayName,
    },
  };
}

// Define the layout component with matching async params type
export default function SocializeUserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}