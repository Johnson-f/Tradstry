"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { PRODUCT_STORIES } from "./content";
import { EASE_OUT, Reveal } from "./motion";
import { Shot } from "./primitives";
import { InteractiveSceneFrame } from "./threeui-scene";

type ShotData = { src: string | null; alt: string; ratio: string };

export function ProductStories() {
  return (
    <div className="relative">
      <span id="product" className="absolute top-0" />
      {PRODUCT_STORIES.map((story, index) => (
        <article
          key={story.id}
          id={story.id}
          className="scroll-mt-16 border-b border-zinc-200 px-5 py-24 sm:px-8 md:py-32"
        >
          <div className="mx-auto max-w-[68rem]">
            <Reveal className="mb-8 grid gap-5 border-b border-zinc-200 pb-6 md:grid-cols-[0.72fr_1.28fr] md:gap-12">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                  {String(index + 1).padStart(2, "0")} · {story.kicker}
                </p>
                <h2 className="mt-3 max-w-md text-balance text-3xl font-semibold leading-[1.05] tracking-[-0.04em] text-zinc-950 md:text-4xl">
                  {story.title}
                </h2>
              </div>
              <p className="max-w-2xl text-[16px] leading-7 text-zinc-600 md:pt-6">
                {story.body}
              </p>
            </Reveal>

            <InteractiveSceneFrame scene={story.id}>
              {story.visual === "screenshot" ? (
                <ProductGallery shots={[story.shot]} label={story.kicker} />
              ) : story.visual === "playbook" ? (
                <PlaybookVisual />
              ) : (
                <AiVisual />
              )}
            </InteractiveSceneFrame>
          </div>
        </article>
      ))}
    </div>
  );
}

function ProductGallery({
  shots,
  label,
}: {
  shots: ShotData[];
  label: string;
}) {
  const [selected, setSelected] = useState(0);
  const reducedMotion = useReducedMotion() === true;
  const shot = shots[selected] ?? shots[0];
  if (!shot) return null;

  return (
    <fieldset>
      <legend className="sr-only">{label} product gallery</legend>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={shot.src ?? shot.alt}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.1 : 0.18, ease: EASE_OUT }}
        >
          <Shot shot={shot} />
        </motion.div>
      </AnimatePresence>
      {shots.length > 1 ? (
        <div
          role="tablist"
          aria-label={`${label} slides`}
          className="mt-4 flex gap-2"
        >
          {shots.map((item, index) => (
            <button
              key={item.alt}
              type="button"
              role="tab"
              aria-selected={selected === index}
              aria-label={`Slide ${index + 1}`}
              onClick={() => setSelected(index)}
              className="flex size-9 items-center justify-center rounded-full border border-zinc-200 font-mono text-[10px] text-zinc-500 outline-none aria-selected:border-[#ff7a21] aria-selected:text-[#c65f19] focus-visible:ring-2 focus-visible:ring-[#ff7a21]/50"
            >
              {String(index + 1).padStart(2, "0")}
            </button>
          ))}
        </div>
      ) : null}
    </fieldset>
  );
}

function PlaybookVisual() {
  const rules = [
    "Price above the 20 EMA on the daily",
    "Volume at least 1.5× the 50-day average",
    "Stop below the pivot low, never below 1R",
  ];

  return (
    <div className="grid min-h-[28rem] overflow-hidden rounded-2xl border border-zinc-200 bg-[#f4f4f2] p-5 shadow-[0_24px_70px_rgba(24,24,27,0.08)] sm:p-10 md:aspect-[16/9] md:grid-cols-[1fr_0.8fr] md:gap-10">
      <div className="relative z-20 rounded-xl border border-zinc-200 bg-white/92 p-6 backdrop-blur-[2px] sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#c65f19]">
          Breakout continuation
        </p>
        <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-zinc-950">
          Entry checklist
        </h3>
        <ol className="mt-8 space-y-5">
          {rules.map((rule, index) => (
            <motion.li
              key={rule}
              initial={{ opacity: 0.35, transform: "translateX(-6px)" }}
              whileInView={{ opacity: 1, transform: "translateX(0px)" }}
              viewport={{ once: true, amount: 0.7 }}
              transition={{
                duration: 0.35,
                delay: index * 0.1,
                ease: EASE_OUT,
              }}
              className="flex gap-4 text-sm leading-6 text-zinc-700"
            >
              <span className="font-mono text-xs text-zinc-400">
                {String(index + 1).padStart(2, "0")}
              </span>
              {rule}
            </motion.li>
          ))}
        </ol>
      </div>
      <div className="relative z-20 mt-5 grid content-end gap-3 md:mt-0">
        <Metric label="Followed · 34 trades" value="+$4,180" tone="profit" />
        <Metric label="Broken · 7 trades" value="−$1,240" tone="loss" />
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Same setup. Different discipline. Tradstry shows the cost.
        </p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "profit" | "loss";
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <p className="text-xs text-zinc-500">{label}</p>
      <p
        className={`mt-2 font-mono text-2xl tabular-nums ${
          tone === "profit" ? "text-profit" : "text-loss"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function AiVisual() {
  const activity = [
    ["Trading performance", "Read 5 closed trades"],
    ["Playbook adherence", "Compared written rules"],
    ["Market context", "Checked the loss cluster"],
  ];

  return (
    <div className="grid min-h-[30rem] overflow-hidden rounded-2xl border border-zinc-200 bg-[#f4f4f2] p-5 shadow-[0_24px_70px_rgba(24,24,27,0.08)] sm:p-10 md:aspect-[16/9] md:grid-cols-[0.85fr_1.15fr] md:gap-8">
      <div className="relative z-20 flex flex-col justify-between rounded-xl border border-zinc-200 bg-white/92 p-6 backdrop-blur-[2px]">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
            Question
          </p>
          <p className="mt-4 text-xl font-medium leading-8 tracking-[-0.02em] text-zinc-950">
            What hurt my win rate over the last 30 days?
          </p>
        </div>
        <div className="mt-8 space-y-3">
          {activity.map(([label, result], index) => (
            <motion.div
              key={label}
              initial={{ opacity: 0.3, transform: "translateX(-8px)" }}
              whileInView={{ opacity: 1, transform: "translateX(0px)" }}
              whileHover={{ transform: "translateX(4px)" }}
              viewport={{ once: true, amount: 0.7 }}
              transition={{
                duration: 0.36,
                delay: index * 0.12,
                ease: EASE_OUT,
              }}
              className="flex gap-3 border-t border-zinc-100 pt-3"
            >
              <span className="font-mono text-[10px] text-[#c65f19]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-xs font-medium text-zinc-800">{label}</p>
                <p className="mt-1 text-xs text-zinc-400">{result}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="relative z-20 mt-5 rounded-xl border border-zinc-200 bg-white/92 p-6 backdrop-blur-[2px] md:mt-0 sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#c65f19]">
          Verified answer
        </p>
        <p className="mt-5 text-3xl font-semibold tracking-[-0.04em] text-zinc-950">
          Losses were concentrated in one symbol.
        </p>
        <ul className="mt-6 space-y-3 text-sm leading-6 text-zinc-600">
          <li>Four trades produced all gross losses in the period.</li>
          <li>The two largest losses occurred on the same day.</li>
          <li>No closed trade had predefined risk recorded.</li>
        </ul>
        <p className="mt-6 border-l-2 border-[#ff7a21] pl-4 text-xs leading-5 text-zinc-500">
          The record supports concentration and missing risk data. It does not
          prove whether entries or exits caused the losses.
        </p>
      </div>
    </div>
  );
}
