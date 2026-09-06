import { Geist, Geist_Mono } from "next/font/google";

// Shared font instances. Previously initialized in the root layout; after the
// static-rendering refactor (step 131) the root layout is a bare pass-through and
// each zone layout ([lang], (service)) owns its own <html>/<body>, so the font CSS
// variables are imported from here to avoid re-declaring the loaders.
export const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});
export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

// Applied on <body> (was the root layout body className).
export const bodyFontClass = `${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden`;
