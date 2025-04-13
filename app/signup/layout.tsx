import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up | Join Our Creator Community",
  description: "Create your Insturix account today and gain access to powerful AI tools, creator protection services, and resources designed to elevate your content creation.",
  keywords: "Insturix signup, creator account creation, join creator platform, content creation tools, AI tools account",
  openGraph: {
    title: "Sign Up | Join Our Creator Community",
    description: "Create your Insturix account today and gain access to powerful AI tools, creator protection services, and resources designed to elevate your content creation.",
    images: [
      {
        url: "/icons/signup-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Sign Up - Join Our Creator Community",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sign Up | Join Our Creator Community",
    description: "Create your Insturix account today and gain access to powerful AI tools, creator protection services, and resources designed to elevate your content creation.",
    images: ["/icons/signup-twitter-image.jpg"],
  },
};

export default function SignUpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 