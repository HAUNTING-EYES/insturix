import One from "@/public/blogs/one.jpg";
import { StaticImageData } from "next/image";
import NJ from "@/public/NimitJain.jpeg";

export interface BlogPost {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  date: string;
  author: {
    name: string;
    avatar: string | StaticImageData;
  };
  imageUrl: string | StaticImageData;
}

export const blogPosts: BlogPost[] = [
  {
    id: "1",
    title: "How Insturance Protects Influencer's Accounts",
    content:
      "In the high-stakes world of social media, where influencers invest countless hours and creativity to build their digital empires, one misstep—whether a copyright dispute, an unexpected community guideline violation, or a hacked account—can erase years of effort overnight. Enter Insturance: the first-of-its-kind insurance platform designed exclusively for content creators. Insturance offers comprehensive protection against account suspensions, legal disputes over intellectual property, and even revenue loss during appeals. For a monthly subscription, creators gain access to 24/7 legal support, rapid account recovery services, and financial compensation for lost partnerships during downtime. The platform also provides proactive safeguards, like AI-powered content audits to flag potential guideline violations before posting. With Insturance, influencers can innovate boldly, knowing their livelihood is shielded from the unpredictable risks of platform algorithms and content ownership",
    excerpt:
      "Influencers face risks online—Insturance protects their platforms so they can focus on creating content",
    date: "23 January 2025",
    author: {
      name: "Nimit Jain",
      avatar: NJ,
    },
    imageUrl: One,
  },
  {
    id: "2",
    title: "The Power of Tailwind CSS with next.js bruh",
    content:
      "Tailwind CSS is a utility-first CSS framework that can significantly speed up your development process...",
    excerpt:
      "Learn how to use Tailwind CSS to build beautiful and responsive websites quickly.",
    date: "23 January 2025",
    author: {
      name: "Bob Smith",
      avatar: "/placeholder.svg?height=50&width=50",
    },
    imageUrl: "/placeholder.svg?height=400&width=600",
  },
  {
    id: "3",
    title: "Understanding React Hooks like a 12 year old kid",
    content:
      "React Hooks have revolutionized the way we write React components, allowing for more reusable and cleaner code...",
    excerpt:
      "Master React Hooks and build more efficient and maintainable React applications.",
    date: "23 January 2025",
    author: {
      name: "Charlie Brown",
      avatar: "/placeholder.svg?height=50&width=50",
    },
    imageUrl: "/placeholder.svg?height=400&width=600",
  },
];
