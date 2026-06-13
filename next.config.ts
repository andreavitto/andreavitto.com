import type { NextConfig } from "next";
import createMDX from "@next/mdx";

const nextConfig: NextConfig = {
  // Note: `output: "export"` was removed to enable API routes (/api/*) for the
  // internal email-automation tooling. The site pages remain statically
  // pre-rendered (SSG) via generateStaticParams + force-static.
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  images: {
    unoptimized: true,
  },
};

const withMDX = createMDX({});

export default withMDX(nextConfig);
