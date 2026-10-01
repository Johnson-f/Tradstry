"use client";

import { SignUpButton } from "@clerk/nextjs";
import { Button } from "@tradstry/app-ui/components/ui/button";
import { Reveal } from "./motion";

export function Cta() {
  return (
    <section className="border-t border-zinc-200 px-5 py-28 sm:px-8 md:py-36">
      <Reveal className="mx-auto max-w-[68rem]">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#c65f19]">
          Build the record
        </p>
        <div className="mt-6 grid items-end gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="max-w-4xl text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.05em] text-zinc-950 md:text-6xl">
              Plan the risk. Review the execution. Improve the process.
            </h2>
            <p className="mt-5 max-w-xl text-[16px] leading-7 text-zinc-600">
              One connected record for every plan, execution, and review.
            </p>
          </div>
          <SignUpButton>
            <Button
              size="lg"
              className="h-12 rounded-xl bg-zinc-950 px-8 text-sm font-semibold text-white hover:bg-zinc-800 active:scale-[0.97]"
            >
              Start free
            </Button>
          </SignUpButton>
        </div>
      </Reveal>
    </section>
  );
}
