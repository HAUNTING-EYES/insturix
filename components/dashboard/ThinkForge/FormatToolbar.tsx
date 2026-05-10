'use client';

import React, { useCallback } from 'react';
import { 
  Bold, 
  Italic, 
  Underline, 
  Code, 
  Heading1, 
  Heading2, 
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  Strikethrough,
  Highlighter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { Editor } from '@tiptap/core';

interface FormatToolbarProps {
  editor: Editor | null;
  disabled?: boolean;
}

interface ToolbarButtonProps {
  icon: React.ElementType;
  tooltip: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ 
  icon: Icon, 
  tooltip, 
  onClick, 
  disabled,
  active 
}) => {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 ${
              active 
                ? 'bg-[#282724] text-[#ECE9E1]' 
                : 'text-[#7A776E] hover:text-[#ECE9E1] hover:bg-[#1C1B19]'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={onClick}
            disabled={disabled}
          >
            <Icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-[#0F0F0E] border-[#282724] text-[#ECE9E1]">
          <p className="text-[11px]">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const FormatToolbar: React.FC<FormatToolbarProps> = ({ editor, disabled = false }) => {
  // Toggle bold style
  const toggleBold = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleBold().run();
  }, [editor]);

  // Toggle italic style
  const toggleItalic = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleItalic().run();
  }, [editor]);

  // Toggle underline style
  const toggleUnderline = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleUnderline().run();
  }, [editor]);

  // Toggle strikethrough style
  const toggleStrike = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleStrike().run();
  }, [editor]);

  // Toggle code style
  const toggleCode = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleCode().run();
  }, [editor]);

  // Toggle highlight
  const toggleHighlight = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleHighlight().run();
  }, [editor]);

  // Set heading level
  const setHeading = useCallback((level: 1 | 2 | 3) => {
    if (!editor) return;
    editor.chain().focus().toggleHeading({ level }).run();
  }, [editor]);

  // Convert to bullet list
  const toggleBulletList = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleBulletList().run();
  }, [editor]);

  // Convert to numbered list
  const toggleNumberedList = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleOrderedList().run();
  }, [editor]);

  // Insert blockquote
  const toggleBlockquote = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().toggleBlockquote().run();
  }, [editor]);

  // Insert horizontal rule / divider
  const insertDivider = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().setHorizontalRule().run();
  }, [editor]);

  // Undo
  const undo = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().undo().run();
  }, [editor]);

  // Redo
  const redo = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().redo().run();
  }, [editor]);

  // Check if a formatting is active
  const isActive = useCallback((name: string, attrs?: Record<string, unknown>) => {
    if (!editor) return false;
    return editor.isActive(name, attrs);
  }, [editor]);

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-[#1C1B19]/60 rounded-lg border border-[#282724]/50 backdrop-blur-sm">
      {/* Text formatting */}
      <ToolbarButton 
        icon={Bold} 
        tooltip="Bold (Ctrl+B)" 
        onClick={toggleBold} 
        disabled={disabled} 
        active={isActive('bold')}
      />
      <ToolbarButton 
        icon={Italic} 
        tooltip="Italic (Ctrl+I)" 
        onClick={toggleItalic} 
        disabled={disabled}
        active={isActive('italic')}
      />
      <ToolbarButton 
        icon={Underline} 
        tooltip="Underline (Ctrl+U)" 
        onClick={toggleUnderline} 
        disabled={disabled}
        active={isActive('underline')}
      />
      <ToolbarButton 
        icon={Strikethrough} 
        tooltip="Strikethrough" 
        onClick={toggleStrike} 
        disabled={disabled}
        active={isActive('strike')}
      />
      <ToolbarButton 
        icon={Code} 
        tooltip="Inline Code" 
        onClick={toggleCode} 
        disabled={disabled}
        active={isActive('code')}
      />
      <ToolbarButton 
        icon={Highlighter} 
        tooltip="Highlight" 
        onClick={toggleHighlight} 
        disabled={disabled}
        active={isActive('highlight')}
      />
      
      <Separator orientation="vertical" className="h-6 mx-1 bg-[#282724]" />
      
      {/* Headings */}
      <ToolbarButton 
        icon={Heading1} 
        tooltip="Heading 1" 
        onClick={() => setHeading(1)} 
        disabled={disabled}
        active={isActive('heading', { level: 1 })}
      />
      <ToolbarButton 
        icon={Heading2} 
        tooltip="Heading 2" 
        onClick={() => setHeading(2)} 
        disabled={disabled}
        active={isActive('heading', { level: 2 })}
      />
      <ToolbarButton 
        icon={Heading3} 
        tooltip="Heading 3" 
        onClick={() => setHeading(3)} 
        disabled={disabled}
        active={isActive('heading', { level: 3 })}
      />
      
      <Separator orientation="vertical" className="h-6 mx-1 bg-[#282724]" />
      
      {/* Lists */}
      <ToolbarButton 
        icon={List} 
        tooltip="Bullet List" 
        onClick={toggleBulletList} 
        disabled={disabled}
        active={isActive('bulletList')}
      />
      <ToolbarButton 
        icon={ListOrdered} 
        tooltip="Numbered List" 
        onClick={toggleNumberedList} 
        disabled={disabled}
        active={isActive('orderedList')}
      />
      
      <Separator orientation="vertical" className="h-6 mx-1 bg-[#282724]" />
      
      {/* Block elements */}
      <ToolbarButton 
        icon={Quote} 
        tooltip="Quote" 
        onClick={toggleBlockquote} 
        disabled={disabled}
        active={isActive('blockquote')}
      />
      <ToolbarButton 
        icon={Minus} 
        tooltip="Divider" 
        onClick={insertDivider} 
        disabled={disabled}
      />
      
      <Separator orientation="vertical" className="h-6 mx-1 bg-[#282724]" />
      
      {/* Undo/Redo */}
      <ToolbarButton 
        icon={Undo} 
        tooltip="Undo (Ctrl+Z)" 
        onClick={undo} 
        disabled={disabled || !editor?.can().undo()}
      />
      <ToolbarButton 
        icon={Redo} 
        tooltip="Redo (Ctrl+Y)" 
        onClick={redo} 
        disabled={disabled || !editor?.can().redo()}
      />
    </div>
  );
};

export default FormatToolbar;
