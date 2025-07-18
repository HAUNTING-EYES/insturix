"use client";
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RocketIcon, SparklesIcon, ClockIcon } from "lucide-react";

interface ComingSoonProps {
  serviceName: string;
  progressPercentage?: number; // Optional, default to 75% if not provided
}

export function ComingSoon({ serviceName, progressPercentage }: ComingSoonProps) {
  return (
    <div className="relative min-h-screen bg-zinc-950 overflow-hidden">
      {/* Gradient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />
      
      {/* Animated Particles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="particle particle-1" />
        <div className="particle particle-2" />
        <div className="particle particle-3" />
        <div className="particle particle-4" />
        <div className="particle particle-5" />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-8">
        <div className="text-center space-y-8 max-w-2xl mx-auto">
          {/* Badge */}
          <Badge 
            variant="secondary" 
            className="bg-zinc-800/60 text-zinc-300 border border-zinc-700/50 px-4 py-2 text-sm font-medium backdrop-blur-sm"
          >
            <SparklesIcon className="w-4 h-4 mr-2" />
            New Feature in Development
          </Badge>

          {/* Main Heading */}
          <div className="space-y-4">
            <h1 className="text-6xl md:text-7xl font-bold bg-gradient-to-r from-zinc-100 via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              {serviceName}
            </h1>
            <h2 className="text-3xl md:text-4xl font-semibold text-zinc-400">
              Coming Soon
            </h2>
          </div>

          {/* Card */}
          <Card className="mx-auto max-w-lg bg-zinc-900/40 border-zinc-800/50 backdrop-blur-xl shadow-2xl shadow-zinc-950/50">
            <CardHeader className="text-center pb-6">
              <div className="mx-auto w-20 h-20 bg-gradient-to-br from-blue-500/20 to-purple-600/20 rounded-full flex items-center justify-center border border-blue-500/30 mb-4">
                <RocketIcon className="w-10 h-10 text-blue-400" />
              </div>
              <CardTitle className="text-xl text-zinc-100 font-semibold">
                We're Building Something Amazing
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-6">
              <p className="text-zinc-400 leading-relaxed">
                Our team is hard at work crafting the next generation of {serviceName}. 
                This powerful new tool will revolutionize your workflow with cutting-edge features and seamless integration.
              </p>
              
              <div className="flex items-center justify-center space-x-2 text-zinc-500">
                <ClockIcon className="w-4 h-4" />
                <span className="text-sm">Stay tuned for updates</span>
              </div>

              {/* Progress Indicator */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-zinc-400">
                  <span>Development Progress</span>
                  <span>{progressPercentage?progressPercentage:75}%</span>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full progress-bar"
                    style={{ width: `${progressPercentage ? progressPercentage : 75}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Footer Text */}
          <p className="text-zinc-500 text-sm">
            Want to be notified when {serviceName} launches? Follow us for the latest updates.
          </p>
        </div>
      </div>

      <style jsx>{`
        .particle {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          opacity: 0.1;
          animation: float 6s ease-in-out infinite;
        }
        
        .particle-1 {
          width: 4px;
          height: 4px;
          background: #3b82f6;
          top: 20%;
          left: 10%;
          animation-delay: 0s;
          animation-duration: 8s;
        }
        
        .particle-2 {
          width: 6px;
          height: 6px;
          background: #8b5cf6;
          top: 60%;
          right: 15%;
          animation-delay: 2s;
          animation-duration: 10s;
        }
        
        .particle-3 {
          width: 3px;
          height: 3px;
          background: #06b6d4;
          bottom: 30%;
          left: 20%;
          animation-delay: 4s;
          animation-duration: 7s;
        }
        
        .particle-4 {
          width: 5px;
          height: 5px;
          background: #f59e0b;
          top: 40%;
          right: 30%;
          animation-delay: 1s;
          animation-duration: 9s;
        }
        
        .particle-5 {
          width: 4px;
          height: 4px;
          background: #ef4444;
          bottom: 20%;
          right: 10%;
          animation-delay: 3s;
          animation-duration: 6s;
        }
        
        .progress-bar {
          animation: progressLoad 2s ease-out;
        }
        
        @keyframes float {
          0%, 100% {
            transform: translateY(0px) rotate(0deg);
            opacity: 0.1;
          }
          50% {
            transform: translateY(-20px) rotate(180deg);
            opacity: 0.3;
          }
        }
        
        @keyframes progressLoad {
          from {
            width: 0%;
          }
          to {
            width: 75%;
          }
        }
      `}</style>
    </div>
  );
}