import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { ThemeProvider } from "@/components/theme-provider";
import { AmbientBlobs } from "@/components/ambient-blobs";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Andrea Vitto",
    template: "%s — Andrea Vitto",
  },
  description:
    "Building things at the intersection of AI, SaaS & automation.",
  metadataBase: new URL("https://andreavitto.com"),
  openGraph: {
    title: "Andrea Vitto",
    description:
      "Building things at the intersection of AI, SaaS & automation.",
    url: "https://andreavitto.com",
    siteName: "Andrea Vitto",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Andrea Vitto",
    description:
      "Building things at the intersection of AI, SaaS & automation.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg-primary text-text-primary font-sans">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <AmbientBlobs />
          <Header />
          <main className="relative z-10 flex-1">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
