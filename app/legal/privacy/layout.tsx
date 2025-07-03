import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Insturix",
  description:
    "Read our Privacy Policy to understand how we collect, use, and protect your personal information.",
  keywords:
    "Privacy Policy Insturix , Insturix privacy , Insturix privacy policy , Insturix privacy settings , Insturix data protection",
  openGraph: {
    title: "Privacy Policy | Insturix",
    description:
      "Read our Privacy Policy to understand how we collect, use, and protect your personal information.",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Privacy Policy Insturix",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | Insturix",
    description:
      "Read our Privacy Policy to understand how we collect, use, and protect your personal information.",
    images: ["/icons/privacy-twitter-image.jpg"],
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}