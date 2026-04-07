import Link from "next/link";

export default function NotFound() {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center px-6">
      <h1 className="text-6xl font-bold tracking-tight">404</h1>
      <p className="mt-4 text-text-secondary">This page doesn&apos;t exist.</p>
      <Link
        href="/"
        className="mt-8 rounded-full border border-text-primary/10 px-6 py-3 text-sm font-medium transition-all duration-300 hover:border-text-primary/20 hover:bg-text-primary/5"
      >
        Go home
      </Link>
    </section>
  );
}
