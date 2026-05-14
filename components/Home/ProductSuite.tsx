"use client";

import { useRef, useState } from "react";
import { motion, useScroll, useMotionValueEvent, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Play, Wand2, BarChart3, Edit3, Music, Share2, Compass, CheckCircle, AlertCircle, MousePointer2, Sparkles, SlidersHorizontal, Plus, GripVertical, ExternalLink, Edit2, Trash2, Link2, User, Copy, Video, Type, Image as ImageIcon, Smile, Folder, LayoutTemplate, Bot, History, Send, Save, Bell, RotateCw, Undo, Redo, ZoomIn, Maximize2, Settings, Layers, Mic, Volume2, FastForward, Rewind, SkipBack, SkipForward, Repeat, Youtube, Instagram, LineChart, Network, Users, MousePointerClick, Calendar, Clock, PenTool, Beaker, FileText, ListChecks, BookOpen, Brain, Loader2, Scissors, Upload } from "lucide-react";

const products = [
  {
    id: "editron",
    name: "Editron",
    tagline: "AI Video Editor",
    description: "Upload raw footage, let AI cut filler, add captions, and match your brand's pacing. Zero editing experience needed.",
    color: "#14b8a6",
    icon: Scissors,
    href: "/products/editron",
    visual: () => (
      <div className="w-full h-full flex relative bg-[#0E0E10] overflow-hidden text-zinc-300 rounded-xl">
        
        {/* Leftmost Tool Sidebar */}
        <div className="w-12 bg-[#141415] border-r border-zinc-800/80 flex flex-col items-center py-4 gap-4 shrink-0 z-20">
          <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center mb-2">
            <span className="text-[10px] text-white font-bold tracking-tighter">VI</span>
          </div>
          {[
            { icon: Video, label: "Video", active: false },
            { icon: Type, label: "Text", active: false },
            { icon: Music, label: "Audio", active: false },
            { icon: Sparkles, label: "Caption", active: false },
            { icon: ImageIcon, label: "Image", active: false },
            { icon: Smile, label: "Stickers", active: false },
            { icon: Folder, label: "Assets", active: false },
            { icon: LayoutTemplate, label: "Template", active: false },
            { icon: Bot, label: "AI Chat", active: true },
          ].map((item, i) => (
            <div key={i} className={`flex flex-col items-center gap-1 cursor-pointer w-full py-1 ${item.active ? 'bg-zinc-800/80 border-l-2 border-emerald-500' : 'opacity-60 hover:opacity-100'}`}>
              <item.icon className={`w-4 h-4 ${item.active ? 'text-emerald-400' : 'text-zinc-400'}`} />
              <span className={`text-[8px] ${item.active ? 'text-zinc-200 font-semibold' : 'text-zinc-500'}`}>{item.label}</span>
            </div>
          ))}
        </div>

        {/* AI Chat Sidebar */}
        <div className="w-[30%] bg-[#121213] flex flex-col border-r border-zinc-800/80 shrink-0 relative z-10">
           {/* Header */}
           <div className="h-12 border-b border-zinc-800/80 flex items-center px-4 shrink-0">
             <span className="text-[11px] font-bold text-zinc-100">AI Chat</span>
           </div>
           
           <div className="p-3 border-b border-zinc-800/80 flex items-center justify-between shrink-0">
             <div className="flex items-center gap-2">
               <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center border border-zinc-700">
                 <Bot className="w-4 h-4 text-zinc-300" />
               </div>
               <div className="flex flex-col">
                 <span className="text-[11px] font-semibold text-zinc-200 leading-tight">AI Assistant</span>
                 <span className="text-[9px] text-zinc-500">2 messages</span>
               </div>
             </div>
             <div className="flex items-center gap-2">
               <History className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-200 cursor-pointer" />
               <div className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-700 bg-zinc-800/50 cursor-pointer hover:bg-zinc-800">
                 <Plus className="w-3 h-3 text-zinc-300" />
                 <span className="text-[9px] text-zinc-300 tracking-wide">New</span>
               </div>
             </div>
           </div>

           {/* Chat Area with animations */}
           <div className="flex-1 overflow-hidden p-4 flex flex-col gap-4">
             {/* User Message */}
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               transition={{ duration: 0.5, delay: 0.5 }}
               className="self-end max-w-[85%] bg-emerald-500/10 border border-emerald-500/20 rounded-xl rounded-tr-sm p-3"
             >
               <p className="text-[10px] text-zinc-300">Make the intro punchier and add a big title.</p>
             </motion.div>

             {/* AI Response */}
             <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 10 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               transition={{ duration: 0.5, delay: 2.5 }}
               className="self-start max-w-[90%] bg-zinc-800 border border-zinc-700 rounded-xl rounded-tl-sm p-3 flex flex-col gap-2"
             >
               <div className="flex items-center gap-2 mb-1">
                 <Bot className="w-3.5 h-3.5 text-emerald-400" />
                 <span className="text-[10px] font-bold text-zinc-200">AI Assistant</span>
               </div>
               <p className="text-[10px] text-zinc-300">Sure! I've trimmed the silence and added the heavy title hook "MAKE AN IMPACT".</p>
               <div className="h-6 mt-1 w-full bg-zinc-900 rounded border border-zinc-700/50 flex items-center px-2 gap-2 cursor-pointer border-l-2 border-l-emerald-500 hover:bg-zinc-800 transition">
                  <Play className="w-3 h-3 text-emerald-500" />
                  <span className="text-[9px] text-zinc-400">Preview changes</span>
               </div>
             </motion.div>
           </div>

           {/* Input */}
           <div className="p-4 shrink-0 border-t border-zinc-800/80 bg-[#121213]">
             <div className="rounded-lg bg-zinc-900 border border-zinc-700 p-2 pl-3 flex items-center justify-between">
               <span className="text-[10px] text-zinc-500 flex-1">Ask AI to edit your video...</span>
               <div className="w-6 h-6 rounded bg-zinc-700 flex items-center justify-center hover:bg-zinc-600 cursor-pointer transition">
                 <Send className="w-3 h-3 text-zinc-300 ml-0.5" />
               </div>
             </div>
             <p className="text-[7px] text-center text-zinc-600 mt-2">AI can make mistakes. Please review generated edits.</p>
           </div>
        </div>

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col relative z-0 min-w-0">
          
          {/* Top Bar */}
          <div className="h-12 border-b border-zinc-800/80 flex items-center justify-end px-4 gap-4 shrink-0 bg-[#0E0E10]">
             <Save className="w-4 h-4 text-zinc-400 cursor-pointer hover:text-white" />
             <Bell className="w-4 h-4 text-zinc-400 cursor-pointer hover:text-white" />
             <div className="px-3 py-1.5 rounded bg-zinc-800 text-[10px] font-semibold text-zinc-100 border border-zinc-700 cursor-pointer hover:bg-zinc-700">
               Render Video
             </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 bg-[#0E0E10] border-b border-zinc-800/80 relative overflow-hidden flex items-center justify-center p-8 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:16px_16px]">
            {/* Video mock rect */}
            <div className="w-[85%] aspect-video bg-[#1A1C23] shadow-2xl relative overflow-hidden flex items-center justify-center border border-zinc-800">
               {/* Animated title pop */}
               <motion.div 
                 initial={{ scale: 0.8, opacity: 0 }}
                 animate={{ scale: [0.8, 1.2, 1], opacity: [0, 1, 1] }}
                 transition={{ duration: 0.6, delay: 3, ease: "easeOut" }}
                 className="relative z-10"
               >
                 <span className="text-[44px] font-black text-white tracking-tighter drop-shadow-lg">MAKE AN IMPACT</span>
                 {/* Bounding Box */}
                 <div className="absolute -inset-4 border border-blue-500 pointer-events-none">
                    <div className="absolute top-0 left-0 w-2 h-2 bg-white border border-blue-500 -translate-x-1/2 -translate-y-1/2" />
                    <div className="absolute top-0 right-0 w-2 h-2 bg-white border border-blue-500 translate-x-1/2 -translate-y-1/2" />
                    <div className="absolute bottom-0 left-0 w-2 h-2 bg-white border border-blue-500 -translate-x-1/2 translate-y-1/2" />
                    <div className="absolute bottom-0 right-0 w-2 h-2 bg-white border border-blue-500 translate-x-1/2 translate-y-1/2" />
                    <div className="absolute top-0 left-1/2 w-3 h-1 bg-white border border-blue-500 -translate-x-1/2 -translate-y-1/2" />
                    <div className="absolute bottom-0 left-1/2 w-3 h-1 bg-white border border-blue-500 -translate-x-1/2 translate-y-1/2" />
                    <div className="absolute left-0 top-1/2 w-1 h-3 bg-white border border-blue-500 -translate-x-1/2 -translate-y-1/2" />
                    <div className="absolute right-0 top-1/2 w-1 h-3 bg-white border border-blue-500 translate-x-1/2 -translate-y-1/2" />
                    <RotateCw className="w-4 h-4 text-blue-500 absolute -top-8 left-1/2 -translate-x-1/2" />
                 </div>
               </motion.div>
            </div>
          </div>

          {/* Timeline Wrapper */}
          <div className="h-44 shrink-0 bg-[#0E0E10] flex flex-col">
            
            {/* Timeline Tools */}
            <div className="h-10 border-b border-zinc-800/80 flex items-center justify-between px-4">
               <div className="flex items-center gap-3">
                 <Undo className="w-3.5 h-3.5 text-zinc-500 cursor-pointer" />
                 <Redo className="w-3.5 h-3.5 text-zinc-500 cursor-pointer" />
               </div>
               
               <div className="flex items-center gap-4">
                 <div className="px-2 py-0.5 rounded border border-zinc-700/50 bg-zinc-800 text-[9px] text-zinc-300">1x</div>
                 <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center cursor-pointer hover:bg-zinc-700">
                   <Play className="w-3 h-3 text-zinc-300 ml-0.5" />
                 </div>
                 <span className="text-[10px] font-mono font-semibold">
                   <span className="text-white">00:00.00</span>
                   <span className="text-zinc-500"> / 00:03.00</span>
                 </span>
               </div>

               <div className="flex items-center gap-3">
                 <div className="flex items-center gap-1.5">
                   <ZoomIn className="w-3.5 h-3.5 text-zinc-400" />
                   <div className="w-16 h-1 bg-zinc-800 rounded-full relative">
                     <div className="absolute right-1/4 top-1/2 -translate-y-1/2 w-2 h-2 bg-zinc-400 rounded-full" />
                   </div>
                   <Plus className="w-3 h-3 text-zinc-400" />
                 </div>
                 <Maximize2 className="w-3.5 h-3.5 text-zinc-400 ml-2" />
                 <Settings className="w-3.5 h-3.5 text-zinc-400" />
               </div>
            </div>

            {/* Tracks */}
            <div className="flex-1 flex overflow-hidden">
               {/* Track Headers */}
               <div className="w-16 border-r border-zinc-800/80 bg-[#121213] flex flex-col overflow-hidden shrink-0">
                  <div className="h-6 flex items-center px-2">
                    <span className="text-[8px] font-bold tracking-widest text-zinc-600">LAYERS</span>
                  </div>
                  <div className="h-12 border-t border-zinc-800/80 flex items-center justify-between px-2 cursor-pointer hover:bg-zinc-800/50">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3 h-3 text-zinc-400" />
                      <span className="text-[10px] font-mono text-zinc-300">L1</span>
                    </div>
                    <Plus className="w-3 h-3 text-zinc-500" />
                  </div>
                  <div className="h-12 border-t border-zinc-800/80 flex items-center justify-between px-2 cursor-pointer hover:bg-zinc-800/50">
                    <div className="flex items-center gap-1.5">
                       <GripVertical className="w-3 h-3 text-zinc-600" />
                      <span className="text-[10px] font-mono text-zinc-500">L2</span>
                    </div>
                    <Plus className="w-3 h-3 text-zinc-600" />
                  </div>
               </div>

               {/* Timeline Content */}
               <div className="flex-1 bg-[#0A0A0B] relative overflow-hidden pb-4">
                  {/* Ruler */}
                  <div className="h-6 border-b border-zinc-800/50 w-full flex items-end opacity-50 relative pointer-events-none">
                     <div className="w-full flex justify-between absolute bottom-0 left-0 hover:opacity-100">
                     {[...Array(15)].map((_, i) => (
                       <div key={i} className="flex-1 border-l border-zinc-700 h-2 relative">
                         <span className="absolute -top-3 -left-3 text-[6px] text-zinc-500 font-mono">{(i*0.2).toFixed(2)}s</span>
                       </div>
                     ))}
                     </div>
                  </div>

                  {/* Playhead */}
                  <motion.div 
                    initial={{ left: "0%" }}
                    animate={{ left: "20%" }}
                    transition={{ duration: 1, delay: 3.2, ease: "easeOut" }}
                    className="absolute top-0 bottom-0 w-px bg-red-500 z-20 pointer-events-none"
                  >
                     <div className="absolute top-6 -translate-x-1/2 -mt-1 w-2 h-2 bg-red-500 rounded-sm" />
                  </motion.div>

                  {/* L1 Track (Text) */}
                  <div className="h-12 border-b border-zinc-800/20 relative w-full pt-1.5 px-2">
                     <motion.div 
                       initial={{ opacity: 0, width: "0%" }}
                       animate={{ opacity: 1, width: "95%" }}
                       transition={{ duration: 0.5, delay: 3 }}
                       className="h-8 rounded bg-gradient-to-r from-[#4C1D95] to-[#7C3AED] border border-b-2 border-r-2 border-[#5B21B6] border-b-[#9333EA] border-r-[#9333EA] flex items-center px-2 shadow-lg overflow-hidden shrink-0"
                     >
                       <div className="w-1 h-full border-l border-r border-white/20 mr-2 shrink-0 pointer-events-none opacity-50" />
                       <Type className="w-3 h-3 text-white mr-1.5 shrink-0" />
                       <span className="text-[9px] font-bold text-white truncate">MAKE AN IMPACT</span>
                       <div className="w-1 h-full border-l border-r border-white/20 ml-auto shrink-0 pointer-events-none opacity-50" />
                     </motion.div>
                  </div>
                  
                  {/* L2 Track (Empty) */}
                  <div className="h-12 border-b border-zinc-800/20 w-full" />
               </div>
            </div>
          </div>

        </div>
      </div>
    ),
  },
  {
    id: "clickatron",
    name: "Clickatron",
    tagline: "AI Image Studio",
    description: "Generate scroll-stopping thumbnails and visuals. Sketch-to-edit, generative fill, and intelligent A/B testing built in.",
    color: "#8B5CF6",
    icon: Sparkles,
    href: "/products/clickatron",
    visual: () => (
      <div className="w-full h-full p-4 flex gap-4 relative bg-zinc-950 overflow-hidden text-zinc-300">
        
        {/* Left Column: Variations */}
        <div className="w-1/4 hidden sm:flex flex-col gap-3 shrink-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-bold text-zinc-400">Variations</span>
          </div>
          <div className="h-6 w-full rounded border border-zinc-800 bg-zinc-900 flex items-center justify-center gap-1 shrink-0">
            <Plus className="w-3 h-3 text-zinc-500" />
            <span className="text-[8px] uppercase tracking-wider text-zinc-500">New Variation</span>
          </div>
          <div className="flex-1 flex flex-col gap-2 overflow-hidden">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`w-full aspect-video rounded border ${i === 1 ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'border-zinc-800'} relative overflow-hidden shrink-0`}>
                <div className={`absolute inset-0 bg-gradient-to-br ${i === 1 ? 'from-pink-500/20 to-teal-500/20' : 'from-zinc-800 to-zinc-900'}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Center Canvas Wrapper */}
        <div className="flex-1 flex flex-col gap-3 relative z-10">
          
          <div className="flex justify-center shrink-0">
            <span className="text-[10px] font-bold text-white tracking-wide">project 16:9 #1771253975182</span>
          </div>

          {/* Main Image */}
          <div className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 relative overflow-hidden flex flex-col items-center justify-center">
             <div className="absolute inset-0 bg-gradient-to-br from-pink-500/30 via-purple-500/10 to-teal-500/30" />
             
             {/* Gen Fill Box glowing on finish */}
             <motion.div 
               animate={{ opacity: [0, 0, 0, 0, 1, 0] }}
               transition={{ duration: 8, repeat: Infinity, times: [0, 0.7, 0.8, 0.81, 0.9, 1] }}
               className="absolute inset-0 bg-white/10 mix-blend-overlay pointer-events-none"
             />

             {/* Generative Fill Button */}
             <motion.div 
               animate={{ scale: [1, 1, 1, 1, 0.9, 1, 1] }}
               transition={{ duration: 8, repeat: Infinity, times: [0, 0.7, 0.75, 0.79, 0.8, 0.85, 1] }}
               className="absolute top-3 right-3 px-2 py-1 bg-white rounded flex items-center gap-1 shadow-[0_0_15px_rgba(255,255,255,0.2)] z-10"
             >
               <Sparkles className="w-3 h-3 text-amber-500 fill-amber-500" />
               <span className="text-[9px] font-bold text-zinc-900 border-l border-zinc-200 pl-1 ml-0.5">Generative Fill</span>
             </motion.div>

             {/* Animated selection box */}
             <motion.div 
               animate={{ 
                 opacity: [0, 0, 1, 1, 1, 0], 
                 width:   ["0%", "0%", "30%", "30%", "30%", "0%"],
                 height:  ["0%", "0%", "35%", "35%", "35%", "0%"]
               }}
               transition={{ duration: 8, repeat: Infinity, times: [0, 0.1, 0.3, 0.7, 0.8, 0.81], ease: "easeInOut" }}
               className="absolute top-[35%] left-[30%] border border-dashed border-white/80 bg-white/10"
             />
          </div>

          {/* Prompt Box */}
          <div className="h-10 rounded-lg border border-zinc-800 bg-zinc-900 flex items-center px-3 shrink-0 gap-2 relative z-0">
            <span className="text-[10px] text-zinc-400 shrink-0 pr-2 border-r border-zinc-700 hidden sm:block">Seedream V4 Edit</span>
            <div className="flex-1 overflow-hidden relative h-full flex items-center">
               <span className="text-[10px] text-zinc-600 absolute">e.g. Add purple smoke...</span>
               <motion.div 
                 animate={{ width: ["0%", "0%", "0%", "90%", "90%", "0%"] }}
                 transition={{ duration: 8, repeat: Infinity, times: [0, 0.3, 0.4, 0.6, 0.8, 0.81], ease: "linear" }}
                 className="h-1.5 bg-zinc-400 rounded-full relative z-10"
               />
            </div>
            <div className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center shrink-0">
               <Sparkles className="w-3 h-3 text-zinc-400" />
            </div>
          </div>

          {/* Cursor (Moves over everything) */}
          <motion.div
            animate={{ 
              left: ["10%", "30%", "60%", "25%", "25%", "85%", "85%", "10%"],
              top:  ["85%", "45%", "70%", "95%", "95%", "15%", "15%", "85%"] 
            }}
            transition={{ duration: 8, repeat: Infinity, times: [0, 0.1, 0.3, 0.4, 0.6, 0.7, 0.8, 1], ease: "easeInOut" }}
            className="absolute w-4 h-4 z-50 pointer-events-none drop-shadow-lg text-white"
          >
            <MousePointer2 className="w-5 h-5 -ml-2 -mt-2 fill-zinc-950" />
          </motion.div>
        </div>

        {/* Right Column: Adjustments */}
        <div className="w-1/4 hidden md:flex flex-col gap-4 shrink-0 border-l border-zinc-800/50 pl-4">
          <div className="flex items-center gap-1 mb-2">
            <SlidersHorizontal className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] font-bold text-zinc-400">Fine Tuning</span>
          </div>

          <div className="flex flex-col gap-3">
            {[
              { label: "Brightness", color: "bg-amber-400" },
              { label: "Contrast", color: "bg-blue-400" },
              { label: "Saturation", color: "bg-emerald-400" }
            ].map((slider, i) => (
              <div key={slider.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${slider.color}`} />
                    <span className="text-[9px] text-zinc-300">{slider.label}</span>
                  </div>
                  <span className="text-[8px] text-zinc-500">100%</span>
                </div>
                <div className="w-full h-1 bg-zinc-800 rounded-full flex items-center relative">
                  <motion.div 
                    animate={{ width: ["50%", `${60 + i * 15}%`, "50%"] }}
                    transition={{ duration: 3 + i, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }}
                    className="h-full bg-zinc-300 rounded-full" 
                  />
                  <motion.div 
                     animate={{ left: ["50%", `${60 + i * 15}%`, "50%"] }}
                     transition={{ duration: 3 + i, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }}
                     className="absolute w-2.5 h-2.5 bg-white rounded-full shadow border border-zinc-300 -ml-1.5"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Curves Box */}
          <div className="mt-2 flex-1 border border-zinc-800 rounded flex items-center justify-center relative overflow-hidden bg-zinc-900/50">
             <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:33%_33%]" />
             <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
               <motion.path 
                 d="M 0 100 Q 50 50 100 0" 
                 animate={{ d: ["M 0 100 C 30 80, 70 20, 100 0", "M 0 100 C 40 60, 60 40, 100 0", "M 0 100 C 30 80, 70 20, 100 0"] }}
                 transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                 fill="none" 
                 stroke="white" 
                 strokeWidth="2" 
               />
               <circle cx="0" cy="100" r="3" fill="white" />
               <circle cx="100" cy="0" r="3" fill="white" />
             </svg>
          </div>
        </div>

      </div>
    ),
  },
  {
    id: "alyzitron",
    name: "Alyzitron",
    tagline: "Content Analyzer",
    description: "Score your content before publishing. Deep analytics, compliance checks, and SEO optimization powered by brand-aware AI.",
    color: "#3B82F6",
    icon: Video,
    href: "/products/alyzitron",
    visual: () => (
      <div className="w-full h-full flex flex-col relative bg-zinc-950 overflow-hidden">
        
        {/* Static Header */}
        <div className="flex items-end justify-between border-b border-zinc-800/60 p-6 pb-4 shrink-0 bg-zinc-950 z-20">
          <div>
            <h3 className="text-[18px] font-bold text-zinc-100 leading-tight">Analysis Results</h3>
            <p className="text-[11px] text-zinc-500 mt-1">Education/Business Case Study</p>
          </div>
          <div className="text-right flex flex-col items-end">
             <div className="text-[44px] font-black text-white leading-none tracking-tighter">
               90
             </div>
             <p className="text-[9px] text-zinc-500 uppercase tracking-widest mt-1.5 font-bold">Global Score</p>
          </div>
        </div>

        {/* Scrollable Content Container (simulated scroll) */}
        <div className="flex-1 relative overflow-hidden">
          {/* Fade masks */}
          <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-zinc-950 to-transparent z-10 pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-zinc-950 to-transparent z-10 pointer-events-none" />
          
          {/* Scrolling content */}
          <motion.div 
            animate={{ y: [0, -380, -380, 0, 0] }}
            transition={{ duration: 18, repeat: Infinity, times: [0, 0.45, 0.5, 0.95, 1], ease: "easeInOut" }}
            className="flex flex-col gap-4 p-6 pt-2"
          >
            {/* Video Mockup */}
            <div className="w-full aspect-[21/9] rounded-xl bg-zinc-900 border border-zinc-800 relative overflow-hidden flex items-center justify-center shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 to-transparent" />
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center backdrop-blur-sm border border-red-500/30">
                <Play className="w-4 h-4 text-red-400 fill-red-400 ml-0.5" />
              </div>
            </div>

            {/* Analysis Summary Box */}
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4 relative shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-md bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                  <CheckCircle className="w-3 h-3 text-indigo-400" />
                </div>
                <span className="text-[11px] font-semibold text-indigo-100 flex-1">Analysis Summary</span>
              </div>
              <div className="space-y-2 mt-1">
                <div className="h-1.5 w-full bg-indigo-500/20 rounded-full" />
                <div className="h-1.5 w-full bg-indigo-500/20 rounded-full" />
                <div className="h-1.5 w-4/5 bg-indigo-500/20 rounded-full" />
              </div>
            </div>

            {/* Target Audience Title */}
            <div className="flex items-center gap-2 mt-1">
              <div className="h-px bg-zinc-800 flex-1" />
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold px-2">Metrics</span>
              <div className="h-px bg-zinc-800 flex-1" />
            </div>

            {/* Grid of scores */}
            <div className="grid grid-cols-2 gap-3 shrink-0">
              {[
                { label: "Content Quality", score: 95 },
                { label: "Engagement", score: 90 },
                { label: "Production Quality", score: 92 },
                { label: "Marketing & CTA", score: 85 },
              ].map((metric) => (
                <div key={metric.label} className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-3 flex flex-col justify-between h-[72px]">
                  <div className="flex justify-between items-start mb-2 block">
                     <h4 className="text-[10px] font-bold text-zinc-300 w-[60%] leading-tight">{metric.label}</h4>
                     <div className="px-1.5 py-0.5 rounded flex items-center bg-emerald-500/10 border border-emerald-500/20 tabular-nums">
                       <span className="text-[11px] font-bold text-emerald-400 leading-none">{metric.score}</span>
                     </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-1 w-full bg-zinc-800 rounded-full" />
                    <div className="h-1 w-2/3 bg-zinc-800 rounded-full" />
                  </div>
                </div>
              ))}
            </div>

            {/* Creator Feedback Title */}
            <div className="flex items-center gap-2 mt-2">
              <div className="h-px bg-zinc-800 flex-1" />
              <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-bold px-2">Creator Feedback</span>
              <div className="h-px bg-zinc-800 flex-1" />
            </div>

            {/* Feedback Columns */}
            <div className="grid grid-cols-2 gap-4 shrink-0">
              {/* Strengths */}
              <div className="space-y-2">
                <span className="text-[10px] text-zinc-400 font-semibold mb-2 block">Strengths</span>
                <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <div className="space-y-1.5 w-full mt-1">
                    <div className="h-1.5 w-full bg-emerald-500/20 rounded" />
                    <div className="h-1.5 w-3/4 bg-emerald-500/20 rounded" />
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/10 p-2.5 rounded-lg">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <div className="space-y-1.5 w-full mt-1">
                    <div className="h-1.5 w-11/12 bg-emerald-500/20 rounded" />
                  </div>
                </div>
              </div>
              
              {/* Improvements */}
              <div className="space-y-2">
                <span className="text-[10px] text-zinc-400 font-semibold mb-2 block">Areas for Improvement</span>
                <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/10 p-2.5 rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <div className="space-y-1.5 w-full mt-1">
                    <div className="h-1.5 w-full bg-amber-500/20 rounded" />
                    <div className="h-1.5 w-full bg-amber-500/20 rounded" />
                    <div className="h-1.5 w-1/2 bg-amber-500/20 rounded" />
                  </div>
                </div>
              </div>
            </div>
            
          </motion.div>
        </div>

      </div>
    ),
  },
  {
    id: "thinkforge",
    name: "ThinkForge",
    tagline: "AI Scriptwriter",
    description: "Turn ideas into brand-aligned scripts. Web search, tone matching, and structured markdown editing in one workspace.",
    color: "#EF4444",
    icon: Brain,
    href: "/products/thinkforge",
    visual: () => (
      <div className="w-full h-full flex flex-col relative bg-[#0A0A0A] overflow-hidden text-zinc-300 rounded-xl font-sans">
        
        {/* Top App Bar */}
        <div className="h-12 border-b border-zinc-800/80 bg-[#121212] flex items-center justify-between px-4 shrink-0 z-10">
           <div className="flex items-center gap-3">
              <div className="px-3 py-1.5 rounded bg-zinc-800/50 border border-zinc-700/50 flex items-center gap-2 cursor-pointer hover:bg-zinc-800 transition-colors">
                <ArrowRight className="w-3 h-3 text-zinc-400 rotate-180" />
                <span className="text-[10px] font-bold text-zinc-300">Generate Ideas</span>
              </div>
           </div>
           
           <div className="flex bg-zinc-900/50 border border-zinc-800/80 rounded-lg p-0.5">
             <div className="px-4 py-1 rounded-md bg-zinc-800 shadow-sm flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-zinc-200" />
                <span className="text-[10px] font-bold text-white">Scripting</span>
             </div>
             <div className="px-4 py-1 rounded-md flex items-center gap-1.5 opacity-50 hover:bg-zinc-800/50 cursor-pointer">
                <PenTool className="w-3.5 h-3.5 text-zinc-400" />
                <span className="text-[10px] font-bold text-zinc-400">Whiteboard</span>
             </div>
           </div>

           <div className="flex items-center gap-4">
              <div className="px-4 py-1.5 rounded bg-red-500/10 border border-red-500/20 flex items-center gap-1.5 cursor-pointer hover:bg-red-500/20 transition-colors">
                 <Play className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                 <span className="text-[10px] font-bold text-red-500">Start Session</span>
              </div>
           </div>
        </div>

        {/* Main Workspace */}
        <div className="flex-1 flex min-h-0 bg-[#0A0A0A] relative">
           
           {/* Left Sidebar (AI History / Actions) */}
           <div className="w-[30%] bg-[#121212] border-r border-zinc-800/80 flex flex-col shrink-0 relative z-10 shadow-2xl">
              
              <div className="h-10 border-b border-zinc-800/80 px-3 flex items-center justify-between opacity-70">
                 <div className="flex items-center gap-3">
                   <RotateCw className="w-3.5 h-3.5 text-zinc-400" />
                   <Plus className="w-3.5 h-3.5 text-zinc-400" />
                 </div>
                 <Settings className="w-3.5 h-3.5 text-zinc-400" />
              </div>

              <div className="flex-1 overflow-hidden p-4 flex flex-col gap-6 relative">
                 {/* Faded top gradient */}
                 <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-[#121212] to-transparent z-10" />

                 {/* History Items */}
                 <div className="self-end px-3 py-1.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-medium border border-red-500/20">create script</div>
                 
                 <div className="flex flex-col gap-1 w-[90%]">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
                       <p className="text-[10px] text-zinc-300 leading-relaxed mb-3">
                          Here's an initial draft for the intro. I focused on making it punchy and asking a direct question to the viewer.
                       </p>
                       <div className="bg-zinc-950 border border-zinc-800 rounded p-2 text-[9px] font-mono text-zinc-500 mb-2">
                          [INT: DARK STUDIO - DAY]<br/><br/>
                          HOST turns to camera.<br/><br/>
                          HOST: "What if everything you thought you knew... was generated?"
                       </div>
                       <div className="flex gap-2">
                         <div className="px-2 py-1 rounded bg-zinc-800/80 text-[8px] text-zinc-300">Accept</div>
                         <div className="px-2 py-1 rounded bg-zinc-800/80 text-[8px] text-zinc-300">Revise</div>
                       </div>
                    </div>
                 </div>

                 <div className="self-end flex items-center gap-2">
                    <span className="text-[10px] text-zinc-500">Fact check</span>
                    <div className="w-6 h-6 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 text-[10px]">&middot;</div>
                 </div>
                 
                 <div className="flex flex-col gap-1 w-[90%] opacity-50">
                    <div className="flex items-center gap-2">
                       <Loader2 className="w-3 h-3 text-red-400 animate-spin" />
                       <span className="text-[10px] text-zinc-500 italic">Verifying claims...</span>
                    </div>
                 </div>
              </div>

              {/* Chat Input */}
              <div className="p-3 border-t border-zinc-800/80 shrink-0 bg-[#121212]">
                 <div className="flex flex-wrap gap-2 mb-3">
                    {["Fact check", "Platform tweak", "Punchier verbs"].map(t => (
                      <span key={t} className="px-2.5 py-1 rounded-full border border-zinc-700 bg-zinc-800/50 text-[9px] text-zinc-400 cursor-pointer hover:bg-zinc-700 transition-colors">{t}</span>
                    ))}
                 </div>
                 <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5 flex items-end">
                    <textarea 
                      readOnly
                      placeholder="Describe changes, ask for ideas..." 
                      className="w-full bg-transparent text-[11px] outline-none resize-none text-zinc-200 placeholder:text-zinc-600 h-8"
                    />
                    <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center shrink-0">
                      <Send className="w-3 h-3 text-zinc-500" />
                    </div>
                 </div>
              </div>
           </div>

           {/* Right Storyboard / Script Area */}
           <div className="flex-1 bg-[#161618] flex flex-col relative overflow-hidden">
              
              {/* Giant background faded icon for style */}
              <Brain className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 text-zinc-900/20 pointer-events-none" />
              
              {/* Document Toolbar */}
              <div className="h-10 border-b border-zinc-800/80 bg-[#1A1A1C] flex items-center px-4 gap-6 shrink-0 relative z-10">
                 <div className="flex items-center gap-2">
                   <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                   <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 opacity-50" />
                   <div className="w-1.5 h-1.5 rounded-full bg-zinc-700 opacity-50" />
                 </div>
                 
                 <div className="flex items-center gap-3">
                    <span className="text-zinc-500 font-bold hover:text-zinc-300 cursor-pointer px-1 py-0.5 rounded text-[10px]">B</span>
                    <span className="text-zinc-500 font-serif italic hover:text-zinc-300 cursor-pointer px-1 py-0.5 rounded text-[10px]">I</span>
                    <span className="text-zinc-500 underline hover:text-zinc-300 cursor-pointer px-1 py-0.5 rounded text-[10px]">U</span>
                 </div>
                 
                 <div className="w-px h-4 bg-zinc-800" />
                 
                 <div className="flex items-center gap-3">
                   <ListChecks className="w-3.5 h-3.5 text-zinc-500" />
                   <FileText className="w-3.5 h-3.5 text-zinc-500" />
                 </div>
              </div>

              {/* Document Content */}
              <div className="flex-1 p-8 relative z-10 overflow-hidden">
                 
                 <div className="max-w-2xl mx-auto flex flex-col gap-6">
                    <motion.h1 
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className="text-2xl font-black text-zinc-100 tracking-tight"
                    >
                      The Unseen Journey of Everyday Objects
                    </motion.h1>

                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="space-y-4">
                       
                       <div className="flex gap-4 group">
                          <div className="w-12 pt-1 font-mono text-[9px] text-zinc-600 text-right uppercase mt-0.5 group-hover:text-red-500 transition-colors">Visual</div>
                          <div className="flex-1 bg-zinc-900/50 border border-zinc-800/50 rounded-lg p-3 text-[11px] text-zinc-400">
                             Rapid montage: Coffee beans roasting, a silicon wafer being etched, a needle sewing denim. <br/><br/>
                             Text overlay: <strong className="text-zinc-200">YOU HAVE NO IDEA.</strong>
                          </div>
                       </div>

                       <div className="flex gap-4 group">
                          <div className="w-12 pt-1 font-mono text-[9px] text-zinc-600 text-right uppercase mt-0.5 group-hover:text-red-500 transition-colors">Audio</div>
                          <div className="flex-1 p-3 text-[11px] text-zinc-200 leading-relaxed font-serif relative">
                             <div className="absolute -left-2 top-3 bottom-3 w-0.5 bg-red-500/50 rounded-full" />
                             (Intense, rhythmic beat building up)<br/><br/>
                             NARRATOR (V.O): You pick up your phone fifty times a day. You drink the coffee. You wear the jeans. But what if I told you that simple mug of coffee required the coordinated effort of 4,000 people across three continents?
                          </div>
                       </div>

                    </motion.div>

                 </div>

              </div>
              
              {/* Bottom floating toolbar */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur-md border border-zinc-800 rounded-2xl p-2 flex items-center gap-2 shadow-2xl z-20">
                 <div className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-zinc-800 cursor-pointer transition-colors"><Folder className="w-4 h-4 text-zinc-400" /></div>
                 <div className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-zinc-800 cursor-pointer transition-colors"><Beaker className="w-4 h-4 text-zinc-400" /></div>
                 <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center cursor-pointer shadow-inner"><FileText className="w-4 h-4 text-red-400" /></div>
                 <div className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-zinc-800 cursor-pointer transition-colors"><Calendar className="w-4 h-4 text-zinc-400" /></div>
                 <div className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-zinc-800 cursor-pointer transition-colors"><BookOpen className="w-4 h-4 text-zinc-400" /></div>
              </div>

           </div>
        </div>

      </div>
    ),
  },
  {
    id: "musitron",
    name: "Musitron",
    tagline: "AI Music Generator",
    description: "Generate copyright-free background music that fits your mood and pacing. Prompt-based creation.",
    color: "#EAB308",
    icon: Music,
    href: "/products/musitron",
    visual: () => (
      <div className="w-full h-full flex flex-col relative bg-[#121214] overflow-hidden text-zinc-300 rounded-xl font-sans">
         {/* Top Header */}
         <div className="h-14 border-b border-zinc-800/80 bg-[#18181B] flex items-center justify-between px-6 shrink-0 z-10">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                 <Music className="w-4 h-4 text-amber-400" />
               </div>
               <div>
                  <h3 className="text-[13px] font-bold text-zinc-100">Cyberpunk Chase Theme</h3>
                  <span className="text-[9px] text-zinc-500 font-mono">120 BPM • 02:34</span>
               </div>
            </div>
            <div className="flex items-center gap-4">
               <Save className="w-4 h-4 text-zinc-400 hover:text-white cursor-pointer" />
               <div className="px-4 py-1.5 rounded-lg bg-amber-500 text-[11px] font-bold text-amber-950 cursor-pointer hover:bg-amber-400 transition-colors">
                 Export Track
               </div>
            </div>
         </div>

         {/* Main Content Area */}
         <div className="flex-1 flex min-h-0 bg-[#0E0E10] relative">
            
            {/* Left Prompting Panel */}
            <div className="w-[35%] bg-[#121214] border-r border-zinc-800/80 p-5 flex flex-col gap-6 shrink-0 relative z-10 shadow-xl">
               <div>
                  <h4 className="text-[11px] font-bold text-white mb-3">AI Generation</h4>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                     <p className="text-[11px] text-zinc-400 leading-relaxed mb-4">
                        "High energy synthwave track with a driving bassline, retro arpeggios, and a heavy drum beat. Suitable for a fast-paced cyberpunk chase visual."
                     </p>
                     
                     {/* Tags */}
                     <div className="flex flex-wrap gap-2 mb-4">
                        {["Synthwave", "High Energy", "Dark", "120 BPM"].map(tag => (
                           <div key={tag} className="px-2 py-1 rounded bg-zinc-800 text-[9px] text-zinc-300 border border-zinc-700">
                             {tag}
                           </div>
                        ))}
                     </div>

                     <div className="h-9 w-full rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center gap-2 cursor-pointer hover:bg-amber-500/20 transition-colors">
                        <RotateCw className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-[10px] font-bold text-amber-500">Regenerate</span>
                     </div>
                  </div>
               </div>

               {/* Instrument Mix */}
               <div className="flex-1">
                  <h4 className="text-[11px] font-bold text-white mb-3">Mix Control</h4>
                  <div className="flex flex-col gap-3">
                     {[
                        { name: "Main Synth", val: 85, color: "bg-amber-500" },
                        { name: "Bassline", val: 95, color: "bg-blue-500" },
                        { name: "Drums", val: 90, color: "bg-rose-500" },
                        { name: "Arp", val: 65, color: "bg-purple-500" }
                     ].map((inst, i) => (
                        <div key={i} className="flex items-center gap-3">
                           <span className="text-[10px] text-zinc-400 w-16">{inst.name}</span>
                           <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div className={`h-full ${inst.color}`} style={{ width: `${inst.val}%` }} />
                           </div>
                           <span className="text-[9px] text-zinc-500 font-mono w-6 text-right">{inst.val}%</span>
                        </div>
                     ))}
                  </div>
               </div>
            </div>

            {/* Right Waveform Area */}
            <div className="flex-1 flex flex-col p-6 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-900/10 via-[#0E0E10] to-[#0E0E10] overflow-hidden">
               
               {/* Center Giant Waveform */}
               <div className="flex-1 flex items-center justify-center relative w-full mb-6">
                 {/* Playhead glow */}
                 <motion.div 
                   animate={{ left: "0%" }}
                   transition={{ duration: 6, ease: "linear", repeat: Infinity }}
                   className="absolute top-0 bottom-0 w-32 -ml-16 bg-gradient-to-r from-transparent via-amber-500/20 to-transparent z-0 pointer-events-none"
                 />
                 
                 <svg className="w-full h-32 relative z-10" viewBox="0 0 400 100" preserveAspectRatio="none">
                   {Array.from({length: 80}).map((_, i) => {
                     const height1 = ((Math.sin(i * 0.2) * 20) + (Math.cos(i * 0.5) * 15) + (Math.random() * 50)) + 10;
                     const height2 = ((Math.sin(i * 0.2 + 0.5) * 20) + (Math.cos(i * 0.5 + 0.3) * 15) + (Math.random() * 50)) + 10;
                     const h = i % 2 === 0 ? height1 : height2;
                     const y = 50 - h/2;
                     return (
                       <motion.rect 
                         key={i} x={i * 5} y={y} width="2.5" height={h} rx="1" 
                         className="fill-zinc-700"
                         animate={{ 
                           fill: ["#3F3F46", "#F59E0B", "#FBBF24", "#3F3F46", "#3F3F46"],
                           height: [h, h * 1.2, h, h],
                           y: [y, 50 - (h*1.2)/2, y, y]
                         }}
                         transition={{ duration: 6, repeat: Infinity, times: [0, (i/80), (i/80) + 0.05, (i/80) + 0.1, 1], ease: "linear" }}
                       />
                     );
                   })}
                 </svg>

                 {/* Sweeping Line */}
                 <motion.div 
                   animate={{ left: ["0%", "100%"] }}
                   transition={{ duration: 6, ease: "linear", repeat: Infinity }}
                   className="absolute top-0 bottom-0 w-px bg-amber-400 z-20 shadow-[0_0_10px_rgba(251,191,36,0.8)]"
                 >
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-amber-400 rounded-sm" />
                 </motion.div>
               </div>

               {/* Track Timeline Preview */}
               <div className="h-28 bg-[#121214] border border-zinc-800/80 rounded-xl p-3 flex flex-col gap-2 shrink-0">
                  <div className="flex items-center justify-between px-1 mb-1 opacity-50">
                    <span className="text-[8px] text-zinc-500 font-mono">00:00</span>
                    <span className="text-[8px] text-zinc-500 font-mono text-center flex-1">01:17</span>
                    <span className="text-[8px] text-zinc-500 font-mono">02:34</span>
                  </div>
                  
                  {/* Tracks */}
                  <div className="flex-1 flex flex-col gap-1.5 h-full relative">
                     {/* Playhead in mini track */}
                     <motion.div 
                       animate={{ left: ["0%", "100%"] }}
                       transition={{ duration: 6, ease: "linear", repeat: Infinity }}
                       className="absolute top-0 bottom-0 w-px bg-white/50 z-20 pointer-events-none"
                     />
                     <div className="w-full h-full bg-blue-500/20 rounded relative border border-blue-500/30 overflow-hidden">
                       <motion.div 
                          animate={{ width: ["0%", "100%"] }}
                          transition={{ duration: 6, ease: "linear", repeat: Infinity }}
                          className="absolute left-0 top-0 bottom-0 bg-blue-500/40"
                       />
                       <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-blue-200">Synth/Bass</span>
                     </div>
                     <div className="w-full h-full bg-rose-500/20 rounded relative border border-rose-500/30 overflow-hidden">
                       <motion.div 
                          animate={{ width: ["0%", "100%"] }}
                          transition={{ duration: 6, ease: "linear", repeat: Infinity }}
                          className="absolute left-0 top-0 bottom-0 bg-rose-500/40"
                       />
                       <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[8px] font-bold text-rose-200">Drums</span>
                     </div>
                  </div>
               </div>

            </div>
         </div>

         {/* Bottom Transport Bar */}
         <div className="h-16 border-t border-zinc-800/80 bg-[#18181B] flex items-center justify-between px-6 shrink-0 z-10 w-full">
            <div className="w-1/3 flex items-center gap-3">
               <Mic className="w-4 h-4 text-zinc-500 hover:text-white cursor-pointer" />
               <div className="flex items-center gap-2">
                 <Volume2 className="w-4 h-4 text-zinc-400" />
                 <div className="w-20 h-1 bg-zinc-800 rounded-full relative">
                   <div className="absolute left-0 top-0 bottom-0 w-3/4 bg-amber-500 rounded-full" />
                 </div>
               </div>
            </div>

            <div className="w-1/3 flex flex-col items-center justify-center gap-2">
               <div className="flex items-center gap-4">
                 <SkipBack className="w-4 h-4 text-zinc-400 hover:text-white cursor-pointer fill-zinc-400" />
                 <motion.div 
                   animate={{ scale: [1, 1.1, 1] }}
                   transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut", repeatType: "reverse" }}
                   className="w-10 h-10 rounded-full bg-amber-500 text-amber-950 flex items-center justify-center cursor-pointer shadow-[0_0_15px_rgba(251,191,36,0.5)]"
                 >
                   <Play className="w-5 h-5 ml-0.5 fill-amber-950" />
                 </motion.div>
                 <SkipForward className="w-4 h-4 text-zinc-400 hover:text-white cursor-pointer fill-zinc-400" />
               </div>
            </div>

            <div className="w-1/3 flex items-center justify-end gap-4">
               <span className="text-[11px] font-mono text-amber-500 font-bold tracking-widest">
                 <motion.span
                    animate={{ opacity: [1, 1, 1, 1] }} 
                 >01:17</motion.span>
               </span>
               <Repeat className="w-4 h-4 text-zinc-500 hover:text-white cursor-pointer" />
            </div>
         </div>

      </div>
    ),
  },
  {
    id: "uploaderx",
    name: "UploaderX",
    tagline: "Multi-Platform Distribution",
    description: "Publish to YouTube, Instagram, TikTok, and Meta simultaneously. Schedule, optimize, and track.",
    color: "#2DD4BF",
    icon: Upload,
    href: "/products/uploaderx",
    visual: () => (
      <div className="w-full h-full p-4 flex gap-4 relative bg-[#0E0E10] overflow-hidden text-zinc-300 font-sans">
        
        {/* Left Column: Post Composer (approx 45%) */}
        <div className="w-[45%] flex flex-col gap-3 relative z-10 shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Network className="w-5 h-5 text-teal-400" />
            <span className="text-[18px] font-bold text-white tracking-tight">UploaderX</span>
          </div>

          <div className="flex-1 bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-3 flex flex-col relative overflow-hidden">
             <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-500 opacity-50" />
             <h4 className="text-[11px] font-bold text-white mb-3">Compose Post</h4>
             
             {/* Media Attached */}
             <div className="w-full aspect-video bg-[#121214] rounded-lg border border-zinc-800 flex items-center justify-center relative overflow-hidden mb-3 group cursor-pointer">
                <Video className="w-6 h-6 text-zinc-600 mb-2 group-hover:scale-110 transition-transform" />
                <span className="absolute bottom-2 left-2 text-[8px] font-mono text-zinc-500 bg-zinc-900/80 px-1.5 rounded">final_cut.mp4</span>
             </div>

             {/* Caption input mock */}
             <div className="flex-1 bg-zinc-950/50 border border-zinc-800 rounded-lg p-2.5 mb-3 flex flex-col">
               <span className="text-[10px] text-zinc-400 leading-relaxed">
                 Check out our latest Cyberpunk project! The visuals and synths are insane 🚀 Let me know what you think below! #Cyberpunk #Synthwave #VFX
               </span>
               <div className="mt-auto pt-2 border-t border-zinc-800/50 flex justify-between items-center">
                 <div className="flex gap-2">
                   <Smile className="w-3.5 h-3.5 text-zinc-500 hover:text-white cursor-pointer" />
                   <Sparkles className="w-3.5 h-3.5 text-teal-400 cursor-pointer" />
                 </div>
                 <span className="text-[8px] font-mono text-zinc-600">142 / 2200</span>
               </div>
             </div>

             <div className="grid grid-cols-2 gap-2 mb-3">
               <div className="h-8 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-between px-3 cursor-pointer hover:bg-zinc-800 transition-colors">
                 <div className="flex items-center gap-1.5">
                   <Calendar className="w-3 h-3 text-zinc-400" />
                   <span className="text-[10px] text-zinc-300">Today</span>
                 </div>
               </div>
               <div className="h-8 rounded bg-zinc-900 border border-zinc-700 flex items-center justify-between px-3 cursor-pointer hover:bg-zinc-800 transition-colors">
                 <div className="flex items-center gap-1.5">
                   <Clock className="w-3 h-3 text-zinc-400" />
                   <span className="text-[10px] text-zinc-300">18:00</span>
                 </div>
               </div>
             </div>

             <div className="h-10 w-full rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center gap-2 cursor-pointer hover:bg-teal-500/20 transition-colors text-teal-400 mt-auto">
               <Share2 className="w-4 h-4" />
               <span className="text-[11px] font-bold">Schedule across Platforms</span>
             </div>
          </div>
        </div>

        {/* Right Column: Platform Status & Analytics (approx 55%) */}
        <div className="w-[55%] flex flex-col gap-4 relative z-10 shrink-0">
           
           {/* Platform Status */}
           <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex flex-col">
              <h4 className="text-[11px] font-bold text-white mb-3 flex items-center justify-between">
                Platform Routing
                <span className="text-[8px] font-mono text-teal-500 bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20">All Connections Active</span>
              </h4>
              <div className="flex flex-col gap-2 relative">
                {/* Connecting lines behind bubbles */}
                <div className="absolute left-[22px] top-6 bottom-6 w-px bg-zinc-800 z-0" />
                
                {[
                  { name: "YouTube", icon: Youtube, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", delay: 0 },
                  { name: "Instagram", icon: Instagram, color: "text-pink-500", bg: "bg-pink-500/10", border: "border-pink-500/20", delay: 0.2 },
                  { name: "TikTok", icon: Music, color: "text-cyan-400", bg: "bg-cyan-400/10", border: "border-cyan-400/20", delay: 0.4 }
                ].map((plat, i) => (
                  <motion.div 
                    key={plat.name}
                    initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: plat.delay + 0.5 }}
                    className="flex items-center gap-3 bg-zinc-950/80 border border-zinc-800/80 p-2 rounded-lg relative z-10"
                  >
                     <div className={`w-9 h-9 rounded-lg ${plat.bg} border ${plat.border} flex items-center justify-center shrink-0`}>
                       <plat.icon className={`w-4 h-4 ${plat.color}`} />
                     </div>
                     <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-[11px] font-bold text-zinc-200">{plat.name}</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <motion.div 
                            animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 2, repeat: Infinity, delay: plat.delay }}
                            className="w-1.5 h-1.5 bg-teal-500 rounded-full" 
                          />
                          <span className="text-[8px] text-zinc-500 truncate">Optimizing format...</span>
                        </div>
                     </div>
                     <div className="px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-[8px] font-mono text-zinc-300">
                       1080x1920
                     </div>
                  </motion.div>
                ))}
              </div>
           </div>

           {/* Quick Analytics Mock */}
           <div className="flex-1 bg-zinc-900/50 border border-zinc-800/80 rounded-xl p-4 flex flex-col min-h-0">
              <h4 className="text-[11px] font-bold text-white mb-3">Live Performance</h4>
              <div className="grid grid-cols-2 gap-3 mb-4">
                 <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-2.5 flex flex-col relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-8 h-8 bg-purple-500/10 blur-xl rounded-full" />
                   <div className="flex items-center gap-2 mb-1 opacity-70">
                     <Users className="w-3 h-3 text-purple-400" />
                     <span className="text-[9px] font-medium text-zinc-400">Total Views</span>
                   </div>
                   <span className="text-lg font-bold text-white tracking-tighter">1.2M</span>
                   <span className="text-[8px] text-emerald-400 font-mono mt-0.5">+14% vs last post</span>
                 </div>
                 <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-lg p-2.5 flex flex-col relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-8 h-8 bg-blue-500/10 blur-xl rounded-full" />
                   <div className="flex items-center gap-2 mb-1 opacity-70">
                     <MousePointerClick className="w-3 h-3 text-blue-400" />
                     <span className="text-[9px] font-medium text-zinc-400">Engagement Rate</span>
                   </div>
                   <span className="text-lg font-bold text-white tracking-tighter">8.4%</span>
                   <span className="text-[8px] text-emerald-400 font-mono mt-0.5">+2.1% higher</span>
                 </div>
              </div>

              {/* Mini Chart Mock */}
              <div className="flex-1 border border-zinc-800/80 rounded-lg bg-zinc-950/80 p-2 flex items-end relative overflow-hidden">
                <div className="absolute top-2 left-2 flex items-center gap-1 mb-2 opacity-50">
                   <LineChart className="w-3 h-3 text-teal-500" />
                   <span className="text-[8px] font-mono text-zinc-500">48h Velocity</span>
                </div>
                <svg className="w-full h-[60%] overflow-visible" viewBox="0 0 100 50" preserveAspectRatio="none">
                  <motion.path 
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 2, delay: 1, ease: "easeOut" }}
                    d="M 0 50 Q 10 45, 20 40 T 40 30 T 60 20 T 80 15 T 100 5" 
                    fill="none" 
                    stroke="#14B8A6" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                  />
                  <path d="M 0 50 Q 10 45, 20 40 T 40 30 T 60 20 T 80 15 T 100 5 L 100 50 L 0 50 Z" className="fill-teal-500/10 opacity-50" />
                </svg>
              </div>
           </div>

        </div>
      </div>
    ),
  },
  {
    id: "socialize",
    name: "Socialize",
    tagline: "Link-in-Bio Builder",
    description: "A smart link-in-bio that auto-updates with your latest content. Custom banners and AI styling.",
    color: "#0EA5E9",
    icon: Share2,
    href: "/products/socialize",
    visual: () => (
      <div className="w-full h-full p-4 flex gap-4 relative bg-[#0E0E10] overflow-hidden text-zinc-300">
        
        {/* Left Column: Editor (approx 60%) */}
        <div className="w-[60%] flex flex-col gap-3 relative z-10 shrink-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <Share2 className="w-5 h-5 text-blue-400" />
            <span className="text-[18px] font-bold text-white tracking-tight">Socialize</span>
          </div>

          {/* Profile Cards */}
          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-blue-600" />
              <div>
                <span className="text-[10px] font-bold text-zinc-200 block">Profile Banner</span>
                <span className="text-[8px] text-zinc-500">Color</span>
              </div>
            </div>
            <span className="text-[9px] text-zinc-400 pr-2">Edit</span>
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 border-2 border-zinc-900 overflow-hidden flex items-center justify-center shadow-inner">
                 <Sparkles className="w-5 h-5 text-white/90" />
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] font-bold text-white">alex_creates</span>
                <span className="text-[9px] text-zinc-500">Filmmaker & AI Creator</span>
              </div>
            </div>
            <div className="px-3 py-1.5 rounded bg-zinc-800 text-[9px] font-semibold text-white">
              Edit Bio
            </div>
          </div>

          {/* Live Link */}
          <div className="rounded-lg bg-blue-900/30 border border-blue-500/30 p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                <Share2 className="w-3 h-3 text-white" />
              </div>
              <span className="text-[10px] text-zinc-300">Your link is live: <span className="text-blue-400">insturix.com/bio/alex</span></span>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-950 border border-zinc-800">
               <Copy className="w-3 h-3 text-zinc-400" />
               <span className="text-[9px] font-bold text-zinc-300">Copy URL</span>
            </div>
          </div>

          {/* Buttons */}
          <div className="h-8 rounded-lg bg-blue-900/40 border border-blue-500/40 flex items-center justify-center gap-1.5 text-blue-100 mt-1 cursor-pointer hover:bg-blue-800/50 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span className="text-[10px] font-semibold">Add New Link</span>
          </div>
          
          {/* Links Section */}
          <div className="mt-2 flex-1 flex flex-col gap-2 min-h-0">
            <div className="mb-1">
              <h4 className="text-[11px] font-bold text-white">Your Links</h4>
              <p className="text-[8px] text-zinc-500">You have 2 links</p>
            </div>
            
            {/* Link 1 */}
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-2.5 flex items-center gap-3">
               <GripVertical className="w-3 h-3 text-zinc-600 cursor-grab" />
               <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center">
                  <span className="text-[10px]">🎥</span>
               </div>
               <span className="text-[10px] text-zinc-300 flex-1 truncate">https://www.youtube.com/@alex_creates</span>
               <div className="flex items-center gap-2">
                 <ExternalLink className="w-3 h-3 text-zinc-500" />
                 <Edit2 className="w-3 h-3 text-zinc-500" />
                 <Trash2 className="w-3 h-3 text-zinc-500" />
               </div>
            </div>

            {/* Link 2 */}
            <div className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-2.5 flex items-center gap-3">
               <GripVertical className="w-3 h-3 text-zinc-600 cursor-grab" />
               <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center">
                  <span className="text-[10px]">🌐</span>
               </div>
               <span className="text-[10px] text-zinc-300 flex-1 truncate">https://www.alexcreates.studio</span>
               <div className="flex items-center gap-2">
                 <ExternalLink className="w-3 h-3 text-zinc-500" />
                 <Edit2 className="w-3 h-3 text-zinc-500" />
                 <Trash2 className="w-3 h-3 text-zinc-500" />
               </div>
            </div>
            
            {/* Animated Link 3 dropping in */}
            <motion.div 
               animate={{ opacity: [0, 0, 1, 1, 0, 0], y: [-10, -10, 0, 0, 10, 10], height: [0, 0, "auto", "auto", 0, 0] }}
               transition={{ duration: 8, repeat: Infinity, times: [0, 0.4, 0.45, 0.9, 0.95, 1], ease: "easeInOut" }}
               className="rounded-lg border border-zinc-800/80 bg-zinc-900/50 p-2.5 flex items-center gap-3 overflow-hidden"
            >
               <GripVertical className="w-3 h-3 text-zinc-600" />
               <div className="w-6 h-6 rounded bg-zinc-800 flex items-center justify-center bg-blue-500/20 text-blue-400">
                  <Link2 className="w-3 h-3" />
               </div>
               <motion.div 
                 animate={{ width: ["0%", "100%", "100%", "0%"] }}
                 transition={{ duration: 8, repeat: Infinity, times: [0, 0.5, 0.9, 1] }}
                 className="h-2 bg-zinc-700/50 rounded-full flex-1"
               />
            </motion.div>
          </div>

          {/* Cursor Animation */}
          <motion.div
            animate={{ 
              left: ["60%", "20%", "20%", "85%", "85%", "60%"],
              top:  ["40%", "45%", "45%", "60%", "60%", "40%"],
              scale: [1, 1, 0.9, 1, 1, 1]
            }}
            transition={{ duration: 8, repeat: Infinity, times: [0, 0.2, 0.25, 0.5, 0.9, 1], ease: "easeInOut" }}
            className="absolute w-4 h-4 z-50 pointer-events-none drop-shadow-lg text-white"
          >
            <MousePointer2 className="w-5 h-5 -ml-2 -mt-2 fill-zinc-950" />
          </motion.div>
        </div>

        {/* Right Column: Mobile Preview (approx 40%) */}
        <div className="w-[40%] flex flex-col shrink-0 bg-[#161618] rounded-2xl border border-zinc-800 overflow-hidden relative shadow-2xl">
           <div className="p-4 pb-2 shrink-0">
             <h4 className="text-[11px] font-bold text-white">Link Preview</h4>
           </div>

           {/* Mobile Phone Frame */}
           <div className="mx-auto mt-2 w-[160px] h-[340px] rounded-[24px] border-[4px] border-zinc-900 bg-[#121214] relative overflow-hidden flex flex-col">
              {/* Profile Banner */}
              <div className="h-16 w-full bg-[#1A73A7] shrink-0" />
              
              {/* Avatar + Bio Area */}
              <div className="px-3 pb-3 relative flex-1 flex flex-col items-center">
                <div className="w-12 h-12 rounded-full border-[3px] border-[#121214] bg-gradient-to-br from-indigo-500 to-cyan-400 -mt-6 relative z-10 flex items-center justify-center overflow-hidden shadow-inner">
                   <Sparkles className="w-6 h-6 text-white/90" />
                </div>
                
                <div className="flex items-center gap-1.5 mt-2 mb-0.5 w-full justify-center">
                  <span className="text-[11px] font-bold text-white truncate">@alex_creates</span>
                  <div className="bg-[#1A73A7] px-1.5 py-0.5 rounded text-[6px] font-bold text-white pointer-events-none">Socialize</div>
                </div>
                <span className="text-[7px] text-zinc-400 text-center leading-tight mb-4 w-full truncate">Filmmaker & AI Creator</span>

                {/* Link Buttons inside the preview */}
                <div className="w-full flex flex-col gap-2">
                  <div className="w-full h-8 rounded-lg bg-zinc-800/80 border border-zinc-700/50 flex items-center px-2.5 gap-2">
                    <span className="text-[9px]">🎥</span>
                    <span className="text-[8px] font-medium text-zinc-300">YouTube</span>
                    <ExternalLink className="w-2.5 h-2.5 ml-auto text-zinc-500" />
                  </div>
                  <div className="w-full h-8 rounded-lg bg-zinc-800/80 border border-zinc-700/50 flex items-center px-2.5 gap-2">
                    <span className="text-[9px]">🌐</span>
                    <span className="text-[8px] font-medium text-zinc-300">Portfolio</span>
                    <ExternalLink className="w-2.5 h-2.5 ml-auto text-zinc-500" />
                  </div>

                  {/* Animated 3rd block in preview mirroring the editor */}
                  <motion.div 
                    animate={{ opacity: [0, 0, 1, 1, 0, 0], scale: [0.95, 0.95, 1, 1, 0.95, 0.95], height: [0, 0, 32, 32, 0, 0], marginBottom: [0, 0, 8, 8, 0, 0] }}
                    transition={{ duration: 8, repeat: Infinity, times: [0, 0.45, 0.5, 0.9, 0.95, 1], ease: "easeInOut" }}
                    className="w-full overflow-hidden"
                  >
                    <div className="w-full h-8 rounded-lg outline outline-1 outline-blue-500/40 bg-blue-500/10 flex items-center px-2.5 gap-2 shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                      <Link2 className="w-3 h-3 text-blue-400" />
                      <div className="h-1.5 w-1/2 bg-blue-400/30 rounded-full" />
                    </div>
                  </motion.div>
                </div>
              </div>
           </div>
        </div>

      </div>
    ),
  }
];

export default function ProductSuite() {
  const [activeItem, setActiveItem] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    const segment = 1 / products.length;
    let newIndex = Math.floor(latest / segment);
    if (newIndex >= products.length) newIndex = products.length - 1;
    if (newIndex < 0) newIndex = 0;
    setActiveItem(newIndex);
  });

  return (
    <section id="suite" className="bg-zinc-950 relative" ref={containerRef}>
      <div style={{ height: `${products.length * 100}vh` }}>
        <div className="sticky top-16 h-[calc(100vh-4rem)] w-full flex flex-col justify-center overflow-hidden">
          <div className="container mx-auto px-4 sm:px-6 flex flex-col h-full py-16 md:py-20">
            
            <div className="mb-8 md:mb-12">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500 mb-4">
                The Suite
              </p>
              <h2 className="text-[32px] md:text-[44px] font-bold tracking-tight text-white">
                Seven tools.{" "}
                <span className="text-zinc-500">One ecosystem.</span>
              </h2>
            </div>

            <div className="flex items-center gap-3 mb-8">
              {products.map((_, i) => (
                <div
                  key={i}
                  className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${
                    i <= activeItem ? "bg-white" : "bg-zinc-800"
                  }`}
                />
              ))}
              <span className="text-[11px] text-zinc-500 font-mono tabular-nums ml-2">
                {String(activeItem + 1).padStart(2, "0")}/{String(products.length).padStart(2, "0")}
              </span>
            </div>
            
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
               
              <div className="lg:col-span-4 flex flex-col justify-center">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeItem}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <div className="flex items-center gap-4 mb-6">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center"
                        style={{ 
                          backgroundColor: `${products[activeItem].color}15`,
                          border: `1px solid ${products[activeItem].color}30`
                        }}
                      >
                        {(() => {
                          const Icon = products[activeItem].icon;
                          return <Icon className="w-5 h-5" style={{ color: products[activeItem].color }} />;
                        })()}
                      </div>
                      <div>
                        <h3 className="text-[32px] md:text-[44px] font-bold text-white tracking-tight">
                          {products[activeItem].name}
                        </h3>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] mt-1" style={{ color: products[activeItem].color }}>
                          {products[activeItem].tagline}
                        </p>
                      </div>
                    </div>
                    
                    <p className="text-lg text-zinc-400 leading-relaxed mb-8 max-w-md">
                      {products[activeItem].description}
                    </p>
                    
                    <Link href={products[activeItem].href}>
                      <button 
                        className="inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:opacity-80"
                        style={{ color: products[activeItem].color }}
                      >
                        Explore {products[activeItem].name}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </Link>
                  </motion.div>
                </AnimatePresence>

                <div className="mt-12 space-y-1">
                  {products.map((product, index) => {
                    const isActive = index === activeItem;
                    return (
                      <button 
                        key={product.id}
                        onClick={() => setActiveItem(index)}
                        className={`block text-left text-sm font-medium transition-all duration-300 ${
                          isActive 
                            ? "text-white opacity-100" 
                            : "text-zinc-500 opacity-50 hover:opacity-80"
                        }`}
                      >
                        {String(index + 1).padStart(2, "0")} — {product.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Immersive App Visual */}
              <div className="hidden lg:flex lg:col-span-8 flex-col justify-center max-h-[600px] h-full relative">
                
                {/* Ambient Glow */}
                <motion.div 
                  className="absolute inset-10 blur-[100px] opacity-20 transition-colors duration-1000 -z-10 rounded-full"
                  animate={{ backgroundColor: products[activeItem].color }}
                />

                <div className="w-full h-full rounded-2xl bg-zinc-950 border border-zinc-700/50 relative overflow-hidden flex flex-col shadow-2xl shadow-black ring-1 ring-white/5">
                  {/* Chrome top bar */}
                  <div className="h-10 bg-gradient-to-b from-zinc-800 to-zinc-900 border-b border-zinc-950 flex items-center px-4 gap-2 shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                     <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-zinc-700/80 shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)]" />
                      <div className="w-3 h-3 rounded-full bg-zinc-700/80 shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)]" />
                      <div className="w-3 h-3 rounded-full bg-zinc-700/80 shadow-[inset_0_1px_1px_rgba(0,0,0,0.5)]" />
                    </div>
                  </div>
                  {/* Dynamic Visual Area */}
                  <div className="flex-1 relative overflow-hidden bg-zinc-950">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={activeItem}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.02 }}
                        transition={{ duration: 0.4 }}
                        className="absolute inset-0 w-full h-full"
                      >
                        {products[activeItem].visual()}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
               
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
