"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Node } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { Mention } from '@tiptap/extension-mention';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import useClickatronStore from '@/stores/useCanvasStore';
import { CanvasPresetSelector } from './CanvasPresetSelector';
import { ImageUpload } from './ImageUpload';
import { ModelSelector } from './stages/ModelSelector';
import { Button } from '@/components/ui/button';
import { MagicPromptEnhancerButton } from './MagicPromptEnhancerButton';


const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.28, ease: "easeOut" } as any
};

export function CanvasIdeaInput() {
  const router = useRouter();
  const { toast } = useToast();
  const createSession = useClickatronStore((state) => state.createSession);

  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [referenceImages, setReferenceImages] = useState<File[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [hoverTag, setHoverTag] = useState<string | null>(null);

  const referenceImagesRef = useRef<File[]>([]);
  const previewUrlsRef = useRef<string[]>([]);

  const handleImagesChange = useCallback((files: File[]) => {
    referenceImagesRef.current = files;
    setReferenceImages(files);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: {
          class: 'mention inline bg-blue-500 text-white px-1 py-0.5 rounded font-semibold cursor-pointer mx-px',
        },
        suggestion: {
          char: '@',
          items: ({ query }) => {
            const currentImages = referenceImagesRef.current;
            if (currentImages.length === 0) {
              return [{ id: 'no reference images', label: 'no reference images' }];
            }
            return currentImages.map((_, index) => ({
              id: `@img${index + 1}`,
              label: `@img${index + 1}`,
              previewUrl: previewUrlsRef.current[index] || '',
            })).filter(item =>
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
                        div.className = `flex items-center gap-3 p-3 cursor-pointer transition-colors hover:bg-zinc-700 ${selectedIndex === index ? 'bg-zinc-70' : ''}`;
                        div.innerHTML = `
                          ${item.previewUrl ? `<img src="${item.previewUrl}" alt="Preview" class="w-8 h-8 rounded object-cover flex-shrink-0" />` : ''}
                          <span class="text-zinc-200 font-medium">${item.label}</span>
                        `;
                        div.addEventListener('mousedown', (e) => {
                          e.preventDefault();
                          commandFunction({ id: item.id, label: item.label });
                          popup.remove();
                        });
                        div.addEventListener('mouseenter', () => {
                          selectedIndex = index;
                          component.update(props);
                        });
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
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      if (filteredItems.length > 0) {
                        selectedIndex = (selectedIndex - 1 + filteredItems.length) % filteredItems.length;
                        component.update({ query: '', items: filteredItems });
                      }
                      return true;
                    }
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      if (filteredItems.length > 0) {
                        selectedIndex = (selectedIndex + 1) % filteredItems.length;
                        component.update({ query: '', items: filteredItems });
                      }
                      return true;
                    }
                    if (event.key === 'Enter' || event.key === 'Tab') {
                      event.preventDefault();
                      if (filteredItems.length > 0 && selectedIndex >= 0 && selectedIndex < filteredItems.length) {
                        const selectedItem = filteredItems[selectedIndex];
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
            
            console.log('Full text length:', fullText.length);
            console.log('Full text:', JSON.stringify(fullText));
            console.log('Cursor pos:', cursorPos);
            
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
                  console.log('Found text trigger at document position:', triggerPos);
                } else {
                  // Move to start of this node and continue
                  pos = resolvedPos.before();
                }
              }
            }
            
            const textBeforeCursor = fullText.substring(0, cursorPos);
            console.log('Text before cursor:', JSON.stringify(textBeforeCursor));
            console.log('Trigger index (document pos):', triggerPos);
            
            // Log the actual characters at specific positions
            for (let i = Math.max(0, cursorPos - 3); i < Math.min(fullText.length, cursorPos + 3); i++) {
              console.log(`Character at pos ${i}:`, JSON.stringify(fullText[i]), `(code: ${fullText[i]?.charCodeAt(0)})`);
            }
            
            console.log('Full editor text before:', fullText);
            console.log('cursorPos:', cursorPos);
            console.log('props.label:', props.label);
            console.log('props.id:', props.id);
            console.log('Document structure before deletion:', JSON.stringify(editor.state.doc.toJSON(), null, 2));
            
            if (triggerPos === -1) {
              // Fallback: insert at cursor without deletion
              console.log('No trigger found, using fallback insertion');
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
              console.log('Full editor text after (fallback):', editor.getText());
              return;
            }
            
            // Calculate deletion range: from trigger to cursor
            let deleteFrom = triggerPos;
            let deleteTo = cursorPos;
            
            // Check for whitespace after cursor and extend if needed
            const whitespaceRegex = /\s/;
            if (cursorPos < fullText.length && whitespaceRegex.test(fullText[cursorPos])) {
              deleteTo += 1;
              console.log('Extended deletion to include trailing whitespace');
            }
            
            const deletingSubstring = fullText.substring(deleteFrom, deleteTo);
            console.log('Deleting substring:', `"${deletingSubstring}"`);
            const simulatedTextAfterDelete = fullText.substring(0, deleteFrom) + fullText.substring(deleteTo);
            console.log('Simulated text after deletion:', simulatedTextAfterDelete);
            const expectedAfterInsert = simulatedTextAfterDelete + ' ' + props.label + ' ';
            console.log('Expected text after insert:', expectedAfterInsert);
            
            console.log('Calculated delete range:', { from: deleteFrom, to: deleteTo });
            
            // Perform deletion first and log state
            editor.chain().focus()
              .deleteRange({ from: deleteFrom, to: deleteTo })
              .run();
            console.log('Text after deletion:', editor.getText());
            console.log('Cursor position after deletion:', editor.state.selection.from);
            
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
            
            console.log('Full editor text after insertion:', editor.getText());
            console.log('Document structure after insertion:', JSON.stringify(editor.state.doc.toJSON(), null, 2));
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'min-h-[80px] w-full p-3 text-zinc-100 outline-none prose prose-sm prose-headings:text-zinc-100 prose-p:text-zinc-100 prose-li:text-zinc-100',
        placeholder: 'e.g., A futuristic city skyline at sunset, cinematic lighting, 4K quality...',
      },
    },
    content: '<p></p>',
    onUpdate: ({ editor }) => {
      // The mention will be rendered with custom styling
    },
  });

  const getPlainPrompt = () => {
    if (!editor) return '';
    let plain = editor.getText().replace(/\s+/g, ' ').trim();
    plain = plain.replace(/e\.g\., A futuristic city skyline at sunset, cinematic lighting, 4K quality\.\.\./, '').trim();
    return plain;
  };

  const enhancePrompt = async (currentPrompt: string): Promise<string> => {
    setIsEnhancing(true);
    try {
      const response = await fetch('/api/services/clickatron/enhance-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: currentPrompt, taskType: 'imageGeneration' }),
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

  useEffect(() => {
    referenceImagesRef.current = referenceImages;
  }, [referenceImages]);

  useEffect(() => {
    const urls = referenceImages.map(file => URL.createObjectURL(file));
    setPreviewUrls(urls);
    previewUrlsRef.current = urls;
    return () => {
      urls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [referenceImages]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await handleSubmit();
  };

  const handleSubmit = async () => {
    const plainPrompt = getPlainPrompt();
    if (!plainPrompt) {
      toast({
        title: "Prompt is required",
        description: "Please describe what you want to create.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedModelId) {
      toast({
        title: "Model not selected",
        description: "Please select a model to generate the image.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const formData = new FormData();
      formData.append('prompt', plainPrompt);
      formData.append('aspectRatio', aspectRatio);
      formData.append('modelId', selectedModelId);
      referenceImages.forEach((image) => {
        formData.append('referenceImage', image);
      });

      const result = await createSession(formData);
      
      if (result && result.sessionId) {
        router.push(`/dashboard/clickatron/lab/${result.sessionId}`);
      } else {
        throw new Error('Session ID not returned');
      }
    } catch (error) {
      console.error("Failed to create session:", error);
      toast({
        title: "Failed to start session",
        description: "Could not create a new Clickatron session. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  return (
    <Card className="relative bg-gradient-to-b from-zinc-950/80 to-zinc-90/40 border-zinc-800/80 backdrop-blur-xl overflow-hidden">
      <CardContent className="relative p-6 overflow-hidden">
        {/* Ambient background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-50/5 via-transparent to-blue-500/5 opacity-40" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-purple-500/10 blur-3xl rounded-full" />
        
        <motion.div
          className="relative z-10"
          {...fadeIn}
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-purple-500/10 ring-1 ring-purple-400/20 mb-4">
              <Sparkles className="h-6 w-6 text-purple-400" />
            </div>
            
            <h2 className="text-xl font-semibold text-zinc-10 mb-2 tracking-tight">
              Create New Thumbnail
            </h2>
              
            <p className="text-zinc-400 text-sm max-w-md mx-auto">
              Describe your vision and let AI bring it to life. Upload reference images for better results.
            </p>
          </div>

          <form onSubmit={handleFormSubmit} className="w-full max-w-2xl mx-auto space-y-4">
            {/* Prompt Input */}
            <div className="relative">
              <div className="relative">
                <div className="min-h-[80px] bg-zinc-900/60 border border-zinc-700 rounded-xl pr-12 focus-within:ring-2 focus-within:ring-purple-400/50 focus-within:border-purple-400/50 transition-all p-3">
                  <EditorContent editor={editor} />
                </div>
                <div className="absolute right-3 top-3">
                  <MagicPromptEnhancerButton
                    onEnhance={enhancePrompt}
                    isEnhancing={isEnhancing}
                    disabled={isLoading}
                    prompt={getPlainPrompt()}
                    onPromptEnhanced={handleEnhanceComplete}
                  />
                </div>
              </div>

              {/* Hover Preview for Tags */}
              {hoverTag && previewUrls.length > 0 && (
                <div
                  className="fixed z-50 bg-black/90 border border-zinc-700 rounded-lg overflow-hidden shadow-2xl"
                  style={{
                    bottom: '20px',
                    right: '20px',
                    width: '150px',
                    height: '150px',
                  }}
                >
                  <img
                    src={previewUrls[parseInt(hoverTag.replace('@img', '')) - 1] || ''}
                    alt={hoverTag}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
            
            {/* Aspect Ratio, Reference Images, and Model */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-zinc-300 mb-2 block">Canvas Size</label>
                <CanvasPresetSelector value={aspectRatio} onChange={setAspectRatio} />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-zinc-300 mb-2 block">Reference Images</label>
                  <ImageUpload 
                    onFileChange={handleImagesChange}
                    isLoading={isLoading}
                    multiple={true}
                  />
                </div>
                <div className="bg-zinc-900/40 border border-zinc-700/50 rounded-lg p-4 min-h-[100px] flex items-center justify-center">
                  <ModelSelector
                    context="ideation"
                    userAttachedImages={referenceImages.length}
                    selectedModelId={selectedModelId || undefined}
                    onModelChange={setSelectedModelId}
                    className=""
                  />
                </div>
              </div>
            </div>
            
            <div className="pt-2">
              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg hover:shadow-purple-500/25"
                disabled={isLoading || isEnhancing}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating your canvas...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Create Canvas
                  </>
                )}
              </Button>
            </div>
          </form>
        </motion.div>
      </CardContent>
    </Card>
  );
}