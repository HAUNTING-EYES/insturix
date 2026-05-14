"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Github, Linkedin, Twitter } from "lucide-react";
import { StaticImageData } from "next/image";
import Link from "next/link";
import NJ from "@/public/team/NimitJain.jpeg";
import AKS from "@/public/team/Akshit Singh.jpeg";
import LG from "@/public/team/Lakshay Goel.png";
import { Link1Icon } from "@radix-ui/react-icons";
import { ScannerDivider } from "@/components/ui/ScannerDivider";

const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];

const teamMembers = [
  {
    name: "Nimit Jain",
    role: "CEO & Founder",
    image: NJ,
    bio: "Nimit Got No Limit.",
    social: {
      github: "https://github.com/HAUNTING-EYES",
      linkedin: "https://www.linkedin.com/in/nimit-jain-106657279/",
    },
  },
  {
    name: "Akshit Kumar Singh",
    role: "CTO",
    image: AKS,
    bio: "Tech Lead, Gen AI, System Architect.",
    social: {
      github: "https://github.com/akshit2434",
      linkedin: "https://www.linkedin.com/in/akshit2434/",
    },
  },
];

const departments = [
  {
    name: "Engineering",
    members: [
      {
        name: "Lakshay Goel",
        role: "Tech Executive",
        image: LG,
        bio: "AI/ML, Gen AI, creative strategist.",
        social: {
          github: "https://github.com/lkshycode",
          linkedin: "https://www.linkedin.com/in/iamlakshaygoel/",
        },
      },
    ],
  },
];

interface SocialLinks {
  website?: string;
  twitter?: string;
  linkedin?: string;
  github?: string;
}

interface TeamMember {
  name: string;
  role: string;
  image: StaticImageData | string;
  bio: string;
  social: SocialLinks;
}

function TeamMemberCard({ member, index }: { member: TeamMember; index: number }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0, transition: { duration: 0.5, delay: index * 0.1, ease } }
      }}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className="group relative"
    >
      <div className="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all duration-500 h-full">
        <div className="flex flex-col items-center text-center">
          <div className="relative w-32 h-32 mb-6">
            <div className="absolute inset-0 rounded-full border border-zinc-700 group-hover:border-zinc-500 transition-colors duration-500" />
            <div className="absolute inset-2 rounded-full overflow-hidden grayscale group-hover:grayscale-0 transition-all duration-700">
              <Image
                src={member.image}
                alt={member.name}
                fill
                className="object-cover"
              />
            </div>
            {/* Technical corner accents */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t border-l border-zinc-800" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b border-r border-zinc-800" />
          </div>
          
          <h3 className="text-[18px] font-bold mb-1 text-white font-space-grotesk tracking-tight">{member.name}</h3>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-4 font-inter">
            {member.role}
          </p>
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed font-inter">
            {member.bio}
          </p>
          
          <div className="flex space-x-5 pt-4 border-t border-zinc-800 w-full justify-center">
            {member.social.twitter && (
              <Link href={member.social.twitter} className="text-zinc-500 hover:text-white transition-colors">
                <Twitter className="h-4 w-4" />
              </Link>
            )}
            {member.social.linkedin && (
              <Link href={member.social.linkedin} className="text-zinc-500 hover:text-white transition-colors">
                <Linkedin className="h-4 w-4" />
              </Link>
            )}
            {member.social.github && (
              <Link href={member.social.github} className="text-zinc-500 hover:text-white transition-colors">
                <Github className="h-4 w-4" />
              </Link>
            )}
            {member.social.website && (
              <Link href={member.social.website} className="text-zinc-500 hover:text-white transition-colors">
                <Link1Icon className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function TeamContent() {
  return (
    <div className="min-h-screen bg-zinc-950 relative overflow-hidden font-inter">
      {/* Subtle radial gradient */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-radial from-zinc-900/40 to-transparent rounded-full opacity-30" />
      </div>

      <div className="container mx-auto px-4 py-24 sm:py-32 relative z-10">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.1 } },
          }}
          className="max-w-6xl mx-auto"
        >
          <div className="mb-20">
            <motion.div
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-6"
            >
              <span className="w-1 h-1 rounded-full bg-zinc-500" />
              The Architects
            </motion.div>
            
            <motion.h1 
              variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease } } }}
              className="text-[44px] sm:text-[110px] font-bold mb-6 text-white font-space-grotesk tracking-tighter"
            >
              The minds <span className="text-zinc-500">behind the engine.</span>
            </motion.h1>
            <motion.p 
              variants={{ hidden: { opacity: 0, y: 15 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
              className="text-lg text-zinc-400 max-w-2xl leading-relaxed"
            >
              Building a team of creators, engineers, and strategists dedicated to 
              redefining what&apos;s possible in content production.
            </motion.p>
          </div>

          {/* Leadership */}
          <section className="mb-24">
            <motion.h2 
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
              className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-10 pb-4 border-b border-zinc-900"
            >
              Core Leadership
            </motion.h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {teamMembers.map((member, index) => (
                <TeamMemberCard key={member.name} member={member} index={index} />
              ))}
            </div>
          </section>

          <ScannerDivider />

          {/* Departments */}
          {departments.map((dept, dIndex) => (
            <section key={dept.name} className="mt-24 mb-16">
              <motion.h2 
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }}
                className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-10 pb-4 border-b border-zinc-900"
              >
                {dept.name}
              </motion.h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {dept.members.map((member, mIndex) => (
                  <TeamMemberCard key={member.name} member={member} index={mIndex} />
                ))}
              </div>
            </section>
          ))}
        </motion.div>
      </div>
    </div>
  );
}
