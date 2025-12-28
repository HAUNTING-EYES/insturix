"use client";

import { Metadata } from "next";
import dynamic from "next/dynamic";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import ProductPageWrapper from "@/components/ProductPageWrapper";
import CursorEffect from "@/components/ui/CursorEffect";

const ClientProductsPage = dynamic(() => import("@/components/ProductPages"), {
  ssr: true,
});

export default function Products() {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))]">
       <CursorEffect
              variant="glow"
              color="rgba(59, 130, 246, 0.15)"
              size={500}
              blur={100}
            />
      <Navbar />
      <ProductPageWrapper>
        <ClientProductsPage />
      </ProductPageWrapper>
      <Footer />
    </div>
  );
}