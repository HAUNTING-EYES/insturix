"use client";

import React, { useState, useEffect } from 'react';
import { CLICKATRON_MODELS, ModelConfig, getAvailableModels } from '@/lib/config/clickatron-models';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bot } from 'lucide-react';

interface ModelSelectorProps {
  context: 'ideation' | 'newVariation' | 'edit';
  userAttachedImages?: number;
  selectedModelId?: string;
  onModelChange: (modelId: string) => void;
  className?: string;
}

export function ModelSelector({
  context,
  userAttachedImages = 0,
  selectedModelId,
  onModelChange,
  className = ""
}: ModelSelectorProps) {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);

  useEffect(() => {
  // Filter models based on the context and number of user attached images
  const filteredModels = getAvailableModels(context, userAttachedImages);
    
    setModels(filteredModels);
    
    // Find the default model for this filter
    const defaultModel = filteredModels.find(model => model.isDefault) || filteredModels[0];
    if (defaultModel) {
      setDefaultModelId(defaultModel.id);
      // If no model is selected, select the default one
      if (!selectedModelId) {
        onModelChange(defaultModel.id);
      }
    }
  }, [context, userAttachedImages, selectedModelId, onModelChange]);

  const handleModelChange = (modelId: string) => {
    onModelChange(modelId);
  };

  // If no models are available for this stage, don't render anything
  if (models.length === 0) {
    return null;
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Bot className="h-4 w-4 text-zinc-400" />
      <Select 
        value={selectedModelId || defaultModelId || ""} 
        onValueChange={handleModelChange}
      >
        <SelectTrigger className="w-[180px] bg-zinc-800/50 border-zinc-700/50 text-zinc-200">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent className="bg-zinc-800 border-zinc-700">
          {models.map((model) => (
            <SelectItem 
              key={model.id} 
              value={model.id}
              className="text-zinc-200 hover:bg-zinc-700/50 focus:bg-zinc-70/50"
            >
              {model.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}