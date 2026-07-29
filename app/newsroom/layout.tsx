import { Metadata } from "next";

export const metadata: Metadata = {
  alternates: { canonical: "/newsroom" },
  title: "Newsroom | Stay Updated",
  description:
    "Stay updated with the latest news and announcements from Insturix. Get the latest insights, updates, and announcements about our products, services, and more.",
  keywords:
    "Newsroom Insturix , Stay Updated , Insturix news , News updates , Announcements at Insturix , Latest news , Updates at Insturix",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/newsroom",
    siteName: "Insturix",
    title: "Newsroom | Stay Updated",
    description:
      "Stay updated with the latest news and announcements from Insturix. Get the latest insights, updates, and announcements about our products, services, and more.",
    images: [
      {
        url: "/icons/contact-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Newsroom Insturix - Stay Updated",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Newsroom | Stay Updated",
    description:
    "Stay updated with the latest news and announcements from Insturix. Get the latest insights, updates, and announcements about our products, services, and more.",
    images: ["/icons/newsroom-twitter-image.jpg"],
  },
};

export default function NewsroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}