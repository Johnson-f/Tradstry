import type { Metadata } from "next";
import {
  Cta,
  Faq,
  Footer,
  Header,
  Hero,
  Mcp,
  Pillars,
  Pricing,
  Proof,
  SignalStrip,
} from "@/components/landing";
import { LeakProvider, LeakSection } from "@/components/landing/leak";
import { StructuredData } from "@/components/landing/structured-data";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div
      data-shell="marketing"
      className="dark min-h-svh bg-[#070809] antialiased"
    >
      <StructuredData />
      <Header />
      <LeakProvider>
        <main>
          <Hero />
          <SignalStrip />
          <LeakSection />
          <Pillars />
          <Mcp />
          <Proof />
          <Pricing />
          <Faq />
          <Cta />
        </main>
      </LeakProvider>
      <Footer />
    </div>
  );
}
