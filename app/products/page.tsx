import { SiteNavbar } from "@/components/shared/site-navbar";
import { SiteFooter } from "@/components/shared/site-footer";
import { ProductsPage } from "@/components/shared/products/products-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Products | Insturix",
  description: "Six steps between your idea and a published video. Script, edit, analyze, design, score, and distribute — all from one platform.",
};

export default function Products() {
  return (
    <>
      <SiteNavbar />
      <ProductsPage />
      <SiteFooter />
    </>
  );
}