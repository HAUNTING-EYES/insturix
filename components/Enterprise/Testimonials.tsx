"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const testimonials = [
  {
    quote: "Insturix has revolutionized our post-production workflow. Editron allows our team to output 10x the content volume without sacrificing quality. It's not just a tool; it's our entire production backbone.",
    author: "Sarah Chen",
    role: "VP of Content",
    company: "StreamLine Media",
    logo: "https://html.tailus.io/blocks/customers/nike.svg", // Placeholder logo
    image: "https://tailus.io/images/reviews/shekinah.webp", // Placeholder image
    initials: "SC",
    className: "sm:col-span-2 lg:row-span-2",
  },
  {
    quote: "Brand safety is paramount for our roster of 500+ influencers. Shield gives us peace of mind by automating rights management and monitoring across all platforms 24/7.",
    author: "Marcus Thorne",
    role: "Head of Legal",
    company: "TalentFirst Agency",
    image: "https://tailus.io/images/reviews/jonathan.webp",
    initials: "MT",
    className: "md:col-span-2",
  },
  {
    quote: "The analytics from Alyzitron are a game-changer. We no longer guess what will perform; we know. Our engagement rates have doubled since integrating Insturix.",
    author: "Elena Rodriguez",
    role: "CMO",
    company: "BuzzWave",
    image: "https://tailus.io/images/reviews/yucel.webp",
    initials: "ER",
    className: "",
  },
  {
    quote: "ThinkForge has completely transformed our ideation process. We're generating data-backed concepts in minutes that used to take days of brainstorming.",
    author: "Jessica Alverez",
    role: "Creative Director",
    company: "ViralStudios",
    image: "https://tailus.io/images/reviews/rodrigo.webp",
    initials: "JA",
    className: "",
  },
  {
    quote: "The enterprise support is unmatched. When we have a critical launch, we know the Insturix team is right there with us ensuring everything runs smoothly.",
    author: "Tom Baker",
    role: "CTO",
    company: "NextGen Media",
    initials: "TB",
    className: "md:col-span-2",
  },
  {
    quote: "Managing assets across global teams was a nightmare until we switched to Insturix. The centralized workspace has saved us thousands of hours.",
    author: "David Kim",
    role: "Director of Ops",
    company: "GlobalCreators",
    initials: "DK",
    className: "md:col-span-2",
  },
];

export default function Testimonials() {
  return (
    <section className="py-24 bg-neutral-950 text-neutral-50 relative overflow-hidden">
      {/* Background Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="container mx-auto px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 text-center max-w-3xl mx-auto"
        >
          <h2 className="text-[44px] md:text-[44px] font-bold tracking-tight mb-6">
            Built by makers, loved by thousands of teams
          </h2>
          <p className="text-lg text-neutral-400">
            Insturix is evolving to be more than just a tool suite. It's the infrastructure that helps businesses innovate at scale.
          </p>
        </motion.div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-rows-3">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              className={testimonial.className}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="h-full bg-zinc-900/50 border-zinc-800 backdrop-blur-sm flex flex-col justify-between hover:border-zinc-700 transition-colors">
                {testimonial.logo && (
                  <CardHeader className="pb-2">
                    <img
                      className="h-6 w-fit opacity-50 grayscale invert"
                      src={testimonial.logo}
                      alt={`${testimonial.company} Logo`}
                    />
                  </CardHeader>
                )}
                <CardContent className={`pt-6 ${!testimonial.logo ? 'h-full' : ''} flex flex-col justify-between`}>
                  <blockquote className="space-y-6 flex flex-col h-full justify-between">
                    <p className={`${testimonial.className.includes('col-span-2') ? 'text-[18px]' : 'text-[14px]'} font-medium text-zinc-200 leading-relaxed`}>
                      "{testimonial.quote}"
                    </p>

                    <div className="flex items-center gap-3">
                      <Avatar className="size-10 border border-zinc-800">
                        {testimonial.image && (
                          <AvatarImage
                            src={testimonial.image}
                            alt={testimonial.author}
                            loading="lazy"
                          />
                        )}
                        <AvatarFallback className="bg-zinc-800 text-zinc-400 text-[11px]">
                          {testimonial.initials}
                        </AvatarFallback>
                      </Avatar>

                      <div>
                        <cite className="text-sm font-medium text-zinc-100 not-italic">
                          {testimonial.author}
                        </cite>
                        <span className="text-zinc-500 block text-[11px]">
                          {testimonial.role}, {testimonial.company}
                        </span>
                      </div>
                    </div>
                  </blockquote>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
