import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "About Andrea Vitto.",
};

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 pb-24 pt-32">
      <h1 className="animate-fade-in-up text-3xl font-bold tracking-tight opacity-0">
        About
      </h1>
      <div className="animate-fade-in-up stagger-1 mt-8 space-y-5 text-lg leading-relaxed text-text-secondary opacity-0">
        <p>
          I&apos;m Andrea Vitto. I build things at the intersection of AI, SaaS
          &amp; automation.
        </p>
        <p>
          This is my corner of the internet where I write about what I&apos;m
          learning, building, and thinking about.
        </p>
      </div>
    </section>
  );
}
