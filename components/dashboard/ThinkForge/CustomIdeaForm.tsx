"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { Idea } from "@/app/dashboard/thinkforge/types";

interface CustomIdeaFormProps {
  onSubmit: (idea: Idea) => void;
  onGoBack: () => void;
}

export default function CustomIdeaForm({ onSubmit, onGoBack }: CustomIdeaFormProps) {
  const [formData, setFormData] = useState({
    idea: "",
    purpose: "",
    style: "",
    format: "",
    platform: "",
    tone: "white" as Idea['tone']
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.idea.trim()) return;

    const customIdea: Idea = {
      id: Date.now(),
      ...formData
    };
    onSubmit(customIdea);
  };

  const handleInputChange = (field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-[#0B0B0A] border-[#1C1B19] backdrop-blur-xl">
        <CardHeader>
          <div className="flex items-center gap-4">
            <Button
              onClick={onGoBack}
              variant="outline"
              size="sm"
              className="border-[#282724] text-[#B5B2A8] hover:bg-[#1C1B19]"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <div>
              <CardTitle className="text-lg font-medium text-[#ECE9E1] flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[#D4A652]" />
                Create Your Own Idea
              </CardTitle>
              <p className="text-sm text-[#7A776E] mt-1">
                Define your content idea with all the details
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Main Idea */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#B5B2A8]">
                Your Content Idea *
              </label>
              <Textarea
                value={formData.idea}
                onChange={(e) => handleInputChange('idea', e.target.value)}
                placeholder="Describe your content idea in detail..."
                className="bg-[#0B0B0A] border-[#282724] text-[#ECE9E1] placeholder:text-[#5F5E5A] focus:ring-2 focus:ring-[#D4A652]"
                rows={3}
                required
              />
            </div>

            {/* Purpose */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-[#B5B2A8]">
                Purpose
              </label>
              <Textarea
                value={formData.purpose}
                onChange={(e) => handleInputChange('purpose', e.target.value)}
                placeholder="What is the main purpose of this content? What do you want to achieve?"
                className="bg-[#0B0B0A] border-[#282724] text-[#ECE9E1] placeholder:text-[#5F5E5A] focus:ring-2 focus:ring-[#D4A652]"
                rows={2}
              />
            </div>

            {/* Style and Format */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#B5B2A8]">
                  Style
                </label>
                <Textarea
                  value={formData.style}
                  onChange={(e) => handleInputChange('style', e.target.value)}
                  placeholder="What style should this content have? (e.g., professional, casual, humorous)"
                  className="bg-[#0B0B0A] border-[#282724] text-[#ECE9E1] placeholder:text-[#5F5E5A] focus:ring-2 focus:ring-[#D4A652]"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#B5B2A8]">
                  Format
                </label>
                <Textarea
                  value={formData.format}
                  onChange={(e) => handleInputChange('format', e.target.value)}
                  placeholder="What format will this take? (e.g., video, blog post, social media post)"
                  className="bg-[#0B0B0A] border-[#282724] text-[#ECE9E1] placeholder:text-[#5F5E5A] focus:ring-2 focus:ring-[#D4A652]"
                  rows={2}
                />
              </div>
            </div>

            {/* Platform and Tone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#B5B2A8]">
                  Platform
                </label>
                <Input
                  value={formData.platform}
                  onChange={(e) => handleInputChange('platform', e.target.value)}
                  placeholder="Which platform? (e.g., YouTube, Instagram, LinkedIn)"
                  className="bg-[#0B0B0A] border-[#282724] text-[#ECE9E1] placeholder:text-[#5F5E5A] focus:ring-2 focus:ring-[#D4A652]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-[#B5B2A8]">
                  Thinking Approach
                </label>
                <Select
                  value={formData.tone}
                  onValueChange={(value) => handleInputChange('tone', value as Idea['tone'])}
                >
                  <SelectTrigger className="bg-[#0B0B0A] border-[#282724] text-[#ECE9E1] focus:ring-2 focus:ring-[#D4A652]">
                    <SelectValue placeholder="Select thinking approach" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#0F0F0E] border-[#282724]">
                    <SelectItem value="white" className="text-[#ECE9E1]">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-white border border-gray-300"></div>
                        <span>White - Facts & Data</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="red" className="text-[#ECE9E1]">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-[#D4A652]"></div>
                        <span>Red - Emotions & Feelings</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="black" className="text-[#ECE9E1]">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-black"></div>
                        <span>Black - Caution & Risks</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="yellow" className="text-[#ECE9E1]">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                        <span>Yellow - Optimism & Benefits</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="green" className="text-[#ECE9E1]">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span>Green - Creativity & New Ideas</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="blue" className="text-[#ECE9E1]">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span>Blue - Process & Organization</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-center pt-4">
              <Button
                type="submit"
                disabled={!formData.idea.trim()}
                className="bg-[#D4A652] hover:bg-[#D4A652] text-white px-8 py-3 text-lg font-medium"
              >
                <Sparkles className="h-5 w-5 mr-3" />
                Create Idea & Start Chat
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
} 