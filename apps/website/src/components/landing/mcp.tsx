"use client";

import { motion } from "motion/react";
import { EASE_OUT, Reveal } from "./motion";
import { InteractiveSceneFrame } from "./threeui-scene";

const CONFIG = `{
  "mcpServers": {
    "tradstry": {
      "url": "https://mcp.tradstry.com/mcp"
    }
  }
}`;

const TOOLS = [
  ["search_trades", "42 matching trades"],
  ["get_playbook_performance", "Breakout continuation"],
  ["calculate_rule_break_cost", "-$2,840 observed loss"],
];

export function Mcp() {
  return (
    <section
      id="mcp"
      className="scroll-mt-16 border-b border-zinc-200 px-5 py-24 sm:px-8 md:py-32"
    >
      <div className="mx-auto max-w-[68rem]">
        <Reveal className="mb-8 grid gap-5 border-b border-zinc-200 pb-6 md:grid-cols-[0.72fr_1.28fr] md:gap-12">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
              06 · MCP
            </p>
            <h2 className="mt-3 max-w-md text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.04em] text-zinc-950 md:text-4xl">
              Take your trading record into the AI tools you already use.
            </h2>
          </div>
          <p className="max-w-2xl text-[16px] leading-7 text-zinc-600 md:pt-6">
            MCP is a standard way for AI software to call outside tools.
            Tradstry exposes your journal, analytics, playbooks, and notebook
            through 27 authenticated tools while keeping your record under your
            control.
          </p>
        </Reveal>

        <InteractiveSceneFrame scene="mcp">
          <div className="grid min-h-[34rem] overflow-hidden rounded-2xl border border-zinc-200 bg-[#f4f4f2] shadow-[0_24px_70px_rgba(24,24,27,0.08)] md:grid-cols-[0.82fr_1.18fr]">
            <div className="relative z-20 min-w-0 border-b border-zinc-200 bg-white/72 p-6 backdrop-blur-[2px] sm:p-10 md:border-b-0 md:border-r">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-profit" />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Tradstry MCP connected
                </span>
              </div>
              <pre className="mt-8 overflow-x-auto rounded-xl border border-zinc-200 bg-white p-5 font-mono text-xs leading-6 text-zinc-600">
                <code>{CONFIG}</code>
              </pre>
              <p className="mt-6 text-sm leading-6 text-zinc-500">
                Connect once. Your compatible AI client can then use Tradstry's
                authenticated tools without copied spreadsheets or pasted
                trades.
              </p>
            </div>

            <div className="relative z-20 min-w-0 bg-white/58 p-6 backdrop-blur-[2px] sm:p-10">
              <motion.p
                whileHover={{ transform: "translateY(-3px) scale(1.01)" }}
                transition={{ duration: 0.16, ease: EASE_OUT }}
                className="ml-auto max-w-sm rounded-2xl bg-zinc-950 px-5 py-4 text-sm leading-6 text-white shadow-[0_14px_35px_rgba(24,24,27,0.16)]"
              >
                Which setup has quietly cost me the most this quarter?
              </motion.p>
              <div className="mt-8 space-y-3">
                {TOOLS.map(([tool, result], index) => (
                  <motion.div
                    key={tool}
                    initial={{ opacity: 0.3, transform: "translateY(8px)" }}
                    whileInView={{ opacity: 1, transform: "translateY(0px)" }}
                    whileHover={{ transform: "translateY(-3px) scale(1.01)" }}
                    viewport={{ once: true, amount: 0.7 }}
                    transition={{
                      duration: 0.36,
                      delay: index * 0.12,
                      ease: EASE_OUT,
                    }}
                    className="rounded-xl border border-zinc-200 bg-white/90 p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[10px] text-[#c65f19]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <code className="font-mono text-[11px] text-zinc-800">
                        {tool}
                      </code>
                    </div>
                    <p className="mt-2 pl-7 font-mono text-[10px] text-zinc-400">
                      {result}
                    </p>
                  </motion.div>
                ))}
              </div>
              <p className="mt-6 max-w-lg text-sm leading-6 text-zinc-600">
                Your breakout continuation setup was profitable when the written
                entry rules were followed. Seven exceptions produced most of the
                observed drawdown.
              </p>
            </div>
          </div>
        </InteractiveSceneFrame>
      </div>
    </section>
  );
}
