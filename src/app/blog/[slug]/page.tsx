import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getAllPosts, getPostBySlug } from "@/lib/posts";
import { ReadingProgress } from "@/components/reading-progress";
import { MdxContent } from "@/components/mdx-content";
import { blogPostingJsonLd, breadcrumbJsonLd } from "@/lib/jsonld";
import { notFound } from "next/navigation";

const BASE_URL = "https://andreavitto.com";

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

  const url = `${BASE_URL}/blog/${slug}`;

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical: url,
    },
    keywords: post.tags,
    openGraph: {
      title: post.title,
      description: post.description,
      url,
      type: "article",
      publishedTime: post.date,
      authors: ["Andrea Vitto"],
      tags: post.tags,
      images: [
        {
          url: post.cover || "/og-default.png",
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      creator: "@iamandreavitto",
      title: post.title,
      description: post.description,
      images: [post.cover || "/og-default.png"],
    },
  };
}

export default async function BlogPost({ params }: Props) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(blogPostingJsonLd(post)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbJsonLd([
              { name: "Home", url: BASE_URL },
              { name: "Blog", url: `${BASE_URL}/blog` },
              { name: post.title },
            ])
          ),
        }}
      />

      <ReadingProgress />

      <article className="mx-auto max-w-2xl px-6 pb-24 pt-32">
        <div
          className="animate-fade-in-up mb-10 h-0.5 w-16 rounded-full opacity-0"
          style={{
            background:
              "linear-gradient(to right, var(--blob-1), var(--blob-2), var(--blob-3))",
          }}
        />

        <nav className="animate-fade-in-up opacity-0">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            &larr; Back
          </Link>
        </nav>

        {post.cover && (
          <div className="animate-fade-in-up stagger-1 mt-8 overflow-hidden rounded-xl opacity-0">
            <Image
              src={post.cover}
              alt={post.title}
              width={1792}
              height={1024}
              className="w-full object-cover"
              priority
            />
          </div>
        )}

        <header className={post.cover ? "mt-6" : "mt-8"}>
          <h1 className="animate-fade-in-up stagger-1 text-3xl font-bold leading-tight tracking-tight opacity-0 sm:text-4xl">
            {post.title}
          </h1>

          <div className="animate-fade-in-up stagger-2 mt-4 flex flex-wrap items-center gap-x-2 text-sm text-text-secondary opacity-0">
            <time dateTime={post.date}>
              {new Date(post.date).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
            <span>&middot;</span>
            <span>{post.readingTime}</span>
          </div>

          {post.description && (
            <p className="animate-fade-in-up stagger-3 mt-4 text-lg leading-relaxed text-text-secondary opacity-0">
              {post.description}
            </p>
          )}

          {post.tags.length > 0 && (
            <div className="animate-fade-in-up stagger-3 mt-4 flex flex-wrap gap-2 opacity-0">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-text-primary/5 px-3 py-1 text-xs text-text-secondary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </header>

        <hr className="animate-fade-in-up stagger-4 my-10 border-text-primary/10 opacity-0" />

        <div className="animate-fade-in-up stagger-5 prose prose-lg max-w-none opacity-0">
          <MdxContent source={post.content} />
        </div>
      </article>
    </>
  );
}
