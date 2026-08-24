"use client";

import { cn } from "@tradstry/app-ui/lib/utils";
import { EXAMPLE } from "@/components/landing/content";
import { Reveal } from "@/components/landing/motion";
import {
  Eyebrow,
  Heading,
  Lede,
  Section,
} from "@/components/landing/primitives";

export function Proof() {
  return (
    <Section id="proof">
      <Reveal className="max-w-3xl">
        <Eyebrow>The evidence</Eyebrow>
        <Heading>The loss is not the lesson. The deviation is.</Heading>
        <Lede>
          Split the same trader and the same setups by one fact: whether the
          written plan was followed. Tradstry makes that comparison visible.
        </Lede>
      </Reveal>

      <Reveal className="mt-14 overflow-hidden rounded-3xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(255,255,255,0.035),rgba(255,255,255,0.01))] p-6 md:p-10">
        <div className="max-w-xl">
          <p className="text-balance text-xl font-medium tracking-[-0.01em] text-zinc-50">
            {EXAMPLE.lede}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-zinc-400">
            {EXAMPLE.body}
          </p>
        </div>

        <div className="mt-9 grid gap-4 sm:grid-cols-2">
          {EXAMPLE.columns.map((column) => (
            <div
              key={column.title}
              className="rounded-2xl border border-white/[0.08] bg-[#0c0e10] p-6"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-zinc-200">
                  {column.title}
                </p>
                <p className="font-mono text-xs text-zinc-600 tabular-nums">
                  {column.count}
                </p>
              </div>
              <dl className="mt-4 grid gap-2.5 border-t border-white/[0.06] pt-4">
                {column.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between"
                  >
                    <dt className="text-xs text-zinc-500">{row.label}</dt>
                    <dd
                      className={cn(
                        "font-mono text-sm tabular-nums",
                        column.tone === "profit" ? "text-profit" : "text-loss",
                      )}
                    >
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>

        <p className="mt-5 max-w-2xl text-xs leading-relaxed text-zinc-600">
          {EXAMPLE.footnote}
        </p>
      </Reveal>
    </Section>
  );
}
