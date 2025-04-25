"use client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Mic, ImageIcon, FileText, Sparkles, X } from "lucide-react"

interface ActionWheelProps {
  onClose: () => void
  onSelectAction: (action: string) => void
  className?: string
}

export function ActionWheel({ onClose, onSelectAction, className }: ActionWheelProps) {
  const actions = [
    { id: "voice", icon: <Mic className="h-5 w-5" />, label: "Voice" },
    { id: "image", icon: <ImageIcon className="h-5 w-5" />, label: "Image" },
    { id: "document", icon: <FileText className="h-5 w-5" />, label: "Document" },
    { id: "generate", icon: <Sparkles className="h-5 w-5" />, label: "Generate" },
  ]

  return (
    <div className={cn("fixed bottom-24 right-8 z-50", className)}>
      <div className="relative">
        <Button
          variant="outline"
          size="icon"
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-background border-border z-10"
          onClick={onClose}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Close</span>
        </Button>

        <div className="flex flex-col gap-2 items-end">
          {actions.map((action, index) => (
            <div
              key={action.id}
              className="flex items-center gap-2 animate-fadeIn"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <span className="bg-card text-card-foreground px-2 py-1 rounded-md text-sm shadow-sm">
                {action.label}
              </span>
              <Button
                variant="secondary"
                size="icon"
                className="h-10 w-10 rounded-full shadow-md"
                onClick={() => onSelectAction(action.id)}
              >
                {action.icon}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
