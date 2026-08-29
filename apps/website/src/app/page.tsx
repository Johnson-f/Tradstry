import type { Metadata } from "next";
import {
  Cta,
  Faq,
  Footer,
  Header,
  Hero,
  Mcp,
  Pricing,
  ProductStories,
} from "@/components/landing";
import { StructuredData } from "@/components/landing/structured-data";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div
      data-shell="marketing"
      className="min-h-svh bg-white text-zinc-950 antialiased"
    >
      <StructuredData />
      <Header />
      <main>
        <Hero />
        <ProductStories />
        <Mcp />
        <Pricing />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
