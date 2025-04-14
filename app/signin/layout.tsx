import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | Access Your Account",
  description: "Sign in to access your Insturix account and tools. Get back to creating content with our suite of AI-powered tools and services for content creators.",
  keywords: "Insturix login, creator account, sign in, creator platform access, content tools login,AI tools login",
  openGraph: {
    title: "Sign In | Access Your Account",
    description: "Sign in to access your Insturix account and tools. Get back to creating content with our suite of AI-powered tools and services for content creators.",
    images: [
      {
        url: "/icons/signin-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Sign In - Access Your Account",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sign In | Access Your Account",
    description: "Sign in to access your Insturix account and tools. Get back to creating content with our suite of AI-powered tools and services for content creators.",
    images: ["/icons/signin-twitter-image.jpg"],
  },
};

export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 