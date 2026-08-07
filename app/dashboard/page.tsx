import DashboardClientPage from "@/components/dashboard/DashboardClientPage";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insturix Dashboard | Creator & Brand Command Center",
  description: "The Insturix Dashboard is your AI-powered control center to manage content, track analytics, handle brand deals, and access all Insturix tools in one place.",
  keywords: "creator dashboard, Insturix Dashboard, content analytics, brand deal management, AI tools for creators, creator business hub, influencer platform",
  openGraph: {
    title: "Insturix Dashboard | Creator & Brand Command Center",
    description: "Manage all your content, campaigns, and AI tools from one smart dashboard. Insturix Dashboard brings analytics, deals, and growth tools together in one place.",
    images: [
      {
        url: "/icons/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Dashboard - Creator & Brand Intelligence Hub",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Insturix Dashboard | Creator & Brand Command Center",
    description: "All your Insturix tools and insights, now in one smart dashboard. Track performance, manage deals, and grow faster with AI.",
    images: ["/icons/twitter-image.jpg"],
  },
};

export default function DashboardPage() {
  return <DashboardClientPage />;
}
