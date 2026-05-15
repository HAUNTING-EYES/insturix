"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Node } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { Mention } from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Image, Loader2, X, Plus, Sparkles, Upload, MoreVertical, SquarePen, Pencil, Eraser, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModelSelector } from "../stages/ModelSelector";
import { MagicPromptEnhancerButton } from "../MagicPromptEnhancerButton";

interface NewVariationConsoleProps {
  onGenerate: (
    prompt: string,
    referenceImages?: File[],
    modelId?: string,
  ) => void;
  onSketchToEditSubmit?: (
    modelId?: string,
  ) => Promise<void>;
  isGenerating: boolean;
  galleryCollapsed?: boolean;
  className?: string;
  clearTrigger?: number; // When this changes, clear the console
  setPromptData?: {
    // When this changes, populate the console
    prompt: string;
    referenceImages?: string[]; // This will now be GCS URLs for display
    trigger: number;
  };
  referenceImageCount?: number; // Number of reference images for model filtering
  onReferenceImageCountChange?: (count: number) => void; // Callback when reference image count changes
  onUploadImage?: (file: File) => void; // Upload user image as new variation (Edit My Image)
  isUploadingImage?: boolean;
  inputMode?: "editCanvas" | "sketchToEdit";
  onInputModeChange?: (mode: "editCanvas" | "sketchToEdit") => void;
  onAddOverlayImage?: () => void;
  sketchTool?: "pencil" | "eraser" | "text" | null;
  onSketchToolChange?: (tool: "pencil" | "eraser" | "text") => void;
  pencilColor?: "black" | "red" | "blue" | "green" | "yellow";
  onPencilColorChange?: (color: "black" | "red" | "blue" | "green" | "yellow") => void;
  eraserSize?: "small" | "medium" | "large";
  onEraserSizeChange?: (size: "small" | "medium" | "large") => void;
}

export function NewVariationConsole({
  onGenerate,
  onSketchToEditSubmit,
  isGenerating,
  galleryCollapsed = false,
  className = "",
  clearTrigger,
  setPromptData,
  referenceImageCount = 0,
  onReferenceImageCountChange,
  onUploadImage,
  isUploadingImage = false,
  inputMode = "editCanvas",
  onInputModeChange,
  sketchTool = "pencil",
  onSketchToolChange,
  pencilColor = "black",
  onPencilColorChange,
  eraserSize = "medium",
  onEraserSizeChange,
  onAddOverlayImage,
}: NewVariationConsoleProps) {
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImagePreviews, setReferenceImagePreviews] = useState<
    string[]
  >([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);

  const referenceImagesRef = useRef<File[]>([]);
  const referenceImagePreviewsRef = useRef<string[]>([]);

  const handleImagesChange = useCallback((files: File[]) => {
    referenceImagesRef.current = files;
    setReferenceImages(files);
  }, []);

  const handleReferencePreviewsChange = useCallback((previews: string[]) => {
    referenceImagePreviewsRef.current = previews;
    setReferenceImagePreviews(previews);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "e.g. Apply a vintage film look with warm tones",
      }),
      Mention.configure({
        HTMLAttributes: {
          class:
            "mention inline bg-blue-500 text-white px-1 py-0.5 rounded font-semibold cursor-pointer mx-px",
        },
        suggestion: {
          char: "@",
          items: ({ query }) => {
            const currentImages = referenceImagesRef.current;
            if (currentImages.length === 0) {
              return [
                { id: "no reference images", label: "no reference images" },
              ];
            }
            return currentImages
              .map((_, index) => ({
                id: `@img${index + 1}`,
                label: `@img${index + 1}`,
                previewUrl: referenceImagePreviewsRef.current[index] || "",
              }))
              .filter((item) =>
                item.label.toLowerCase().includes(query.toLowerCase()),
              );
          },
          render: () => {
            let component: any;
            let popup: any;
            let selectedIndex = 0;

            let filteredItems: any[] = []; // Store the filtered items to be used by onKeyDown

            let commandFunction: any; // Store the command function
            let rect: any;
            let editorDom: HTMLElement | null = null;
            let inputContainer: HTMLElement | null = null;

            return {
              onStart: (props: any) => {
                const { editor, clientRect, command } = props;
                commandFunction = command; // Store the command function
                editorDom = editor.view.dom as HTMLElement;
                inputContainer = editorDom.parentElement as HTMLElement;
                const dom = editorDom;
                rect = clientRect
                  ? clientRect()
                  : { left: 0, top: 0, width: 0, height: 0 };

                popup = document.createElement("div");
                popup.className =
                  "suggestions-popup absolute z-50 bg-[#1B1A18] border border-[#282724] rounded-xl shadow-lg max-h-60 overflow-y-auto w-64";
                const triggerRect = clientRect
                  ? clientRect()
                  : { left: 0, top: 0, width: 0, height: 0 };
                const inputRect = inputContainer.getBoundingClientRect();
                const relativeLeft = triggerRect.left - inputRect.left;
                const relativeTop = triggerRect.top - inputRect.top;
                popup.style.left = `${relativeLeft}px`;
                popup.style.top = `${relativeTop + triggerRect.height}px`; // Initial position below trigger
                inputContainer.appendChild(popup);

                component = {
                  dom: popup,
                  update: (props: any) => {
                    const { query, items, clientRect } = props;
                    // Store the filtered items for use in onKeyDown
                    filteredItems = items;
                    popup.innerHTML = "";
                    if (items.length === 0) {
                      const noItems = document.createElement("div");
                      noItems.className =
                        "p-3 text-[#7A776E] text-sm cursor-default";
                      noItems.textContent = "no reference images";
                      popup.appendChild(noItems);
                    } else {
                      items.forEach((item: any, index: number) => {
                        const div = document.createElement("div");
                        div.className = `flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-[#282724] ${selectedIndex === index ? "bg-[#282724]" : ""}`;
                        div.innerHTML = `
                          ${item.previewUrl ? `<img src="${item.previewUrl}" alt="Preview" class="w-8 h-8 rounded object-cover flex-shrink-0" />` : ""}
                          <span class="text-[#ECE9E1] font-medium">${item.label}</span>
                        `;
                        // Only add click handlers if the item is not "no reference images"
                        if (item.id !== "no reference images") {
                          div.addEventListener("mousedown", (e) => {
                            e.preventDefault();
                            commandFunction({ id: item.id, label: item.label });
                            popup.remove();
                          });
                          div.addEventListener("mouseenter", () => {
                            selectedIndex = index;
                            component.update(props);
                          });
                        } else {
                          // Make the "no reference images" option unclickable
                          div.className = div.className.replace(
                            "cursor-pointer",
                            "cursor-default",
                          );
                          div.classList.add("opacity-50");
                        }
                        popup.appendChild(div);
                      });
                    }
                    setTimeout(() => {
                      if (
                        popup &&
                        popup.parentNode &&
                        inputContainer &&
                        clientRect
                      ) {
                        const currentTriggerRect = clientRect();
                        const inputRect =
                          inputContainer.getBoundingClientRect();
                        const relativeLeft =
                          currentTriggerRect.left - inputRect.left;
                        const relativeTop =
                          currentTriggerRect.top - inputRect.top;
                        const popupHeight = popup.offsetHeight;
                        if (popupHeight > 0) {
                          // Position popup just above the trigger relative to the input container
                          popup.style.left = `${relativeLeft}px`;
                          popup.style.top = `${relativeTop - popupHeight}px`;
                        }
                      }
                    }, 0);
                  },
                  onKeyDown: (props: any) => {
                    const { event } = props;
                    if (event.key === "Escape") {
                      popup?.remove();
                      return true;
                    }

                    // Helper function to find next selectable index when navigating down
                    const findNextSelectableIndex = (currentIndex: number) => {
                      let nextIndex = (currentIndex + 1) % filteredItems.length;
                      let count = 0; // Prevent infinite loop

                      while (count < filteredItems.length) {
                        if (
                          filteredItems[nextIndex]?.id !== "no reference images"
                        ) {
                          return nextIndex;
                        }
                        nextIndex = (nextIndex + 1) % filteredItems.length;
                        count++;
                      }
                      return currentIndex; // Return current if no selectable item found
                    };

                    // Helper function to find previous selectable index when navigating up
                    const findPrevSelectableIndex = (currentIndex: number) => {
                      let prevIndex =
                        (currentIndex - 1 + filteredItems.length) %
                        filteredItems.length;
                      let count = 0; // Prevent infinite loop

                      while (count < filteredItems.length) {
                        if (
                          filteredItems[prevIndex]?.id !== "no reference images"
                        ) {
                          return prevIndex;
                        }
                        prevIndex =
                          (prevIndex - 1 + filteredItems.length) %
                          filteredItems.length;
                        count++;
                      }
                      return currentIndex; // Return current if no selectable item found
                    };

                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      if (filteredItems.length > 0) {
                        // If current index is on "no reference images", move to previous
                        if (
                          filteredItems[selectedIndex]?.id ===
                          "no reference images"
                        ) {
                          selectedIndex =
                            findPrevSelectableIndex(selectedIndex);
                        } else {
                          selectedIndex =
                            findPrevSelectableIndex(selectedIndex);
                        }
                        component.update({ query: "", items: filteredItems });
                      }
                      return true;
                    }
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      if (filteredItems.length > 0) {
                        // If current index is on "no reference images", move to next
                        if (
                          filteredItems[selectedIndex]?.id ===
                          "no reference images"
                        ) {
                          selectedIndex =
                            findNextSelectableIndex(selectedIndex);
                        } else {
                          selectedIndex =
                            findNextSelectableIndex(selectedIndex);
                        }
                        component.update({ query: "", items: filteredItems });
                      }
                      return true;
                    }
                    if (event.key === "Enter" || event.key === "Tab") {
                      event.preventDefault();
                      if (
                        filteredItems.length > 0 &&
                        selectedIndex >= 0 &&
                        selectedIndex < filteredItems.length
                      ) {
                        const selectedItem = filteredItems[selectedIndex];
                        // Skip "no reference images" option for keyboard selection
                        if (selectedItem.id === "no reference images") {
                          // Do nothing for "no reference images" - don't execute command
                          popup?.remove();
                          return true;
                        }
                        commandFunction({
                          id: selectedItem.id,
                          label: selectedItem.label,
                        });
                      }
                      popup?.remove();
                      return true;
                    }
                    return false;
                  },
                  onExit: () => {
                    if (popup && popup.parentNode) {
                      popup.parentNode.removeChild(popup);
                    }
                  },
                };
                component.update(props);
              },
              onUpdate(props: any) {
                component?.update(props);
              },
              onKeyDown(props: any) {
                return component?.onKeyDown(props) || false;
              },
              onExit() {
                component?.onExit();
                component = null;
              },
            };
          },
          command: ({ editor, props }) => {
            const { state } = editor;
            const { from: cursorPos } = state.selection;
            const fullText = editor.getText();

            console.log("Full text length:", fullText.length);
            console.log("Full text:", JSON.stringify(fullText));
            console.log("Cursor pos:", cursorPos);

            // Traverse backwards to find the actual text trigger '@', skipping mention nodes
            let pos = cursorPos;
            let triggerPos = -1;
            let foundTrigger = false;

            while (pos > 0 && !foundTrigger) {
              const resolvedPos = state.doc.resolve(pos);
              const parent = resolvedPos.parent;

              if (parent.type.name === "mention") {
                // Skip the entire mention node
                pos -= parent.nodeSize;
              } else {
                // In a text-containing node, search backwards for '@'
                const textContent = parent.textContent;
                const localOffset = resolvedPos.parentOffset;
                const textBeforeLocal = textContent.substring(0, localOffset);
                const localTriggerIndex = textBeforeLocal.lastIndexOf("@");

                if (localTriggerIndex !== -1) {
                  triggerPos = resolvedPos.start() + localTriggerIndex;
                  foundTrigger = true;
                  console.log(
                    "Found text trigger at document position:",
                    triggerPos,
                  );
                } else {
                  // Move to start of this node and continue
                  pos = resolvedPos.before();
                }
              }
            }

            const textBeforeCursor = fullText.substring(0, cursorPos);
            console.log(
              "Text before cursor:",
              JSON.stringify(textBeforeCursor),
            );
            console.log("Trigger index (document pos):", triggerPos);

            // Log the actual characters at specific positions
            for (
              let i = Math.max(0, cursorPos - 3);
              i < Math.min(fullText.length, cursorPos + 3);
              i++
            ) {
              console.log(
                `Character at pos ${i}:`,
                JSON.stringify(fullText[i]),
                `(code: ${fullText[i]?.charCodeAt(0)})`,
              );
            }

            console.log("Full editor text before:", fullText);
            console.log("cursorPos:", cursorPos);
            console.log("props.label:", props.label);
            console.log("props.id:", props.id);
            console.log(
              "Document structure before deletion:",
              JSON.stringify(editor.state.doc.toJSON(), null, 2),
            );

            if (triggerPos === -1) {
              // Fallback: insert at cursor without deletion
              console.log("No trigger found, using fallback insertion");
              editor
                .chain()
                .focus()
                .insertContent([
                  {
                    type: "text",
                    text: " ",
                  },
                  {
                    type: "mention",
                    attrs: {
                      id: props.id,
                      label: props.label ? props.label.replace("@", "") : "", // Pass label without '@'
                    },
                  },
                  {
                    type: "text",
                    text: " ",
                  },
                ])
                .run();
              console.log(
                "Full editor text after (fallback):",
                editor.getText(),
              );
              return;
            }

            // Calculate deletion range: from trigger to cursor
            const deleteFrom = triggerPos;
            let deleteTo = cursorPos;

            // Check for whitespace after cursor and extend if needed
            const whitespaceRegex = /\s/;
            if (
              cursorPos < fullText.length &&
              whitespaceRegex.test(fullText[cursorPos])
            ) {
              deleteTo += 1;
              console.log("Extended deletion to include trailing whitespace");
            }

            const deletingSubstring = fullText.substring(deleteFrom, deleteTo);
            console.log("Deleting substring:", `"${deletingSubstring}"`);
            const simulatedTextAfterDelete =
              fullText.substring(0, deleteFrom) + fullText.substring(deleteTo);
            console.log(
              "Simulated text after deletion:",
              simulatedTextAfterDelete,
            );
            const expectedAfterInsert =
              simulatedTextAfterDelete + " " + props.label + " ";
            console.log("Expected text after insert:", expectedAfterInsert);

            console.log("Calculated delete range:", {
              from: deleteFrom,
              to: deleteTo,
            });

            // Perform deletion first and log state
            editor
              .chain()
              .focus()
              .deleteRange({ from: deleteFrom, to: deleteTo })
              .run();
            console.log("Text after deletion:", editor.getText());
            console.log(
              "Cursor position after deletion:",
              editor.state.selection.from,
            );

            // Then insert space, mention, space
            editor
              .chain()
              .focus()
              .insertContent([
                {
                  type: "text",
                  text: " ",
                },
                {
                  type: "mention",
                  attrs: {
                    id: props.id,
                    label: props.label ? props.label.replace("@", "") : "", // Pass label without '@'
                  },
                },
                {
                  type: "text",
                  text: " ",
                },
              ])
              .run();

            console.log("Full editor text after insertion:", editor.getText());
            console.log(
              "Document structure after insertion:",
              JSON.stringify(editor.state.doc.toJSON(), null, 2),
            );
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[32px] max-h-[80px] w-full p-2.5 pr-8 text-[#ECE9E1] outline-none overflow-y-auto break-words overflow-x-hidden",
      },
    },
    content: "",
    onUpdate: ({ editor }) => {
      // The mention will be rendered with custom styling
    },
  });

  const getPlainPrompt = () => {
    if (!editor) return "";
    const plain = editor.getText().replace(/\s+/g, " ").trim();
    return plain;
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
  };

  const enhancePrompt = async (currentPrompt: string): Promise<string> => {
    setIsEnhancing(true);
    try {
      const response = await fetch("/api/services/clickatron/enhance-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: currentPrompt,
          taskType: "imageGeneration",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to enhance prompt");
      }

      const data = await response.json();
      return data.enhancedPrompt;
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleEnhanceComplete = useCallback(
    (enhancedPrompt: string) => {
      if (editor) {
        editor.commands.setContent(enhancedPrompt);
      }
    },
    [editor],
  );

  // Clear console when clearTrigger changes
  useEffect(() => {
    if (clearTrigger !== undefined) {
      if (editor) {
        editor.commands.setContent("");
      }
      setReferenceImages([]);
      setReferenceImagePreviews([]);
    }
  }, [clearTrigger, editor]);

  // Set prompt data when setPromptData changes
  useEffect(() => {
    if (setPromptData) {
      if (editor) {
        editor.commands.setContent(setPromptData.prompt);
      }
      // For display purposes, we'll use the GCS URLs provided
      setReferenceImagePreviews(setPromptData.referenceImages || []);
    }
  }, [setPromptData, editor]);

  useEffect(() => {
    referenceImagesRef.current = referenceImages;
  }, [referenceImages]);

  useEffect(() => {
    referenceImagePreviewsRef.current = referenceImagePreviews;
  }, [referenceImagePreviews]);

  const handleSubmit = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
    }
    const plainPrompt = getPlainPrompt();
    if (!plainPrompt.trim() || isGenerating) return;

    onGenerate(
      plainPrompt,
      referenceImages.length > 0 ? referenceImages : undefined,
      selectedModelId || undefined,
    );
    if (editor) {
      editor.commands.setContent("");
    }
    setReferenceImages([]);
    setReferenceImagePreviews([]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    // Store File objects
    setReferenceImages((prev) => [...prev, ...files]);

    // Generate preview URLs
    const newPreviews = files.map((file) => URL.createObjectURL(file));
    setReferenceImagePreviews((prev) => [...prev, ...newPreviews]);
    onReferenceImageCountChange?.(referenceImagePreviews.length + files.length);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          // Store File object
          setReferenceImages((prev) => [...prev, file]);

          // Generate preview URL
          const previewUrl = URL.createObjectURL(file);
          setReferenceImagePreviews((prev) => [...prev, previewUrl]);
          onReferenceImageCountChange?.(referenceImagePreviews.length + 1);
        }
        break;
      }
    }
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
    setReferenceImagePreviews((prev) => {
      const newPreviews = [...prev];
      URL.revokeObjectURL(newPreviews[index]); // Clean up the object URL
      newPreviews.splice(index, 1);
      return newPreviews;
    });
  };

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      referenceImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [referenceImagePreviews]);

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`
        bg-gradient-to-t from-[#131312]/95 to-[#131312]/80
        border-t border-[#1C1B19]/60
        ${className}
      `}
    >
      <div className="p-3 mx-auto mr-0 w-full">
        {/* Model Selector */}
        <div className="mb-2">
          <ModelSelector
            context="newVariation"
            userAttachedImages={referenceImageCount}
            selectedModelId={selectedModelId || undefined}
            onModelChange={handleModelChange}
          />
        </div>

        {/* Main Input Container */}
        <div className="relative bg-[#1B1A18]/40 rounded-xl border border-[#282724]/50 p-2 w-full">
          {/* Reference Images */}
          <AnimatePresence>
            {referenceImagePreviews.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-2 pb-2 border-b border-[#282724]/30"
              >
                <div className="flex flex-wrap gap-1.5">
                  {referenceImagePreviews.map((previewUrl, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative group"
                    >
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-[#282724]/50 border border-[#282724]/50">
                        <img
                          src={previewUrl}
                          alt={`Reference ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        onClick={() => removeReferenceImage(index)}
                        className="absolute -top-1 -right-1 w-3 h-3 bg-[#131312] border border-[#282724] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-[#D46A5C] hover:border-[#D46A5C]"
                      >
                        <X className="h-1.5 w-1.5 text-[#B5B2A8]" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Row */}
          <form onSubmit={(e) => handleSubmit(e)}>
            <div className="flex items-center gap-2 w-full">
              {/* 3-dot menu - mode selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 rounded-lg text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#282724]/50 border border-[#282724]/50 flex-shrink-0"
                    title="Edit mode"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-[#131312] border-[#282724]">
                  <DropdownMenuItem
                    onClick={() => onInputModeChange?.("editCanvas")}
                    className="flex items-center gap-2 text-[#ECE9E1] focus:bg-[#1B1A18] focus:text-[#ECE9E1]"
                  >
                    <SquarePen className="h-4 w-4" />
                    Edit Canvas
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onInputModeChange?.("sketchToEdit")}
                    className="flex items-center gap-2 text-[#ECE9E1] focus:bg-[#1B1A18] focus:text-[#ECE9E1]"
                  >
                    <Pencil className="h-4 w-4" />
                    Sketch to Edit
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {inputMode === "editCanvas" ? (
                <>
                  {/* Reference Image Button */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isGenerating}
                    className="h-8 w-8 p-0 rounded-lg text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#282724]/50 border border-[#282724]/50 hover:border-[#282724]/50 transition-all duration-200"
                    title="Reference Image"
                  >
                    {referenceImagePreviews.length > 0 ? (
                      <Plus className="h-3.5 w-3.5" />
                    ) : (
                      <Image className="h-3.5 w-3.5" />
                    )}
                  </Button>

                  {/* Prompt Input */}
                  <div className="flex-1 min-w-0">
                    <div
                      className="min-h-[32px] max-h-[80px] bg-[#131312]/40 text-[#ECE9E1] placeholder-[#7A776E] rounded-lg focus:ring-1 focus:ring-[#D4A652]/50 focus:bg-[#131312]/60 transition-all duration-200 text-sm border-[#282724]/50 overflow-y-auto break-all overflow-x-hidden p-2.5"
                      onPaste={handlePaste}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit(e);
                        }
                      }}
                    >
                      <EditorContent editor={editor} />
                    </div>
                  </div>

                  <MagicPromptEnhancerButton
                    onEnhance={enhancePrompt}
                    isEnhancing={isEnhancing}
                    disabled={isGenerating}
                    getPrompt={getPlainPrompt}
                    onPromptEnhanced={handleEnhanceComplete}
                  />

                  {/* Send Button */}
                  <Button
                    type="submit"
                    disabled={!getPlainPrompt().trim() || isGenerating}
                    className="h-8 w-8 p-0 rounded-lg bg-gradient-to-r from-[#D4A652] to-[#C49A48] hover:from-[#C49A48] hover:to-[#B8903E] disabled:from-[#282724] disabled:to-[#282724] transition-all duration-200"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </>
              ) : (
                <>
                  {/* Main container for Sketch to Edit mode - all content centered */}
                  <div className="flex items-center justify-center w-full gap-2 ">
                    {/* Edit My Image button */}
                    <input
                      ref={editImageInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          onUploadImage?.(file);
                          e.target.value = "";
                        }
                      }}
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => editImageInputRef.current?.click()}
                      disabled={isGenerating || isUploadingImage}
                      className="h-8 px-2 rounded-lg text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#282724]/50 border border-[#282724]/50 transition-all duration-200 text-[11px] gap-1 flex-shrink-0"
                      title="Edit My Image"
                    >
                      {isUploadingImage ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">Edit My Image</span>
                    </Button>

                    {/* Add Image Overlay button */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onAddOverlayImage?.()}
                      className="h-8 px-2 rounded-lg text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#282724]/50 border border-[#282724]/50 transition-all duration-200 text-[11px] gap-1 flex-shrink-0"
                      title="Add Image Overlay"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Add Image</span>
                    </Button>

                    {/* Sketch tools */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onSketchToolChange?.("pencil")}
                        className={`h-8 w-8 p-0 rounded-lg transition-all flex-shrink-0 ${
                          sketchTool === "pencil"
                            ? "bg-blue-600/80 text-white"
                            : "text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#282724]/50"
                        }`}
                        title="Pencil"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {sketchTool === "pencil" && (
                        <div className="flex items-center gap-0.5">
                          {(["black", "red", "blue", "green", "yellow"] as const).map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => onPencilColorChange?.(c)}
                              className={`w-6 h-6 rounded-full border-2 transition-all flex-shrink-0 ${
                                pencilColor === c ? "border-white scale-110" : "border-[#282724] hover:border-[#282724]"
                              }`}
                              style={{ backgroundColor: c === "black" ? "#000" : c === "red" ? "#ef4444" : c === "blue" ? "#3b82f6" : c === "green" ? "#22c55e" : "#eab308" }}
                              title={c}
                            />
                          ))}
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onSketchToolChange?.("eraser")}
                        className={`h-8 w-8 p-0 rounded-lg transition-all flex-shrink-0 ${
                          sketchTool === "eraser"
                            ? "bg-blue-600/80 text-white"
                            : "text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#282724]/50"
                        }`}
                        title="Eraser"
                      >
                        <Eraser className="h-3.5 w-3.5" />
                      </Button>
                      {sketchTool === "eraser" && (
                        <div className="flex items-center gap-1">
                          {(["small", "medium", "large"] as const).map((s) => (
                            <Button
                              key={s}
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => onEraserSizeChange?.(s)}
                              className={`h-7 px-2 text-[11px] rounded flex-shrink-0 ${
                                eraserSize === s ? "bg-blue-600/80 text-white" : "text-[#7A776E] hover:bg-[#282724]/50"
                              }`}
                            >
                              {s === "small" ? "S" : s === "medium" ? "M" : "L"}
                            </Button>
                          ))}
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onSketchToolChange?.("text")}
                        className={`h-8 w-8 p-0 rounded-lg transition-all flex-shrink-0 ${
                          sketchTool === "text"
                            ? "bg-blue-600/80 text-white"
                            : "text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#282724]/50"
                        }`}
                        title="Text"
                      >
                        <Type className="h-3.5 w-3.5" />
                      </Button>
                      {sketchTool === "text" && (
                        <div className="flex items-center gap-0.5">
                          {(["black", "red", "blue", "green", "yellow"] as const).map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => onPencilColorChange?.(c)}
                              className={`w-6 h-6 rounded-full border-2 transition-all flex-shrink-0 ${
                                pencilColor === c ? "border-white scale-110" : "border-[#282724] hover:border-[#282724]"
                              }`}
                              style={{ backgroundColor: c === "black" ? "#000" : c === "red" ? "#ef4444" : c === "blue" ? "#3b82f6" : c === "green" ? "#22c55e" : "#eab308" }}
                              title={`Text ${c}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Send button */}
                    <Button
                      type="button"
                      onClick={() => onSketchToEditSubmit?.(selectedModelId || undefined)}
                      disabled={isGenerating}
                      className="h-8 w-8 p-0 rounded-lg bg-gradient-to-r from-[#D4A652] to-[#C49A48] hover:from-[#C49A48] hover:to-[#B8903E] disabled:from-[#282724] disabled:to-[#282724] transition-all duration-200 flex-shrink-0 "
                      title="Generate Edit"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </form>
        </div>
      </div>
    </motion.div>
  );
}
