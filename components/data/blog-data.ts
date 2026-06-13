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
  imageUrl: string;
}

export const blogPosts: BlogPost[] = [
  {
    id: "what-is-automated-content-production",
    title: "What Is an Automated Content Production Platform?",
    content:
      "An automated content production platform helps teams move from idea to finished output in one connected workflow. Insturix supports planning, scripting, editing uploaded footage, content analysis, visual asset creation, music and sound, publishing, sharing, and brand consistency from a single production layer.",
    excerpt:
      "A clear definition of automated content production, how the workflow works, and why agencies, in-house teams, businesses, and filmmakers use it.",
    date: "12 June 2026",
    author: {
      name: "Insturix Team",
      avatar: "/blogs/blank_profile.png",
    },
    imageUrl: "/blogs/fallback-blog.jpg",
  },
];
