"use client";

import { motion, useReducedMotion } from "motion/react";
import { METRICS } from "./content";
import { EASE_OUT, getEntranceDelays } from "./motion";

export function SignalStrip() {
  const reducedMotion = useReducedMotion() === true;
  const delays = getEntranceDelays(METRICS.length, 0.055, reducedMotion);

  return (
    <section id="signal" className="relative z-10 px-6 pb-8">
      <div className="mx-auto grid max-w-7xl overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0b0c0e]/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl sm:grid-cols-2 lg:grid-cols-4">
        {METRICS.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{
              duration: reducedMotion ? 0.15 : 0.38,
              delay: delays[index],
              ease: EASE_OUT,
            }}
            className="border-white/[0.07] px-5 py-5 not-last:border-b sm:nth-[odd]:border-r sm:nth-[-n+2]:border-b lg:border-b-0 lg:not-last:border-r"
          >
            <div className="flex items-baseline justify-between gap-4">
              <p className="font-mono text-[9px] tracking-[0.2em] text-zinc-600">
                {metric.label.toUpperCase()}
              </p>
              <p className="font-mono text-lg text-zinc-100 tabular-nums">
                {metric.value}
              </p>
            </div>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              {metric.note}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
