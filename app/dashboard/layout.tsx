"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { useAuth } from "@clerk/nextjs";
import NotSignedIn from "@/components/NotSignedup";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | Creator Control Center",
  description: "Access all your Insturix tools, analytics, and account settings in one convenient dashboard designed to streamline your creator workflow.",
  keywords: "creator dashboard, content analytics, creator tools, account management, Insturix dashboard",
  openGraph: {
    title: "Dashboard | Creator Control Center",
    description: "Access all your Insturix tools, analytics, and account settings in one convenient dashboard designed to streamline your creator workflow.",
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
    description: "Access all your Insturix tools, analytics, and account settings in one convenient dashboard designed to streamline your creator workflow.",
    images: ["/icons/dashboard-twitter-image.jpg"],
  },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  if (!isSignedIn) {
    return <NotSignedIn />;
  }
  return (
    <>
      <DashboardSidebar />
      <main className="min-h-screen bg-zinc-950/95 backdrop-blur-xl lg:pl-[64px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="min-h-screen"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </>
  );
}
