"use client";

import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FAQS } from "@/components/landing/content";
import { Reveal } from "@/components/landing/motion";
import { Eyebrow, Heading, Section } from "@/components/landing/primitives";

export function Faq() {
  return (
    <Section id="faq">
      <div className="grid gap-12 md:grid-cols-[1fr_1.4fr]">
        <Reveal>
          <Eyebrow>FAQ</Eyebrow>
          <Heading className="md:text-4xl">
            Asked honestly. Answered the same way.
          </Heading>
        </Reveal>

        <Reveal className="divide-y divide-zinc-200 border-y border-zinc-200">
          {FAQS.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-[15px] font-medium text-zinc-800 outline-none hover:text-zinc-950 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff7a21]/50">
                {item.q}
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  strokeWidth={2}
                  className="size-4 shrink-0 text-zinc-400 transition-transform duration-150 ease-out group-open:rotate-45"
                />
              </summary>
              <p className="max-w-2xl pb-6 pr-10 text-sm leading-6 text-zinc-600">
                {item.a}
              </p>
            </details>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}
