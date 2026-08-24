"use client";

import { motion, useReducedMotion } from "motion/react";
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
} from "@/components/landing/primitives";

const PROMPTS = [
  "Which setup has the best expectancy since April?",
  "Show me every trade where I moved my stop.",
  "What did my breakout playbook actually cost me?",
  "Write tomorrow's plan from my last ten losers.",
];

const CONFIG = `{
  "mcpServers": {
    "tradstry": {
      "url": "https://mcp.tradstry.com/mcp"
    }
  }
}`;

export function Mcp() {
  const reducedMotion = useReducedMotion() === true;
  const toolDelays = getEntranceDelays(3, 0.09, reducedMotion);

  return (
    <Section id="mcp" className="relative overflow-hidden bg-[#08090a]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-10rem] top-1/2 size-[36rem] -translate-y-1/2 rounded-full bg-[#35d49a]/[0.07] blur-[130px]"
      />

      <div className="relative grid items-center gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <Eyebrow>Model Context Protocol</Eyebrow>
          <Heading>Stop pasting trades into a chat box.</Heading>
          <Lede>
            Tradstry ships an MCP server. Point Claude at it once and your
            journal, playbooks, principles and analytics become things it can
            read and write — on the subscription you already have, with the
            model you already trust.
          </Lede>

          <pre className="mt-8 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 font-mono text-xs leading-relaxed text-zinc-400">
            <code>{CONFIG}</code>
          </pre>

          <ul className="mt-6 space-y-2.5">
            {PROMPTS.map((prompt) => (
              <li
                key={prompt}
                className="flex items-start gap-2.5 text-sm text-zinc-400"
              >
                <span className="mt-2 size-1 shrink-0 rounded-full bg-zinc-500" />
                <span className="italic">“{prompt}”</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal className="overflow-hidden rounded-3xl border border-white/[0.09] bg-[#0c0e10] shadow-[0_35px_100px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-[#35d49a] shadow-[0_0_14px_rgba(53,212,154,0.75)]" />
              <span className="font-mono text-[10px] tracking-[0.18em] text-zinc-500">
                TRADSTRY MCP · CONNECTED
              </span>
            </div>
            <span className="font-mono text-[9px] text-zinc-700">27 TOOLS</span>
          </div>
          <div className="space-y-4 p-5 sm:p-7">
            <motion.div
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{
                duration: reducedMotion ? 0.15 : 0.36,
                ease: EASE_OUT,
              }}
              className="ml-auto max-w-[82%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-3 text-sm leading-6 text-[#0a0b0d]"
            >
              Which setup has quietly cost me the most this quarter?
            </motion.div>
            {[
              ["search_trades", "42 matching trades"],
              ["get_playbook_performance", "Breakout continuation"],
              ["calculate_rule_break_cost", "-$2,840 avoidable loss"],
            ].map(([tool, result], index) => (
              <motion.div
                key={tool}
                initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.75 }}
                transition={{
                  duration: reducedMotion ? 0.15 : 0.36,
                  delay: toolDelays[index] + (reducedMotion ? 0 : 0.12),
                  ease: EASE_OUT,
                }}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-6 place-items-center rounded-full border border-[#35d49a]/20 bg-[#35d49a]/10 font-mono text-[9px] text-[#6ce7b5]">
                    0{index + 1}
                  </span>
                  <code className="font-mono text-[11px] text-zinc-300">
                    {tool}
                  </code>
                </div>
                <p className="mt-3 border-l border-white/10 pl-3 font-mono text-[10px] text-zinc-600">
                  {result}
                </p>
              </motion.div>
            ))}
            <motion.p
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{
                duration: reducedMotion ? 0.15 : 0.36,
                delay: reducedMotion ? 0 : 0.48,
                ease: EASE_OUT,
              }}
              className="max-w-[92%] text-sm leading-6 text-zinc-300"
            >
              Your breakout-continuation setup produced positive expectancy when
              the written entry rules were followed. Seven exceptions accounted
              for most of the drawdown.
            </motion.p>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
