"use client";

import { SignUpButton } from "@clerk/nextjs";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { cn } from "@tradstry/app-ui/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { capture, EVENTS } from "@/lib/analytics/events";
import { PLANS } from "./content";
import { Reveal } from "./motion";
import { Eyebrow, Heading, Lede, Section } from "./primitives";

export function Pricing() {
  const [cadence, setCadence] = useState<"monthly" | "annual">("annual");
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const fired = useRef(false);
  const reducedMotion = useReducedMotion() === true;

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !fired.current) {
        fired.current = true;
        capture(EVENTS.pricingViewed, {});
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={sectionRef}>
      <Section id="pricing" className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-0 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-[#ff8b3d]/[0.055] blur-[130px]"
        />
        <Reveal className="relative mx-auto max-w-2xl text-center">
          <Eyebrow className="justify-center">Pricing</Eyebrow>
          <Heading>Start the record free. Upgrade the feedback loop.</Heading>
          <Lede className="mx-auto">
            No trade-count traps. Free gives you a real journal; Pro adds the
            scale, analysis, and AI context for an active practice.
          </Lede>
        </Reveal>

        <fieldset className="relative mt-10 flex justify-center">
          <legend className="sr-only">Billing period</legend>
          <div className="inline-flex rounded-xl border border-white/[0.09] bg-white/[0.025] p-1">
            {(["monthly", "annual"] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  "relative flex min-h-10 cursor-pointer items-center rounded-lg px-4 text-xs font-medium capitalize outline-none transition-colors has-focus-visible:ring-2 has-focus-visible:ring-white/60",
                  cadence === option
                    ? "text-[#070809]"
                    : "text-zinc-400 hover:text-white",
                )}
              >
                <input
                  type="radio"
                  name="billing-period"
                  value={option}
                  checked={cadence === option}
                  onChange={() => setCadence(option)}
                  className="sr-only"
                />
                {cadence === option ? (
                  <motion.span
                    layoutId="pricing-cadence-highlight"
                    className="absolute inset-0 rounded-lg bg-zinc-100"
                    transition={
                      reducedMotion
                        ? { duration: 0.12 }
                        : { type: "spring", duration: 0.22, bounce: 0.08 }
                    }
                  />
                ) : null}
                <span className="relative">{option}</span>
                {option === "annual" ? (
                  <span className="relative ml-2 font-mono text-[9px] opacity-65">
                    SAVE $60
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="relative mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-2">
          {PLANS.map((plan) => {
            const price =
              cadence === "annual" ? plan.annualPrice : plan.monthlyPrice;
            const isPro = plan.id === "pro";
            return (
              <Reveal
                key={plan.id}
                as="article"
                className={cn(
                  "relative overflow-hidden rounded-2xl border p-7",
                  isPro
                    ? "border-[#ff8b3d]/30 bg-[linear-gradient(145deg,rgba(255,139,61,0.09),rgba(255,255,255,0.025)_45%)]"
                    : "border-white/[0.09] bg-white/[0.02]",
                )}
              >
                {isPro ? (
                  <span className="absolute right-5 top-5 rounded-full border border-[#ff8b3d]/25 bg-[#ff8b3d]/10 px-2.5 py-1 font-mono text-[9px] tracking-[0.15em] text-[#ffb47a]">
                    COMPLETE LOOP
                  </span>
                ) : null}
                <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-500">
                  {plan.name.toUpperCase()}
                </p>
                <p className="mt-6 flex items-end gap-2">
                  <span className="relative inline-grid overflow-hidden text-5xl font-semibold tracking-[-0.055em] text-white">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={`${plan.id}-${cadence}`}
                        initial={
                          reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8 }
                        }
                        animate={{ opacity: 1, y: 0 }}
                        exit={
                          reducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }
                        }
                        transition={{ duration: reducedMotion ? 0.1 : 0.18 }}
                      >
                        {price}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <span className="pb-1 text-sm text-zinc-500">/ month</span>
                </p>
                <p className="mt-3 min-h-12 text-sm leading-6 text-zinc-400">
                  {plan.description}
                </p>
                <SignUpButton>
                  <Button
                    onClick={() =>
                      capture(EVENTS.ctaClicked, {
                        location: "pricing",
                        label: plan.cta,
                      })
                    }
                    className={cn(
                      "mt-6 h-11 w-full rounded-xl",
                      isPro
                        ? "bg-zinc-50 text-[#070809] hover:bg-white"
                        : "border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]",
                    )}
                  >
                    {plan.cta}
                  </Button>
                </SignUpButton>
                <ul className="mt-7 space-y-3 border-t border-white/[0.07] pt-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2}
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          isPro ? "text-[#ff9a52]" : "text-zinc-500",
                        )}
                      />
                      <span className="text-sm leading-5 text-zinc-300">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            );
          })}
        </div>
      </Section>
    </div>
  );
}
