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
        <Reveal className="relative max-w-3xl">
          <Eyebrow>Pricing</Eyebrow>
          <Heading>Start the record free. Upgrade the feedback loop.</Heading>
          <Lede>
            No trade-count traps. Free gives you a real journal; Pro adds the
            scale, analysis, and AI context for an active practice.
          </Lede>
        </Reveal>

        <fieldset className="relative mt-10 flex">
          <legend className="sr-only">Billing period</legend>
          <div className="inline-flex rounded-xl border border-zinc-200 bg-zinc-100 p-1">
            {(["monthly", "annual"] as const).map((option) => (
              <label
                key={option}
                className={cn(
                  "relative flex min-h-10 cursor-pointer items-center rounded-lg px-4 text-xs font-medium capitalize outline-none transition-colors has-focus-visible:ring-2 has-focus-visible:ring-[#ff7a21]/50",
                  cadence === option
                    ? "text-white"
                    : "text-zinc-500 hover:text-zinc-950",
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
                    className="absolute inset-0 rounded-lg bg-zinc-950"
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
                    SAVE 25%
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="relative mt-8 grid max-w-5xl gap-5 md:grid-cols-2">
          {PLANS.map((plan) => {
            const price =
              cadence === "annual" ? plan.annualPrice : plan.monthlyPrice;
            const billingNote =
              cadence === "annual"
                ? plan.annualBillingNote
                : plan.monthlyBillingNote;
            const isPro = plan.id === "pro";
            return (
              <Reveal
                key={plan.id}
                as="article"
                className={cn(
                  "relative overflow-hidden rounded-2xl border p-6 sm:p-8",
                  isPro
                    ? "border-[#ff7a21]/45 bg-[#fffaf6]"
                    : "border-zinc-200 bg-white",
                )}
              >
                {isPro ? (
                  <span className="absolute right-5 top-5 rounded-full border border-[#ff7a21]/30 bg-white px-2.5 py-1 font-mono text-[9px] tracking-[0.15em] text-[#c65f19]">
                    RECOMMENDED
                  </span>
                ) : null}
                <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-400">
                  {plan.name.toUpperCase()}
                </p>
                <p className="mt-6 flex items-end gap-2">
                  <span className="relative inline-grid overflow-hidden text-5xl font-semibold tracking-[-0.055em] text-zinc-950">
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
                  <span className="pb-1 text-sm text-zinc-400">/ month</span>
                </p>
                <p className="mt-3 min-h-12 text-sm leading-6 text-zinc-600">
                  {plan.description}
                </p>
                <p className="mt-2 min-h-10 text-xs leading-5 text-zinc-400">
                  {billingNote}
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
                      "mt-5 h-11 w-full rounded-xl active:scale-[0.97]",
                      isPro
                        ? "bg-zinc-950 text-white hover:bg-zinc-800"
                        : "border border-zinc-300 bg-white text-zinc-950 hover:bg-zinc-100",
                    )}
                  >
                    {plan.cta}
                  </Button>
                </SignUpButton>
                <ul className="mt-7 space-y-3 border-t border-zinc-200 pt-6">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        strokeWidth={2}
                        className={cn(
                          "mt-0.5 size-4 shrink-0",
                          isPro ? "text-[#c65f19]" : "text-zinc-400",
                        )}
                      />
                      <span className="text-sm leading-5 text-zinc-700">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            );
          })}
        </div>
        <p className="relative mt-6 max-w-3xl text-xs leading-5 text-zinc-500">
          Taxes are calculated at checkout where applicable. Tradstry is a
          retrospective journal and analytics product, not an investment
          adviser. It does not provide trading signals or personalized buy or
          sell recommendations. See our{" "}
          <a
            href="/terms"
            className="text-zinc-800 underline underline-offset-4"
          >
            Terms
          </a>
          ,{" "}
          <a
            href="/refund"
            className="text-zinc-800 underline underline-offset-4"
          >
            Refund Policy
          </a>
          , and{" "}
          <a
            href="/support"
            className="text-zinc-800 underline underline-offset-4"
          >
            Support
          </a>{" "}
          pages.
        </p>
      </Section>
    </div>
  );
}
