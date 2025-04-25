"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, X } from "lucide-react";

interface VoiceInputProps {
  onClose: () => void;
  onTranscript: (text: string) => void;
  className?: string;
}

export function VoiceInput({
  onClose,
  onTranscript,
  className,
}: VoiceInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [visualizer, setVisualizer] = useState<number[]>(Array(20).fill(5));

  // Simulate voice recording
  useEffect(() => {
    if (!isRecording) {
      return;
    }

    // Simulate audio visualization
    const interval = setInterval(() => {
      setVisualizer(
        Array(20)
          .fill(0)
          .map(() => Math.floor(Math.random() * 40) + 5)
      );
    }, 100);

    // Simulate transcript after 3 seconds
    const timeout = setTimeout(() => {
      setTranscript("This is a simulated voice transcript.");
    }, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isRecording]);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (isRecording) {
      // If we were recording and now stopping, we'd submit the transcript
      if (transcript) {
        onTranscript(transcript);
      }
    } else {
      // Starting a new recording
      setTranscript("");
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className={cn(
          "bg-card border border-border rounded-lg shadow-lg w-full max-w-md p-6",
          className
        )}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium">Voice Input</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        <div className="flex flex-col items-center gap-6">
          <div className="w-full h-20 bg-muted rounded-md flex items-center justify-center overflow-hidden">
            {isRecording ? (
              <div className="flex items-end h-16 gap-[2px]">
                {visualizer.map((height, i) => (
                  <div
                    key={i}
                    className="w-2 bg-primary rounded-t-sm"
                    style={{
                      height: `${height}px`,
                      transition: "height 0.1s ease",
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {transcript || "Press the microphone button to start recording"}
              </p>
            )}
          </div>

          <Button
            size="lg"
            variant={isRecording ? "destructive" : "default"}
            className={cn(
              "h-16 w-16 rounded-full",
              isRecording && "animate-pulse"
            )}
            onClick={toggleRecording}
          >
            {isRecording ? (
              <MicOff className="h-6 w-6" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
            <span className="sr-only">
              {isRecording ? "Stop Recording" : "Start Recording"}
            </span>
          </Button>

          {transcript && (
            <div className="w-full">
              <p className="text-sm font-medium mb-2">Transcript:</p>
              <div className="bg-muted p-3 rounded-md text-sm">
                {transcript}
              </div>
              <div className="flex justify-end mt-4">
                <Button
                  onClick={() => onTranscript(transcript)}
                  disabled={!transcript}
                >
                  Use Transcript
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
