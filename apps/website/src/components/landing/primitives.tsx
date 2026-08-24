"use client";

import { cn } from "@tradstry/app-ui/lib/utils";
import type * as React from "react";
import { PLACEHOLDER } from "@/components/landing/content";

export function Section({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative border-t border-white/[0.055] py-24 md:py-36",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-6">{children}</div>
    </section>
  );
}

export function Eyebrow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.22em] text-[#ff9a52]",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full bg-[#ff8b3d] shadow-[0_0_12px_rgba(255,139,61,0.75)]"
      />
      {children}
    </p>
  );
}

export function Heading({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "mt-4 text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-zinc-50 md:text-[3.75rem]",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function Lede({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "mt-5 max-w-xl text-[16px] leading-7 text-zinc-400",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Ruled paper, straight off the mark — the one motif the whole page is built on. */
export function Ruled({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_23px,rgba(255,255,255,0.05)_23px,rgba(255,255,255,0.05)_24px)]",
        className,
      )}
    />
  );
}

export function Shot({
  shot,
  className,
}: {
  shot: { src: string | null; alt: string; ratio: string };
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-2xl border border-white/10 bg-[#111316] shadow-[0_30px_90px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-2.5">
        <span className="size-2 rounded-full bg-white/10" />
        <span className="size-2 rounded-full bg-white/10" />
        <span className="size-2 rounded-full bg-white/10" />
      </div>
      {shot.src ? (
        // biome-ignore lint/performance/noImgElement: static marketing asset, no layout shift risk at a fixed ratio
        <img
          src={shot.src}
          alt={shot.alt}
          style={{ aspectRatio: shot.ratio }}
          className="w-full object-cover"
        />
      ) : (
        <div
          style={{ aspectRatio: shot.ratio }}
          className="relative grid w-full place-items-center"
        >
          <Ruled className="absolute inset-0" />
          <p className="relative font-mono text-xs text-zinc-600">{shot.alt}</p>
        </div>
      )}
    </figure>
  );
}

export function Pending({ children }: { children: string }) {
  if (children !== PLACEHOLDER) return <>{children}</>;
  return (
    <span className="rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.8em] text-zinc-400">
      TODO
    </span>
  );
}
