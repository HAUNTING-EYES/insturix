import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEditorContext } from "../../../contexts/editor-context";
import { useTimelinePositioning } from "../../../hooks/use-timeline-positioning";
import { useTimeline } from "../../../contexts/timeline-context";
import { CaptionOverlay, OverlayType, Caption, CaptionWord } from "../../../types";
import { CaptionSettings } from "./caption-settings";
import { defaultCaptionStyles, defaultDisplayConfig } from "./default-caption-styles";
import { groupWordsIntoCaptions } from "@/lib/editron/utils/caption-utils";
import { Upload, X } from "lucide-react";

/**
 * Interface for word timing data from uploaded files
 * @interface WordData
 */
interface WordData {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

/**
 * Interface for the structure of uploaded caption files
 * @interface WordsFileData
 */
interface WordsFileData {
  words: WordData[];
}

/**
 * CaptionsPanel Component
 *
 * @component
 * @description
 * Main interface for managing captions in the video editor.
 * Provides functionality for:
 * - Uploading caption files (.json)
 * - Manual script entry
 * - Caption generation from text
 * - Caption editing and styling
 *
 * The component handles both the initial caption creation process
 * and the management of existing captions through different states
 * and interfaces.
 *
 * Features:
 * - File upload support
 * - Text-to-caption conversion
 * - Automatic timing calculation
 * - Position management in the timeline
 * - Integration with the editor's overlay system
 *
 * @example
 * ```tsx
 * <CaptionsPanel />
 * ```
 */
export const CaptionsPanel: React.FC = () => {
  const [script, setScript] = useState("");
  const [isBannerVisible, setIsBannerVisible] = useState(true);
  const {
    addOverlay,
    overlays,
    selectedOverlayId,
    durationInFrames,
    changeOverlay,
    currentFrame,
  } = useEditorContext();

  const { findNextAvailablePosition } = useTimelinePositioning();
  const { visibleRows } = useTimeline();
  const [localOverlay, setLocalOverlay] = useState<CaptionOverlay | null>(null);

  React.useEffect(() => {
    if (selectedOverlayId === null) {
      return;
    }

    const selectedOverlay = overlays.find(
      (overlay) => overlay.id === selectedOverlayId
    );

    if (selectedOverlay?.type === OverlayType.CAPTION) {
      setLocalOverlay(selectedOverlay as CaptionOverlay);
    }
  }, [selectedOverlayId, overlays]);

  const generateCaptions = () => {
    const sentences = script
      .split(/[.!?]+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0);

    let currentStartTime = 0;
    const wordsPerMinute = 160;
    const msPerWord = (60 * 1000) / wordsPerMinute;

    const processedCaptions: Caption[] = sentences.map((sentence) => {
      const words = sentence.split(/\s+/);
      const sentenceStartTime = currentStartTime;

      const processedWords = words.map((word, index) => ({
        word,
        startMs: sentenceStartTime + index * msPerWord,
        endMs: sentenceStartTime + (index + 1) * msPerWord,
        confidence: 0.99,
      }));

      const caption: Caption = {
        text: sentence,
        startMs: sentenceStartTime,
        endMs: sentenceStartTime + words.length * msPerWord,
        timestampMs: null,
        confidence: 0.99,
        words: processedWords,
      };

      currentStartTime = caption.endMs + 500;
      return caption;
    });

    // Calculate total duration in frames
    const totalDurationMs = currentStartTime;
    const calculatedDurationInFrames = Math.ceil((totalDurationMs / 1000) * 30);

    const position = findNextAvailablePosition(
      overlays,
      visibleRows,
      durationInFrames
    );

    const newCaptionOverlay: CaptionOverlay = {
      id: Date.now(),
      type: OverlayType.CAPTION,
      from: position.from,
      durationInFrames: calculatedDurationInFrames,
      captions: processedCaptions,
      // Responsive positioning: 80% width, centered, bottom 15%
      left: playerDimensions.width * 0.1,
      top: playerDimensions.height * 0.75,
      width: playerDimensions.width * 0.8,
      height: playerDimensions.height * 0.2,
      rotation: 0,
      isDragging: false,
      row: position.row,
      styles: defaultCaptionStyles,
      displayConfig: defaultDisplayConfig,
      position: "bottom",
    };

    addOverlay(newCaptionOverlay);
    setScript("");
  };

  const handleUpdateOverlay = (updatedOverlay: CaptionOverlay) => {
    setLocalOverlay(updatedOverlay);
    changeOverlay(updatedOverlay.id, updatedOverlay);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(
          e.target?.result as string
        ) as WordsFileData;

        // Convert WordData to CaptionWord format
        const captionWords: CaptionWord[] = jsonData.words.map((w) => ({
          word: w.word,
          startMs: w.start * 1000,
          endMs: w.end * 1000,
          confidence: w.confidence,
        }));

        // Use utility function to group words based on default config
        const processedCaptions = groupWordsIntoCaptions(captionWords, {
          wordsPerGroup: defaultDisplayConfig.wordsPerGroup,
          groupByPunctuation: true,
        });

        // Calculate total duration
        const totalDurationMs =
          processedCaptions[processedCaptions.length - 1].endMs;
        const calculatedDurationInFrames = Math.ceil(
          (totalDurationMs / 1000) * 30
        );

        const position = findNextAvailablePosition(
          overlays,
          visibleRows,
          durationInFrames
        );

        const newCaptionOverlay: CaptionOverlay = {
          id: Date.now(),
          type: OverlayType.CAPTION,
          from: position.from,
          durationInFrames: calculatedDurationInFrames,
          captions: processedCaptions,
          // Responsive positioning: 80% width, centered, bottom 15%
          left: playerDimensions.width * 0.1,
          top: playerDimensions.height * 0.75,
          width: playerDimensions.width * 0.8,
          height: playerDimensions.height * 0.2,
          rotation: 0,
          isDragging: false,
          row: position.row,
          styles: defaultCaptionStyles,
          displayConfig: defaultDisplayConfig,
          position: "bottom",
        };

        addOverlay(newCaptionOverlay);
      } catch (error) {
        // If it's not JSON, treat it as plain text
        const text = e.target?.result;
        if (typeof text === "string") {
          setScript(text);
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col gap-6 p-4 bg-transparent dark:bg-transparent">
      {!localOverlay ? (
        <>
          <div className="space-y-4">
            <div className="flex flex-col gap-2">
              {isBannerVisible && (
                <div
                  className="relative rounded-lg bg-muted/50 
                  border border-border p-3 shadow-[0_1px_3px_0_rgb(0,0,0,0.05)]"
                >
                  <button
                    onClick={() => setIsBannerVisible(false)}
                    className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground 
                      transition-colors p-1.5 hover:bg-accent rounded-md"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="space-y-1.5">
                    <h3 className="text-xs font-medium text-gray-800 dark:text-gray-200">
                      How would you like this to work?
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 pr-4">
                      We&apos;re actively improving captions support and would
                      love your feedback!
                    </p>
                    <a
                      href="/docs/captions"
                      className="inline-flex items-center text-xs text-primary 
                        hover:text-primary/80 font-medium transition-colors"
                    >
                      Learn more about captions
                      <svg
                        className="w-3.5 h-3.5 ml-0.5"
                        viewBox="0 0 16 16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M6.5 3.5L11 8L6.5 12.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full border-dashed border-2 border-border
                  hover:border-primary/50 bg-muted/50
                  hover:bg-muted h-28 
                  flex flex-col items-center justify-center gap-3 text-sm group transition-all duration-200"
                  onClick={() =>
                    document.getElementById("file-upload")?.click()
                  }
                >
                  <Upload className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <div className="flex flex-col items-center">
                    <span className="text-gray-600 dark:text-gray-300 group-hover:text-gray-800 dark:group-hover:text-gray-200">
                      Upload Script File
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      Supported formats: .json
                    </span>
                  </div>
                </Button>
                <input
                  id="file-upload"
                  type="file"
                  accept=".txt,.srt,.vtt,.json"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>

              <div className="relative">
                <div className="absolute inset-x-0 -top-3 flex items-center justify-center">
                  <span
                    className="px-3 py-1 text-xs text-muted-foreground dark:text-muted-foreground bg-background dark:bg-background 
                  rounded-full border border-border dark:border-border"
                  >
                    or
                  </span>
                </div>
                <div className="pt-2">
                  <Textarea
                    value={script}
                    onChange={(e) => setScript(e.target.value)}
                    placeholder="Type or paste your script here..."
                    className="min-h-[200px] bg-background dark:bg-background 
                    border-border dark:border-border 
                    text-foreground dark:text-foreground 
                    placeholder:text-muted-foreground dark:placeholder:text-muted-foreground 
                    focus:border-primary/50 focus:ring-1 focus:ring-primary/30 
                    transition-all rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={generateCaptions}
                className="flex-1 text-white dark:text-black
                disabled:bg-muted disabled:text-muted-foreground disabled:dark:bg-muted 
                disabled:dark:text-muted-foreground disabled:opacity-100 disabled:cursor-not-allowed 
                transition-colors"
                disabled={!script.trim()}
              >
                Generate Captions
              </Button>
              {script && (
                <Button
                  variant="ghost"
                  className="text-sm text-muted-foreground dark:text-muted-foreground 
                  hover:text-foreground dark:hover:text-foreground 
                  hover:bg-muted/50 dark:hover:bg-muted/50 
                   transition-colors"
                  onClick={() => setScript("")}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </>
      ) : (
        <CaptionSettings
          currentFrame={currentFrame}
          localOverlay={localOverlay}
          setLocalOverlay={handleUpdateOverlay}
          startFrame={localOverlay.from}
          captions={localOverlay.captions}
        />
      )}
    </div>
  );
};
