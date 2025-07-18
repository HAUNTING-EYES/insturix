"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import Image from "next/image";
import { Github, Linkedin, Twitter } from "lucide-react";
import { StaticImageData } from "next/image";
import Link from "next/link";
import NJ from "@/public/team/NimitJain.jpeg";
import SB from "@/public/team/Srijan Baniyal.jpeg";
import AKS from "@/public/team/Akshit Singh.jpeg";
import LG from "@/public/team/Lakshay Goel.png";
import { Link1Icon } from "@radix-ui/react-icons";

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
    name: "Engineering Team",
    members: [
      {
        name: "Srijan Baniyal",
        role: "Tech Executive",
        image: SB,
        bio: "Full-stack developer and  AI enthusiast.",
        social: {
          linkedin: "https://www.linkedin.com/in/srijan-baniyal/",
          github: "https://github.com/Srijan-Baniyal",
          website: "https://srijanbaniyal.com",
        },
      },
      {
        name: "Lakshay Goel",
        role: "Tech Executive",
        image: LG,
        bio: " AI/ML,creative strategist and content creation.",
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

function TeamMemberCard({ member }: { member: TeamMember }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        viewport={{ once: true }}
      >
        <Card className="p-6 bg-white/50 dark:bg-[rgb(var(--surface-1))]/50 backdrop-blur-xs transition-all duration-300 hover:scale-[1.02] hover:shadow-lg">
          <div className="flex flex-col items-center text-center">
            <div className="relative w-32 h-32 mb-4">
              <Image
                src={member.image}
                alt={member.name}
                fill
                className="rounded-full object-cover"
              />
            </div>
            <h3 className="text-xl font-semibold mb-1">{member.name}</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-3">
              {member.role}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              {member.bio}
            </p>
            <div className="flex space-x-4">
              {member.social.twitter && (
                <Link
                  href={member.social.twitter}
                  className="text-zinc-400 hover:text-blue-400 transition-colors"
                >
                  <Twitter className="h-5 w-5" />
                </Link>
              )}
              {member.social.linkedin && (
                <Link
                  href={member.social.linkedin}
                  className="text-zinc-400 hover:text-blue-600 transition-colors"
                >
                  <Linkedin className="h-5 w-5" />
                </Link>
              )}
              {member.social.github && (
                <Link
                  href={member.social.github}
                  className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <Github className="h-5 w-5" />
                </Link>
              )}
              {member.social.website && (
                <Link
                  href={member.social.website}
                  className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors"
                >
                  <Link1Icon className="h-5 w-5" />
                </Link>
              )}
            </div>
          </div>
        </Card>
      </motion.div>
    </>
  );
}

export default function TeamContent() {
  return (
    <>
      <div className="min-h-screen bg-zinc-50 dark:bg-[rgb(var(--surface-0))] relative">
        {/* Animated floating particles background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute inset-0">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 bg-blue-500/10 dark:bg-blue-400/5 rounded-full"
                animate={{
                  x: [0, Math.random() * 100 - 50],
                  y: [0, Math.random() * 100 - 50],
                  scale: [1, Math.random() * 0.5 + 0.5],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: Math.random() * 5 + 5,
                  repeat: Infinity,
                  repeatType: "reverse",
                }}
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
              />
            ))}
          </div>
        </div>

        <div className="container mx-auto px-4 py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-6xl mx-auto"
          >
            <h1 className="text-3xl font-semibold mb-2 relative">
              Our Team
              <div className="absolute -top-1.5 -left-3 w-12 h-12 bg-blue-500/10 rounded-full blur-xl" />
            </h1>
            <p className="text-zinc-600 dark:text-zinc-400 mb-12 text-lg">
              Meet the talented individuals behind Insturix
            </p>

            {/* Leadership */}
            <section className="mb-16">
              <h2 className="text-2xl font-semibold mb-8">Leadership</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                {teamMembers.map((member, index) => (
                  <TeamMemberCard key={index} member={member} />
                ))}
              </div>
            </section>

            {/* Departments */}
            {departments.map((dept, index) => (
              <section key={index} className="mb-16">
                <h2 className="text-2xl font-semibold mb-8">{dept.name}</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {dept.members.map((member, mIndex) => (
                    <TeamMemberCard key={mIndex} member={member} />
                  ))}
                </div>
              </section>
            ))}
          </motion.div>
        </div>
      </div>
    </>
  );
}
