"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, MotionValue } from "framer-motion";
import { product } from "./data/product-data";
import { ArrowRightIcon, Cross2Icon, CheckIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface ImmersiveProductSectionProps {
  product: product;
  index: number;
  style?: any; // For framer-motion styles passed from parent
}

export const ImmersiveProductSection = ({ product, index, style }: ImmersiveProductSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isEven = index % 2 === 0;

  // Lock body scroll when expanded
  useEffect(() => {
    if (isExpanded) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => { document.body.style.overflow = "unset"; };
  }, [isExpanded]);

  const toggleExpand = () => setIsExpanded(!isExpanded);

  return (
    <>
      <motion.div
        className={cn(
            "w-full max-w-5xl mx-auto rounded-[2rem] overflow-hidden relative shadow-2xl",
            "bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl border border-neutral-200 dark:border-neutral-800",
            "flex flex-col md:flex-row items-stretch",
            "h-[60vh] md:h-[500px]" // Fixed height for card look
        )}
        style={style}
      >
        {/* Decorative Background Blob inside card */}
        <div 
            className="absolute -right-20 -top-20 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{ background: product.accentColor }}
        />

        {/* Visual Half */}
        <div className={cn("w-full md:w-1/2 relative overflow-hidden group cursor-pointer", isEven ? "md:order-1" : "md:order-2")} onClick={toggleExpand}>
            <div className="absolute inset-0 bg-neutral-100 dark:bg-neutral-800 transition-transform duration-700 group-hover:scale-105">
                 {/* Placeholder for Video/Image */}
                 <div className="absolute inset-0 flex items-center justify-center">
                    <product.Icon className="w-20 h-20 opacity-10" style={{ color: product.accentColor }} />
                 </div>
                 
                 {/* Gradient Overlay */}
                 <div 
                   className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                   style={{ background: `linear-gradient(135deg, ${product.accentColor}20, transparent)` }}
                 />
            </div>

            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                <div className="bg-white/90 dark:bg-black/90 text-[11px] font-bold px-4 py-2 rounded-full shadow-lg backdrop-blur-sm">
                    VIEW DETAILS
                </div>
            </div>
        </div>

        {/* Content Half */}
        <div className={cn("w-full md:w-1/2 p-8 md:p-12 flex flex-col justify-center relative z-10", isEven ? "md:order-2" : "md:order-1")}>
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-neutral-100 dark:bg-neutral-800">
                         <product.Icon className="w-6 h-6" style={{ color: product.accentColor }} />
                    </div>
                    <span className="text-sm font-bold tracking-wider text-neutral-500 uppercase">{product.tags[0]}</span>
                </div>

                <h2 className="text-[32px] md:text-[44px] font-bold text-neutral-900 dark:text-white leading-tight">
                    {product.name}
                </h2>

                <p className="text-neutral-600 dark:text-neutral-400 leading-relaxed">
                    {product.description}
                </p>

                <div className="pt-4 flex items-center gap-4">
                    <button 
                        onClick={toggleExpand}
                        className="text-sm font-semibold border-b-2 border-neutral-900 dark:border-white pb-0.5 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                    >
                        Learn More
                    </button>
                    <Link href={product.dashboard_href} className="text-sm font-semibold text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors">
                        Try Demo
                    </Link>
                </div>
            </div>
        </div>
      </motion.div>

      {/* Expanded Modal Overlay */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-neutral-950/20 backdrop-blur-xl"
            onClick={(e) => { if(e.target === e.currentTarget) toggleExpand() }}
          >
            <motion.div
              layoutId={`visual-${product.name}`}
              className="w-full max-w-6xl h-full max-h-[90vh] bg-white dark:bg-neutral-950 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col md:flex-row"
              onClick={(e) => e.stopPropagation()}
            >
              <button 
                onClick={toggleExpand}
                className="absolute top-6 right-6 z-20 p-2 rounded-full bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20 transition-colors"
              >
                <Cross2Icon className="w-6 h-6" />
              </button>

              {/* Enhanced Visual Side */}
              <div className="w-full md:w-1/2 h-64 md:h-full relative bg-neutral-100 dark:bg-neutral-900">
                <div className="absolute inset-0 flex items-center justify-center p-12">
                   <div 
                     className="w-full h-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black shadow-lg flex items-center justify-center relative overflow-hidden"
                   >
                     {/* Just a bigger placeholder for now */}
                      <div className="text-center">
                        <product.Icon className="w-24 h-24 mx-auto mb-4 opacity-20" />
                        <span className="text-sm font-mono opacity-50 uppercase tracking-widest">Interactive Demo Loading...</span>
                      </div>
                      
                      {/* Decorative gradient blob */}
                      <div className="absolute -bottom-24 -right-24 w-64 h-64 rounded-full blur-3xl opacity-30" style={{ background: product.accentColor }} />
                   </div>
                </div>
              </div>

              {/* Detailed Content Side */}
              <div className="w-full md:w-1/2 h-full overflow-y-auto p-8 md:p-12 lg:p-16 scrollbar-hide">
                 <div className="space-y-10">
                   <div>
                     <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-900">
                          <product.Icon className="w-8 h-8" style={{ color: product.accentColor }} />
                        </div>
                        <h3 className="text-[32px] font-bold">{product.name}</h3>
                     </div>
                     <p className="text-lg leading-relaxed text-neutral-600 dark:text-neutral-300">
                       {product.longDescription}
                     </p>
                   </div>

                   {/* Features List */}
                   <div className="space-y-6">
                     <h4 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Key Features</h4>
                     <ul className="space-y-4">
                       {product.features.map((feature, i) => (
                         <li key={i} className="flex items-start gap-4 p-4 rounded-xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-100 dark:border-neutral-800 transition-colors hover:border-neutral-200 dark:hover:border-neutral-700">
                           <div className="mt-1 p-1 rounded-full bg-green-500/10 text-green-500">
                             <CheckIcon className="w-3.5 h-3.5" />
                           </div>
                           <span className="font-medium">{feature}</span>
                         </li>
                       ))}
                     </ul>
                   </div>

                   {/* Tags */}
                   <div className="flex flex-wrap gap-2 pt-4">
                     {product.tags.map(tag => (
                       <span key={tag} className="px-3 py-1 text-[11px] font-medium rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                         #{tag}
                       </span>
                     ))}
                   </div>

                   <div className="pt-8 border-t border-neutral-200 dark:border-neutral-800 flex gap-4">
                      <Link 
                        href={product.dashboard_href}
                        className="flex-1 py-4 text-center rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
                      >
                        Launch App
                      </Link>
                      <Link 
                        href={product.product_href}
                        className="flex-1 py-4 text-center rounded-xl font-bold border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
                      >
                        View More Info
                      </Link>
                   </div>
                 </div>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
