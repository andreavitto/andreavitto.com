"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import gsap from "gsap";
import { RippleClick } from "./ripple-click";
import type { Post } from "@/lib/posts";

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function FeaturedPost({ post }: { post: Post }) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!cardRef.current) return;

    gsap.fromTo(
      cardRef.current,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.8, ease: "power3.out", delay: 0.2 }
    );
  }, []);

  return (
    <div ref={cardRef} className="opacity-0">
      <RippleClick href={`/blog/${post.slug}`} className="rounded-2xl">
        <article className="group relative overflow-hidden rounded-2xl border border-text-primary/5 bg-bg-secondary/50 transition-colors duration-300 hover:border-text-primary/10">
          {post.cover && (
            <div className="aspect-[16/9] overflow-hidden">
              <Image
                src={post.cover}
                alt={post.title}
                width={1792}
                height={1024}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
              />
            </div>
          )}

          {!post.cover && (
            <div
              className="absolute left-0 top-0 h-[2px] w-full"
              style={{
                background:
                  "linear-gradient(to right, var(--blob-1), var(--blob-2), var(--blob-3))",
              }}
            />
          )}

          <div className="p-8 sm:p-10">
            <p className="text-sm text-text-secondary">
              {formatDate(post.date)} &middot; {post.readingTime}
            </p>

            <h3 className="mt-3 text-2xl font-semibold tracking-tight transition-colors duration-200 group-hover:text-text-primary sm:text-3xl">
              {post.title}
            </h3>

            {post.description && (
              <p className="mt-3 text-base leading-relaxed text-text-secondary sm:text-lg">
                {post.description}
              </p>
            )}

            <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-text-secondary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Read article &rarr;
            </span>
          </div>
        </article>
      </RippleClick>
    </div>
  );
}
