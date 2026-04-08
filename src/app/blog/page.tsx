import type { Metadata } from "next";
import { PostCard } from "@/components/post-card";
import { getAllPosts } from "@/lib/posts";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Articles about AI, SaaS, automation, and building digital products.",
  alternates: {
    canonical: "https://andreavitto.com/blog",
  },
};

export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <section className="mx-auto max-w-2xl px-6 pb-24 pt-32">
      <h1 className="animate-fade-in-up text-3xl font-bold tracking-tight opacity-0">
        Blog
      </h1>
      <p className="animate-fade-in-up stagger-1 mt-2 text-text-secondary opacity-0">
        All articles, newest first.
      </p>

      {posts.length > 0 ? (
        <div className="mt-10">
          {posts.map((post, i) => (
            <PostCard key={post.slug} post={post} index={i} />
          ))}
        </div>
      ) : (
        <p className="mt-10 text-text-secondary">
          No posts yet. Check back soon.
        </p>
      )}
    </section>
  );
}
