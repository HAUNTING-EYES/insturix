"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  Calendar, 
  MapPin, 
  Users, 
  Sparkles,
  Trophy, 
  Zap,
  ArrowRight,
  Play,
  Mic,
  Cpu,
  Mic2,
  Gamepad2,
  Award,
  Handshake
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ICS25PopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ICS25Popup({ isOpen, onClose }: ICS25PopupProps) {
  const router = useRouter();

  const goToICS25 = () => {
    onClose();
    router.push('/ics25');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] p-0 overflow-hidden border-0 bg-transparent">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          {/* ICS'25 dark neon vibe backdrop */}
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[#0A0A0C]" />
            <div className="absolute inset-0 bg-gradient-to-br from-sky-500/10 via-transparent to-fuchsia-400/10" />
            <div className="absolute -top-20 -right-20 w-[520px] h-[520px] rounded-full bg-sky-500/15 blur-3xl" />
            <div className="absolute -bottom-24 -left-24 w-[520px] h-[520px] rounded-full bg-fuchsia-500/15 blur-3xl" />
            <div className="absolute inset-0 bg-gradient-radial from-white/10 via-transparent to-transparent" />
          </div>

          <div className="relative z-10 p-6 md:p-10 overflow-y-auto max-h-[80vh] border border-white/10 rounded-2xl m-2 md:m-3 bg-white/5 backdrop-blur-xl">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="text-center mb-8"
            >
              {/* Date Badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-3 mb-6"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/15 text-white">
                  <Calendar className="w-4 h-4 text-white/80" />
                  <span className="font-medium text-sm">Nov 22–23, 2025</span>
                </div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/15 text-white">
                  <MapPin className="w-4 h-4 text-white/80" />
                  <span className="font-medium text-sm">IIIT Delhi</span>
                </div>
              </motion.div>

              {/* Main Title */}
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="text-4xl md:text-5xl font-black mb-3 bg-clip-text text-transparent bg-gradient-to-r from-[#3A9EFF] via-[#7AB8FF] to-[#FF2EE6] drop-shadow-[0_6px_30px_rgba(58,158,255,0.25)]"
              >
                ICS&apos;25
              </motion.h1>

              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="text-xl md:text-2xl font-semibold text-white/90 mb-2"
              >
                Insturix Creator&apos;s Summit 2025
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="text-lg md:text-xl text-white/70 mb-8 font-light"
              >
                Where Creators Collide, Collaborate & Create Magic
              </motion.p>
            </motion.div>

            {/* Key Highlights */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
            >
              {[
                {
                  icon: Users,
                  title: "ICS25 Passes",
                  description: "various tiers of passes for attendees and creators"
                },
                {
                  icon: Trophy,
                  title: "Live Competitions",
                  description: "Reel-making battles & speed editing showdowns"
                },
                {
                  icon: Zap,
                  title: "AI Tools Showcase",
                  description: "Editron, Alyzitron, Musitron & ThinkForge live demos"
                }
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.7 + (index * 0.1), duration: 0.4 }}
                  className="relative group"
                >
                  <div className="relative p-6 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all duration-300 hover:shadow-[0_0_30px_rgba(58,158,255,0.25)]">
                    <div className="inline-flex p-3 rounded-lg bg-white text-black mb-4">
                      <item.icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-white font-semibold text-lg mb-2">{item.title}</h3>
                    <p className="text-white/70 text-sm">{item.description}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Exciting Features */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0, duration: 0.4 }}
              className="mb-8"
            >
              <h3 className="text-white font-semibold text-xl mb-4 text-center">What Awaits You</h3>
              <div className="flex flex-wrap justify-center gap-3">
                {[
                  { icon: Play, text: "Reel-Making Battles" },
                  { icon: Sparkles, text: "Speed Editing Showdown" },
                  { icon: Mic, text: "Stand Up Comedy" },
                  { icon: Cpu, text: "ThinkForge Ideation" },
                  { icon: Mic2, text: "Creator Panels" },
                  { icon: Gamepad2, text: "GameOn Esports" },
                  { icon: Award, text: "Creator Awards" },
                  { icon: Handshake, text: "Networking Zones" }
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.1 + (index * 0.05), duration: 0.3 }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/15"
                  >
                    <item.icon className="w-4 h-4 text-white/80" />
                    <span className="text-white/80 text-sm font-medium">{item.text}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Esports quick blurb (linking to register) */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2, duration: 0.4 }}
              className="mb-8 text-center"
            >
              
            </motion.div>

            {/* GameOn Spotlight */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.25, duration: 0.4 }}
              className="mb-8"
            >
              <h3 className="text-white font-semibold text-xl mb-4 text-center">GameOn Esports Spotlight</h3>
              <div className="bg-gradient-to-r from-red-500/5 to-transparent border border-red-500/20 rounded-xl p-6">
                <div className="text-center mb-4">
                  <div className="text-red-400 font-bold text-lg" style={{ textShadow: '0 0 10px rgba(239, 68, 68, 0.5)' }}>Fully Online Tournament</div>
                  <div className="text-white/70 text-sm">Compete in Valorant or BGMI. Winners crowned at ICS'25 awards!</div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-white font-semibold">Qualifiers</div>
                    <div className="text-red-400 text-lg" style={{ textShadow: '0 0 10px rgba(239, 68, 68, 0.5)' }}>Nov 1 (Online)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white font-semibold">Finals</div>
                    <div className="text-red-400 text-lg" style={{ textShadow: '0 0 10px rgba(239, 68, 68, 0.5)' }}>Nov 8 (Online)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white font-semibold">Entry Fee</div>
                    <div className="text-red-400 text-lg" style={{ textShadow: '0 0 10px rgba(239, 68, 68, 0.5)' }}>₹500/player</div>
                  </div>
                </div>
                <div className="text-center mt-4 text-white/70 text-sm">
                  Cashback up to ₹350 on completing creator tasks. Register now!
                </div>
              </div>
            </motion.div>

            {/* Special Promotion */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.35, duration: 0.4 }}
              className="text-center rounded-xl p-6 border border-white/10 bg-white/5 mb-8"
            >
              <div className="flex items-center justify-center gap-2 mb-3">
                <Sparkles className="w-5 h-5 text-[#3A9EFF]" />
                <span className="text-white font-semibold">Special Offer</span>
              </div>
              <p className="text-white mb-2">
                <span className="font-semibold">Get discounts on Attendee Passes</span> by creating a promotional reel!
              </p>
              <p className="text-white/70 text-sm">
                Tag us and use <span className="font-mono bg-white/10 px-2 py-1 rounded text-xs">#ICS25</span> <span className="font-mono bg-white/10 px-2 py-1 rounded text-xs">#insturix</span>
              </p>
            </motion.div>

            {/* Why Attend Teaser */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.45, duration: 0.4 }}
              className="text-center mb-8"
            >
              <h3 className="text-white font-semibold text-xl mb-4">Why ICS'25?</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="text-white font-bold text-lg mb-2">🚀 Innovation Hub</div>
                  <div className="text-white/80 text-sm">Experience cutting-edge AI tools live – Editron, Alyzitron, Musitron, ThinkForge.</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="text-white font-bold text-lg mb-2">🌟 Creator Community</div>
                  <div className="text-white/80 text-sm">Connect with 800+ creators, brands, and fans in structured networking.</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="text-white font-bold text-lg mb-2">🏆 Epic Competitions</div>
                  <div className="text-white/80 text-sm">Reel battles, speed edits, esports finals, and creator awards night.</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <div className="text-white font-bold text-lg mb-2">🎉 Unforgettable Vibes</div>
                  <div className="text-white/80 text-sm">Talks, panels, DJ night, standup comedy, and exclusive merch.</div>
                </div>
              </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.55, duration: 0.4 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Button
                onClick={goToICS25}
                className="px-8 py-3 bg-white text-black hover:bg-zinc-200 font-semibold rounded-xl shadow-lg hover:shadow-[0_0_30px_rgba(58,158,255,0.35)] transition-all duration-300 transform hover:scale-[1.03]"
              >
                <span>Go to ICS25</span>
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </motion.div>

            {/* Venue Info */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.7, duration: 0.4 }}
              className="text-center mt-6"
            >
              
            </motion.div>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}