import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getAllBlogPosts } from "@/lib/blog-server";
import BlogGrid from "@/components/BlogGrid";

export default async function BlogPage() {
  const blogPosts = await getAllBlogPosts();

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#0a0a0a] relative overflow-hidden">
        {/* Premium background texture */}
        <div className="absolute inset-0 opacity-[0.02]">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)`,
            backgroundSize: '24px 24px'
          }}></div>
        </div>
        
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#111111] to-[#0a0a0a] opacity-90"></div>
        
        <div className="relative z-10 container mx-auto px-4 py-20 mt-16">
          <div className="text-center mb-20">
            <h1 className="font-serif text-6xl md:text-7xl font-light text-white mb-8 tracking-tight">
              Insights
            </h1>
            <div className="w-24 h-[1px] bg-gradient-to-r from-transparent via-white to-transparent mx-auto mb-8 opacity-30"></div>
            <p className="font-serif text-xl text-gray-300 max-w-2xl mx-auto leading-relaxed font-light">
              Thoughtful perspectives on the evolving landscape of digital creation, 
              innovation, and the future of creative commerce.
            </p>
          </div>
          <BlogGrid posts={blogPosts} />
        </div>
      </div>
      <Footer />
    </>
  );
}
