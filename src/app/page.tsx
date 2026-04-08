import Link from "next/link";
import { FeaturedPost } from "@/components/featured-post";
import { PostCard } from "@/components/post-card";
import { getAllPosts } from "@/lib/posts";
import { websiteJsonLd } from "@/lib/jsonld";

export default function Home() {
  const posts = getAllPosts();
  const featured = posts[0];
  const rest = posts.slice(1, 6);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }}
      />

      <section className="mx-auto max-w-2xl px-6 pb-24 pt-32">
        <header className="animate-fade-in-up opacity-0">
          <h1 className="text-2xl font-semibold tracking-tight">
            Andrea Vitto
          </h1>
          <p className="mt-1 text-text-secondary">
            Building at the intersection of AI, SaaS &amp; automation.
          </p>
        </header>

        {featured && (
          <div className="mt-12">
            <FeaturedPost post={featured} />
          </div>
        )}

        {rest.length > 0 && (
          <div className="mt-12">
            {rest.map((post, i) => (
              <PostCard key={post.slug} post={post} index={i} />
            ))}
          </div>
        )}

        {posts.length > 6 && (
          <div className="mt-8">
            <Link
              href="/blog"
              className="text-sm font-medium text-accent transition-opacity duration-200 hover:opacity-80"
            >
              View all posts &rarr;
            </Link>
          </div>
        )}
      </section>
    </>
  );
}
