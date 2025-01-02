import { notFound } from "next/navigation";
import Image from "next/image";
import { blogPosts } from "@/components/data/blog-data";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function BlogPost({ params }: { params: { id: string } }) {
  const post = blogPosts.find((post) => post.id === params.id);

  if (!post) {
    notFound();
  }

  return (
    <article className="container mx-auto px-4 py-8 max-w-4xl">
      <Link href="/resources/blog">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to all posts
        </Button>
      </Link>
      <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
      <div className="flex items-center mb-6">
        <Image
          src={post.author.avatar}
          alt={post.author.name}
          width={50}
          height={50}
          className="rounded-full mr-4"
        />
        <div>
          <p className="font-semibold">{post.author.name}</p>
          <p className="text-muted-foreground text-sm">{post.date}</p>
        </div>
      </div>
      <div className="relative h-[400px] w-full mb-8">
        <Image
          src={post.imageUrl}
          alt={post.title}
          layout="fill"
          objectFit="cover"
          className="rounded-lg"
        />
      </div>
      <div className="prose prose-lg dark:prose-invert max-w-none mb-8">
        <p>{post.content}</p>
      </div>
      <Separator className="my-8" />
      <div className="flex flex-wrap gap-2 mb-8">
        <Badge variant="secondary">{post.category}</Badge>
        {post.tags.map((tag) => (
          <Badge key={tag} variant="outline">
            {tag}
          </Badge>
        ))}
      </div>
    </article>
  );
}
