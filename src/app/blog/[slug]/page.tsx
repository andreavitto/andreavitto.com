import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts, getPostBySlug } from "@/lib/posts";
import { ReadingProgress } from "@/components/reading-progress";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: "article",
      publishedTime: post.date,
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const { default: Content } = await import(`@/content/blog/${slug}.mdx`);

  return (
    <>
      <ReadingProgress />

      <article className="mx-auto max-w-2xl px-6 pb-24 pt-32">
        {/* Gradient accent line */}
        <div
          className="animate-fade-in-up mb-10 h-[2px] w-16 rounded-full opacity-0"
          style={{
            background:
              "linear-gradient(to right, var(--blob-1), var(--blob-2), var(--blob-3))",
          }}
        />

        <Link
          href="/blog"
          className="animate-fade-in-up inline-flex items-center gap-1 text-sm text-text-secondary opacity-0 transition-colors hover:text-text-primary"
        >
          &larr; Back
        </Link>

        <header className="mt-8">
          <h1 className="animate-fade-in-up stagger-1 text-3xl font-bold leading-tight tracking-tight opacity-0 sm:text-4xl">
            {post.title}
          </h1>
          <p className="animate-fade-in-up stagger-2 mt-4 text-sm text-text-secondary opacity-0">
            {new Date(post.date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}{" "}
            &middot; {post.readingTime}
          </p>
          {post.description && (
            <p className="animate-fade-in-up stagger-3 mt-4 text-lg text-text-secondary opacity-0">
              {post.description}
            </p>
          )}
        </header>

        <hr className="animate-fade-in-up stagger-4 my-10 border-text-primary/10 opacity-0" />

        <div className="animate-fade-in-up stagger-5 prose prose-lg max-w-none opacity-0">
          <Content />
        </div>
      </article>
    </>
  );
}
