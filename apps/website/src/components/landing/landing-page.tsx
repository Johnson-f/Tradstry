import { Link } from '@tanstack/react-router'
import { type MouseEvent, useEffect } from 'react'
import { AiSection } from '@/components/landing/ai-section'
import { AnalyticsSection } from '@/components/landing/analytics-section'
import { AppPreview } from '@/components/landing/app-preview'
import { BrokerSection, JournalSection, PlansSection, TrustSection } from '@/components/landing/feature-sections'
import { FaqSection } from '@/components/landing/faq-section'
import { ImageSlot } from '@/components/landing/image-slot'
import { LANDING_IMAGES } from '@/components/landing/images'
import { Section } from '@/components/landing/section'
import { PAGE_TITLE } from '@/components/landing/seo'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#journal', label: 'Journal' },
  { href: '#analytics', label: 'Analytics' },
  { href: '#ai', label: 'AI' },
  { href: '#faq', label: 'FAQ' },
]

const FOOTER_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#security', label: 'Security' },
  { href: '#faq', label: 'FAQ' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
]

const YEAR = new Date().getFullYear()

const bigButton = 'h-11 rounded-full px-5 text-[15px]'

function scrollToSection(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const href = event.currentTarget.getAttribute('href')
  if (!href?.startsWith('#')) return
  const section = document.getElementById(href.slice(1))
  if (!section) return
  event.preventDefault()
  section.scrollIntoView({ behavior: 'instant' })
}

function Logo() {
  return (
    <a href="#top" onClick={scrollToSection} className="flex items-center gap-2 rounded-lg" aria-label="Tradstry home">
      <img src="/favicon.svg" alt="" width="28" height="28" className="size-7 rounded-lg dark:ring-1 dark:ring-white/15" />
      <span className="text-lg font-semibold tracking-tight">Tradstry</span>
    </a>
  )
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Logo />
        <nav className="mx-auto hidden items-center gap-7 text-sm text-muted-foreground md:flex" aria-label="Sections">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} onClick={scrollToSection} className="hover:text-foreground">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Link to="/sign-in" className={buttonVariants({ variant: 'ghost', className: 'rounded-full px-3' })}>
            Sign in
          </Link>
          <Link to="/sign-in" className={buttonVariants({ className: 'rounded-full px-3.5' })}>
            Get started
          </Link>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="mx-auto w-full max-w-6xl px-5 pt-14 pb-10 sm:px-8 sm:pt-20">
      <div className="grid items-center gap-10 lg:grid-cols-[1.25fr_1fr]">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Trading journal and analytics</p>
          <h1 className="mt-4 text-5xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
            The trading journal that builds itself.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground sm:text-xl">
            Connect your broker and every fill becomes a trade, ready for your notes. See what's working, size the next
            one, and ask Claude or ChatGPT about your own numbers.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/sign-in" className={buttonVariants({ size: 'lg', className: bigButton })}>
              Get started
            </Link>
            <a href="#product" onClick={scrollToSection} className={buttonVariants({ variant: 'outline', size: 'lg', className: bigButton })}>
              See how it works
            </a>
          </div>
        </div>
        <ImageSlot image={LANDING_IMAGES.hero} className="mx-auto max-w-md" priority />
      </div>
      <div className="mt-16">
        <AppPreview />
      </div>
    </section>
  )
}

function ClosingCall() {
  return (
    <Section className="text-center">
      <ImageSlot image={LANDING_IMAGES.cta} className="mx-auto max-w-56" />
      <h2 className="mx-auto mt-10 max-w-2xl text-5xl leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-6xl">
        Start the journal you'll actually keep.
      </h2>
      <p className="mt-5 text-lg text-muted-foreground">Link a broker and your past trades are ready to review.</p>
      <Link to="/sign-in" className={buttonVariants({ size: 'lg', className: cn(bigButton, 'mt-9') })}>
        Get started
      </Link>
    </Section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground" aria-label="Footer">
            {FOOTER_LINKS.map((link) => (
              <a key={link.href} href={link.href} onClick={scrollToSection} className="hover:text-foreground">
                {link.label}
              </a>
            ))}
            <Link to="/sign-in" className="hover:text-foreground">
              Sign in
            </Link>
          </nav>
        </div>
        <div className="mt-10 space-y-3 text-xs leading-relaxed text-muted-foreground">
          <p>
            <strong className="font-medium text-foreground">Tradstry is a trading journal and analytics tool.</strong> It
            does not place trades, hold your money, or give investment, tax or legal advice. Trading involves risk,
            including losses larger than your deposit when you use margin or options. Past results don't guarantee future
            ones.
          </p>
          <p>
            Every account, trade, note, chart and conversation on this page is a fictional example, not a real result or
            a recommendation.
          </p>
          <p>© {YEAR} Tradstry</p>
        </div>
      </div>
    </footer>
  )
}

export function LandingPage() {
  useEffect(() => {
    document.title = PAGE_TITLE
    return () => {
      document.title = 'Tradstry'
    }
  }, [])

  return (
    <div id="top" className="min-h-svh bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <BrokerSection />
        <JournalSection />
        <AnalyticsSection />
        <PlansSection />
        <AiSection />
        <TrustSection />
        <FaqSection />
        <ClosingCall />
      </main>
      <Footer />
    </div>
  )
}
