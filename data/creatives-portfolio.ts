export interface Project {
  id: string;
  title: string;
  company: string;
  description: string;
  logo: string;
  thumbnail: string;
  videoUrl: string; // YouTube embed ID or full URL
  brandColor: string;
  aspectRatio: "video" | "square" | "portrait"; // For visual variety if needed, but we'll default to video (16:9)
}

export const portfolioProjects: Project[] = [
  {
    id: "1",
    title: "Tanishq Jewelry",
    company: "Tanishq",
    description: "A cinematic exploration of heritage and craftsmanship, showcasing the timeless elegance of Tanishq jewelry.",
    logo: "/agencywork/tanishq-logo.png",
    thumbnail: "/agencywork/tanishq-thumbnail.webp",
    videoUrl: "bt5to27N0Fw",
    brandColor: "#7c2d12",
    aspectRatio: "video",
  },
  {
    id: "2",
    title: "The Coffee Experience",
    company: "Starbucks",
    description: "Capturing the art of the perfect brew and the cozy atmosphere that makes Starbucks a second home.",
    logo: "/agencywork/starbucks-logo.png",
    thumbnail: "/agencywork/starbucks-thumbnail.jpg",
    videoUrl: "_n2N8G55Kb8",
    brandColor: "#00704A",
    aspectRatio: "video",
  },
  {
    id: "3",
    title: "Beauty Redefined",
    company: "L'Oréal",
    description: "A high-fashion commercial highlighting innovative beauty products and empowered self-expression.",
    logo: "/agencywork/loreal-logo.png",
    thumbnail: "/agencywork/loreal-thumbnail.webp",
    videoUrl: "BZ7hBXJhSpU",
    brandColor: "#ab9368",
    aspectRatio: "video",
  },
  {
    id: "4",
    title: "Treating Everyone Right",
    company: "Corah Rehab",
    description: "Fast-paced lifestyle video demonstrating the ease of urban transportation.",
    logo: "/agencywork/corahrehab-logo.webp",
    thumbnail: "/agencywork/corahrehab-thumbnail.webp",
    videoUrl: "0L9lpYJV8wA",
    brandColor: "#000000",
    aspectRatio: "video",
  },
  {
    id: "5",
    title: "Chai Culture",
    company: "Chaayos",
    description: "Sleek, modern promotional video for a new financial product launch.",
    logo: "/agencywork/chaayos-logo.png",
    thumbnail: "/agencywork/chaayos-thumbnail.webp",
    videoUrl: "KitOgGgdOA8",
    brandColor: "#000000",
    aspectRatio: "video",
  },
  {
    id: "6",
    title: "Clothing",
    company: "Bewakoof",
    description: "A high-energy vertical brand film capturing the spirit of modern streetwear culture.",
    logo: "/agencywork/bewakoof-logo.png",
    thumbnail: "/agencywork/bewakoof-thumbnail.jpg",
    videoUrl: "SMjjx2Qx_Dw",
    brandColor: "#facc15",
    aspectRatio: "portrait",
  },
//    {
//     id: "7",
//     title: "Space Exploration",
//     company: "SpaceX",
//     description: "Cinematic journey through the stars, highlighting the next generation of space travel.",
//     logo: "https://upload.wikimedia.org/wikipedia/commons/2/2e/SpaceX_logo_black.svg",
//     thumbnail: "https://images.unsplash.com/photo-1516849841032-87cbac4d88f7?q=80&w=2070&auto=format&fit=crop",
//     videoUrl: "73_1biulkYk",
//     brandColor: "#000000",
//     aspectRatio: "video",
//   },
//   {
//     id: "8",
//     title: "Music Experience",
//     company: "Spotify",
//     description: "Vibrant and colorful video celebrating diversity in music culture.",
//     logo: "https://upload.wikimedia.org/wikipedia/commons/1/19/Spotify_logo_without_text.svg",
//     thumbnail: "https://images.unsplash.com/photo-1614680376593-902f74cf0d41?q=80&w=1974&auto=format&fit=crop",
//     videoUrl: "fA632Jc56Cg",
//     brandColor: "#1DB954",
//     aspectRatio: "video",
//   },
//   {
//     id: "9",
//     title: "Electric Future",
//     company: "Tesla",
//     description: "Elegant showcase of electric vehicle design and performance.",
//     logo: "https://upload.wikimedia.org/wikipedia/commons/e/e8/Tesla_logo.png",
//     thumbnail: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?q=80&w=2071&auto=format&fit=crop",
//     videoUrl: "M7FIvfx5J10",
//     brandColor: "#E31937",
//     aspectRatio: "video",
//   }
];
