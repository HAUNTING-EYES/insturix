# Blog System Documentation

## Overview
This blog system uses JSON files to store blog posts, making it easy to add new content without a database.

## Adding a New Blog Post

1. Create a new JSON file in the `data/blogs/` directory (filename doesnt matter)
2. Use the following structure:

```json
{
  "id": "unique-blog-slug",
  "title": "Your Blog Title",
  "author": {
    "name": "Author Name",
    "avatar": "/path/to/author/image.jpg"
  },
  "publishedAt": "2025-01-23T00:00:00Z",
  "image": "/blogs/your-blog-image.jpg",
  "fallbackImage": "/blogs/blank_profile.png",
  "excerpt": "A brief description of your blog post (150-200 characters)",
  "tags": ["tag1", "tag2", "tag3"],
  "readTime": 5,
  "content": "# Your Blog Content\n\nWrite your blog content in **Markdown** format here..."
}
```

3. Done, Commit and Push!

## Field Descriptions

- `id`: Unique identifier used in the URL (use kebab-case)
- `title`: The blog post title
- `author.name`: Author's full name
- `author.avatar`: Path to author's profile image
- `publishedAt`: ISO 8601 date string
- `image`: Main blog image (recommended: 1200x630px)
- `fallbackImage`: Image to show if main image fails to load
- `excerpt`: Brief description for blog cards and SEO
- `tags`: Array of relevant tags (max 3-4 recommended)
- `readTime`: Estimated reading time in minutes
- `content`: Full blog content in Markdown format

## Markdown Features Supported

- Headers (H1-H6)
- Bold and italic text
- Lists (ordered and unordered)
- Links
- Images
- Code blocks with syntax highlighting
- Tables
- Blockquotes

## Best Practices

1. **Images**: Store blog images in `/public/blogs/` directory
2. **File naming**: Use kebab-case for JSON filenames
3. **Content**: Write engaging, well-structured content
4. **SEO**: Include relevant keywords in title and excerpt
5. **Mobile**: Test content on mobile devices
6. **Performance**: Optimize images before uploading

## File Structure
```
data/blogs/
├── README.md
├── blog-post-1.json
├── blog-post-2.json
└── ...
```

## Deployment
After adding a new blog post, the site will automatically rebuild and include the new content.