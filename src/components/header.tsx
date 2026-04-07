"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  const pathname = usePathname();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-text-primary/5 bg-bg-primary/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-base font-semibold tracking-tight text-text-primary transition-colors hover:text-accent"
        >
          <Image
            src="/andreavittoprofile.jpg"
            alt="Andrea Vitto"
            width={28}
            height={28}
            className="rounded-full object-cover"
          />
          Andrea Vitto
        </Link>
        <div className="flex items-center gap-5">
          <Link
            href="/blog"
            className={`text-sm transition-colors hover:text-text-primary ${
              pathname?.startsWith("/blog")
                ? "text-text-primary font-medium"
                : "text-text-secondary"
            }`}
          >
            Blog
          </Link>
          <Link
            href="/about"
            className={`text-sm transition-colors hover:text-text-primary ${
              pathname === "/about"
                ? "text-text-primary font-medium"
                : "text-text-secondary"
            }`}
          >
            About
          </Link>
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
