export interface BlogPost {
  id: string;
  title: string;
  author: {
    name: string;
    avatar: string;
  };
  publishedAt: string;
  image: string;
  fallbackImage: string;
  excerpt: string;
  tags: string[];
  readTime: number;
  content: string;
  audioUrl?: string;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}