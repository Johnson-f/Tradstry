import { TradstryMark } from "@tradstry/app-ui/components/logo";
import Link from "next/link";

const PRODUCT = [
  { href: "/#journal", label: "Product" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#mcp", label: "MCP" },
  { href: "/#faq", label: "FAQ" },
];

const LEARN = [
  { href: "/trading-journal", label: "Trading journal" },
  { href: "/brokerage-sync", label: "Brokerage sync" },
  { href: "/analytics", label: "Analytics" },
  { href: "/security", label: "Security" },
];

const LEGAL = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refund", label: "Refunds" },
  { href: "/support", label: "Support" },
];

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#070809] px-6 py-12 sm:py-14">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_10rem_10rem] lg:gap-16">
          <div className="sm:col-span-2 lg:col-span-1">
            <a
              href="/"
              aria-label="Tradstry home"
              className="inline-flex items-center gap-2.5 text-zinc-100 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-zinc-100 text-[#070809]">
                <TradstryMark className="size-4" />
              </span>
              <span className="text-base font-semibold tracking-[-0.02em]">
                Tradstry
              </span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-6 text-zinc-500">
              One connected record for every plan, execution, and review.
            </p>
          </div>

          <FooterGroup title="Product" links={PRODUCT} />
          <FooterGroup title="Learn" links={LEARN} />
        </div>

        <div className="mt-10 flex flex-col gap-5 border-t border-white/[0.07] pt-5 sm:flex-row sm:items-center sm:justify-between">
          <nav
            aria-label="Legal and support"
            className="flex flex-wrap gap-x-5 gap-y-2"
          >
            {LEGAL.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs text-zinc-500 transition-colors hover:text-zinc-200"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <p className="text-xs text-zinc-600">
            &copy; {new Date().getFullYear()} Tradstry
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterGroup({
  title,
  links,
}: {
  title: string;
  links: readonly { href: string; label: string }[];
}) {
  return (
    <nav aria-label={title}>
      <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
        {title}
      </p>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="text-sm text-zinc-400 transition-colors hover:text-zinc-100"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
