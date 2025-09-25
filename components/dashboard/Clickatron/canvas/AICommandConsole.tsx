"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Node } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { Mention } from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Image, Loader2, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModelSelector } from '../stages/ModelSelector';
import { MagicPromptEnhancerButton } from '../MagicPromptEnhancerButton';

interface AICommandConsoleProps {
onGenerate: (prompt: string, referenceImages?: File[], modelId?: string) => void;
isGenerating: boolean;
galleryCollapsed?: boolean;
className?: string;
clearTrigger?: number; // When this changes, clear the console
setPromptData?: { // When this changes, populate the console
  prompt: string;
  referenceImages?: string[]; // This will now be GCS URLs for display
  trigger: number;
};
referenceImageCount?: number; // Number of reference images for model filtering
onReferenceImageCountChange?: (count: number) => void; // Callback when reference image count changes
currentImageUrl?: string; // GCS signed URL of the active variation's imageRef
}

export function AICommandConsole({
  onGenerate,
  isGenerating,
  galleryCollapsed = false,
  className = "",
  clearTrigger,
  setPromptData,
  referenceImageCount = 0,
  onReferenceImageCountChange,
  currentImageUrl,
}: AICommandConsoleProps) {
  
  useEffect(() => {
  }, [currentImageUrl]);
  
  useEffect(() => {
    currentImageUrlRef.current = currentImageUrl || '';
  }, [currentImageUrl]);
  
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [referenceImagePreviews, setReferenceImagePreviews] = useState<string[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const referenceImagesRef = useRef<File[]>([]);
  const referenceImagePreviewsRef = useRef<string[]>([]);
  const currentImageUrlRef = useRef<string>('');

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
        placeholder: 'e.g. Add the dog from @img2 to @img1',
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention inline bg-blue-500 text-white px-1 py-0.5 rounded font-semibold cursor-pointer mx-px',
        },
        suggestion: {
          char: '@',
          items: ({ query }) => {
            
            let items = [];
            
            if (currentImageUrlRef.current) {
              // If currentImageUrl exists, add it as @img1, then add uploads as @img2+
              items.push({
                id: '@img1',
                label: '@img1',
                previewUrl: '',
              });
              
              // Add uploaded reference images as @img2, @img3, etc.
              for (let i = 0; i < referenceImagePreviewsRef.current.length; i++) {
                items.push({
                  id: `@img${i + 2}`,
                  label: `@img${i + 2}`,
                  previewUrl: referenceImagePreviewsRef.current[i] || '',
                });
              }
            } else {
              // If no currentImageUrl, start uploads from @img1
              for (let i = 0; i < referenceImagePreviewsRef.current.length; i++) {
                items.push({
                  id: `@img${i + 1}`,
                  label: `@img${i + 1}`,
                  previewUrl: referenceImagePreviewsRef.current[i] || '',
                });
              }
            }
            
            if (items.length === 0) {
              return [{ id: 'no reference images', label: 'no reference images' }];
            }
            
            return items.filter(item =>
              item.label.toLowerCase().includes(query.toLowerCase())
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
                rect = clientRect ? clientRect() : { left: 0, top: 0, width: 0, height: 0 };
                
                popup = document.createElement('div');
                popup.className = 'suggestions-popup absolute z-50 bg-zinc-800 border border-zinc-700 rounded-xl shadow-lg max-h-60 overflow-y-auto w-64';
                const triggerRect = clientRect ? clientRect() : { left: 0, top: 0, width: 0, height: 0 };
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
                    popup.innerHTML = '';
                    if (items.length === 0) {
                      const noItems = document.createElement('div');
                      noItems.className = 'p-3 text-zinc-400 text-sm cursor-default';
                      noItems.textContent = 'no reference images';
                      popup.appendChild(noItems);
                    } else {
                      items.forEach((item: any, index: number) => {
                        const div = document.createElement('div');
                        div.className = `flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-zinc-700 ${selectedIndex === index ? 'bg-zinc-700' : ''}`;
                        
                        if (item.previewUrl) {
                          const img = document.createElement('img');
                          img.src = item.previewUrl;
                          img.alt = 'Preview';
                          img.className = 'w-8 h-8 rounded object-cover flex-shrink-0';
                          
                          img.onerror = (e) => {
                            console.error('Popup preview load error:', item.previewUrl, e);
                          };
                          
                          // Set loading to eager to load immediately
                          img.loading = 'eager';
                          
                          div.appendChild(img);
                        }
                        
                        const labelSpan = document.createElement('span');
                        labelSpan.className = 'text-zinc-200 font-medium';
                        labelSpan.textContent = item.id === '@img1' ? '@img1 - Original Image' : item.label;
                        div.appendChild(labelSpan);
                        
                        // Only add click handlers if the item is not "no reference images"
                        if (item.id !== 'no reference images') {
                          div.addEventListener('mousedown', (e) => {
                            e.preventDefault();
                            commandFunction({ id: item.id, label: item.label });
                            popup.remove();
                          });
                          div.addEventListener('mouseenter', () => {
                            selectedIndex = index;
                            component.update(props);
                          });
                        } else {
                          // Make the "no reference images" option unclickable
                          div.className = div.className.replace('cursor-pointer', 'cursor-default');
                          div.classList.add('opacity-50');
                        }
                        popup.appendChild(div);
                      });
                    }
                    setTimeout(() => {
                      if (popup && popup.parentNode && inputContainer && clientRect) {
                        const currentTriggerRect = clientRect();
                        const inputRect = inputContainer.getBoundingClientRect();
                        const relativeLeft = currentTriggerRect.left - inputRect.left;
                        const relativeTop = currentTriggerRect.top - inputRect.top;
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
                    if (event.key === 'Escape') {
                      popup?.remove();
                      return true;
                    }
                    
                    // Helper function to find next selectable index when navigating down
                    const findNextSelectableIndex = (currentIndex: number) => {
                      let nextIndex = (currentIndex + 1) % filteredItems.length;
                      let count = 0; // Prevent infinite loop
                      
                      while (count < filteredItems.length) {
                        if (filteredItems[nextIndex]?.id !== 'no reference images') {
                          return nextIndex;
                        }
                        nextIndex = (nextIndex + 1) % filteredItems.length;
                        count++;
                      }
                      return currentIndex; // Return current if no selectable item found
                    };
                    
                    // Helper function to find previous selectable index when navigating up
                    const findPrevSelectableIndex = (currentIndex: number) => {
                      let prevIndex = (currentIndex - 1 + filteredItems.length) % filteredItems.length;
                      let count = 0; // Prevent infinite loop
                      
                      while (count < filteredItems.length) {
                        if (filteredItems[prevIndex]?.id !== 'no reference images') {
                          return prevIndex;
                        }
                        prevIndex = (prevIndex - 1 + filteredItems.length) % filteredItems.length;
                        count++;
                      }
                      return currentIndex; // Return current if no selectable item found
                    };
                    
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      if (filteredItems.length > 0) {
                        // If current index is on "no reference images", move to previous
                        if (filteredItems[selectedIndex]?.id === 'no reference images') {
                          selectedIndex = findPrevSelectableIndex(selectedIndex);
                        } else {
                          selectedIndex = findPrevSelectableIndex(selectedIndex);
                        }
                        component.update({ query: '', items: filteredItems });
                      }
                      return true;
                    }
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      if (filteredItems.length > 0) {
                        // If current index is on "no reference images", move to next
                        if (filteredItems[selectedIndex]?.id === 'no reference images') {
                          selectedIndex = findNextSelectableIndex(selectedIndex);
                        } else {
                          selectedIndex = findNextSelectableIndex(selectedIndex);
                        }
                        component.update({ query: '', items: filteredItems });
                      }
                      return true;
                    }
                    if (event.key === 'Enter' || event.key === 'Tab') {
                      event.preventDefault();
                      if (filteredItems.length > 0 && selectedIndex >= 0 && selectedIndex < filteredItems.length) {
                        const selectedItem = filteredItems[selectedIndex];
                        // Skip "no reference images" option for keyboard selection
                        if (selectedItem.id === 'no reference images') {
                          // Do nothing for "no reference images" - don't execute command
                          popup?.remove();
                          return true;
                        }
                        commandFunction({ id: selectedItem.id, label: selectedItem.label });
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
            
            // Traverse backwards to find the actual text trigger '@', skipping mention nodes
            let pos = cursorPos;
            let triggerPos = -1;
            let foundTrigger = false;
            
            while (pos > 0 && !foundTrigger) {
              const resolvedPos = state.doc.resolve(pos);
              const parent = resolvedPos.parent;
              
              if (parent.type.name === 'mention') {
                // Skip the entire mention node
                pos -= parent.nodeSize;
              } else {
                // In a text-containing node, search backwards for '@'
                const textContent = parent.textContent;
                const localOffset = resolvedPos.parentOffset;
                const textBeforeLocal = textContent.substring(0, localOffset);
                const localTriggerIndex = textBeforeLocal.lastIndexOf('@');
                
                if (localTriggerIndex !== -1) {
                  triggerPos = resolvedPos.start() + localTriggerIndex;
                  foundTrigger = true;
                } else {
                  // Move to start of this node and continue
                  pos = resolvedPos.before();
                }
              }
            }
            
            if (triggerPos === -1) {
              // Fallback: insert at cursor without deletion
              editor.chain().focus().insertContent([
                 {
                   type: 'text',
                   text: ' ',
                 },
                 {
                   type: 'mention',
                   attrs: {
                     id: props.id,
                     label: props.label ? props.label.replace('@', '') : '', // Pass label without '@'
                   },
                 },
                 {
                   type: 'text',
                   text: ' ',
                }
             ]).run();
              return;
            }
            
            // Calculate deletion range: from trigger to cursor
            let deleteFrom = triggerPos;
            let deleteTo = cursorPos;
            
            // Check for whitespace after cursor and extend if needed
            const whitespaceRegex = /\s/;
            if (cursorPos < fullText.length && whitespaceRegex.test(fullText[cursorPos])) {
              deleteTo += 1;
            }
            
            // Perform deletion first
            editor.chain().focus()
              .deleteRange({ from: deleteFrom, to: deleteTo })
              .run();
            
            // Then insert space, mention, space
            editor.chain().focus()
              .insertContent([
                 {
                   type: 'text',
                   text: ' ',
                 },
                 {
                   type: 'mention',
                   attrs: {
                     id: props.id,
                     label: props.label ? props.label.replace('@', '') : '', // Pass label without '@'
                   },
                 },
                 {
                   type: 'text',
                   text: ' ',
                 }
              ])
              .run();
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'min-h-[32px] max-h-[80px] w-full p-2.5 text-zinc-100 outline-none overflow-y-auto break-all overflow-x-hidden',
      },
    },
    content: '',
  });

  const getPlainPrompt = () => {
    if (!editor) return '';
    let plain = editor.getText().replace(/\s+/g, ' ').trim();
    return plain;
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
  };

  const enhancePrompt = async (currentPrompt: string): Promise<string> => {
    setIsEnhancing(true);
    try {
      const response = await fetch('/api/services/clickatron/enhance-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: currentPrompt, taskType: 'imageEditing' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to enhance prompt');
      }

      const data = await response.json();
      return data.enhancedPrompt;
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleEnhanceComplete = useCallback((enhancedPrompt: string) => {
    if (editor) {
      editor.commands.setContent(enhancedPrompt);
    }
  }, [editor]);

  // Clear console when clearTrigger changes
  useEffect(() => {
    if (clearTrigger !== undefined) {
      if (editor) {
        editor.commands.setContent('');
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

  const handleSubmit = (e?: React.FormEvent | React.KeyboardEvent) => {
    if (e) {
      e.preventDefault();
    }
    const plainPrompt = getPlainPrompt();
    if (!plainPrompt.trim() || isGenerating) return;

    onGenerate(plainPrompt, referenceImages.length > 0 ? referenceImages : undefined, selectedModelId || undefined);
    if (editor) {
      editor.commands.setContent('');
    }
    setReferenceImages([]);
    setReferenceImagePreviews([]);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    
    // Store File objects
    setReferenceImages(prev => [...prev, ...files]);
    
    // Generate preview URLs
    const newPreviews = files.map(file => URL.createObjectURL(file));
    setReferenceImagePreviews(prev => [...prev, ...newPreviews]);
    onReferenceImageCountChange?.(referenceImagePreviews.length + files.length);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        if (file) {
          // Store File object
          setReferenceImages(prev => [...prev, file]);
          
          // Generate preview URL
          const previewUrl = URL.createObjectURL(file);
          setReferenceImagePreviews(prev => [...prev, previewUrl]);
        }
        break;
      }
    }
  };

  const removeReferenceImage = (index: number) => {
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
    setReferenceImagePreviews(prev => {
      const newPreviews = [...prev];
      URL.revokeObjectURL(newPreviews[index]); // Clean up the object URL
      newPreviews.splice(index, 1);
      return newPreviews;
    });
  };

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      referenceImagePreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [referenceImagePreviews]);




  useEffect(() => {
    referenceImagesRef.current = referenceImages;
  }, [referenceImages]);

  useEffect(() => {
    referenceImagePreviewsRef.current = referenceImagePreviews;
  }, [referenceImagePreviews]);

  // Update reference image count when reference images change
  useEffect(() => {
    onReferenceImageCountChange?.(referenceImages.length);
  }, [referenceImages.length, onReferenceImageCountChange]);

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`
        bg-gradient-to-t from-zinc-900/95 to-zinc-900/80 backdrop-blur-xl 
        border-t border-zinc-800/60
        ${className}
      `}
    >
      <div className="p-3 max-w-4xl mx-auto mr-0">
        {/* Model Selector */}
        <div className="mb-2">
          <ModelSelector
            context="edit"
            userAttachedImages={referenceImageCount}
            selectedModelId={selectedModelId || undefined}
            onModelChange={handleModelChange}
          />
        </div>
        
        {/* Main Input Container */}
        <div className="relative bg-zinc-800/40 rounded-xl border border-zinc-700/50 p-2">
          {/* Reference Images */}
          <AnimatePresence>
            {referenceImagePreviews.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-2 pb-2 border-b border-zinc-700/30"
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
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-zinc-700/50 border border-zinc-600/50">
                        <img
                          src={previewUrl}
                          alt={`Reference ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <button
                        onClick={() => removeReferenceImage(index)}
                        className="absolute -top-1 -right-1 w-3 h-3 bg-zinc-900 border border-zinc-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-600 hover:border-red-500"
                      >
                        <X className="h-1.5 w-1.5 text-zinc-300" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input Row */}
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-2">
              {/* Image Upload Button */}
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
                className="h-8 w-8 p-0 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 border border-zinc-700/50 hover:border-zinc-600/50 transition-all duration-200"
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
                  className="min-h-[32px] max-h-[80px] bg-zinc-900/40 text-zinc-100 placeholder-zinc-50 rounded-lg focus:ring-1 focus:ring-purple-400/50 focus:bg-zinc-900/60 transition-all duration-200 text-sm border-zinc-700/50 overflow-y-auto break-all overflow-x-hidden p-2.5"
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                >
                  <EditorContent
                    editor={editor}
                  />
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
                className="h-8 w-8 p-0 rounded-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 disabled:from-zinc-700 disabled:to-zinc-700 transition-all duration-200"
              >
                {isGenerating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </motion.div>
  );
}