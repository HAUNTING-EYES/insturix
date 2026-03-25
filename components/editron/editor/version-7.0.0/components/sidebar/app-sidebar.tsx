"use client";

import * as React from "react";
import {
  Film,
  Music,
  Type,
  Subtitles,
  ImageIcon,
  FolderOpen,
  Sticker,
  Layout,
  MessageSquare,
  Sparkles,
  ShieldCheck,
  Volume2,
} from "lucide-react";
import Image from "next/image";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { useSidebar } from "../../contexts/sidebar-context";
import { VideoOverlayPanel } from "../overlays/video/video-overlay-panel";
import { TextOverlaysPanel } from "../overlays/text/text-overlays-panel";
import SoundsPanel from "../overlays/sounds/sounds-panel";
import { OverlayType } from "../../types";
import { CaptionsPanel } from "../overlays/captions/captions-panel";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ImageOverlayPanel } from "../overlays/images/image-overlay-panel";
import { LocalMediaPanel } from "../overlays/local-media/local-media-panel";
import { StickersPanel } from "../overlays/stickers/stickers-panel";
import { TemplateOverlayPanel } from "../overlays/templates/template-overlay-panel";
import { HtmlScenePanel } from "../overlays/html/html-scene-panel";
import { useEditorContext } from "../../contexts/editor-context";
import { AIChatPanel } from "../ai-chat/ai-chat-panel";
import { AISuggestionsPanel } from "../ai-suggestions/ai-suggestions-panel";
import { QualityReviewPanel } from "../quality-review/quality-review-panel";
import { TransitionBrowserPanel } from "../transitions/transition-browser-panel";
import { SFXLibraryPanel } from "../sfx-library/sfx-library-panel";
import { LottiePanel } from "../lottie/lottie-panel";

/**
 * AppSidebar Component
 *
 * A dual-sidebar layout component for the video editor application.
 * Consists of two parts:
 * 1. A narrow icon-based sidebar on the left for main navigation
 * 2. A wider content sidebar that displays the active panel's content
 *
 * @component
 * @param props - Props extending from the base Sidebar component
 */
export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { activePanel, setActivePanel, setIsOpen, isOpen } = useSidebar();
  const { setSelectedOverlayId, selectedOverlayId } = useEditorContext();

  const getPanelTitle = (type: OverlayType): string => {
    switch (type) {
      case OverlayType.VIDEO:
        return "Video";
      case OverlayType.TEXT:
        return "Text";
      case OverlayType.SOUND:
        return "Audio";
      case OverlayType.CAPTION:
        return "Caption";
      case OverlayType.IMAGE:
        return "Image";
      case OverlayType.LOCAL_DIR:
        return "Assets";
      case OverlayType.STICKER:
        return "Stickers";
      case OverlayType.TEMPLATE:
        return "Template";
      case OverlayType.AI_CHAT:
        return "AI Chat";
      case OverlayType.AI_SUGGESTIONS:
        return "AI Suggestions";
      case OverlayType.HTML_SCENE:
        return "Custom Scene";
      case OverlayType.HTML_STICKER:
        return "Sticker";
      case OverlayType.QUALITY_REVIEW:
        return "Quality";
      case OverlayType.TRANSITIONS:
        return "Transitions";
      case OverlayType.SFX_LIBRARY:
        return "Sound Effects";
      case OverlayType.LOTTIE:
        return "Motion Graphics";
      default:
        return "Unknown";
    }
  };

  const [showMorePanels, setShowMorePanels] = React.useState(false);

  // Primary panels — always visible (most used, reduced cognitive load)
  const primaryItems = [
    { title: 'Video', icon: Film, panel: OverlayType.VIDEO, type: OverlayType.VIDEO },
    { title: 'Text', icon: Type, panel: OverlayType.TEXT, type: OverlayType.TEXT },
    { title: 'Audio', icon: Music, panel: OverlayType.SOUND, type: OverlayType.SOUND },
    { title: 'Assets', icon: FolderOpen, panel: OverlayType.LOCAL_DIR, type: OverlayType.LOCAL_DIR },
  ];

  // Secondary panels — shown when "More" is toggled
  const secondaryItems = [
    { title: 'Captions', icon: Subtitles, panel: OverlayType.CAPTION, type: OverlayType.CAPTION },
    { title: 'Transitions', icon: Film, panel: OverlayType.TRANSITIONS, type: OverlayType.TRANSITIONS },
    { title: 'Sound FX', icon: Volume2, panel: OverlayType.SFX_LIBRARY, type: OverlayType.SFX_LIBRARY },
    { title: 'Images', icon: ImageIcon, panel: OverlayType.IMAGE, type: OverlayType.IMAGE },
    { title: 'Lottie', icon: Sparkles, panel: OverlayType.LOTTIE, type: OverlayType.LOTTIE },
    { title: 'Stickers', icon: Sticker, panel: OverlayType.STICKER, type: OverlayType.STICKER },
    { title: 'Templates', icon: Layout, panel: OverlayType.TEMPLATE, type: OverlayType.TEMPLATE },
  ];

  const navigationItems = [...primaryItems, ...(showMorePanels ? secondaryItems : [])];

  /**
   * Renders the appropriate panel component based on the active panel selection
   * @returns {React.ReactNode} The component corresponding to the active panel
   */
  const renderActivePanel = () => {
    switch (activePanel) {
      case OverlayType.TEXT:
        return <TextOverlaysPanel />;
      case OverlayType.SOUND:
        return <SoundsPanel />;
      case OverlayType.VIDEO:
        return <VideoOverlayPanel />;
      case OverlayType.CAPTION:
        return <CaptionsPanel />;
      case OverlayType.IMAGE:
        return <ImageOverlayPanel />;
      case OverlayType.STICKER:
        return <StickersPanel />;
      case OverlayType.LOCAL_DIR:
        return <LocalMediaPanel />;
      case OverlayType.TEMPLATE:
        return <TemplateOverlayPanel />;
      case OverlayType.AI_CHAT:
        return <AIChatPanel />;
      case OverlayType.AI_SUGGESTIONS:
        return <AISuggestionsPanel />;
      case OverlayType.QUALITY_REVIEW:
        return <QualityReviewPanel />;
      case OverlayType.TRANSITIONS:
        return <TransitionBrowserPanel />;
      case OverlayType.SFX_LIBRARY:
        return <SFXLibraryPanel />;
      case OverlayType.LOTTIE:
        return <LottiePanel />;
      case OverlayType.HTML_SCENE:
        return <HtmlScenePanel />;
      default:
        return null;
    }
  };

  return (
    <Sidebar
      collapsible="icon"
      className="!relative !block !h-full !z-10 !w-auto [&>div.fixed]:!relative [&>div.fixed]:!h-full [&>div.fixed]:!w-[--sidebar-width] [&>div.relative]:!hidden overflow-hidden [&>[data-sidebar=sidebar]]:flex-row border-r border-1 bg-black"
      {...props}
    >
      {/* First sidebar */}
        <Sidebar
        collapsible="none"
        className="!w-[calc(var(--sidebar-width-icon)_+_1px)] bg-black border-r"
      >
        <SidebarHeader className="h-0 p-0">
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            {navigationItems.map((item) => (
              <TooltipProvider key={item.title} delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      onClick={() => {
                        if (activePanel === item.panel && isOpen) {
                          setIsOpen(false);
                        } else {
                          setActivePanel(item.panel);
                          setIsOpen(true);
                        }
                      }}
                      size="lg"
                      className={`flex flex-col items-center gap-2 px-1.5 py-2 ${
                        activePanel === item.panel
                          ? "bg-accent text-foreground hover:bg-accent"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon
                        className="h-4 w-4 text-foreground dark:text-foreground font-light"
                        strokeWidth={1.25}
                      />
                      <span className="text-[8px] font-medium leading-none">
                        {item.title}
                      </span>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="border bg-background text-foreground"
                  >
                    {item.title}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
            
            {/* More panels toggle */}
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    onClick={() => setShowMorePanels(!showMorePanels)}
                    size="lg"
                    className="flex flex-col items-center gap-2 px-1.5 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <span className="text-[10px] font-bold">{showMorePanels ? '−' : '+'}</span>
                    <span className="text-[8px] font-medium leading-none">
                      {showMorePanels ? 'Less' : 'More'}
                    </span>
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent side="right" className="border bg-background text-foreground">
                  {showMorePanels ? 'Hide extra panels' : 'Show more panels (Captions, Images, Stickers, Templates)'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* AI Chat Button - Standard Design */}
            <div className="mt-2 pt-2 border-t border-border">
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      onClick={() => {
                        if (activePanel === OverlayType.AI_CHAT && isOpen) {
                          setIsOpen(false);
                        } else {
                          setActivePanel(OverlayType.AI_CHAT);
                          setIsOpen(true);
                        }
                      }}
                      size="lg"
                      className={`flex flex-col items-center gap-2 px-1.5 py-2 ${
                        activePanel === OverlayType.AI_CHAT
                          ? "bg-accent text-foreground hover:bg-accent"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <MessageSquare
                        className="h-4 w-4 text-foreground dark:text-foreground font-light"
                        strokeWidth={1.25}
                      />
                      <span className="text-[8px] font-medium leading-none">
                        AI Chat
                      </span>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="border bg-background text-foreground"
                  >
                    AI Chat
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* AI Suggestions Button */}
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      onClick={() => {
                        if (activePanel === OverlayType.AI_SUGGESTIONS && isOpen) {
                          setIsOpen(false);
                        } else {
                          setActivePanel(OverlayType.AI_SUGGESTIONS);
                          setIsOpen(true);
                        }
                      }}
                      size="lg"
                      className={`flex flex-col items-center gap-2 px-1.5 py-2 ${
                        activePanel === OverlayType.AI_SUGGESTIONS
                          ? "bg-accent text-foreground hover:bg-accent"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Sparkles
                        className="h-4 w-4 text-foreground dark:text-foreground font-light"
                        strokeWidth={1.25}
                      />
                      <span className="text-[8px] font-medium leading-none">
                        Suggest
                      </span>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="border bg-background text-foreground"
                  >
                    AI Suggestions
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Quality Review Button */}
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      onClick={() => {
                        if (activePanel === OverlayType.QUALITY_REVIEW && isOpen) {
                          setIsOpen(false);
                        } else {
                          setActivePanel(OverlayType.QUALITY_REVIEW);
                          setIsOpen(true);
                        }
                      }}
                      size="lg"
                      className={`flex flex-col items-center gap-2 px-1.5 py-2 ${
                        activePanel === OverlayType.QUALITY_REVIEW
                          ? "bg-accent text-foreground hover:bg-accent"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <ShieldCheck
                        className="h-4 w-4 text-foreground dark:text-foreground font-light"
                        strokeWidth={1.25}
                      />
                      <span className="text-[8px] font-medium leading-none">
                        Quality
                      </span>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent
                    side="right"
                    className="border bg-background text-foreground"
                  >
                    Quality Review
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      {/* Second sidebar */}
      <div className="transition-all duration-300 ease-in-out overflow-hidden" style={{ width: isOpen ? 'var(--sidebar-width)' : '0px' }}>
        {isOpen && (
            <Sidebar
            collapsible="none"
            className="flex-1 md:flex bg-black border-r"
          >
            <SidebarHeader className="gap-3.5 border-b px-4 py-[12px] bg-black">
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="text-base font-medium text-foreground">
                    {activePanel ? getPanelTitle(activePanel) : ""}
                  </div>
                </div>
              </div>
            </SidebarHeader>
            <SidebarContent className="text-foreground bg-black">
              {renderActivePanel()}
            </SidebarContent>
          </Sidebar>
        )}
      </div>
    </Sidebar>
  );
}
