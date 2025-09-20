import { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ICS25ClientContent from "@/components/ICS25ClientContent";

export const metadata: Metadata = {
  title: "ICS'25 - Insturix Creator's Summit 2025",
  description: "Join the biggest creator event of 2025. Where creators collide, collaborate & create magic. Live competitions, AI tools showcase, networking and more.",
  alternates: {
    canonical: "/ics25",
  },
  openGraph: {
    title: "ICS'25 - Insturix Creator's Summit 2025",
    description: "Join the biggest creator event of 2025. Where creators collide, collaborate & create magic.",
    images: [
      {
        url: "/icons/ics25-og.jpg",
        width: 1200,
        height: 630,
        alt: "ICS'25 - Insturix Creator's Summit 2025",
      },
    ],
  },
};

export default function ICS25Page() {
  return (
    <div className="relative min-h-screen bg-white dark:bg-zinc-900 overflow-x-hidden">
      <Navbar />
      <ICS25ClientContent />
      <Footer />
    </div>
  );
}