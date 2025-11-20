import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import dynamic from "next/dynamic";

import RenderControls from "../rendering/render-controls";
import { useEditorContext } from "../../contexts/editor-context";

/**
 * Dynamic import of the ThemeToggle component to enable client-side rendering only.
 * This prevents hydration mismatches since theme detection requires browser APIs.
 */
const ThemeToggleClient = dynamic(
  () =>
    import("@/components/editron/shared/theme-toggle")
      .then((mod) => mod.ThemeToggle)
      .catch((err) => {
        console.error("Error loading ThemeToggle:", err);
        return () => null; // Fallback component
      }),
  {
    ssr: false,
    loading: () => <></>, // Optional loading state
  }
);

/**
 * EditorHeader component renders the top navigation bar of the editor interface.
 *
 * @component
 * @description
 * This component provides the main navigation and control elements at the top of the editor:
 * - A sidebar trigger button for showing/hiding the sidebar
 * - A visual separator
 * - A theme toggle switch for light/dark mode
 * - Rendering controls for media export
 *
 * The header is sticky-positioned at the top of the viewport and includes
 * responsive styling for both light and dark themes.
 *
 * @example
 * ```tsx
 * <EditorHeader />
 * ```
 *
 * @returns {JSX.Element} A header element containing navigation and control components
 */
export function EditorHeader() {
  /**
   * Destructure required values from the editor context:
   * - renderMedia: Function to handle media rendering/export
   * - state: Current editor state
   * - renderType: Type of render
   */
  const { renderMedia, state, saveProject, renderType } = useEditorContext();

  return (
    <header
      className="sticky top-0 flex shrink-0 items-center gap-2.5 
      bg-black border-l border-b border-gray-800 p-2.5 px-4.5"
    >
      {/* Spacer to push rendering controls to the right */}
      <div className="flex-grow" />

      {/* Media rendering controls */}
      <RenderControls
        handleRender={renderMedia}
        state={state}
        saveProject={saveProject}
        renderType={renderType}
      />
    </header>
  );
}
