"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, Pencil, Trash2, GripVertical } from "lucide-react";
import Link from "next/link";
import { getPlatformIcon } from "./SocializeIcons";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { SocializeLink } from "@/schemas/Socialize";

interface SocializeLinksCardProps {
  links: SocializeLink[];
  selectedLinkIndex: number | null;
  onSelectLink: (index: number) => void;
  onRemoveLink: (index: number) => void;
  onEditLink: (index: number) => void;
  onReorder: (links: SocializeLink[]) => void;
}

function SortableLink({
  link,
  index,
  selectedLinkIndex,
  onSelectLink,
  onRemoveLink,
  onEditLink,
}: {
  link: SocializeLink;
  index: number;
  selectedLinkIndex: number | null;
  onSelectLink: (index: number) => void;
  onRemoveLink: (index: number) => void;
  onEditLink: (index: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: link.url });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: '#1B1A18',
        borderRadius: '12px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: selectedLinkIndex === index ? '#D4A652' : 'transparent',
      }}
      className={`w-full py-3 flex items-center justify-between gap-2 transition px-5 cursor-pointer group hover:border-[#D4A652]`}
      onClick={() => onSelectLink(index)}
    >
      <div className="flex items-center gap-4 flex-1 min-w-0 overflow-hidden">
        <button {...attributes} {...listeners} className="cursor-grab text-[#7A776E] hover:text-[#D4A652] transition-colors">
          <GripVertical className="w-5 h-5" />
        </button>
        {getPlatformIcon(link.platform)}
        <span className="truncate overflow-hidden text-ellipsis whitespace-nowrap block w-0 flex-grow" style={{ color: '#B5B2A8', fontFamily: 'JetBrains Mono', fontSize: '10px' }}>
          {link.url}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          asChild
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => e.stopPropagation()}
        >
          <Link
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#7A776E] hover:text-[#D4A652] transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-[#7A776E] hover:text-[#D4A652] hover:bg-transparent transition-colors"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            onEditLink(index);
          }}
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-[#7A776E] hover:text-[#D4A652] hover:bg-transparent transition-colors"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            onRemoveLink(index);
          }}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function SocializeLinksCard({
  links,
  selectedLinkIndex,
  onSelectLink,
  onRemoveLink,
  onEditLink,
  onReorder,
}: SocializeLinksCardProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = links.findIndex((link) => link.url === active.id);
      const newIndex = links.findIndex((link) => link.url === over.id);
      onReorder(arrayMove(links, oldIndex, newIndex));
    }
  }

  return (
    <Card className="shadow-none border-none" style={{ backgroundColor: '#0F0F0E', borderRadius: '12px' }}>
      <CardHeader>
        <CardTitle className="uppercase" style={{ fontFamily: 'JetBrains Mono', fontSize: '10px', letterSpacing: '0.08em', fontWeight: 500, color: '#EAE9E5' }}>Your Links</CardTitle>
        <CardDescription style={{ color: '#B5B2A8' }}>
          {links?.length
            ? `You have ${links.length} link${links.length > 1 ? "s" : ""}`
            : "Add your first link to get started"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {links?.length ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={links.map(l => l.url)} strategy={verticalListSortingStrategy}>
              <div className="grid gap-4">
                {links.map((link, index) => (
                  <SortableLink
                    key={link.url}
                    link={link}
                    index={index}
                    selectedLinkIndex={selectedLinkIndex}
                    onSelectLink={onSelectLink}
                    onRemoveLink={onRemoveLink}
                    onEditLink={onEditLink}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#1B1A18' }}>
              <span className="text-2xl">✨</span>
            </div>
            <p className="mb-2 text-lg font-medium" style={{ color: '#EAE9E5' }}>
              Show the world who you are.
            </p>
            <p style={{ color: '#B5B2A8' }}>Add a link to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}