"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Edit3, Save, X, MessageSquare } from "lucide-react";
import { motion } from "framer-motion";
import { Idea } from "@/app/dashboard/thinkforge/types";
import { getToneDescription } from "@/app/dashboard/thinkforge/utils/toneUtils";
import { getToneColorClass } from "@/lib/thinkforge/tone";

interface SelectedIdeaDisplayProps {
  idea: Idea;
  onProceedToChat: () => void;
  onGoBack: () => void;
  onUpdateIdea: (updatedIdea: Idea) => void;
}

export default function SelectedIdeaDisplay({
  idea,
  onProceedToChat,
  onGoBack,
  onUpdateIdea
}: SelectedIdeaDisplayProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedIdea, setEditedIdea] = useState<Idea>(idea);

  const handleSave = () => {
    onUpdateIdea(editedIdea);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedIdea(idea);
    setIsEditing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            onClick={onGoBack}
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Ideas
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-red-500" />
              Selected Idea
            </h2>
            <p className="text-sm text-zinc-400">Review and edit your chosen idea</p>
          </div>
        </div>
        {!isEditing ? (
          <Button
            onClick={() => setIsEditing(true)}
            variant="outline"
            size="sm"
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <Edit3 className="h-4 w-4 mr-2" />
            Edit
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              size="sm"
              className="bg-green-600 hover:bg-green-700"
            >
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button
              onClick={handleCancel}
              variant="outline"
              size="sm"
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Idea Content */}
      <Card className="bg-black/40 border-zinc-800 backdrop-blur-xl">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {isEditing ? (
                <Input
                  value={editedIdea.idea}
                  onChange={(e) => setEditedIdea({ ...editedIdea, idea: e.target.value })}
                  className="bg-black/30 border-zinc-700 text-zinc-100 text-lg font-medium"
                  placeholder="Enter your idea..."
                />
              ) : (
                <CardTitle className="text-lg font-medium text-zinc-100">
                  {editedIdea.idea}
                </CardTitle>
              )}
            </div>
            <div 
              className={`w-4 h-4 rounded-full flex-shrink-0 ml-3 ${getToneColorClass(editedIdea.tone)}`}
              title={getToneDescription(editedIdea.tone)}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Purpose</span>
              {isEditing ? (
                <Textarea
                  value={editedIdea.purpose}
                  onChange={(e) => setEditedIdea({ ...editedIdea, purpose: e.target.value })}
                  className="bg-black/30 border-zinc-700 text-zinc-100 mt-1"
                  placeholder="What is the purpose of this content?"
                  rows={2}
                />
              ) : (
                <p className="text-sm text-zinc-300 mt-1">{editedIdea.purpose}</p>
              )}
            </div>
            <div>
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Style</span>
              {isEditing ? (
                <Textarea
                  value={editedIdea.style}
                  onChange={(e) => setEditedIdea({ ...editedIdea, style: e.target.value })}
                  className="bg-black/30 border-zinc-700 text-zinc-100 mt-1"
                  placeholder="What style should this content have?"
                  rows={2}
                />
              ) : (
                <p className="text-sm text-zinc-300 mt-1">{editedIdea.style}</p>
              )}
            </div>
            <div>
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Format</span>
              {isEditing ? (
                <Textarea
                  value={editedIdea.format}
                  onChange={(e) => setEditedIdea({ ...editedIdea, format: e.target.value })}
                  className="bg-black/30 border-zinc-700 text-zinc-100 mt-1"
                  placeholder="What format will this content take?"
                  rows={2}
                />
              ) : (
                <p className="text-sm text-zinc-300 mt-1">{editedIdea.format}</p>
              )}
            </div>
            <div>
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Platform</span>
              {isEditing ? (
                <Textarea
                  value={editedIdea.platform}
                  onChange={(e) => setEditedIdea({ ...editedIdea, platform: e.target.value })}
                  className="bg-black/30 border-zinc-700 text-zinc-100 mt-1"
                  placeholder="Which platform is this for?"
                  rows={2}
                />
              ) : (
                <p className="text-sm text-zinc-300 mt-1">{editedIdea.platform}</p>
              )}
            </div>
          </div>
          
          <div className="pt-3 border-t border-zinc-800">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Thinking Approach</span>
            {isEditing ? (
              <div className="mt-2">
                <Select
                  value={editedIdea.tone}
                  onValueChange={(value) => setEditedIdea({ ...editedIdea, tone: value as Idea['tone'] })}
                >
                  <SelectTrigger className="bg-black/30 border-zinc-700 text-zinc-100 focus:ring-2 focus:ring-red-500">
                    <SelectValue placeholder="Select thinking approach" />
                  </SelectTrigger>
                  <SelectContent className="bg-zinc-900 border-zinc-700">
                    <SelectItem value="white" className="text-zinc-100">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-white border border-gray-300"></div>
                        <span>White - Facts & Data</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="red" className="text-zinc-100">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <span>Red - Emotions & Feelings</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="black" className="text-zinc-100">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-black"></div>
                        <span>Black - Caution & Risks</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="yellow" className="text-zinc-100">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                        <span>Yellow - Optimism & Benefits</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="green" className="text-zinc-100">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                        <span>Green - Creativity & New Ideas</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="blue" className="text-zinc-100">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span>Blue - Process & Organization</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-zinc-500 mt-1">
                  {getToneDescription(editedIdea.tone)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-zinc-300 mt-1">
                {getToneDescription(editedIdea.tone)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-center">
        <Button
          onClick={onProceedToChat}
          className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 text-lg font-medium"
        >
          <MessageSquare className="h-5 w-5 mr-3" />
          Start Chat with ForgeAI
        </Button>
      </div>
    </motion.div>
  );
} 