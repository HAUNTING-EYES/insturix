"use client";

import Image from "next/image";
import React, { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useOutsideClick } from "@/hooks/use-outside-click";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Music,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Add custom scrollbar styles
const customScrollbarStyles = `
    .custom-scrollbar::-webkit-scrollbar {
      width: 6px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
      background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background-color: rgba(155, 155, 155, 0.5);
      border-radius: 20px;
    }
    .custom-scrollbar {
      scrollbar-width: thin;
      scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
    }
  `;

interface Track {
  id: string;
  title: string;
  tags: string;
  prompt: string;
  image_url: string;
  audio_url: string;
  model_name: string;
  duration: number;
  createTime: string;
}

interface HistoryProps {
  shouldRefetch?: boolean;
}

export default function History({ shouldRefetch }: HistoryProps) {
  const [active, setActive] = useState<Track | boolean | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [filter, setFilter] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  const fetchTracks = async (isRefetch = false) => {
    try {
      // Only set loading to true for initial fetch, not for refetches
      if (!isRefetch) {
        setLoading(true);
      }

      console.log(`Fetching tracks (isRefetch: ${isRefetch})`);
      const response = await fetch("/api/services/musitron/history");

      if (!response.ok) {
        throw new Error("Failed to fetch tracks");
      }

      const data = await response.json();

      // Compare data to see if anything changed
      if (isRefetch && data.tracks) {
        const currentIds = new Set(tracks.map((t) => t.id));
        const newTracks = data.tracks.filter(
          (t: Track) => !currentIds.has(t.id)
        );

        if (newTracks.length > 0) {
          console.log(`Found ${newTracks.length} new tracks in history`);
          setTracks(data.tracks);
        } else {
          console.log("No new tracks found in refetch");
        }
      } else {
        setTracks(data.tracks || []);
      }
    } catch (err) {
      console.error("Error fetching tracks:", err);
      setError("Failed to load your music history.");
    } finally {
      // Only update loading state for initial fetch
      if (!isRefetch) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchTracks();
  }, []);
  // ignore the eslint error. Causes infinite loading shit.

  // Add a new useEffect to refetch when shouldRefetch changes
  useEffect(() => {
    if (shouldRefetch) {
      console.log("Refetching tracks due to shouldRefetch flag change");
      fetchTracks(true); // Pass true to indicate this is a refetch
    }
  }, [shouldRefetch]);
  // ignore the eslint error. Causes infinite loading shit.

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActive(false);
      }
    }

    // Fixed position scroll lock method
    if (active && typeof active === "object") {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = "100%";
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.setAttribute("data-scroll-lock", scrollY.toString());
    } else {
      const scrollY = parseInt(
        document.body.getAttribute("data-scroll-lock") || "0",
        10
      );
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.removeAttribute("data-scroll-lock");
      window.scrollTo(0, -scrollY);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // Always restore scroll on unmount
      const scrollY = parseInt(
        document.body.getAttribute("data-scroll-lock") || "0",
        10
      );
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.left = "";
      document.body.style.right = "";
      document.body.removeAttribute("data-scroll-lock");
      window.scrollTo(0, -scrollY);
    };
  }, [active]);

  useOutsideClick(ref as React.RefObject<HTMLDivElement>, () =>
    setActive(null)
  );

  // Format date from timestamp
  const formatDate = (timestamp: string) => {
    if (!timestamp) return "Unknown date";
    const date = new Date(Number.parseInt(timestamp));
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Format duration from seconds
  const formatDuration = (seconds: number) => {
    if (!seconds) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  // Sort and filter tracks
  const filteredAndSortedTracks = React.useMemo(() => {
    let result = [...tracks];

    // Filter by title or tags
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter(
        (track) =>
          track.title.toLowerCase().includes(lowerFilter) ||
          track.tags.toLowerCase().includes(lowerFilter) ||
          track.prompt.toLowerCase().includes(lowerFilter)
      );
    }

    // Sort by date
    result.sort((a, b) => {
      const dateA = Number.parseInt(a.createTime);
      const dateB = Number.parseInt(b.createTime);
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [tracks, filter, sortOrder]);

  // Handle download track
  const downloadTrack = (track: Track, e: React.MouseEvent) => {
    e.stopPropagation();

    // Create a temporary anchor element
    const link = document.createElement("a");
    link.href = track.audio_url;
    link.download = `${track.title}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Show improved loading UI with card container and centered skeletons
  if (loading) {
    return (
      <div className="max-w-2xl mx-auto w-full px-2 sm:px-4 py-6">
        {/* Match dashboard card style: background, border, rounded, shadow */}
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 sm:p-6 shadow">
          <div className="flex flex-col gap-2 mb-4">
            <h2 className="text-2xl font-bold">Your Music History</h2>
          </div>
          {/* Responsive loading skeletons */}
          <div className="min-h-[220px] sm:min-h-[300px] max-h-[70vh] overflow-y-auto custom-scrollbar pr-1 sm:pr-2 mt-2">
            <ul className="space-y-3 pb-4">
              {[1, 2, 3, 4].map((i) => (
                <li
                  key={i}
                  className="p-3 sm:p-4 flex gap-3 sm:gap-4 items-center border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-sm bg-white/80 dark:bg-neutral-800/40"
                >
                  <Skeleton className="h-12 w-12 sm:h-16 sm:w-16 rounded-xl" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-8 w-8 rounded-full" />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto w-full p-4">
        {/* Match dashboard card style for error state */}
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 text-center shadow">
          <h3 className="text-red-600 dark:text-red-400 font-medium text-lg mb-2">
            Error Loading History
          </h3>
          <p className="text-red-500 dark:text-red-300">{error}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  if (tracks.length === 0) {
    return (
      <div className="max-w-2xl mx-auto w-full p-4">
        {/* Match dashboard card style for empty state */}
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-10 text-center shadow">
          <Music className="w-12 h-12 text-neutral-400 mx-auto mb-4" />
          <h3 className="font-medium text-lg mb-2">No Music Created Yet</h3>
          <p className="text-neutral-500 dark:text-neutral-400 mb-6">
            You haven&apos;t created any music yet. Try creating some!
          </p>
          <Button>Create Your First Track</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>
        {customScrollbarStyles}
      </style>
      <AnimatePresence>
        {active && typeof active === "object" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm h-full w-full z-10"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {active && typeof active === "object" && (
          <div className="fixed inset-0 z-[100] h-screen w-screen flex items-center justify-center bg-black/50 backdrop-blur-sm p-2 sm:p-6 overflow-hidden">
            <motion.button
              key={`button-${active.id}-${id}`}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              className="absolute top-6 right-6 flex items-center justify-center bg-white dark:bg-neutral-800 rounded-full h-10 w-10 shadow-lg z-[101] border border-neutral-200 dark:border-neutral-800"
              onClick={() => setActive(null)}
              aria-label="Close"
              title="Close"
            >
              <X className="h-5 w-5" />
            </motion.button>

            <motion.div
              layoutId={`card-${active.id}-${id}`}
              ref={ref}
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="w-full max-w-2xl min-h-[60vh] max-h-[calc(100vh-3rem)] flex flex-col bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-2xl relative"
            >
              {/* Large cover image */}
              <motion.div layoutId={`image-${active.id}-${id}`}>
                <div className="relative">
                  <Image
                    priority
                    width={800}
                    height={400}
                    src={active.image_url || "/placeholder.svg"}
                    alt={active.title}
                    className="w-full h-64 sm:h-80 object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent flex items-end pointer-events-none">
                    <div className="p-6 text-white">
                      <motion.h3
                        layoutId={`title-${active.id}-${id}`}
                        className="font-bold text-2xl sm:text-3xl drop-shadow"
                      >
                        {active.title}
                      </motion.h3>
                      <motion.p
                        layoutId={`description-${active.id}-${id}`}
                        className="text-white/80 text-base sm:text-lg"
                      >
                        {active.tags} • {formatDuration(active.duration)}
                      </motion.p>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Popup content */}
              <div className="p-6 space-y-8 flex-1 overflow-y-auto custom-scrollbar">
                <div>
                  <h4 className="font-medium text-lg mb-2">Listen</h4>
                  <div className="bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 shadow-sm">
                    <audio controls className="w-full">
                      <source src={active.audio_url} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                </div>
                <div>
                  <h4 className="font-medium text-lg mb-2">Prompt</h4>
                  {/* Scrollable lyrics/prompt section */}
                  <div className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-800 p-4 rounded-lg border border-neutral-200 dark:border-neutral-800 max-h-60 overflow-y-auto custom-scrollbar">
                    {active.prompt.startsWith("[Instrumental]") ? (
                      <p>
                        This is an instrumental generated song. This
                        doesn&apos;t contain any lyrics.
                      </p>
                    ) : (
                      active.prompt
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Created on {formatDate(active.createTime)}
                  </p>
                </div>
                <div>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={(e) => downloadTrack(active, e)}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Track
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto w-full px-2 sm:px-4 py-6">
        {/* Match dashboard card style for main container */}
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 sm:p-6 shadow">
          <div className="flex flex-col gap-2 mb-4">
            <h2 className="text-2xl font-bold">Your Music History</h2>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search tracks..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-700 dark:bg-neutral-800 transition-all"
                />
                {filter && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400"
                    onClick={() => setFilter("")}
                    title="Clear search"
                    aria-label="Clear search"
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {/* Sort button with fixed width and height for consistency */}
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1 w-32 h-10 min-w-[8rem] min-h-[2.5rem] justify-center"
                onClick={() =>
                  setSortOrder(sortOrder === "newest" ? "oldest" : "newest")
                }
              >
                <Clock className="h-4 w-4" />
                {sortOrder === "newest" ? (
                  <>
                    Newest <ChevronDown className="h-3 w-3 ml-1" />
                  </>
                ) : (
                  <>
                    Oldest <ChevronUp className="h-3 w-3 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </div>
          {filteredAndSortedTracks.length > 0 && (
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              Showing {filteredAndSortedTracks.length}{" "}
              {filteredAndSortedTracks.length === 1 ? "track" : "tracks"}
              {filter && <span> matching &quot;{filter}&quot;</span>}
            </div>
          )}
          {filteredAndSortedTracks.length === 0 ? (
            <div className="text-center p-8 bg-white/80 dark:bg-neutral-800/40 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow mt-6">
              <p className="text-neutral-600 dark:text-neutral-400">
                No tracks match your search.
              </p>
            </div>
          ) : (
            <div className="min-h-[220px] sm:min-h-[300px] max-h-[70vh] overflow-y-auto custom-scrollbar pr-1 sm:pr-2 mt-2">
              {/* Responsive height for music history list */}
              <ul className="space-y-3 pb-4">
                {filteredAndSortedTracks.map((track, index) => (
                  <motion.li
                    layoutId={`card-${track.id}-${id}`}
                    key={`card-${track.id}-${id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{
                      opacity: 1,
                      y: 0,
                      transition: { delay: index * 0.05, duration: 0.2 },
                    }}
                    onClick={() => setActive(track)}
                    className="p-3 sm:p-4 flex gap-3 sm:gap-4 items-center hover:bg-neutral-100 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-2xl cursor-pointer transition-colors shadow-sm bg-white dark:bg-neutral-900"
                  >
                    <motion.div
                      layoutId={`image-${track.id}-${id}`}
                      className="shrink-0"
                    >
                      <Image
                        width={100}
                        height={100}
                        src={track.image_url || "/placeholder.svg"}
                        alt={track.title}
                        className="h-12 w-12 sm:h-16 sm:w-16 rounded-xl object-cover object-center"
                      />
                    </motion.div>
                    <div className="flex-1 min-w-0">
                      <motion.h3
                        layoutId={`title-${track.id}-${id}`}
                        className="font-medium text-neutral-800 dark:text-neutral-200 truncate"
                      >
                        {track.title}
                      </motion.h3>
                      <motion.p
                        layoutId={`description-${track.id}-${id}`}
                        className="text-neutral-600 dark:text-neutral-400 truncate"
                      >
                        {track.tags} • {formatDuration(track.duration)}
                      </motion.p>
                      <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">
                        {formatDate(track.createTime)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={(e) => downloadTrack(track, e)}
                    >
                      <Download className="h-4 w-4" />
                      <span className="sr-only">Download</span>
                    </Button>
                  </motion.li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {/* Removed duplicate card list rendering to prevent layout issues */}
      </div>
    </>
  );
}
