import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | Creator Control Center",
  description:
    "Access all your Insturix tools, analytics, and account settings in one convenient dashboard designed to streamline your creator workflow.",
  keywords:
    "creator dashboard, content analytics, creator tools, account management, Insturix dashboard",
  openGraph: {
    title: "Dashboard | Creator Control Center",
    description:
      "Access all your Insturix tools, analytics, and account settings in one convenient dashboard designed to streamline your creator workflow.",
    images: [
      {
        url: "/icons/dashboard-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Dashboard - Creator Control Center",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dashboard | Creator Control Center",
    description:
      "Access all your Insturix tools, analytics, and account settings in one convenient dashboard designed to streamline your creator workflow.",
    images: ["/icons/dashboard-twitter-image.jpg"],
  },
}; 