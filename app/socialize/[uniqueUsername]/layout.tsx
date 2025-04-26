import { Metadata } from "next";
import { getSocializeUserData } from "@/lib/seo/socialize";

// Define param type as a Promise like in the blogs example
type SocializeParams = Promise<{ uniqueUsername: string }>;

// Define the return type of getSocializeUserData for better type safety
interface UserData {
  username?: string;
  bio?: string;
  profileImage?: string;
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
  const { username, bio, profileImage } = userData;
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
      url: `${process.env.SITE_URL || "https://insturix.com"}/socialize/${uniqueUsername}`,
      images: profileImage
        ? [
            {
              url: profileImage,
              width: 800,
              height: 800,
              alt: `${displayName}'s Socialize profile`,
            },
          ]
        : [
            {
              url: "/icons/products/socialize-og-image.jpg", // Default image if no profile image
              width: 1200,
              height: 630,
              alt: `${displayName}'s Socialize profile`,
            },
          ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: profileImage
        ? [profileImage]
        : ["/icons/products/socialize-og-image.jpg"],
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