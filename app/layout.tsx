import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kushal's Taste Cosmos",
  description: "A latent-space map of 1,111 liked tracks and 14,185 music watches.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
