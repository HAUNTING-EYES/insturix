"use client";
import { useRef } from "react";
import { motion, useScroll, useTransform, MotionValue } from "framer-motion";
import { Products } from "./data/product-data";
import { ArrowDownIcon, ArrowRightIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { ProductFlowDiagram } from "./ProductFlowDiagram";
import Image from "next/image";

export default function ProductsPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });

  const productStart = 0.18;
  const productStep = (1 - productStart) / Products.length;

  return (
    <div
      ref={containerRef}
      className="relative scroll-smooth"
      style={{ scrollSnapType: "y mandatory" }}
    >
      <div style={{ height: "900vh" }} className="w-full relative">
        {/* Invisible snap point markers */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="h-screen snap-start" />
          <div className="h-screen snap-start" />
          {Products.map((_, i) => (
            <div key={i} className="h-screen snap-start" />
          ))}
        </div>

        {/* === STICKY VIEWPORT === */}
        <div className="sticky top-0 h-screen pt-16">
          {/* Dynamic Background - Light Mode */}
          <motion.div
            className="absolute inset-0 transition-colors duration-700 dark:hidden pointer-events-none"
            style={{
              backgroundColor: useTransform(
                scrollYProgress,
                [
                  0,
                  0.08,
                  0.18,
                  ...Products.map(
                    (_, i) => productStart + (i + 0.5) * productStep
                  ),
                ],
                [
                  "#fafafa",
                  "#fafafa",
                  "#fafafa",
                  ...Products.map((p) => `${p.accentColor || "#6366f1"}08`),
                ]
              ),
            }}
          />

          {/* Dynamic Background - Dark Mode */}
          <motion.div
            className="absolute inset-0 hidden dark:block transition-colors duration-700 pointer-events-none"
            style={{
              backgroundColor: useTransform(
                scrollYProgress,
                [
                  0,
                  0.08,
                  0.18,
                  ...Products.map(
                    (_, i) => productStart + (i + 0.5) * productStep
                  ),
                ],
                [
                  "#000000",
                  "#000000",
                  "#0a0a0a",
                  ...Products.map((p) => `${p.accentColor || "#6366f1"}12`),
                ]
              ),
            }}
          />

          {/* === PHASE 1: INTRO === */}
          <motion.section
            className="absolute inset-0 flex flex-col items-center justify-center z-10 snap-center pointer-events-none"
            style={{
              opacity: useTransform(scrollYProgress, [0, 0.06], [1, 0]),
              scale: useTransform(scrollYProgress, [0, 0.08], [1, 0.95]),
            }}
          >
            <div className="text-center space-y-6 px-4">
              <motion.h1
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter text-neutral-900 dark:text-white"
              >
                The Suite.
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 1, delay: 0.3 }}
                className="text-lg md:text-xl text-neutral-500 dark:text-neutral-400 max-w-lg mx-auto"
              >
                Seven AI-powered tools. One creative ecosystem.
              </motion.p>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 1 }}
                className="flex items-center justify-center gap-2 text-neutral-400 mt-16"
              >
                <ArrowDownIcon className="w-5 h-5 animate-bounce" />
              </motion.div>
            </div>
          </motion.section>

          {/* === PHASE 2: OVERVIEW === */}
          <motion.section
            className="absolute inset-x-0 bottom-0 top-20 md:top-28 flex flex-col items-center justify-start md:justify-center z-20 snap-center overflow-hidden overflow-y-auto pointer-events-none"
            style={{
              opacity: useTransform(
                scrollYProgress,
                [0.06, 0.1, 0.16, 0.2],
                [0, 1, 1, 0]
              ),
              scale: useTransform(
                scrollYProgress,
                [0.06, 0.1, 0.16, 0.2],
                [0.95, 1, 1, 1.02]
              ),
            }}
          >
            <ProductFlowDiagram scrollProgress={scrollYProgress} />
            <motion.div
              className="absolute bottom-8 text-center text-neutral-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.5 }}
            >
              <ArrowDownIcon className="w-5 h-5 mx-auto animate-bounce" />
            </motion.div>
          </motion.section>

          {/* === PHASE 3: PRODUCT DETAILS === */}
          {Products.map((product, index) => {
            const start = productStart + index * productStep;
            const peak = start + productStep * 0.5;
            const end = start + productStep;
            return (
              <ProductSection
                key={product.Id}
                product={product}
                index={index}
                progress={scrollYProgress}
                start={start}
                peak={peak}
                end={end}
              />
            );
          })}

          {/* Progress indicator */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-50 pointer-events-none"
            style={{
              opacity: useTransform(scrollYProgress, [0.16, 0.2], [0, 1]),
            }}
          >
            {Products.map((product, i) => {
              const start = productStart + i * productStep;
              const end = start + productStep;
              return (
                <motion.div
                  key={i}
                  className="w-10 h-1 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800"
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      width: useTransform(
                        scrollYProgress,
                        [start, end],
                        ["0%", "100%"]
                      ),
                      backgroundColor: product.accentColor,
                    }}
                  />
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </div>
    </div>
  );
}

// Full-screen product section
const ProductSection = ({
  product,
  index,
  progress,
  start,
  peak,
  end,
}: {
  product: any;
  index: number;
  progress: MotionValue<number>;
  start: number;
  peak: number;
  end: number;
}) => {
  const isEven = index % 2 === 0;

  const opacity = useTransform(
    progress,
    [start, start + 0.02, end - 0.02, end],
    [0, 1, 1, 0]
  );
  const y = useTransform(
    progress,
    [start, start + 0.04, end - 0.04, end],
    [80, 0, 0, -80]
  );

  const visualX = useTransform(
    progress,
    [start, start + 0.05, end - 0.05, end],
    [isEven ? 80 : -80, 0, 0, isEven ? -40 : 40]
  );
  const visualOpacity = useTransform(
    progress,
    [start, start + 0.04, end - 0.04, end],
    [0, 1, 1, 0]
  );
  const visualScale = useTransform(
    progress,
    [start, start + 0.05, end - 0.05, end],
    [0.9, 1, 1, 0.95]
  );

  return (
    <motion.section
      className="absolute inset-x-0 bottom-0 top-20 md:top-28 flex items-center justify-center z-30 snap-center pointer-events-none"
      style={{ opacity }}
    >
      <div className="container max-w-7xl mx-auto px-6 md:px-12 pt-0">
        <div
          className={`flex flex-col lg:flex-row items-center gap-6 lg:gap-20 ${!isEven ? "lg:flex-row-reverse" : ""}`}
        >
          {/* Text Content */}
          <motion.div className="flex-1 space-y-3 md:space-y-6" style={{ y }}>
            {/* Tag */}
            <div className="flex items-center gap-3">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: product.accentColor }}
              />
              <span className="text-sm font-medium tracking-widest uppercase text-neutral-500 dark:text-neutral-400">
                {product.tags?.[0] || "AI Tool"}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-neutral-900 dark:text-white leading-none">
              {product.name}
            </h2>

            {/* Description */}
            <p className="text-base md:text-lg text-neutral-600 dark:text-neutral-300 leading-relaxed max-w-lg">
              {product.longDescription || product.description}
            </p>

            {/* Features - Hidden on mobile */}
            <div className="hidden md:grid grid-cols-2 gap-3 pt-2">
              {product.features
                ?.slice(0, 4)
                .map((feature: string, i: number) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400"
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: product.accentColor }}
                    />
                    <span className="truncate">{feature}</span>
                  </div>
                ))}
            </div>

            {/* CTA */}
            <div className="flex items-center gap-4 pt-2 md:pt-4 pointer-events-auto z-50">
              <Link
                href={product.dashboard_href}
                className="group inline-flex items-center gap-2 px-4 md:px-6 py-2 md:py-3 rounded-full font-semibold text-sm md:text-base text-white transition-all hover:scale-102 active:scale-95 shadow-lg cursor-pointer"
                style={{
                  backgroundColor: product.accentColor,
                  boxShadow: `0 8px 24px -4px ${product.accentColor}40`,
                }}
              >
                {product.cta}
                <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href={product.product_href}
                className="text-sm font-medium text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Learn more →
              </Link>
            </div>
          </motion.div>

          {/* Previews */}
          <motion.div
            className="flex-1 w-full max-w-xl lg:max-w-none pointer-events-none"
            style={{ x: visualX, opacity: visualOpacity, scale: visualScale }}
          >
            <div
              className="relative aspect-[4/3] md:aspect-[4/3] rounded-3xl overflow-hidden max-h-[35vh] md:max-h-none"
              style={{
                background: `linear-gradient(145deg, ${product.accentColor}12, ${product.accentColor}05)`,
                border: `1px solid ${product.accentColor}20`,
              }}
            >
              <div className="absolute inset-4 rounded-2xl bg-white/60 dark:bg-black/40 backdrop-blur-sm border border-white/30 dark:border-white/10 overflow-hidden">
                <div className="relative w-full h-full">
                  <Image
                    src={product.image_src}
                    alt={`${product.name} preview`}
                    fill
                    quality={100}
                    className="object-cover"
                    priority={index === 0}
                  />
                </div>
              </div>
              {/* Decorative blob */}
              <div
                className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-40"
                style={{ backgroundColor: product.accentColor }}
              />
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
};