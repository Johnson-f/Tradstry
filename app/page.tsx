import type { Metadata } from "next";
import {
  LandingNavbar,
  Hero,
  Features,
  CTA,
  Footer,
} from "@/components/landing";

// Force this page to be static - because of SEO
export const dynamic = 'force-static';
export const revalidate = 3600; // Revalidate every hour (optional)

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://tradstry.com";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "Tradstry - AI-Powered Trading Journal & Analytics Platform",
  description:
    "Track, analyze, and improve your trading performance with comprehensive journaling, real-time analytics, and AI-powered insights. Transform your trading journey with data-driven decisions.",
  keywords: [
    "trading journal",
    "trading analytics",
    "trade tracking",
    "trading platform",
    "stock trading",
    "trading performance",
    "AI trading insights",
    "trading journal software",
    "portfolio analytics",
    "trading education",
  ],
  authors: [{ name: "Tradstry" }],
  creator: "Tradstry",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: defaultUrl,
    title: "Tradstry - AI-Powered Trading Journal & Analytics Platform",
    description:
      "Track, analyze, and improve your trading performance with comprehensive journaling, real-time analytics, and AI-powered insights.",
    siteName: "Tradstry",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tradstry - AI-Powered Trading Journal & Analytics Platform",
    description:
      "Track, analyze, and improve your trading performance with comprehensive journaling, real-time analytics, and AI-powered insights.",
    creator: "@tradstry",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: defaultUrl,
  },
};

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-background via-background to-primary/5" />
      <div className="fixed inset-0 -z-10 bg-gradient-to-tr from-transparent via-purple-500/5 to-pink-500/5" />
      
      <LandingNavbar />
      <main className="flex-1 relative">
        <Hero />
        <div id="features">
          <Features />
        </div>
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
