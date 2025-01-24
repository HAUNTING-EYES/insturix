"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Quote } from "lucide-react";
import Image from "next/image";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type Testimonial = {
  quote: string;
  name: string;
  designation: string;
  src: string;
};

export const Testimonials = ({
  testimonials,
  className,
}: {
  testimonials: Testimonial[];
  className?: string;
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [imageLoading, setImageLoading] = useState(true);

  useEffect(() => {
    setImageLoading(true);
  }, [activeIndex]);

  const slideVariants = {
    enter: (direction: number) => ({
      y: direction > 0 ? 50 : -50,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      y: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.6,
        ease: [0.32, 0.72, 0, 1],
      },
    },
    exit: (direction: number) => ({
      y: direction < 0 ? 50 : -50,
      opacity: 0,
      scale: 0.95,
      transition: {
        duration: 0.6,
        ease: [0.32, 0.72, 0, 1],
      },
    }),
  };

  const paginate = (newDirection: number) => {
    setDirection(newDirection);
    setActiveIndex(
      (prev) =>
        (prev + newDirection + testimonials.length) % testimonials.length
    );
  };

  return (
    <div className={cn("relative overflow-hidden py-4", className)}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Image Section */}
        <div className="relative h-[320px] md:h-[300px] w-full rounded-2xl overflow-hidden">
          {/* Permanent placeholder */}
          <motion.div
            className="absolute inset-0 bg-muted"
            initial={false}
            animate={{ opacity: imageLoading ? 1 : 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="absolute inset-0 bg-linear-to-r from-neutral-200 via-neutral-300 to-neutral-200 dark:from-neutral-800 dark:via-neutral-700 dark:to-neutral-800 bg-[length:200%_100%] animate-shimmer" />
          </motion.div>

          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.div
              key={activeIndex}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0 overflow-hidden"
            >
              <motion.div
                className="relative w-full h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                <Image
                  src={testimonials[activeIndex].src}
                  alt={testimonials[activeIndex].name}
                  fill
                  className="object-cover object-center rounded-2xl"
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                  onLoadingComplete={() => setImageLoading(false)}
                />
                <div className="absolute inset-0 bg-linear-to-t from-background/90 via-background/50 to-transparent" />
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Content Section */}
        <div className="relative flex flex-col h-full md:min-h-[300px] justify-between py-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
              className="space-y-6"
            >
              {/* Name and Role */}
              <div className="space-y-1">
                <h3 className="text-2xl font-semibold tracking-tight primtext">
                  {testimonials[activeIndex].name}
                </h3>
                <p className="text-base text-muted-foreground font-medium">
                  {testimonials[activeIndex].designation}
                </p>
              </div>

              {/* Quote */}
              <div className="relative">
                <Quote className="absolute -left-1 -top-1 w-8 h-8 text-primary/10" />
                <blockquote className="pt-6 pl-6 text-lg leading-relaxed tracking-normal text-muted-foreground">
                  &quot;{testimonials[activeIndex].quote}&quot;
                </blockquote>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Navigation */}
          <div className="flex items-center gap-6 pt-8">
            <button
              onClick={() => paginate(-1)}
              className="p-3 rounded-full hover:bg-primary/5 transition-colors"
              aria-label="Previous testimonial"
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </button>

            <div className="flex-1 flex justify-center gap-3">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setDirection(index > activeIndex ? 1 : -1);
                    setActiveIndex(index);
                  }}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all duration-300",
                    index === activeIndex
                      ? "bg-primary w-6"
                      : "bg-primary/20 hover:bg-primary/40"
                  )}
                  aria-label={`Go to testimonial ${index + 1}`}
                />
              ))}
            </div>

            <button
              onClick={() => paginate(1)}
              className="p-3 rounded-full hover:bg-primary/5 transition-colors"
              aria-label="Next testimonial"
            >
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
