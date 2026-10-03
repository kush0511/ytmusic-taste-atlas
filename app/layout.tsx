import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";

const displayFont = localFont({
  src: "./fonts/Anton.ttf",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kushal’s Taste Atlas",
  description:
    "A personal music journal. Explore 1,111 liked songs, your evolving taste, listening rhythms, and replay obsessions.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={displayFont.variable}>
      <body>{children}</body>
    </html>
  );
}
