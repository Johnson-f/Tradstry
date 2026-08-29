"use client";

import { SignUpButton } from "@clerk/nextjs";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { capture, EVENTS } from "@/lib/analytics/events";
import { HeroSignalField } from "./hero-signal-field";

const FACTS = ["35+ brokerages", "27 MCP tools", "0% used for training"];

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-svh items-center overflow-hidden border-b border-zinc-200 px-5 pb-20 pt-28 sm:px-8 lg:py-20"
    >
      <HeroSignalField />
      <div className="relative mx-auto w-full max-w-[68rem]">
        <div className="max-w-[62rem]">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#c65f19]">
            Your complete trading record
          </p>
          <h1 className="mt-6 max-w-[11ch] text-balance text-[clamp(4rem,10vw,8.5rem)] font-semibold leading-[0.88] tracking-[-0.07em] text-zinc-950">
            Your trading record should talk back.
          </h1>
          <p className="mt-8 max-w-2xl text-pretty text-[18px] leading-8 text-zinc-600">
            Tradstry connects broker activity, trading rules, journal context,
            and AI in one record you can review and question.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <SignUpButton>
              <Button
                size="lg"
                onClick={() =>
                  capture(EVENTS.ctaClicked, {
                    location: "hero",
                    label: "Start free",
                  })
                }
                className="h-12 rounded-xl bg-zinc-950 px-7 text-sm font-semibold text-white hover:bg-zinc-800 active:scale-[0.97]"
              >
                Start free
              </Button>
            </SignUpButton>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 rounded-xl border-zinc-300 bg-white px-7 text-sm text-zinc-800 hover:bg-zinc-100"
            >
              <a href="#journal">View product</a>
            </Button>
          </div>
          <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[9px] uppercase tracking-[0.13em] text-zinc-400">
            {FACTS.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
