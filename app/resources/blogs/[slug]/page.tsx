import { blogPosts } from "@/components/data/blog-data";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Metadata } from "next";

type tParams = Promise<{ slug: string[] }>;

export async function generateMetadata({
  params,
}: {
  params: tParams;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const blogId = resolvedParams.slug[0];
  const post = blogPosts.find((p) => p.id === blogId);

  if (!post) {
    return {
      title: "Post Not Found",
      description: "The requested blog post could not be found",
    };
  }

  return {
    title: post.title,
    description: post.content.substring(0, 160),
    openGraph: {
      title: post.title,
      description: post.content.substring(0, 160),
      images: [post.imageUrl || "/placeholder.svg"],
    },
  };
}

export default async function Page({ params }: { params: tParams }) {
  const resolvedParams = await params;
  const blogId = resolvedParams.slug[0];
  const post = blogPosts.find((p) => p.id === blogId);

  if (!post) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <article className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
        <div className="flex items-center mb-4">
          <Image
            src={post.author.avatar || "/placeholder.svg"}
            alt={post.author.name}
            width={40}
            height={40}
            className="rounded-full mr-2"
          />
          <span className="text-sm font-medium mr-4">{post.author.name}</span>
          <span className="text-sm text-gray-500">{post.date}</span>
        </div>
        <Badge variant="outline" className="mb-4">
          {post.category}
        </Badge>
        <Image
          src={post.imageUrl || "/placeholder.svg"}
          alt={post.title}
          width={800}
          height={400}
          className="w-full h-auto mb-6"
        />
        <div className="prose max-w-none">
          <p>{post.content}</p>
        </div>
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">Tags:</h2>
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </article>
    </div>
  );
}
