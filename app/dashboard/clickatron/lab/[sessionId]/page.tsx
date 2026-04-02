import { ClickatronLabClient } from '@/components/dashboard/Clickatron/ClickatronLabClient';
import { notFound } from 'next/navigation';

interface LabPageProps {
  params: Promise<{
    sessionId: string;
  }>;
}

// This is a server component responsible for fetching initial data
export default async function ClickatronLabPage({ params }: LabPageProps) {
  const { sessionId } = await params;

  // In a real app, you would fetch this from your database
  // For now, we'll just pass the ID and let the client component fetch
  const initialData = {
    sessionId: sessionId,
    // You could pre-fetch some data here to avoid a client-side loading spinner
    // For example:
    // videoIdea: "Pre-fetched video idea",
    // variations: [{...}]
  };
  
  if (!sessionId) {
    notFound();
  }

  return <ClickatronLabClient initialData={initialData} />;
}