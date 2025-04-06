"use client"

import Image from "next/image"
import React, { useEffect, useId, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { useOutsideClick } from "@/hooks/use-outside-click"
import { ChevronDown, ChevronUp, Clock, Download, Music, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

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
  `

interface Track {
  id: string
  title: string
  tags: string
  prompt: string
  image_url: string
  audio_url: string
  model_name: string
  duration: number
  createTime: string
}

export default function History() {
  const [active, setActive] = useState<Track | boolean | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest")
  const [filter, setFilter] = useState<string>("")
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    async function fetchTracks() {
      try {
        setLoading(true)
        const response = await fetch("/api/services/musitron/history")

        if (!response.ok) {
          throw new Error("Failed to fetch tracks")
        }

        const data = await response.json()
        setTracks(data.tracks || [])
      } catch (err) {
        console.error("Error fetching tracks:", err)
        setError("Failed to load your music history.")
      } finally {
        setLoading(false)
      }
    }

    fetchTracks()
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActive(false)
      }
    }

    if (active && typeof active === "object") {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = "auto"
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [active])

  useOutsideClick(ref as React.RefObject<HTMLDivElement>, () => setActive(null))

  // Format date from timestamp
  const formatDate = (timestamp: string) => {
    if (!timestamp) return "Unknown date"
    const date = new Date(Number.parseInt(timestamp))
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  // Format duration from seconds
  const formatDuration = (seconds: number) => {
    if (!seconds) return "00:00"
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  // Sort and filter tracks
  const filteredAndSortedTracks = React.useMemo(() => {
    let result = [...tracks]

    // Filter by title or tags
    if (filter) {
      const lowerFilter = filter.toLowerCase()
      result = result.filter(
        (track) =>
          track.title.toLowerCase().includes(lowerFilter) ||
          track.tags.toLowerCase().includes(lowerFilter) ||
          track.prompt.toLowerCase().includes(lowerFilter),
      )
    }

    // Sort by date
    result.sort((a, b) => {
      const dateA = Number.parseInt(a.createTime)
      const dateB = Number.parseInt(b.createTime)
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB
    })

    return result
  }, [tracks, filter, sortOrder])

  // Handle download track
  const downloadTrack = (track: Track, e: React.MouseEvent) => {
    e.stopPropagation()

    // Create a temporary anchor element
    const link = document.createElement("a")
    link.href = track.audio_url
    link.download = `${track.title}.mp3`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto w-full p-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Your Music History</h2>
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-4 items-center p-4 mb-4 border rounded-xl">
            <Skeleton className="h-14 w-14 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto w-full p-4">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-6 text-center">
          <h3 className="text-red-600 dark:text-red-400 font-medium text-lg mb-2">Error Loading History</h3>
          <p className="text-red-500 dark:text-red-300">{error}</p>
          <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  if (tracks.length === 0) {
    return (
      <div className="max-w-2xl mx-auto w-full p-4">
        <div className="bg-neutral-50 dark:bg-neutral-800/20 border border-neutral-200 dark:border-neutral-800 rounded-xl p-10 text-center">
          <Music className="w-12 h-12 text-neutral-400 mx-auto mb-4" />
          <h3 className="font-medium text-lg mb-2">No Music Created Yet</h3>
          <p className="text-neutral-500 dark:text-neutral-400 mb-6">
            You haven&apos;t created any music yet. Try creating some!
          </p>
          <Button>Create Your First Track</Button>
        </div>
      </div>
    )
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm h-full w-full z-10"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {active && typeof active === "object" ? (
          <div className="fixed inset-0 flex items-start justify-center z-[100] p-4 pt-16 sm:pt-24 overflow-auto">
            <motion.button
              key={`button-${active.id}-${id}`}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.05 } }}
              className="fixed top-4 right-4 flex items-center justify-center bg-white dark:bg-neutral-800 rounded-full h-8 w-8 shadow-md z-[101]"
              onClick={() => setActive(null)}
            >
              <X className="h-4 w-4" />
            </motion.button>

            <motion.div
              layoutId={`card-${active.id}-${id}`}
              ref={ref}
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="w-full max-w-[500px] flex flex-col bg-white dark:bg-neutral-900 rounded-2xl overflow-hidden shadow-xl mb-16"
            >
              <motion.div layoutId={`image-${active.id}-${id}`}>
                <div className="relative">
                  <Image
                    priority
                    width={500}
                    height={500}
                    src={active.image_url || "/placeholder.svg"}
                    alt={active.title}
                    className="w-full h-60 sm:h-72 object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end">
                    <div className="p-4 text-white">
                      <motion.h3 layoutId={`title-${active.id}-${id}`} className="font-bold text-xl sm:text-2xl">
                        {active.title}
                      </motion.h3>
                      <motion.p layoutId={`description-${active.id}-${id}`} className="text-white/80">
                        {active.tags} • {formatDuration(active.duration)}
                      </motion.p>
                    </div>
                  </div>
                </div>
              </motion.div>

              <div className="p-4 space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div>
                <div>
                  <h4 className="font-medium text-lg mb-2">Listen</h4>
                  <div className="bg-neutral-50 dark:bg-neutral-800 p-3 rounded-lg">
                    <audio controls className="w-full">
                      <source src={active.audio_url} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                </div>
                  <h4 className="font-medium text-lg mb-2">Prompt</h4>
                  <p className="whitespace-pre-wrap text-neutral-700 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800 p-3 rounded-lg">
                    {active.prompt}
                  </p>
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Created on {formatDate(active.createTime)}
                  </p>
                </div>

                <div className="pt-2">
                  <Button variant="outline" className="w-full" onClick={(e) => downloadTrack(active, e)}>
                    <Download className="w-4 h-4 mr-2" />
                    Download Track
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto w-full p-4">
        <div className="sticky top-0 z-[5] bg-white dark:bg-neutral-900 pt-2 pb-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <h2 className="text-2xl font-bold">Your Music History</h2>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search tracks..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-300 dark:focus:ring-neutral-700 dark:bg-neutral-800 dark:border-neutral-700"
                />
                {filter && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400"
                    onClick={() => setFilter("")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={() => setSortOrder(sortOrder === "newest" ? "oldest" : "newest")}
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
              Showing {filteredAndSortedTracks.length} {filteredAndSortedTracks.length === 1 ? "track" : "tracks"}
              {filter && <span> matching &quot;{filter}&quot;</span>}
            </div>
          )}
        </div>

        {filteredAndSortedTracks.length === 0 ? (
          <div className="text-center p-8 bg-neutral-50 dark:bg-neutral-800/20 rounded-xl border border-neutral-200 dark:border-neutral-800">
            <p className="text-neutral-600 dark:text-neutral-400">No tracks match your search.</p>
          </div>
        ) : (
          <div className="h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar pr-2">
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
                  className="p-4 flex gap-4 items-center hover:bg-neutral-50 dark:hover:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-xl cursor-pointer transition-colors"
                >
                  <motion.div layoutId={`image-${track.id}-${id}`} className="shrink-0">
                    <Image
                      width={100}
                      height={100}
                      src={track.image_url || "/placeholder.svg"}
                      alt={track.title}
                      className="h-16 w-16 rounded-lg object-cover object-center"
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

                  <Button variant="ghost" size="icon" className="shrink-0" onClick={(e) => downloadTrack(track, e)}>
                    <Download className="h-4 w-4" />
                    <span className="sr-only">Download</span>
                  </Button>
                </motion.li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  )
}

