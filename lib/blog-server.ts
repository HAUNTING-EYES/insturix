import fs from 'fs';
import path from 'path';
import { BlogPost } from './blog-utils';

const BLOGS_DIRECTORY = path.join(process.cwd(), 'data/blogs');

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  try {
    const fileNames = fs.readdirSync(BLOGS_DIRECTORY);
    const blogPosts: BlogPost[] = [];

    for (const fileName of fileNames) {
      if (fileName.endsWith('.json')) {
        const filePath = path.join(BLOGS_DIRECTORY, fileName);
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const blogPost: BlogPost = JSON.parse(fileContents);
        blogPosts.push(blogPost);
      }
    }

    // Sort by publishedAt date (newest first)
    return blogPosts.sort((a, b) => 
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );
  } catch (error) {
    console.error('Error reading blog posts:', error);
    return [];
  }
}

export async function getBlogPost(id: string): Promise<BlogPost | null> {
  try {
    const filePath = path.join(BLOGS_DIRECTORY, `${id}.json`);
    const fileContents = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContents);
  } catch (error) {
    console.error(`Error reading blog post ${id}:`, error);
    return null;
  }
}

export function generateBlogSlugs(): string[] {
  try {
    const fileNames = fs.readdirSync(BLOGS_DIRECTORY);
    return fileNames
      .filter(fileName => fileName.endsWith('.json'))
      .map(fileName => fileName.replace('.json', ''));
  } catch (error) {
    console.error('Error generating blog slugs:', error);
    return [];
  }
}