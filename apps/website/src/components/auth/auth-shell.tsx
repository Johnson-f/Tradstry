import { TradstryMark } from "@tradstry/app-ui/components/logo";
import Link from "next/link";
import type * as React from "react";

const LEDGER = [
  {
    setup: "Breakout",
    context: "Continuation",
    trades: "34 followed",
    pl: "+$4,180",
    followed: true,
  },
  {
    setup: "Pullback",
    context: "Trend",
    trades: "21 followed",
    pl: "+$1,905",
    followed: true,
  },
  {
    setup: "Breakout",
    context: "Rules broken",
    trades: "7 broken",
    pl: "−$1,240",
    followed: false,
  },
];

export function AuthShell({
  title,
  subtitle,
  showTerms = true,
  children,
}: {
  title?: string;
  subtitle?: string;
  showTerms?: boolean;
  children: React.ReactNode;
}) {
  return (
    <main
      data-shell="marketing"
      className="min-h-svh bg-white text-zinc-950 antialiased scheme-light lg:grid lg:grid-cols-2"
    >
      <div className="flex min-h-svh min-w-0 flex-col px-6 sm:px-12 lg:px-14">
        <header className="py-7 sm:py-9">
          <Link
            href="/"
            aria-label="Tradstry home"
            className="inline-flex items-center gap-2.5 rounded-md text-lg font-semibold tracking-tight outline-none transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-4"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-zinc-950 text-white">
              <TradstryMark className="size-[22px]" />
            </span>
            Tradstry
          </Link>
        </header>

        <section
          aria-labelledby="auth-title"
          className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12 sm:py-16"
        >
          {title && (
            <div className="mb-8">
              <h1
                id="auth-title"
                className="text-balance text-[32px] font-semibold leading-[1.15] tracking-[-0.04em] sm:text-4xl"
              >
                {title}
              </h1>
              {subtitle && (
                <p className="mt-3 text-pretty text-[15px] leading-6 text-zinc-500">
                  {subtitle}
                </p>
              )}
            </div>
          )}

          <div className="[&>div[style]]:p-0! [&>div>div:has(>a[href='https://stytch.com/'])]:hidden! [&_button]:min-h-11! [&_input:not([type=checkbox]):not([type=radio])]:min-h-11! [&_input:not([type=checkbox]):not([type=radio])]:text-base!">
            {children}
          </div>

          {showTerms && (
            <p className="mt-7 text-pretty text-center text-xs leading-5 text-zinc-500">
              By continuing, you agree to our{" "}
              <Link
                href="/terms"
                className="rounded-sm text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="rounded-sm text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Privacy Policy
              </Link>
              .
            </p>
          )}
        </section>

        <footer className="pb-7 text-xs text-zinc-500 sm:pb-9">
          A clearer view of your trading.
        </footer>
      </div>

      <aside
        aria-labelledby="journal-preview-title"
        className="hidden min-w-0 p-3 pl-0 lg:flex"
      >
        <div className="flex w-full flex-col justify-center rounded-3xl bg-[#151615] px-10 py-14 xl:px-16">
          <div className="mx-auto w-full max-w-[460px]">
            <h2
              id="journal-preview-title"
              className="text-balance text-[42px] font-medium leading-[1.12] tracking-[-0.045em] text-zinc-50 xl:text-5xl"
            >
              Less noise.
              <br />
              More perspective.
            </h2>
            <p className="mt-5 max-w-[360px] text-[15px] leading-7 text-zinc-400">
              Bring your trades, rules, and notes together. See what works.
              Learn from what doesn’t.
            </p>

            <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-[#1c1d1c] shadow-[0_16px_48px_-24px_rgba(0,0,0,0.5)]">
              <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-5 py-4">
                <span className="text-[13px] font-medium text-zinc-200">
                  The trading record
                </span>
                <span className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
                  Sample journal
                </span>
              </div>
              <dl className="divide-y divide-white/[0.07] px-5">
                {LEDGER.map((row) => (
                  <div
                    key={`${row.setup}-${row.context}`}
                    className="flex items-center justify-between gap-4 py-5"
                  >
                    <dt className="min-w-0">
                      <span className="block text-sm font-medium text-zinc-200">
                        {row.setup}{" "}
                        <span className="font-normal text-zinc-400">
                          · {row.context}
                        </span>
                      </span>
                      <span className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400">
                        <span
                          aria-hidden="true"
                          className={`size-1 rounded-full ${row.followed ? "bg-emerald-400" : "bg-rose-400"}`}
                        />
                        {row.trades}
                      </span>
                    </dt>
                    <dd
                      className={`shrink-0 font-mono text-sm tabular-nums ${row.followed ? "text-emerald-300" : "text-rose-300"}`}
                    >
                      {row.pl}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="border-t border-white/[0.07] bg-white/[0.02] px-5 py-4">
                <p className="text-xs leading-5 text-zinc-400">
                  The same setup. A different result when the rules change.
                </p>
              </div>
            </div>
            <p className="mt-7 text-xs leading-5 text-zinc-400">
              A record to learn from, one trade at a time.
            </p>
          </div>
        </div>
      </aside>
    </main>
  );
}
