import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "MoatRadar — Competitive Market Intelligence for Product Managers",
  description:
    "Open-source multi-agent competitive intelligence workbench with Critic verification, human-in-the-loop review, and snapshot diffing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#080c14] text-slate-100 font-sans selection:bg-teal-500/30 selection:text-teal-100 print:bg-white print:text-slate-900">
        {children}
      </body>
    </html>
  );
}
