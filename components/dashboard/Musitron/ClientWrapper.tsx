"use client";

import { lazy, Suspense } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MusicGenerator from "./MusicGenerator";
import { RecordingStudio } from "./RecordingStudio";
import { JukeboxCollections } from "./JukeboxCollections";

const DAWProvider = lazy(() =>
  import("./DAW/DAWContext").then((mod) => ({ default: mod.DAWProvider }))
);
const DAWWorkspace = lazy(() => import("./DAW/DAWWorkspace"));

interface ClientWrapperProps {
  activeTab: "studio" | "daw" | "jukebox";
  onSwitchTab?: (tab: "studio" | "daw" | "jukebox") => void;
}

const motionProps = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
} as const;

export function ClientWrapper({ activeTab, onSwitchTab }: ClientWrapperProps) {
  return (
    <AnimatePresence mode="wait">
      {activeTab === "daw" ? (
        <motion.div key="daw" {...motionProps}>
          <Suspense
            fallback={
              <div style={{ height: "80vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#5F5E5A", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                Loading DAW...
              </div>
            }
          >
            <DAWProvider>
              <DAWWorkspace onSwitchToStudio={() => onSwitchTab?.("studio")}>
                <MusicGenerator />
              </DAWWorkspace>
            </DAWProvider>
          </Suspense>
        </motion.div>
      ) : activeTab === "jukebox" ? (
        <motion.div key="jukebox" {...motionProps}>
          <JukeboxCollections />
        </motion.div>
      ) : (
        <motion.div key="studio" {...motionProps}>
          <RecordingStudio>
            <MusicGenerator />
          </RecordingStudio>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
