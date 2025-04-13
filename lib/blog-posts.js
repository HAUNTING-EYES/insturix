import fs from 'fs';
import path from 'path';

/**
 * Fetches all blog posts data for sitemap generation
 * This could be replaced with an actual API or database call in production
 */
export async function fetchBlogPosts() {
  // For demonstration, we're using local data 
  // In a real app, this would be a database or API call
  
  // Sample placeholder data for the sitemap
  const blogPosts = [
    {
      slug: 'ai-video-editing-guide',
      title: 'The Ultimate Guide to AI Video Editing',
      createdAt: '2023-10-15T00:00:00.000Z',
      updatedAt: '2023-11-20T00:00:00.000Z'
    },
    {
      slug: 'influencer-protection-strategies',
      title: 'Top 10 Strategies for Influencer Protection',
      createdAt: '2023-09-01T00:00:00.000Z',
      updatedAt: '2023-12-05T00:00:00.000Z'
    },
    {
      slug: 'business-analytics-for-creators',
      title: 'How Creators Can Use Business Analytics to Grow',
      createdAt: '2023-08-10T00:00:00.000Z',
      updatedAt: '2023-12-01T00:00:00.000Z'
    },
    {
      slug: 'brand-deals-maximizing-profit',
      title: 'Maximizing Profit from Brand Deals: A Creator\'s Guide',
      createdAt: '2023-11-05T00:00:00.000Z',
      updatedAt: '2023-12-10T00:00:00.000Z'
    },
    {
      slug: 'ai-future-content-creation',
      title: 'The Future of Content Creation with AI',
      createdAt: '2023-07-22T00:00:00.000Z',
      updatedAt: '2023-11-15T00:00:00.000Z'
    }
  ];
  
  return blogPosts;
} 