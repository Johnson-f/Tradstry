"use client";

import {
  AnalyticsUpIcon,
  BookOpen01Icon,
  File01Icon,
  Notebook01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion, useReducedMotion } from "motion/react";
import type * as React from "react";
import { EquityCard, PlaybookCard } from "@/components/landing/cards";
import { SCREENSHOTS } from "@/components/landing/content";
import {
  EASE_OUT,
  getEntranceDelays,
  Reveal,
} from "@/components/landing/motion";
import {
  Eyebrow,
  Heading,
  Lede,
  Section,
  Shot,
} from "@/components/landing/primitives";

const PILLARS = [
  {
    icon: File01Icon,
    kicker: "Journal",
    title: "Every fill, already there.",
    body: "Connect a brokerage and Tradstry pulls your executions, matches them into round trips, and works out P&L, R-multiple and holding time before you open the app. Tag the setup, write the note, attach the chart.",
    visual: <Shot shot={SCREENSHOTS.journal} />,
  },
  {
    icon: AnalyticsUpIcon,
    kicker: "Analytics",
    title: "The number, and the reason.",
    body: "Tradstry computes expectancy in dollars and in R, alongside SQN, recovery factor and max drawdown against real account equity. Every measure breaks out by symbol, session, day of week and playbook — so an edge stops being a feeling.",
    visual: <EquityCard />,
  },
  {
    icon: BookOpen01Icon,
    kicker: "Playbook",
    title: "The rules you wrote, enforced.",
    body: "A Tradstry playbook is a setup written as numbered steps, with the principles you refuse to break attached to it. Every trade gets checked against those rules, and the ones that broke a rule get a dollar figure next to them.",
    visual: <PlaybookCard />,
  },
  {
    icon: Notebook01Icon,
    kicker: "Notebook",
    title: "Thinking, not filing.",
    body: "The Tradstry notebook is a real editor — images, code, slash commands, and an autocomplete that has read your journal and finishes the sentence you were already writing. It links a note to the trade it explains so the two stay together.",
    visual: <Shot shot={SCREENSHOTS.notebook} />,
  },
] satisfies Array<{
  icon: typeof File01Icon;
  kicker: string;
  title: string;
  body: string;
  visual: React.ReactNode;
}>;

export function Pillars() {
  const reducedMotion = useReducedMotion() === true;
  const flowDelays = getEntranceDelays(PILLARS.length, 0.12, reducedMotion);

  return (
    <Section id="product" className="overflow-hidden bg-white/[0.008]">
      <Reveal className="max-w-3xl">
        <Eyebrow>The product</Eyebrow>
        <Heading>One record. Four ways to read it.</Heading>
        <Lede>
          A fill enters once. The journal adds intent, the playbook checks the
          rules, analytics prices the outcome, and your notebook keeps the
          lesson attached.
        </Lede>
      </Reveal>

      <div className="mt-12 flex flex-wrap items-center gap-2 font-mono text-[9px] tracking-[0.16em] text-zinc-500">
        {PILLARS.map((pillar, index) => (
          <div key={pillar.kicker} className="flex items-center gap-2">
            <motion.span
              initial={
                reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }
              }
              whileInView={{
                opacity: 1,
                scale: 1,
                borderColor: "rgba(255,139,61,0.22)",
                color: "rgb(212,212,216)",
              }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{
                duration: reducedMotion ? 0.15 : 0.38,
                delay: flowDelays[index],
                ease: EASE_OUT,
              }}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2"
            >
              {pillar.kicker.toUpperCase()}
            </motion.span>
            {index < PILLARS.length - 1 ? (
              <span className="relative h-px w-5 overflow-hidden bg-white/[0.08]">
                <motion.span
                  className="absolute inset-0 origin-left bg-[#ff8b3d] shadow-[0_0_8px_rgba(255,139,61,0.8)]"
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{
                    duration: reducedMotion ? 0.15 : 0.45,
                    delay: flowDelays[index] + (reducedMotion ? 0 : 0.08),
                    ease: EASE_OUT,
                  }}
                />
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <div className="relative mt-10 overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0b0c0e]">
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-1/2 top-0 hidden w-px bg-white/[0.06] md:block"
        />
        {PILLARS.map((pillar, index) => (
          <Reveal
            key={pillar.kicker}
            as="article"
            className="relative grid items-center gap-8 border-b border-white/[0.07] p-6 last:border-b-0 md:grid-cols-2 md:p-10 lg:p-14"
          >
            <div className={index % 2 === 1 ? "md:order-2" : undefined}>
              <div className="flex items-center gap-2.5">
                <span className="flex size-10 items-center justify-center rounded-xl border border-[#ff8b3d]/20 bg-[#ff8b3d]/[0.07] text-[#ff9a52]">
                  <HugeiconsIcon
                    icon={pillar.icon}
                    strokeWidth={2}
                    className="size-[18px]"
                  />
                </span>
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-zinc-500">
                  0{index + 1} · {pillar.kicker}
                </span>
              </div>
              <h3 className="mt-6 text-balance text-3xl font-semibold tracking-[-0.04em] text-zinc-50">
                {pillar.title}
              </h3>
              <p className="mt-4 max-w-lg text-[15px] leading-7 text-zinc-400">
                {pillar.body}
              </p>
            </div>

            <div className={index % 2 === 1 ? "md:order-1" : undefined}>
              {pillar.visual}
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
