"use client";

import { SignUpButton } from "@clerk/nextjs";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { motion } from "motion/react";
import { capture, EVENTS } from "@/lib/analytics/events";
import { EASE_OUT } from "./motion";
import { TradingOrbit } from "./trading-orbit";

export function Hero() {
  return (
    <section
      id="top"
      className="relative min-h-svh overflow-hidden px-6 pb-20 pt-32 sm:pt-36 lg:grid lg:place-items-center lg:py-32"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(ellipse_at_top,rgba(255,139,61,0.08),transparent_64%)]"
      />

      <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-4">
        <div className="relative z-10 max-w-2xl">
          <motion.a
            href="#mcp"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#ff8b3d]/20 bg-[#ff8b3d]/[0.06] px-3 font-mono text-[10px] tracking-[0.08em] text-[#ffb47a] outline-none hover:border-[#ff8b3d]/40 focus-visible:ring-2 focus-visible:ring-[#ff8b3d]/60"
          >
            <span className="size-1.5 rounded-full bg-[#ff8b3d] shadow-[0_0_12px_#ff8b3d]" />
            YOUR JOURNAL · NOW AVAILABLE OVER MCP
          </motion.a>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.08, ease: EASE_OUT }}
            className="mt-7 text-balance text-[clamp(3rem,7vw,6.7rem)] font-semibold leading-[0.91] tracking-[-0.065em] text-white"
          >
            Your trading record should talk back.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.22, ease: EASE_OUT }}
            className="mt-7 max-w-xl text-pretty text-[17px] leading-7 text-zinc-400 sm:text-lg"
          >
            Tradstry turns your broker activity, trading rules, and journal into
            one clear record that you and your AI can analyze.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.34, ease: EASE_OUT }}
            className="mt-9 flex flex-col gap-3 sm:flex-row"
          >
            <SignUpButton>
              <Button
                size="lg"
                onClick={() =>
                  capture(EVENTS.ctaClicked, {
                    location: "hero",
                    label: "Start free",
                  })
                }
                className="h-12 rounded-xl bg-zinc-50 px-7 text-[15px] font-semibold text-[#070809] shadow-[0_0_40px_rgba(255,255,255,0.12)] hover:bg-white active:scale-[0.98]"
              >
                Start free
              </Button>
            </SignUpButton>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-xl border-white/10 bg-white/[0.035] px-7 text-[15px] text-zinc-300 backdrop-blur-md hover:bg-white/[0.07] hover:text-white"
            >
              <a href="#product">See the record</a>
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.48 }}
            className="mt-10 flex flex-wrap gap-x-7 gap-y-3 font-mono text-[10px] tracking-[0.11em] text-zinc-600"
          >
            <span>35+ BROKERAGES</span>
            <span>27 MCP TOOLS</span>
            <span>0% USED FOR TRAINING</span>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.16, ease: EASE_OUT }}
          className="relative -mx-8 lg:-mr-24"
        >
          <TradingOrbit />
        </motion.div>
      </div>
    </section>
  );
}
