import { blogPosts } from './sitemap-blog-data.js';

/**
 * Fetches all blog posts data for sitemap generation
 * This could be replaced with an actual API or database call in production
 */
export async function fetchBlogPosts() {
  // Use the simplified blog data for sitemap generation
  const formattedBlogPosts = blogPosts.map(post => ({
    slug: post.id,
    title: post.title,
    createdAt: new Date(post.date).toISOString(),
    updatedAt: new Date(post.date).toISOString()
  }));
  
  return formattedBlogPosts;
} 