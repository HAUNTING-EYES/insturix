import { Overlay, OverlayType } from "./types";

// Default and maximum number of rows to display in the editor
export const INITIAL_ROWS = 1;
export const MAX_ROWS = 20;
// Frames per second for video rendering
export const FPS = 30;

// Name of the component being tested/rendered
export const COMP_NAME = "TestComponent";

// Video configuration
export const DURATION_IN_FRAMES = 30;
export const VIDEO_WIDTH = 1280; // 720p HD video dimensions
export const VIDEO_HEIGHT = 720;

// UI configuration
export const ROW_HEIGHT = 44; // Slightly increased from 48
export const SHOW_LOADING_PROJECT_ALERT = true; // Controls visibility of asset loading indicator
export const DISABLE_MOBILE_LAYOUT = false;

/**
 * This constant disables video keyframe extraction in the browser. Enable this if you're working with
 * multiple videos or large video files to improve performance. Keyframe extraction is CPU-intensive and can
 * cause browser lag. For production use, consider moving keyframe extraction to the server side.
 * Future versions of Remotion may provide more efficient keyframe handling.
 */
export const DISABLE_VIDEO_KEYFRAMES = false;

// AWS deployment configuration
export const SITE_NAME = "sams-site";
export const LAMBDA_FUNCTION_NAME =
  "remotion-render-4-0-272-mem2048mb-disk2048mb-120sec";
export const REGION = "us-east-1";

// Zoom control configuration
export const ZOOM_CONSTRAINTS = {
  min: 0.2, // Minimum zoom level
  max: 10, // Maximum zoom level
  step: 0.1, // Smallest increment for manual zoom controls
  default: 1, // Default zoom level
  zoomStep: 0.15, // Zoom increment for zoom in/out buttons
  wheelStep: 0.3, // Zoom increment for mouse wheel
  transitionDuration: 100, // Animation duration in milliseconds
  easing: "cubic-bezier(0.4, 0.0, 0.2, 1)", // Smooth easing function for zoom transitions
};

// Timeline Snapping configuration
export const SNAPPING_CONFIG = {
  thresholdFrames: 1, // Default snapping sensitivity in frames
  enableVerticalSnapping: true, // Enable snapping to items in adjacent rows
};

// Add new constant for push behavior
export const ENABLE_PUSH_ON_DRAG = false; // Set to false to disable pushing items on drag

// Render configuration
// NOTE: TO CHANGE RENDER TYPE, UPDATE THE RENDER_TYPE CONSTANT
export const RENDER_TYPE: "ssr" | "lambda" = "lambda";

// Autosave configuration
export const AUTO_SAVE_INTERVAL = 15000; // Autosave every 15 seconds

// Start with empty canvas - users can add their own content
export const DEFAULT_OVERLAYS: Overlay[] = [];

