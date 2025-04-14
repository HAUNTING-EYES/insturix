import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join the Waitlist | Early Access",
  description: "Be among the first to experience Insturix's revolutionary creator tools. Join our waitlist for early access and exclusive updates on our upcoming releases.",
  keywords: "Insturix waitlist, early access, creator tools , product launch, exclusive updates",
  openGraph: {
    title: "Join the Waitlist | Early Access",
    description: "Be among the first to experience Insturix's revolutionary creator tools. Join our waitlist for early access and exclusive updates on our upcoming releases.",
    images: [
      {
        url: "/icons/waitlist-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Join Insturix Waitlist - Early Access",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Join the Waitlist | Early Access",
    description: "Be among the first to experience Insturix's revolutionary creator tools. Join our waitlist for early access and exclusive updates on our upcoming releases.",
    images: ["/icons/waitlist-twitter-image.jpg"],
  },
};

export default function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 