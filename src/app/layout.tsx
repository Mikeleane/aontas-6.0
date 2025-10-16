import "@/polyfills/repeat-safe"
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Aontas 6.0 — Builder",
  description: "Inclusive CEFR-aligned builder with LD adaptations",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


