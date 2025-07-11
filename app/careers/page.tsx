"use client";

import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Briefcase,
  MapPin,
  Clock,
  Users,
  Rocket,
  Brain,
  TrendingUp,
  Code,
  Settings,
  Palette,
  ArrowRight,
  Star,
  Target,
  Zap,
} from "lucide-react";
import Link from "next/link";

const jobPositions = [
  {
    title: "Marketing Lead",
    department: "Marketing",
    location: "Remote / Hybrid",
    type: "Full-time",
    experience: "3-5 years",
    icon: TrendingUp,
    description: "Lead our marketing strategy and drive growth across all channels. Shape our brand presence and accelerate user acquisition.",
    skills: ["Digital Marketing", "Growth Strategy", "Analytics", "Brand Management"],
    highlights: ["Lead a growing team", "Shape marketing strategy", "Work with cutting-edge AI products"]
  },
  {
    title: "Branding Manager",
    department: "Marketing",
    location: "Remote / Hybrid", 
    type: "Full-time",
    experience: "2-4 years",
    icon: Palette,
    description: "Define and maintain our brand identity across all touchpoints. Create compelling visual narratives that resonate with creators.",
    skills: ["Brand Strategy", "Visual Design", "Creative Direction", "Content Strategy"],
    highlights: ["Creative freedom", "Work with design tools", "Shape brand identity"]
  },
  {
    title: "Full Stack Developer",
    department: "Engineering",
    location: "Remote / On-site",
    type: "Full-time", 
    experience: "2-5 years",
    icon: Code,
    description: "Build and scale our platform using modern web technologies. Work on both frontend experiences and backend infrastructure.",
    skills: ["React", "Node.js", "TypeScript", "Next.js", "Database Design"],
    highlights: ["Modern tech stack", "High-impact projects", "Learning opportunities"]
  },
  {
    title: "AI Engineer",
    department: "Engineering",
    location: "Remote / On-site",
    type: "Full-time",
    experience: "3-6 years", 
    icon: Brain,
    description: "Develop and optimize AI models that power our creator tools. Work on cutting-edge machine learning applications.",
    skills: ["Machine Learning", "Python", "TensorFlow/PyTorch", "AI/ML Pipelines", "Data Science"],
    highlights: ["Cutting-edge AI", "Research opportunities", "Impact at scale"]
  },
  {
    title: "MLOps Engineer", 
    department: "Engineering",
    location: "Remote / On-site",
    type: "Full-time",
    experience: "3-5 years",
    icon: Settings,
    description: "Build and maintain ML infrastructure. Ensure our AI models run efficiently and reliably at scale.",
    skills: ["MLOps", "DevOps", "Kubernetes", "AWS/GCP", "CI/CD", "Monitoring"],
    highlights: ["Scale AI systems", "DevOps expertise", "Infrastructure impact"]
  },
  {
    title: "Go-To-Market Strategist",
    department: "Strategy",
    location: "Remote / Hybrid",
    type: "Full-time", 
    experience: "4-7 years",
    icon: Target,
    description: "Drive market entry strategies and product launches. Connect our innovation with market opportunities.",
    skills: ["Market Analysis", "Product Strategy", "Business Development", "Partnership Management"],
    highlights: ["Strategic impact", "Cross-functional work", "Market leadership"]
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.6,
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
    },
  },
};

const JobCard = ({ job }: { job: typeof jobPositions[0] }) => {
  const IconComponent = job.icon;
  
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <Card className="h-full bg-black/30 border-zinc-800/30 backdrop-blur-2xl hover:border-zinc-600/40 transition-all duration-500 group overflow-hidden rounded-2xl shadow-xl hover:shadow-2xl">
        <CardHeader className="pb-6 p-6">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/25 to-purple-500/25 group-hover:from-blue-500/35 group-hover:to-purple-500/35 transition-all duration-500 shadow-lg">
                <IconComponent className="h-6 w-6 text-blue-300 group-hover:text-blue-200 transition-colors duration-300" />
              </div>
              <div className="space-y-2">
                <CardTitle className="text-zinc-50 text-xl font-semibold group-hover:text-white transition-colors duration-300 leading-tight">
                  {job.title}
                </CardTitle>
                <Badge variant="outline" className="text-xs border-zinc-600/50 text-zinc-300 bg-zinc-800/30 px-3 py-1 rounded-full">
                  {job.department}
                </Badge>
              </div>
            </div>
            <Badge className="bg-green-500/25 text-green-300 border-green-500/40 px-3 py-1 rounded-full shadow-sm">
              Hiring
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6 p-6 pt-0">
          <p className="text-zinc-300 text-sm leading-relaxed font-light">
            {job.description}
          </p>
          
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
              <div className="flex items-center gap-2 bg-zinc-800/40 px-3 py-2 rounded-lg">
                <MapPin className="h-3.5 w-3.5 text-zinc-500" />
                <span>{job.location}</span>
              </div>
              <div className="flex items-center gap-2 bg-zinc-800/40 px-3 py-2 rounded-lg">
                <Clock className="h-3.5 w-3.5 text-zinc-500" />
                <span>{job.type}</span>
              </div>
              <div className="flex items-center gap-2 bg-zinc-800/40 px-3 py-2 rounded-lg">
                <Briefcase className="h-3.5 w-3.5 text-zinc-500" />
                <span>{job.experience}</span>
              </div>
            </div>
            
            <div className="space-y-3">
              <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Key Skills</p>
              <div className="flex flex-wrap gap-2">
                {job.skills.map((skill) => (
                  <Badge 
                    key={skill} 
                    variant="secondary" 
                    className="text-xs bg-zinc-800/60 text-zinc-300 border-zinc-700/40 px-3 py-1.5 rounded-lg hover:bg-zinc-700/60 transition-colors duration-200"
                  >
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div className="space-y-3">
              <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Why You&apos;ll Love It</p>
              <ul className="space-y-2">
                {job.highlights.map((highlight) => (
                  <li key={highlight} className="text-sm text-zinc-300 flex items-start gap-3">
                    <Star className="h-3.5 w-3.5 text-yellow-400/80 mt-0.5 flex-shrink-0" />
                    <span className="leading-relaxed">{highlight}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          
          <div className="pt-4">
            <Button 
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 rounded-xl font-semibold text-base shadow-lg hover:shadow-xl transition-all duration-300 group/button"
              asChild
            >
              <Link href="/contactus" className="flex items-center justify-center gap-3">
                <span>Apply Now</span>
                <ArrowRight className="h-5 w-5 group-hover/button:translate-x-1 transition-transform duration-300" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default function Careers() {
  return (
    <>
      <Navbar />
      
      <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-black text-white relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-grid-neutral-900/10 bg-[size:80px_80px]" />
          <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-500/15 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '2s' }} />
          <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-indigo-500/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '4s' }} />
        </div>

        <div className="relative z-10 container mx-auto px-6 sm:px-8 lg:px-12 pt-28 pb-20">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-20"
          >
            {/* Hero Section */}
            <motion.div variants={itemVariants} className="text-center space-y-8 max-w-5xl mx-auto">
              <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-500/30 text-blue-300 text-sm font-medium shadow-lg backdrop-blur-xl">
                <Rocket className="h-4 w-4" />
                <span>We&apos;re Growing Fast</span>
              </div>
              
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-tight">
                <span className="bg-gradient-to-br from-white via-zinc-100 to-zinc-300 bg-clip-text text-transparent">
                  Join Our
                </span>
                <br />
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
                  Amazing Team
                </span>
              </h1>
              
              <p className="text-xl sm:text-2xl text-zinc-300 leading-relaxed max-w-3xl mx-auto font-light">
                Help us build the future of creator tools and AI-powered solutions. 
                Join a team that&apos;s passionate about empowering content creators worldwide.
              </p>
              
              <div className="flex flex-wrap justify-center gap-8 text-base text-zinc-300 pt-4">
                <div className="flex items-center gap-3 bg-zinc-800/30 px-4 py-3 rounded-xl backdrop-blur-xl">
                  <Users className="h-5 w-5 text-blue-400" />
                  <span>Remote-First Culture</span>
                </div>
                <div className="flex items-center gap-3 bg-zinc-800/30 px-4 py-3 rounded-xl backdrop-blur-xl">
                  <Zap className="h-5 w-5 text-purple-400" />
                  <span>Cutting-Edge Technology</span>
                </div>
                <div className="flex items-center gap-3 bg-zinc-800/30 px-4 py-3 rounded-xl backdrop-blur-xl">
                  <TrendingUp className="h-5 w-5 text-green-400" />
                  <span>Fast-Growing Startup</span>
                </div>
              </div>
            </motion.div>

            {/* Open Positions */}
            <motion.div variants={itemVariants} className="space-y-12">
              <div className="text-center space-y-6">
                <h2 className="text-4xl sm:text-5xl font-semibold text-zinc-50 tracking-tight">
                  Open Positions
                </h2>
                <p className="text-xl text-zinc-400 max-w-3xl mx-auto leading-relaxed font-light">
                  We&apos;re looking for talented individuals who are passionate about innovation 
                  and want to make a real impact in the creator economy.
                </p>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                {jobPositions.map((job) => (
                  <JobCard key={job.title} job={job} />
                ))}
              </div>
            </motion.div>

            {/* CTA Section */}
            <motion.div 
              variants={itemVariants}
              className="text-center space-y-8 bg-gradient-to-br from-zinc-900/40 to-zinc-800/40 rounded-3xl p-12 sm:p-16 border border-zinc-700/30 backdrop-blur-2xl shadow-2xl"
            >
              <h3 className="text-3xl sm:text-4xl font-semibold text-zinc-50 tracking-tight">
                Don&apos;t See Your Role?
              </h3>
              <p className="text-xl text-zinc-300 max-w-3xl mx-auto leading-relaxed font-light">
                We&apos;re always looking for exceptional talent. Send us your resume and 
                tell us how you&apos;d like to contribute to our mission.
              </p>
              <div className="flex flex-col sm:flex-row gap-6 justify-center pt-4">
                <Button 
                  size="lg"
                  className="h-14 px-8 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 rounded-xl font-semibold text-lg shadow-xl hover:shadow-2xl transition-all duration-300"
                  asChild
                >
                  <Link href="/contactus" className="flex items-center gap-3">
                    <span>Get in Touch</span>
                    <ArrowRight className="h-5 w-5" />
                  </Link>
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  className="h-14 px-8 border-2 border-zinc-600/50 bg-zinc-800/30 text-zinc-200 hover:bg-zinc-700/50 hover:border-zinc-500/60 rounded-xl font-semibold text-lg backdrop-blur-xl transition-all duration-300"
                  asChild
                >
                  <Link href="/about">
                    Learn About Us
                  </Link>
                </Button> 
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
      
      <Footer />
    </>
  );
}
