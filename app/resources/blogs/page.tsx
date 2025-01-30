import Navbar from "@/components/Navbar";
import BlogCard from "@/components/BlogCard";
import Footer from "@/components/Footer";

export default function BlogPage() {
  return (
    <>
      <Navbar />
      <div className="mt-12">
        <BlogCard />
      </div>
      <Footer />
    </>
  );
}
