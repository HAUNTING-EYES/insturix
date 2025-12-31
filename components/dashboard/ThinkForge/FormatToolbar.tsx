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
  Redo
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FormatToolbarProps {
  editor: any; // BlockNote editor instance
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
                ? 'bg-zinc-700 text-white' 
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={onClick}
            disabled={disabled}
          >
            <Icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="bg-zinc-900 border-zinc-700 text-zinc-100">
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const FormatToolbar: React.FC<FormatToolbarProps> = ({ editor, disabled = false }) => {
  // Toggle bold style
  const toggleBold = useCallback(() => {
    if (!editor) return;
    try {
      editor.toggleStyles({ bold: true });
    } catch (e) {
      console.error('Failed to toggle bold:', e);
    }
  }, [editor]);

  // Toggle italic style
  const toggleItalic = useCallback(() => {
    if (!editor) return;
    try {
      editor.toggleStyles({ italic: true });
    } catch (e) {
      console.error('Failed to toggle italic:', e);
    }
  }, [editor]);

  // Toggle underline style
  const toggleUnderline = useCallback(() => {
    if (!editor) return;
    try {
      editor.toggleStyles({ underline: true });
    } catch (e) {
      console.error('Failed to toggle underline:', e);
    }
  }, [editor]);

  // Toggle code style
  const toggleCode = useCallback(() => {
    if (!editor) return;
    try {
      editor.toggleStyles({ code: true });
    } catch (e) {
      console.error('Failed to toggle code:', e);
    }
  }, [editor]);

  // Set heading level
  const setHeading = useCallback((level: 1 | 2 | 3) => {
    if (!editor) return;
    try {
      const selection = editor.getSelection();
      if (selection && selection.blocks && selection.blocks.length > 0) {
        for (const block of selection.blocks) {
          editor.updateBlock(block, { type: 'heading', props: { level } });
        }
      } else {
        // Try to update the current block
        const cursor = editor.getTextCursorPosition();
        if (cursor && cursor.block) {
          editor.updateBlock(cursor.block, { type: 'heading', props: { level } });
        }
      }
    } catch (e) {
      console.error('Failed to set heading:', e);
    }
  }, [editor]);

  // Convert to bullet list
  const toggleBulletList = useCallback(() => {
    if (!editor) return;
    try {
      const cursor = editor.getTextCursorPosition();
      if (cursor && cursor.block) {
        const currentType = cursor.block.type;
        const newType = currentType === 'bulletListItem' ? 'paragraph' : 'bulletListItem';
        editor.updateBlock(cursor.block, { type: newType });
      }
    } catch (e) {
      console.error('Failed to toggle bullet list:', e);
    }
  }, [editor]);

  // Convert to numbered list
  const toggleNumberedList = useCallback(() => {
    if (!editor) return;
    try {
      const cursor = editor.getTextCursorPosition();
      if (cursor && cursor.block) {
        const currentType = cursor.block.type;
        const newType = currentType === 'numberedListItem' ? 'paragraph' : 'numberedListItem';
        editor.updateBlock(cursor.block, { type: newType });
      }
    } catch (e) {
      console.error('Failed to toggle numbered list:', e);
    }
  }, [editor]);

  // Insert blockquote
  const insertQuote = useCallback(() => {
    if (!editor) return;
    try {
      const cursor = editor.getTextCursorPosition();
      if (cursor && cursor.block) {
        // Insert a new paragraph block styled as a quote
        // BlockNote doesn't have native quote, so we use paragraph with styling
        editor.insertBlocks(
          [{ type: 'paragraph', content: '' }],
          cursor.block,
          'after'
        );
      }
    } catch (e) {
      console.error('Failed to insert quote:', e);
    }
  }, [editor]);

  // Insert horizontal rule / divider
  const insertDivider = useCallback(() => {
    if (!editor) return;
    try {
      const cursor = editor.getTextCursorPosition();
      if (cursor && cursor.block) {
        // Insert a divider-like element (paragraph with line)
        editor.insertBlocks(
          [{ type: 'paragraph', content: '———' }],
          cursor.block,
          'after'
        );
      }
    } catch (e) {
      console.error('Failed to insert divider:', e);
    }
  }, [editor]);

  // Undo
  const undo = useCallback(() => {
    if (!editor) return;
    try {
      editor.undo();
    } catch (e) {
      console.error('Failed to undo:', e);
    }
  }, [editor]);

  // Redo
  const redo = useCallback(() => {
    if (!editor) return;
    try {
      editor.redo();
    } catch (e) {
      console.error('Failed to redo:', e);
    }
  }, [editor]);

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 bg-zinc-800/60 rounded-lg border border-zinc-700/50 backdrop-blur-sm">
      {/* Text formatting */}
      <ToolbarButton icon={Bold} tooltip="Bold (Ctrl+B)" onClick={toggleBold} disabled={disabled} />
      <ToolbarButton icon={Italic} tooltip="Italic (Ctrl+I)" onClick={toggleItalic} disabled={disabled} />
      <ToolbarButton icon={Underline} tooltip="Underline (Ctrl+U)" onClick={toggleUnderline} disabled={disabled} />
      <ToolbarButton icon={Code} tooltip="Code" onClick={toggleCode} disabled={disabled} />
      
      <Separator orientation="vertical" className="h-6 mx-1 bg-zinc-700" />
      
      {/* Headings */}
      <ToolbarButton icon={Heading1} tooltip="Heading 1" onClick={() => setHeading(1)} disabled={disabled} />
      <ToolbarButton icon={Heading2} tooltip="Heading 2" onClick={() => setHeading(2)} disabled={disabled} />
      <ToolbarButton icon={Heading3} tooltip="Heading 3" onClick={() => setHeading(3)} disabled={disabled} />
      
      <Separator orientation="vertical" className="h-6 mx-1 bg-zinc-700" />
      
      {/* Lists */}
      <ToolbarButton icon={List} tooltip="Bullet List" onClick={toggleBulletList} disabled={disabled} />
      <ToolbarButton icon={ListOrdered} tooltip="Numbered List" onClick={toggleNumberedList} disabled={disabled} />
      
      <Separator orientation="vertical" className="h-6 mx-1 bg-zinc-700" />
      
      {/* Block elements */}
      <ToolbarButton icon={Quote} tooltip="Quote" onClick={insertQuote} disabled={disabled} />
      <ToolbarButton icon={Minus} tooltip="Divider" onClick={insertDivider} disabled={disabled} />
      
      <Separator orientation="vertical" className="h-6 mx-1 bg-zinc-700" />
      
      {/* Undo/Redo */}
      <ToolbarButton icon={Undo} tooltip="Undo (Ctrl+Z)" onClick={undo} disabled={disabled} />
      <ToolbarButton icon={Redo} tooltip="Redo (Ctrl+Y)" onClick={redo} disabled={disabled} />
    </div>
  );
};

export default FormatToolbar;
