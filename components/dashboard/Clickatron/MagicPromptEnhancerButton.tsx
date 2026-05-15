import React from 'react';
import { Button } from '@/components/ui/button';
import { Wand2, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface MagicPromptEnhancerButtonProps {
  onEnhance: (prompt: string) => Promise<string>;
  isEnhancing: boolean;
  disabled: boolean;
  getPrompt: () => string;
  onPromptEnhanced: (enhancedPrompt: string) => void;
}

export function MagicPromptEnhancerButton({
  onEnhance,
  isEnhancing,
  disabled,
  getPrompt,
  onPromptEnhanced,
}: MagicPromptEnhancerButtonProps) {
  const handleEnhance = async () => {
    const currentPrompt = getPrompt();
    if (!currentPrompt.trim()) {
      toast({
        title: "Prompt is required",
        description: "Please enter a prompt to enhance.",
        variant: "destructive",
      });
      return;
    }

    try {
      const enhancedPrompt = await onEnhance(currentPrompt);
      onPromptEnhanced(enhancedPrompt);
      toast({
        title: "Prompt Enhanced",
        description: "Your prompt has been successfully enhanced!",
      });
    } catch (error) {
      console.error('Error enhancing prompt:', error);
      toast({
        title: "Enhancement Failed",
        description: error instanceof Error ? error.message : "Failed to enhance prompt. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleEnhance}
      disabled={disabled || isEnhancing}
      className="h-10 w-10 p-0 rounded-xl text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#282724]/50 transition-colors"
    >
      {isEnhancing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Wand2 className="h-4 w-4" />
      )}
    </Button>
  );
}