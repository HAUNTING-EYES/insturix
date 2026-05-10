import React from "react";
import { CaptionOverlay, Caption } from "../../../types";

import { AlignLeft, PaintBucket, Mic } from "lucide-react";

import { CaptionStylePanel } from "./caption-style-panel";
import { CaptionTimeline } from "./caption-timeline";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// Re-export from standalone file (used by ai-tools.ts)
export { defaultCaptionStyles } from "./default-caption-styles";

/**
 * Props for the CaptionSettings component
 * @interface CaptionSettingsProps
 * @property {CaptionOverlay} localOverlay - Current caption overlay being edited
 * @property {Function} setLocalOverlay - Function to update the caption overlay
 * @property {number} currentFrame - Current frame position in the video
 * @property {number} startFrame - Starting frame of the caption overlay
 * @property {Caption[]} captions - Array of caption objects
 */
interface CaptionSettingsProps {
  localOverlay: CaptionOverlay;
  setLocalOverlay: (overlay: CaptionOverlay) => void;
  currentFrame: number;
  startFrame: number;
  captions: Caption[];
}

/**
 * CaptionSettings Component
 *
 * @component
 * @description
 * Provides a tabbed interface for managing caption settings including:
 * - Caption text and timing management
 * - Visual style customization
 * - Voice settings (planned feature)
 *
 * The component uses a tab-based layout to organize different aspects of caption
 * configuration, making it easier for users to focus on specific settings.
 *
 * @example
 * ```tsx
 * <CaptionSettings
 *   localOverlay={captionOverlay}
 *   setLocalOverlay={handleOverlayUpdate}
 *   currentFrame={30}
 *   startFrame={0}
 *   captions={[...]}
 * />
 * ```
 */
export const CaptionSettings: React.FC<CaptionSettingsProps> = ({
  localOverlay,
  setLocalOverlay,
  currentFrame,
}) => {
  const currentMs = (currentFrame / 30) * 1000;

  return (
    <Tabs defaultValue="display" className="w-full">
      {/* Tab Navigation */}
      <TabsList className="w-full grid grid-cols-3 bg-muted/50 backdrop-blur-sm rounded-sm border border-border gap-1">
        {/* Captions Tab */}
        <TabsTrigger
          value="captions"
          className="data-[state=active]:bg-accent data-[state=active]:text-foreground 
            rounded-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <span className="flex items-center gap-2 text-[11px]">
            <AlignLeft className="w-3 h-3" />
            Captions
          </span>
        </TabsTrigger>

        {/* Display Tab */}
        <TabsTrigger
          value="display"
          className="data-[state=active]:bg-accent data-[state=active]:text-foreground 
            rounded-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <span className="flex items-center gap-2 text-[11px]">
            <PaintBucket className="w-3 h-3" />
            Style
          </span>
        </TabsTrigger>

        {/* Voice Tab (Coming Soon) */}
        <TabsTrigger
          value="voice"
          disabled
          className="cursor-not-allowed opacity-50 rounded-sm transition-all duration-200 text-muted-foreground"
        >
          <span className="flex items-center gap-2 text-[11px]">
            <Mic className="w-3 h-3" />
            Voice
            <span className="text-[9px] ml-2 text-amber-700 dark:text-amber-400 font-medium bg-amber-100/50 dark:bg-yellow-800/50 rounded-sm px-1 py-0.5">
              SOON
            </span>
          </span>
        </TabsTrigger>
      </TabsList>

      {/* Tab Content */}
      <TabsContent
        value="display"
        className="space-y-4 mt-4 focus-visible:outline-none"
      >
        <CaptionStylePanel
          localOverlay={localOverlay}
          setLocalOverlay={setLocalOverlay}
        />
      </TabsContent>

      <TabsContent
        value="captions"
        className="space-y-4 mt-4 focus-visible:outline-none"
      >
        <CaptionTimeline
          localOverlay={localOverlay}
          setLocalOverlay={setLocalOverlay}
          currentMs={currentMs}
        />
      </TabsContent>
    </Tabs>
  );
};
