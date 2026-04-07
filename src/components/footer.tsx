export function Footer() {
  return (
    <footer className="relative z-10 border-t border-text-primary/5 py-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 px-6 text-sm text-text-secondary">
        <p>Andrea Vitto &middot; {new Date().getFullYear()}</p>
        <div className="flex gap-4">
          <a
            href="https://twitter.com/andreavitto"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-text-primary"
          >
            Twitter
          </a>
          <a
            href="https://github.com/andreavitto"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-text-primary"
          >
            GitHub
          </a>
          <a
            href="https://linkedin.com/in/andreavitto"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-text-primary"
          >
            LinkedIn
          </a>
        </div>
      </div>
    </footer>
  );
}
