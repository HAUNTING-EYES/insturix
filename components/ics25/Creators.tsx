"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Instagram, Twitch, Twitter, Youtube, Linkedin } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import styles from "./Creators.module.css";
import ImageWithSkeleton from "@/components/ics25/ImageWithSkeleton";

// TODO: Replace with actual creator data
const creators = [
  {
    id: 1,
    name: "Martin Noronha",
    handle: "@techinmartin",
    avatar: "/creators/martin.jpg", // Replace with actual avatar path
    category: "Video Education, Tech, AI",
    followers: "5M+",
    description: " Martin Noronha is a visionary filmmaker and co-founder of AevyTV, pioneering India's largest video mastery education platform through innovative tech and AI integration.",
    socials: {
      instagram: "https://www.instagram.com/techinmartin/?hl=en",
      youtube: "https://www.youtube.com/@techinmartin",
      linkedin: "https://in.linkedin.com/in/techinmartin",
    },
  },
  {
    id: 2,
    name: "Saumya Awasthi",
    handle: "@iamsaumyaawasthi",
    avatar: "/creators/saumya.jpg",
    category: "AI-focused Software Engineer, Tech Content Creator",
    followers: "600K+",
    verified: true,
    description: "Saumya Awasthi is a seasoned software engineer and tech content creator who leverages her expertise to empower and guide aspiring professionals through insightful career tips and technical knowledge shared across social platforms.",
    socials: {
      instagram: "https://www.instagram.com/iamsaumyaawasthi/",
      youtube: "https://www.youtube.com/@TechWithSaumya",
      linkedin: "https://in.linkedin.com/in/saumyaawasthi",
    },
  },
  {
    id: 3,
    name: "Abhinav Gupta",
    handle: "@abhinavsayshi",
    avatar: "/creators/abhinav.jpg",
    category: "Entrepreneur, Digital Creator, Family Business Advisor",
    followers: "300K+",
    socials: {
      instagram: "https://www.instagram.com/abhinavsayshi/?hl=en",
      youtube: "https://www.youtube.com/@abhinavsayshi",
      twitter: "https://twitter.com/abhnvx",
    },
    description: "Abhinav Gupta is an entrepreneur and CEO of Budha College, ex-founding member of 100xEngineers, and former Head of Product & Design at Avalon Scenes, now applying his expertise to transform family business and education through innovation.",
  },
  {
    id: 4,
    name: "Rajkumar",
    handle: "@therajkumar_17",
    avatar: "/creators/rajkumar.jpg",
    category: "Comedy Content Creator, Social Media Influencer",
    followers: "3M+",
    socials: {
      youtube: "https://www.youtube.com/@therajkumar_17",
      instagram: "https://www.instagram.com/therajkumar_17/",
    },
    description: "Rajkumar is a leading Indian comedy creator and social media influencer, captivating millions with his relatable, humorous videos and viral digital content.",
  },
  {
    id: 5,
    name: "Dishi Jain",
    handle: "@dishi.jain5",
    avatar: "/creators/dishi.jpg",
    category: "Digital Creator, Lifestyle Influencer, Entertainer",
    followers: "600K+",
    socials: {
      instagram: "https://www.instagram.com/dishi.jain5/",
      youtube: "https://www.youtube.com/@DishiJain20",
    },
    description: "Dishi Jain is a distinguished digital content creator and lifestyle influencer, recognized for producing authentic, high-impact entertainment and lifestyle content that effectively engages and inspires a diverse audience across major social media platforms.",
  },
  {
    id: 6,
    name: "Santosh Mishra",
    handle: "@iamsantoshmishra",
    avatar: "/creators/santosh.jpg",
    category: "Software Engineer, Tech Educator, Content Creator",
    followers: "200K+",
    socials: {
      youtube: "https://www.youtube.com/@InterviewCafe",
      instagram: "https://www.instagram.com/iamsantoshmishra/",
      linkedin: "https://www.linkedin.com/in/iamsantoshmishra/"
    },
    description: "Santosh Mishra is a skilled Microsoft software engineer and tech educator renowned for his YouTube channel 'InterviewCafe', where he provides practical career guidance, interview preparation tips, and technical education to aspiring professionals across digital platforms.",
  },
  {
    id: 7,
    name: "Chitwan Garg",
    handle: "@chitwangarg",
    avatar: "/creators/chitwan.jpg",
    category: "Fitness & Nutrition Certified Coach and Expert, Content Creator",
    followers: "2M+",
    socials: {
      youtube: "https://www.youtube.com/@Chitwangarg",
      instagram: "https://www.instagram.com/chitwangarg",
    },
    description: "Chitwan Garg is a certified nutrition coach and top fitness creator, inspiring hundreds of thousands with accessible, results-oriented nutrition and wellness content across Instagram and YouTube.",
  },
  {
    id: 8,
    name: "Ekansh Taneja",
    handle: "@ekansh_taneja_fitness",
    avatar: "/creators/ekansh.jpg",
    category: "Fitness Coach, Transformation Specialist, Content Creator",
    followers: "1.5M+",
    socials: {
      youtube: "https://www.youtube.com/@EkanshTanejaFitness",
      instagram: "https://www.instagram.com/ekansh_taneja_fitness",
    },
    description: "Ekansh Taneja is an award-winning fitness coach, ICN Gold medalist, and certified sports nutrition specialist who transformed his own health by losing over 37 kg, now helping thousands achieve dramatic results through flexible dieting, evidence-based programs, and social media influence across India.",
  },
  {
    id: 9,
    name: "Uday Sharma",
    handle: "@udaysharmaaaaa",
    avatar: "/creators/uday.jpg",
    category: "Tech Content Creator, Hackathon Mentor, Entrepreneur",
    followers: "500K+",
    socials: {
      youtube: "https://www.youtube.com/@udaysharmaminivlog",
      instagram: "https://www.instagram.com/udaysharmaaaaa/",
    },
    description: "Uday Sharma is a leading tech creator, entrepreneur, and hackathon mentor, empowering India’s youth in AI, freelancing, and digital business through his influential social platforms and community leadership.",
  },
  {
    id: 10,
    name: "Dolly Pathak",
    handle: "@dollypathak__",
    avatar: "/creators/dolly.jpg",
    category: "Comedy & Lifestyle Content Creator, Social Media Influencer",
    followers: "300K+",
    socials: {
      youtube: "https://www.youtube.com/@dollypathak796",
      instagram: "https://www.instagram.com/dollypathak__",
    },
    description: "Dolly Pathak is a rising comedy and lifestyle creator known for her engaging sketches and relatable reels, entertaining over 200,000 followers across Instagram and YouTube with a vibrant digitaldigital persona.",
  },
  {
    id: 11,
    name: "Anuj Singh",
    handle: "@anujsinghviines",
    avatar: "/creators/anuj.jpg",
    category: "Comedy Sketch Creator, Social Media Entertainer",
    followers: "2M+",
    socials: {
      youtube: "https://www.youtube.com/@anujsinghviness",
      instagram: "https://www.instagram.com/anujsinghviines",
    },
    description: "Anuj Singh is a prominent Indian digital comedian and content creator, widely recognized for his viral sketches and character-driven humor, engaging over 1.3 million followers across Instagram and YouTube with relatable and entertaining content.",
  },
  {
    id: 12,
    name: "Taiyab Alam",
    handle: "@taiyabalam0",
    avatar: "/creators/alam.jpg",
    category: "Comedy Creator & Digital Visual Artist",
    followers: "400K+",
    socials: {
      youtube: "https://www.youtube.com/@avtaarcreation9414",
      instagram: "https://www.instagram.com/taiyabalam0",
    },
    description: "Taiyab Alam is a creative comedy creator and digital visual artist, known for his relatable humor and artistic storytelling that engages over 280,000 Instagram followers and a growing audience on his YouTube channel Avtaar Creation.",
  },
];

const categoryBlurbs: Record<string, string> = {
  Gaming: "Arcade-level plays, midnight scrims, and live strat breakdowns.",
  Tech: "Engineering the future of creator tools and AI-powered workflows.",
  Comedy: "Sharp improv, viral bits, and chaos energy that never clocks out.",
  Lifestyle: "Designing aesthetics, balance, and cosmic vibes for every feed.",
  Music: "Live loops, sonic experiments, and midnight jam sessions.",
  Education: "Blueprints, growth science, and playbooks for the next wave.",
};

export default function Creators() {
  const shouldReduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [paused, setPaused] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // Precompute doubled arrays to enable seamless 50% translate loop
  const doubled = useMemo(() => creators.concat(creators), []);

  useEffect(() => setMounted(true), []);

  // Pause CSS animations when section is offscreen (battery-friendly)
  useEffect(() => {
    if (!rootRef.current) return;
    const el = rootRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setPaused(!entry.isIntersecting || entry.intersectionRatio < 0.15);
      },
      { threshold: [0, 0.15, 0.5, 1] }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Handle infinite scroll wrapping
  useEffect(() => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    
    const handleScroll = () => {
      if (isScrollingRef.current) return;
      
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;
      const scrollLeft = container.scrollLeft;
      const singleSetWidth = scrollWidth / 2; // We have 2 copies
      
      // If scrolled past the first set, wrap to beginning
      if (scrollLeft >= singleSetWidth) {
        isScrollingRef.current = true;
        container.scrollLeft = scrollLeft - singleSetWidth;
        requestAnimationFrame(() => {
          isScrollingRef.current = false;
        });
      }
      // If scrolled before the first set (bounce back), wrap to end
      else if (scrollLeft <= 0) {
        isScrollingRef.current = true;
        container.scrollLeft = singleSetWidth;
        requestAnimationFrame(() => {
          isScrollingRef.current = false;
        });
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initialize scroll position to middle
    container.scrollLeft = container.scrollWidth / 4;
    
    return () => container.removeEventListener('scroll', handleScroll);
  }, [mounted]);

  return (
    <div ref={rootRef} className="relative space-y-10" data-paused={paused}>
      <style jsx>{`
        @keyframes fadeInUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,46,230,0.18),transparent_58%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(58,158,255,0.16),transparent_60%)]" />
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[conic-gradient(from_120deg_at_50%_50%,rgba(255,255,255,0.18),rgba(58,158,255,0.08),rgba(255,46,230,0.2),transparent)] blur-3xl opacity-70" />
      </div>

      <div className="relative z-10 px-2 sm:px-4">
        <div className="mx-auto max-w-6xl">
        </div>
      </div>

      {/* Single full-bleed marquee row */}
      <div
        ref={scrollRef}
        className="relative z-10 w-screen overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ marginLeft: 'calc(50% - 50vw)', marginRight: 'calc(50% - 50vw)' }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        <div className={styles.marquee}>
          <div
            className={`${styles.track} ${styles.row}`}
            style={{ ['--marquee-duration' as any]: shouldReduceMotion ? '0s' : '46s' }}
          >
            {doubled.map((creator, i) => (
              <CreatorCard
                key={`row-${creator.id}-${i}`}
                creator={creator}
                index={i % creators.length}
                shouldReduceMotion={shouldReduceMotion}
              />
            ))}
          </div>
        </div>
      </div>

      <motion.div
        className="relative z-10 flex justify-center"
        initial={{ opacity: 0, y: 20 }}
        animate={mounted ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: shouldReduceMotion ? 0 : 0.45, delay: shouldReduceMotion ? 0 : 0.1 }}
      />
    </div>
  );
}

function CreatorCard({
  creator,
  index,
  shouldReduceMotion,
}: {
  creator: typeof creators[number];
  index: number;
  shouldReduceMotion: boolean | null;
}) {
  const blurb =
    (creator as any).description ||
    categoryBlurbs[creator.category as keyof typeof categoryBlurbs] ||
    "Headlining creative energy meets ICS scale.";

  return (
    <article
      className={`group relative flex h-[400px] sm:h-[340px] min-w-[220px] sm:min-w-[360px] flex-col overflow-hidden rounded-3xl bg-white/[0.04] text-white shadow-[0_18px_50px_-24px_rgba(255,46,230,0.35)] transition-transform duration-300 ${styles.tilt} ${styles.card} ${styles.wiggle}`}
      style={{
        opacity: 0,
        transform: shouldReduceMotion ? 'none' : 'translateY(28px)',
        animation: shouldReduceMotion ? 'none' : `fadeInUp 0.55s ease-out ${(index % 8) * 0.06}s forwards`,
      }}
    >
      <div className={`absolute inset-0 ${styles.imageWrap}`}>
        <ImageWithSkeleton
          src={creator.avatar}
          alt={creator.name}
          fill
          loading={index > 2 ? "lazy" : undefined}
          priority={index === 0}
          className="object-cover"
          skeletonClassName="rounded-3xl"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.16),transparent_55%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/60 to-black/80" />
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black via-transparent to-transparent" />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-8">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-[0.26em] text-white/65">
              {creator.category}
            </span>
          </div>
          <span className="text-xs uppercase tracking-[0.28em] text-white/45">
            {creator.followers} reach
          </span>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {creator.name}
            </h4>
            <p className="text-sm sm:text-base text-white/70">{creator.handle}</p>
          </div>
          <p className="max-w-xl text-sm text-white/65 sm:text-base">
            {blurb}
          </p>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-3">
            {(creator.socials as Record<string, string | undefined>)['youtube'] && (
                <SocialLink href={(creator.socials as Record<string, string | undefined>)['youtube']!} icon={Youtube} label="YouTube" className={styles.socialIcon} />
            )}
            {(creator.socials as Record<string, string | undefined>)['instagram'] && (
                <SocialLink href={(creator.socials as Record<string, string | undefined>)['instagram']!} icon={Instagram} label="Instagram" className={styles.socialIcon} />
            )}
            {(creator.socials as Record<string, string | undefined>)['twitter'] && (
                <SocialLink href={(creator.socials as Record<string, string | undefined>)['twitter']!} icon={Twitter} label="X" className={styles.socialIcon} />
            )}
            {(creator.socials as Record<string, string | undefined>)['linkedin'] && (
                <SocialLink href={(creator.socials as Record<string, string | undefined>)['linkedin']!} icon={Linkedin} label="LinkedIn" className={styles.socialIcon} />
            )}
            {(creator.socials as Record<string, string | undefined>)['twitch'] && (
                <SocialLink href={(creator.socials as Record<string, string | undefined>)['twitch']!} icon={Twitch} label="Twitch" className={styles.socialIcon} />
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function SocialLink({
  href,
  icon: Icon,
  label,
  className,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/[0.08] px-4 py-2 text-xs uppercase tracking-[0.2em] text-white/70 transition-transform duration-200 hover:scale-105 active:scale-95 ${className ?? ''}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </a>
  );
}

// Removed Chip (unused) to keep bundle light
