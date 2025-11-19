import { CaptionStyles } from "../../../types";

/**
 * Default styling configuration for captions
 * Defines the base appearance for all captions including font, size, colors, and highlight effects
 */
export const defaultCaptionStyles: CaptionStyles = {
  fontFamily: "Inter, sans-serif",
  fontSize: "2.5rem",
  lineHeight: 1.4,
  textAlign: "center",
  color: "#FFFFFF",
  textShadow: "2px 2px 4px rgba(0,0,0,0.5)",
  padding: "24px",
  highlightStyle: {
    backgroundColor: "rgba(20, 184, 166, 0.95)",
    scale: 1.1,
    fontWeight: 600,
    textShadow: "2px 2px 4px rgba(0,0,0,0.3)",
  },
};
