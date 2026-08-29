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
        "relative scroll-mt-20 border-t border-zinc-200 py-24 md:py-32",
        className,
      )}
    >
      <div className="mx-auto max-w-[68rem] px-5 sm:px-8">{children}</div>
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
        "flex items-center gap-3 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-[#c65f19]",
        className,
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-[#ff7a21]" />
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
        "mt-4 text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-zinc-950 md:text-[3.75rem]",
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
        "mt-5 max-w-xl text-[16px] leading-7 text-zinc-600",
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
        "pointer-events-none bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_23px,rgba(24,24,27,0.06)_23px,rgba(24,24,27,0.06)_24px)]",
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
        "overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100 shadow-[0_24px_70px_rgba(24,24,27,0.08)]",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-zinc-200 bg-white px-3 py-2.5">
        <span className="size-2 rounded-full bg-zinc-200" />
        <span className="size-2 rounded-full bg-zinc-200" />
        <span className="size-2 rounded-full bg-zinc-200" />
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
          <p className="relative font-mono text-xs text-zinc-500">{shot.alt}</p>
        </div>
      )}
    </figure>
  );
}

export function Pending({ children }: { children: string }) {
  if (children !== PLACEHOLDER) return <>{children}</>;
  return (
    <span className="rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.8em] text-zinc-600">
      TODO
    </span>
  );
}
