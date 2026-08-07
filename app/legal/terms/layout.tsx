import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Insturix",
  description:
    "Read our Terms of Service to understand how you can use Insturix's services and products.",
  keywords:
    "Terms of Service Insturix , Insturix terms , Insturix terms of service , Insturix terms of use , Insturix terms of conditions",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/legal/terms",
    siteName: "Insturix",
    title: "Terms of Service | Insturix",
    description:
      "Read our Terms of Service to understand how you can use Insturix's services and products.",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Terms of Service Insturix",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Service | Insturix",
    description:
      "Read our Terms of Service to understand how you can use Insturix's services and products.",
    images: ["/icons/twitter-image.jpg"],
  },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}