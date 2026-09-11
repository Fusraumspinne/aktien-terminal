import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Marketdesk — Personal Terminal",
  description: "Ein fokussierter Arbeitsplatz für Aktienanalyse und Swing Trading.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
