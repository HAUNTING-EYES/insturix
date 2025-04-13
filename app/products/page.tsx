import { Metadata } from "next";
import dynamic from "next/dynamic";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";

const ClientProductsPage = dynamic(() => import("@/components/ProductPages"), { ssr: true });
const ClientMotionWrapper = dynamic(() => import("@/components/MotionWrapper"), { ssr: false });

export const metadata: Metadata = {
  title: "Products | Insturix",
  description: "Discover Insturix's suite of AI-powered tools for content creators, including video editing, analytics, influencer protection, and brand collaborations.",
  alternates: {
    canonical: "/products",
  },
  openGraph: {
    title: "Products | Insturix",
    description: "Discover Insturix's suite of AI-powered tools for content creators, including video editing, analytics, influencer protection, and brand collaborations.",
    url: "/products",
    type: "website",
    images: [
      {
        url: "/icons/products-og.jpg",
        width: 1200,
        height: 630,
        alt: "Insturix Products",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Products | Insturix",
    description: "Discover Insturix's suite of AI-powered tools for content creators, including video editing, analytics, influencer protection, and brand collaborations.",
    images: ["/icons/products-twitter.jpg"],
  },
};

export default function Products() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <ClientMotionWrapper>
        <ClientProductsPage />
      </ClientMotionWrapper>
      <Footer />
    </div>
  );
}
