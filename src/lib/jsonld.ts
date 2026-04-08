import type { Post } from "./posts";

const BASE_URL = "https://andreavitto.com";

const AUTHOR = {
  "@type": "Person" as const,
  name: "Andrea Vitto",
  url: BASE_URL,
  sameAs: [
    "https://x.com/iamandreavitto",
    "https://github.com/andreavitto",
    "https://linkedin.com/in/andreavitto",
  ],
};

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Andrea Vitto",
    url: BASE_URL,
    description:
      "Building things at the intersection of AI, SaaS & automation.",
    author: AUTHOR,
  };
}

export function blogPostingJsonLd(post: Post) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    author: AUTHOR,
    publisher: AUTHOR,
    datePublished: post.date,
    url: `${BASE_URL}/blog/${post.slug}`,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}/blog/${post.slug}`,
    },
    ...(post.tags && post.tags.length > 0 && { keywords: post.tags.join(", ") }),
  };
}

export function breadcrumbJsonLd(
  items: { name: string; url?: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      ...(item.url && { item: item.url }),
    })),
  };
}

export function personJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Andrea Vitto",
    url: BASE_URL,
    jobTitle: "Founder & Builder",
    description:
      "Building things at the intersection of AI, SaaS & automation.",
    sameAs: AUTHOR.sameAs,
  };
}
