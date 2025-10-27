'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Calendar, { CalendarEvent } from './Calendar';

type PlanningPanelProps = {
  isOpen: boolean;
  onClose: () => void;
};

// Mock event data for demonstration
const mockEvents: CalendarEvent[] = [
  {
    id: '1',
    title: 'YouTube Tutorial',
    date: new Date().toISOString(),
    platform: 'youtube',
    status: 'scheduled',
    tags: ['tutorial', 'coding'],
    aiScore: 92
  },
  {
    id: '2',
    title: 'Instagram Reel',
    date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    platform: 'instagram',
    status: 'draft',
    tags: ['social', 'engagement'],
    aiScore: 78
  },
  {
    id: '3',
    title: 'LinkedIn Post',
    date: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
    platform: 'linkedin',
    status: 'published',
    tags: ['professional', 'networking']
  },
  {
    id: '4',
    title: 'Product Demo',
    date: new Date(Date.now() + 259200000).toISOString(), // 3 days
    platform: 'youtube',
    status: 'scheduled',
    tags: ['product', 'demo'],
    aiScore: 88
  },
  {
    id: '5',
    title: 'Behind the Scenes',
    date: new Date(Date.now() + 345600000).toISOString(), // 4 days
    platform: 'instagram',
    status: 'draft',
    tags: ['bts', 'culture']
  },
  {
    id: '6',
    title: 'Tech Talk',
    date: new Date(Date.now() + 432000000).toISOString(), // 5 days
    platform: 'youtube',
    status: 'scheduled',
    tags: ['tech', 'tutorial'],
    aiScore: 85
  }
];

export default function PlanningPanel({ isOpen, onClose }: PlanningPanelProps) {
  const [events, setEvents] = useState<CalendarEvent[]>(mockEvents);

  const handleCellClick = (date: Date) => {
    console.log('Cell clicked:', date);
    // Future: Open modal to create new event
  };

  const handleEventClick = (event: CalendarEvent) => {
    console.log('Event clicked:', event);
    // Future: Open modal/sidebar with event details
  };

  const handleEventDrop = (eventId: string, newDate: Date) => {
    setEvents(prev => 
      prev.map(event => 
        event.id === eventId 
          ? { ...event, date: newDate.toISOString() }
          : event
      )
    );
    console.log('Event dropped:', eventId, 'to', newDate);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Calendar
            events={events}
            onCellClick={handleCellClick}
            onEventClick={handleEventClick}
            onEventDrop={handleEventDrop}
            onClose={onClose}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
