import One from "@/public/blogs/one.jpg";
import { StaticImageData } from "next/image";
import NJ from "@/public/team/NimitJain.jpeg";
import Two from "@/public/blogs/two.jpg";
import SB from "@/public/team/Srijan Baniyal.jpeg";
import Three from "@/public/blogs/three.jpg";
import AS from "@/public/team/Akshit Singh.jpeg";

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
    title: "How Insturix Protects Influencer's Accounts",
    content:
      "In the high-stakes world of social media, where influencers invest countless hours and creativity to build their digital empires, one misstep—whether a copyright dispute, an unexpected community guideline violation, or a hacked account—can erase years of effort overnight. Enter Insturix: the first-of-its-kind insurance platform designed exclusively for content creators. Insturix offers comprehensive protection against account suspensions, legal disputes over intellectual property, and even revenue loss during appeals. For a monthly subscription, creators gain access to 24/7 legal support, rapid account recovery services, and financial compensation for lost partnerships during downtime. The platform also provides proactive safeguards, like AI-powered content audits to flag potential guideline violations before posting. With Insturix, influencers can innovate boldly, knowing their livelihood is shielded from the unpredictable risks of platform algorithms and content ownership",
    excerpt:
      "Influencers face growing risks online – Insturix safeguards their platforms, giving them peace of mind to focus on creating engaging content, building their brand, and connecting with their audience freely.",
    date: "23 January 2025",
    author: {
      name: "Nimit Jain",
      avatar: NJ,
    },
    imageUrl: One,
  },
  {
    id: "2",
    title: "The Unlimited Potential of Content Creation ",
    content:
      "As a creator, the opportunities are boundless. Whether you're passionate about travel, fashion, technology, fitness, or education, there’s an audience out there eager to connect with your content. Influencers have the unique power to shape perceptions, build communities, and even drive social change. What sets this profession apart is its inclusivity—anyone with a smartphone, creativity, and determination can make their mark in the creator economy. <br /><br />Beyond creative freedom, being a creator offers unparalleled flexibility. You’re your own boss, deciding when, where, and how to work. The ability to monetize your passion through sponsorships, merchandise, affiliate marketing, and more makes content creation a lucrative career choice. For many, the idea of transforming their hobby into a full-time profession is no longer a dream but a reality within reach. <br /><br /> Moreover, the influencer industry is becoming more dynamic and diverse, welcoming creators from all walks of life. As more businesses invest in influencer marketing, the demand for niche creators with authentic voices is skyrocketing, giving rise to countless opportunities for growth and success.",
    excerpt:
      "The creator economy empowers individuals to turn passions into careers through flexible work. It provides inclusive opportunities for anyone with authenticity and dedication to thrive and make an impact.",
    date: "24 January 2025",
    author: {
      name: "Srijan Baniyal",
      avatar: SB,
    },
    imageUrl: Two,
  },
  {
    id: "3",
    title: "The Rising Influence of Influencer Marketing ",
    content:
      "Brands are shifting away from traditional advertising methods to embrace the personal touch of influencer marketing. Why? Because people trust people. Influencers offer authenticity, relatability, and the ability to engage audiences on a deeper level than conventional ads ever could. Studies show that influencer marketing delivers 11 times higher ROI than traditional advertising, making it an invaluable tool for businesses.<br /><br /> As an influencer, you’re not just promoting products—you’re crafting stories, building connections, and creating meaningful interactions with your audience. This level of impact is why brands are eager to collaborate with creators who resonate with their target demographics. Whether you have a few thousand followers or millions, there’s room for everyone to thrive in this ecosystem.",
    excerpt:
      "Influencer marketing drives 11x higher ROI than traditional ads. Brands partner with influencers for authentic storytelling, connection, and real results that truly matter always.",
    date: "23 January 2025",
    author: {
      name: "Akshit Singh",
      avatar: AS,
    },
    imageUrl: Three,
  },
];
