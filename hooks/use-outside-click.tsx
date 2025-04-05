"use client"

import type React from "react"
import { useEffect, useCallback, useRef } from "react"

/**
 * Hook that detects clicks outside of a specified element
 *
 * @param ref - React ref object pointing to the element to monitor
 * @param callback - Function to call when a click outside is detected
 * @param enabled - Optional boolean to enable/disable the hook (defaults to true)
 * @returns void
 *
 * @example
 * const modalRef = useRef(null);
 * useOutsideClick(modalRef, () => setIsOpen(false));
 */
export const useOutsideClick = <T extends HTMLElement = HTMLElement>(
  ref: React.RefObject<T>,
  callback: (event: MouseEvent | TouchEvent) => void,
  enabled = true,
) => {
  // Store the callback in a ref to avoid recreating the listener on every render
  const callbackRef = useRef(callback)
  // Update the callback ref when the callback changes
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  // Memoize the event listener to prevent unnecessary re-renders
  const handleClickOutside = useCallback(
    (event: MouseEvent | TouchEvent) => {
      try {
        // Check if the ref is valid and if the click was outside
        if (!ref.current || ref.current.contains(event.target as Node)) {
          return
        }

        // Call the latest callback
        callbackRef.current(event)
      } catch (error) {
        console.error("Error in useOutsideClick event handler:", error)
      }
    },
    [ref],
  )

  useEffect(() => {
    // Only attach listeners if the hook is enabled
    if (!enabled) return

    // Add event listeners with passive option for better performance
    document.addEventListener("mousedown", handleClickOutside, { passive: true })
    document.addEventListener("touchstart", handleClickOutside, { passive: true })

    // Clean up event listeners on unmount
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
    }
  }, [ref, handleClickOutside, enabled])
}

/**
 * Alternative version that returns a function to manually remove the listeners
 * Useful for cases where you need to control the lifecycle more precisely
 */
export const useOutsideClickWithCleanup = <T extends HTMLElement = HTMLElement>(
  ref: React.RefObject<T>,
  callback: (event: MouseEvent | TouchEvent) => void,
  enabled = true,
) => {
  // Store the callback in a ref to avoid recreating the listener on every render
  const callbackRef = useRef(callback)

  // Update the callback ref when the callback changes
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  // Memoize the event listener to prevent unnecessary re-renders
  const handleClickOutside = useCallback(
    (event: MouseEvent | TouchEvent) => {
      try {
        // Check if the ref is valid and if the click was outside
        if (!ref.current || ref.current.contains(event.target as Node)) {
          return
        }

        // Call the latest callback
        callbackRef.current(event)
      } catch (error) {
        console.error("Error in useOutsideClick event handler:", error)
      }
    },
    [ref],
  )

  // Setup function to add listeners
  const setup = useCallback(() => {
    if (!enabled) return () => {}

    document.addEventListener("mousedown", handleClickOutside, { passive: true })
    document.addEventListener("touchstart", handleClickOutside, { passive: true })

    // Return cleanup function
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      document.removeEventListener("touchstart", handleClickOutside)
    }
  }, [handleClickOutside, enabled])

  // Add listeners on mount and return cleanup function
  useEffect(() => {
    const cleanup = setup()
    return cleanup
  }, [setup])

  // Return the setup function for manual control
  return { setup }
}

