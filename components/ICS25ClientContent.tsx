"use client";

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Calendar, 
  MapPin, 
  Users, 
  Gift,
  Play,
  ExternalLink
} from 'lucide-react';
import CursorEffect from '@/components/ui/CursorEffect';

export default function ICS25ClientContent() {
  return (
    <div className="relative min-h-screen bg-white dark:bg-zinc-900">
      <CursorEffect variant="glow" color="rgba(59, 130, 246, 0.1)" size={800} blur={150} />
      
      {/* Hero Section */}
      <section className="relative pt-20 pb-16 overflow-hidden">
        {/* Subtle mesh background */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/60 via-white to-purple-50/60 dark:from-blue-950/30 dark:via-zinc-900 dark:to-purple-950/30" />
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-cyan-200/30 via-transparent to-transparent dark:from-cyan-800/20 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-purple-200/30 via-transparent to-transparent dark:from-purple-800/20 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/80 dark:bg-zinc-800/80 backdrop-blur-sm border border-zinc-200 dark:border-zinc-700 mb-8"
            >
              <Calendar className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
              <span className="text-zinc-700 dark:text-zinc-300 font-semibold">15 November 2025</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-6xl md:text-8xl font-bold mb-6 text-zinc-900 dark:text-zinc-100"
            >
              ICS'25
            </motion.h1>

            <motion.h2
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="text-2xl md:text-4xl font-semibold text-zinc-700 dark:text-zinc-300 mb-4"
            >
              Insturix Creator's Summit 2025
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}  
              transition={{ delay: 0.8, duration: 0.8 }}
              className="text-xl md:text-2xl text-zinc-600 dark:text-zinc-400 mb-8 font-light"
            >
              Where Creators Collide, Collaborate & Create Magic
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.8 }}
              className="flex flex-col sm:flex-row gap-4 justify-center mb-12"
            >
              <Button className="px-8 py-4 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105 text-lg">
                <Users className="w-5 h-5 mr-2" />
                Get Creator Pass
              </Button>
              
              <Button variant="outline" className="px-8 py-4 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl font-semibold transition-all duration-300 text-lg">
                <Play className="w-5 h-5 mr-2" />
                Watch Teaser
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Registration CTA */}
      <section className="py-20 bg-zinc-50/50 dark:bg-zinc-800/20">
        <div className="container mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="max-w-3xl mx-auto"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
              Ready to Join ICS'25?
            </h2>
            <p className="text-xl text-zinc-600 dark:text-zinc-400 mb-8">
              Don't miss out on the biggest creator event of 2025. Registration opens soon!
            </p>
            
            {/* Special Promotion */}
            <Card className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 border-blue-200 dark:border-blue-800/30 mb-8">
              <CardContent className="p-8">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Gift className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-2xl font-bold text-blue-700 dark:text-blue-300">Special Discount Offer</h3>
                </div>
                <p className="text-zinc-800 dark:text-zinc-200 mb-4 text-lg">
                  Create a promotional reel for ICS'25 and get exclusive discounts!
                </p>
                <div className="flex flex-wrap justify-center gap-3 mb-6">
                  <Badge className="bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm">
                    #ICS25
                  </Badge>
                  <Badge className="bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border-zinc-300 dark:border-zinc-600 px-4 py-2 text-sm">
                    #insturix
                  </Badge>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400 text-sm">
                  Tag us in your reel and get discount codes sent to your DM!
                </p>
              </CardContent>
            </Card>

            {/* TODO: Add back when registration opens and notification system is ready */}
            {/* <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button className="px-8 py-4 bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 text-lg">
                <ExternalLink className="w-5 h-5 mr-2" />
                Notify Me When Registration Opens
              </Button>
              
              <Button variant="outline" className="px-8 py-4 border-zinc-300 dark:border-zinc-600 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl font-semibold transition-all duration-300 text-lg">
                <MapPin className="w-5 h-5 mr-2" />
                Get Updates
              </Button>
            </div> */}

            <div className="mt-8 text-zinc-500 dark:text-zinc-400">
              <div className="flex items-center justify-center gap-2 text-sm">
                <MapPin className="w-4 h-4" />
                <span>Venue TBD • Pricing TBD • More details coming soon</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}