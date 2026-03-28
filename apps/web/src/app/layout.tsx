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
      <body>{children}</body>
    </html>
  );
}
