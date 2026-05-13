/**
 * TimelineRowLabel Component
 * Displays layer number and provides controls for adding/deleting individual rows
 */

import React from "react";
import { Plus, X, Grip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TimelineRowLabelProps {
  /** Row index (0-based) */
  rowIndex: number;
  /** Whether this row can be deleted */
  canDelete: boolean;
  /** Whether a new row can be added */
  canAdd: boolean;
  /** Callback to delete this specific row */
  onDeleteRow: (rowIndex: number) => void;
  /** Callback to add a new row after this row */
  onAddRowAfter: (rowIndex: number) => void;
  /** Whether any row is currently being dragged */
  isDraggingRow: boolean;
  /** Index of the row being dragged */
  draggedRowIndex: number | null;
  /** Index of the row being hovered over during drag */
  dragOverRowIndex: number | null;
  /** Drag start handler */
  onDragStart: (e: React.DragEvent, rowIndex: number) => void;
  /** Drag end handler */
  onDragEnd: () => void;
  /** Drag over handler */
  onDragOver: (e: React.DragEvent, rowIndex: number) => void;
  /** Drop handler */
  onDrop: (rowIndex: number) => void;
  /** Whether this row has any overlays */
  hasContent: boolean;
}

export const TimelineRowLabel: React.FC<TimelineRowLabelProps> = ({
  rowIndex,
  canDelete,
  canAdd,
  onDeleteRow,
  onAddRowAfter,
  isDraggingRow,
  draggedRowIndex,
  dragOverRowIndex,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  hasContent,
}) => {
  return (
    <div
      className={`flex-1 flex items-center justify-between px-1 transition-all duration-200 
        ${
          dragOverRowIndex === rowIndex
            ? "bg-zinc-50 dark:bg-zinc-900/20 border-2 border-dashed border-zinc-300 dark:border-zinc-500"
            : ""
        }
        ${
          draggedRowIndex === rowIndex
            ? "opacity-50 bg-muted/50 dark:bg-muted/70"
            : ""
        }
        ${isDraggingRow ? "cursor-grabbing" : ""}`}
      onDragOver={(e) => onDragOver(e, rowIndex)}
      onDrop={() => onDrop(rowIndex)}
    >
      {/* Left side: Drag handle and label with hover-delete */}
      <div className="flex items-center gap-0.5">
        {/* Drag Handle */}
        <div
          className={`flex items-center justify-center rounded 
            transition-all duration-150 
            hover:bg-gray-200 dark:hover:bg-gray-800
            active:scale-95
            ${isDraggingRow ? "cursor-grabbing" : "cursor-grab"} 
            active:cursor-grabbing
            p-0.5`}
          draggable
          onDragStart={(e) => onDragStart(e, rowIndex)}
          onDragEnd={onDragEnd}
        >
          <Grip
            className="w-3 h-3 text-muted-foreground dark:text-muted-foreground 
            hover:text-foreground dark:hover:text-foreground
            transition-colors duration-150"
          />
        </div>

        {/* Layer Number area with fixed width so replacement doesn't shift layout */}
        <div className="w-6 h-5 relative flex items-center justify-center group">
          {/* Label text - fades out on hover */}
          <span
            className={`absolute inset-0 flex items-center justify-center text-[11px] font-semibold transition-all duration-150 ease-in-out ${
              hasContent
                ? "text-gray-700 dark:text-gray-200"
                : "text-gray-400 dark:text-gray-600"
            } group-hover:opacity-0 group-hover:scale-95`}
            aria-hidden={true}
          >
            L{rowIndex + 1}
          </span>

          {/* Delete button - occupies same space, hidden until hover; smooth fade/scale */}
          <span className="absolute inset-0 flex items-center justify-center">
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => onDeleteRow(rowIndex)}
                    disabled={!canDelete}
                    size="sm"
                    variant="ghost"
                    tabIndex={-1}
                    className={`h-5 w-5 p-0 transition-all duration-150 ease-in-out transform
                      opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100
                      ${canDelete ? "hover:bg-red-100 dark:hover:bg-red-900/30" : "opacity-30 cursor-not-allowed"}`}
                  >
                    <X className="h-3 w-3 text-red-600 dark:text-red-400" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-[11px]">
                  <p>
                    {canDelete
                      ? hasContent
                        ? `Delete L${rowIndex + 1} and remove all content`
                        : `Delete empty layer L${rowIndex + 1}`
                      : "Cannot delete - minimum 1 layer required"}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
        </div>
      </div>

      {/* Right side: Add button only */}
      <div className="flex items-center gap-0.5">
        {/* Add Row After Button */}
        <TooltipProvider>
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Button
                onClick={() => onAddRowAfter(rowIndex)}
                disabled={!canAdd}
                size="sm"
                variant="ghost"
                className={`h-6 w-6 p-0 transition-all ${
                  canAdd
                    ? "hover:bg-zinc-100 dark:hover:bg-zinc-900/30 opacity-100"
                    : "opacity-30 cursor-not-allowed"
                }`}
              >
                <Plus className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-400" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-[11px]">
              <p>{canAdd ? `Add layer below L${rowIndex + 1}` : "Max 20 layers reached"}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
};
