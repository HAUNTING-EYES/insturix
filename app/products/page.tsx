"use client";

import { motion } from "framer-motion";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { ProductsPage } from "@/components/ProductPages";

export default function Products() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <motion.main
        className="grow flex items-center justify-center p-4"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <ProductsPage />
        </motion.div>
      </motion.main>
      <Footer />
    </div>
  );
}
