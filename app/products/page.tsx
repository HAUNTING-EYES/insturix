"use client";

import dynamic from "next/dynamic";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import ProductPageWrapper from "@/components/ProductPageWrapper";

import UniversalLoader from "@/components/Loader/UniversalLoader";

const ClientProductsPage = dynamic(() => import("@/components/ProductPages"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center min-h-[70vh]">
      <UniversalLoader />
    </div>
  ),
});

export default function Products() {
  return (
    <div className="flex flex-col min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))]">
      <Navbar />
      <ProductPageWrapper>
        <ClientProductsPage />
      </ProductPageWrapper>
      <Footer />
    </div>
  );
}