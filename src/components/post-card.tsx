import Link from "next/link";
import type { Post } from "@/lib/posts";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function PostCard({ post, index }: { post: Post; index: number }) {
  const delay = Math.min(index + 1, 6);

  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <article
        className={`animate-fade-in-up stagger-${delay} border-b border-text-primary/5 py-6 opacity-0 transition-colors duration-200`}
      >
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h3 className="text-base font-medium tracking-tight transition-colors duration-200 group-hover:text-accent sm:text-lg">
            {post.title}
          </h3>
          <p className="shrink-0 text-sm text-text-secondary">
            {formatDate(post.date)}
          </p>
        </div>

        {post.description && (
          <p className="mt-2 text-sm leading-relaxed text-text-secondary line-clamp-2">
            {post.description}
          </p>
        )}
      </article>
    </Link>
  );
}
