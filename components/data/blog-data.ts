export interface BlogPost {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  date: string;
  author: {
    name: string;
    avatar: string;
  };
  category: string;
  tags: string[];
  imageUrl: string;
}

export const blogPosts: BlogPost[] = [
  {
    id: "1",
    title: "The Future of Web Development with Next.js",
    content: "Next.js is revolutionizing the way we build web applications...",
    excerpt:
      "Explore the cutting-edge features of Next.js and how they're shaping the future of web development.",
    date: "2023-06-15",
    author: {
      name: "Alice Johnson",
      avatar: "/placeholder.svg?height=50&width=50",
    },
    category: "Web Development",
    tags: ["Next.js", "React", "JavaScript"],
    imageUrl: "/placeholder.svg?height=400&width=600",
  },
  {
    id: "2",
    title: "The Power of Tailwind CSS",
    content:
      "Tailwind CSS is a utility-first CSS framework that can significantly speed up your development process...",
    excerpt:
      "Learn how to use Tailwind CSS to build beautiful and responsive websites quickly.",
    date: "2023-05-15",
    author: {
      name: "Bob Smith",
      avatar: "/placeholder.svg?height=50&width=50",
    },
    category: "Web Development",
    tags: ["Tailwind CSS", "CSS", "UI"],
    imageUrl: "/placeholder.svg?height=400&width=600",
  },
  {
    id: "3",
    title: "Understanding React Hooks",
    content:
      "React Hooks have revolutionized the way we write React components, allowing for more reusable and cleaner code...",
    excerpt:
      "Master React Hooks and build more efficient and maintainable React applications.",
    date: "2023-06-01",
    author: {
      name: "Charlie Brown",
      avatar: "/placeholder.svg?height=50&width=50",
    },
    category: "Web Development",
    tags: ["React", "Hooks", "JavaScript"],
    imageUrl: "/placeholder.svg?height=400&width=600",
  },
];

export const categories = [
  "Web Development",
  "Design",
  "DevOps",
  "AI",
  "Mobile Development",
];
