import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_URL || "https://psychometric-5qft.onrender.com"),
  title: "Psychometric AI — Understand your strengths. Explore what comes next.",
  description:
    "A structured assessment of aptitude, interests and work style to help Grade 10 students explore educational directions with greater clarity.",
  keywords: ["psychometric assessment", "grade 10 career guidance", "stream selection", "CBSE guidance", "aptitude test"],
  authors: [{ name: "Psychometric AI" }],
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "Psychometric AI — Understand your strengths. Explore what comes next.",
    description: "Structured educational guidance for Grade 10 students exploring post-secondary academic streams.",
    url: "https://psychometric-5qft.onrender.com",
    siteName: "Psychometric AI",
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Psychometric AI — Grade 10 Educational Guidance",
    description: "Structured assessment of aptitude, interests and work style for Grade 10 stream exploration.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f6f2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${jakarta.variable} ${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
