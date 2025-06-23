import Dashboard from "@/components/dashboard/Dashboard";
import CursorEffect from "@/components/ui/CursorEffect";
import DashboardShell from "@/components/dashboard/DashboardShell";
import { FeatureUsageOverviewWrapper } from "@/components/dashboard/FeatureUsageOverviewWrapper";
import { Metadata } from "next";

const THEME = {
  color: "rgba(255, 255, 255, 0.05)",
  gradient: {
    from: "from-white/40",
    to: "to-white/60",
  },
};

export const metadata: Metadata = {
  title: "Insturix Dashboard | Creator & Brand Command Center",
  description: "The Insturix Dashboard is your AI-powered control center to manage content, track analytics, handle brand deals, and access all Insturix tools in one place.",
  keywords: "creator dashboard, Insturix Dashboard, content analytics, brand deal management, AI tools for creators, creator business hub, influencer platform",
  openGraph: {
    title: "Insturix Dashboard | Creator & Brand Command Center",
    description: "Manage all your content, campaigns, and AI tools from one smart dashboard. Insturix Dashboard brings analytics, deals, and growth tools together in one place.",
    images: [
      {
        url: "/icons/products/insturix-dashboard-og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Dashboard - Creator & Brand Intelligence Hub",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Insturix Dashboard | Creator & Brand Command Center",
    description: "All your Insturix tools and insights—now in one smart dashboard. Track performance, manage deals, and grow faster with AI.",
    images: ["/icons/products/insturix-dashboard-twitter-image.jpg"],
  },
};

export default function DashboardPage() {
  return (
    <>
      <Dashboard />
      <CursorEffect variant="glow" color={THEME.color} size={500} blur={100} />
      <DashboardShell>
        {/* Feature Usage Overview */}
        <div className="mb-8">
          <FeatureUsageOverviewWrapper />
        </div>
      </DashboardShell>
    </>
  );
}
