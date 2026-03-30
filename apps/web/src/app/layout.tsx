import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Pocket Codex",
  description: "Web-first remote client for your local Codex runtime.",
  applicationName: "Pocket Codex",
  icons: {
    icon: "/pocketcodex-mark.svg",
    shortcut: "/pocketcodex-mark.svg",
    apple: "/pocketcodex-mark.svg",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
