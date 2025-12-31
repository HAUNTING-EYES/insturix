import { CaptionStyles } from "../../../types";

/**
 * Default styling configuration for captions
 * Defines the base appearance for all captions including font, size, colors, and highlight effects
 */
export const defaultCaptionStyles: CaptionStyles = {
  fontFamily: "font-sans",
  fontSize: "2.5rem",
  fontWeight: 500,
  color: "#FFFFFF",
  textAlign: "center",
  lineHeight: 1.4,
  textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
  padding: "24px",
  highlight: {
    backgroundColor: "rgba(20, 184, 166, 0.95)",
    color: "#FFFFFF",
    scale: 1.1,
    fontWeight: 600,
    textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
    effect: "box",
    animation: "scale",
  },
};
