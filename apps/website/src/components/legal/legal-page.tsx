import type * as React from "react";
import { Footer, Header } from "@/components/landing";

export const LEGAL = {
  entity: "Tradstry",
  operator: "an independent sole trader",
  contact: "johnsonnifemi11@gmail.com",
  updated: "28 August 2026",
} as const;

export function Blank({ children }: { children: string }) {
  if (!children.startsWith("TODO")) return <>{children}</>;
  return (
    <span className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.85em] text-zinc-600">
      {children}
    </span>
  );
}

export function Contact() {
  return <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>;
}

export type LegalSection = {
  id: string;
  heading: string;
  body: React.ReactNode;
};

export function LegalPage({
  title,
  summary,
  sections,
}: {
  title: string;
  summary: string;
  sections: LegalSection[];
}) {
  return (
    <div
      data-shell="marketing"
      className="min-h-svh bg-white text-zinc-950 antialiased"
    >
      <Header />

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-32 md:pb-24 md:pt-36">
        <header className="max-w-2xl">
          <p className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <span aria-hidden="true" className="h-px w-6 bg-zinc-300" />
            Legal
          </p>
          <h1 className="mt-3 text-balance text-4xl font-semibold tracking-[-0.02em] text-zinc-950 md:text-5xl">
            {title}
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-zinc-600">
            {summary}
          </p>
          <p className="mt-6 font-mono text-xs text-zinc-400">
            Last updated {LEGAL.updated}
          </p>
        </header>

        <div className="mt-16 grid gap-12 md:grid-cols-[16rem_1fr] md:gap-16">
          <nav
            aria-label="Contents"
            className="md:sticky md:top-24 md:self-start"
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">
              Contents
            </p>
            <ol className="mt-4 space-y-2.5">
              {sections.map((section, index) => (
                <li key={section.id} className="flex gap-3">
                  <span className="font-mono text-xs text-zinc-400 tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <a
                    href={`#${section.id}`}
                    className="text-sm leading-snug text-zinc-600 transition-colors hover:text-zinc-950"
                  >
                    {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="max-w-[68ch] space-y-12">
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24"
              >
                <h2 className="flex items-baseline gap-3 text-xl font-semibold tracking-[-0.01em] text-zinc-950">
                  <span className="font-mono text-sm text-zinc-400 tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {section.heading}
                </h2>
                <div className="mt-4 space-y-4 text-[15px] leading-[1.75] text-zinc-600 [&_a]:text-zinc-950 [&_a]:underline [&_a]:underline-offset-4 [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-zinc-900 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                  {section.body}
                </div>
              </section>
            ))}
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
}
