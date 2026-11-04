import { ArrowDown, ArrowRight, Check, KeyRound, Lock, ShieldCheck } from 'lucide-react'
import { DEMO_FILLS } from '@/components/landing/demo-data'
import { ImageSlot } from '@/components/landing/image-slot'
import { LANDING_IMAGES } from '@/components/landing/images'
import { Panel, Screen, Section, SectionHeading } from '@/components/landing/section'
import { toneClass, usd } from '@/components/landing/tone'
import { cn } from '@/lib/utils'

const FEES = 1.2
const PLANNED_RISK = 490

function demoTrade() {
  const average = (side: 'Buy' | 'Sell') => {
    const fills = DEMO_FILLS.filter((fill) => fill.action === side)
    const shares = fills.reduce((sum, fill) => sum + fill.quantity, 0)
    const value = fills.reduce((sum, fill) => sum + fill.quantity * fill.price, 0)
    return { shares, value, price: value / shares }
  }
  const entry = average('Buy')
  const exit = average('Sell')
  const net = exit.value - entry.value - FEES
  return { shares: entry.shares, entry: entry.price, exit: exit.price, net, r: net / PLANNED_RISK }
}

function Fact({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('mt-0.5 font-medium tabular-nums', className)}>{value}</dd>
    </div>
  )
}

export function BrokerSection() {
  const trade = demoTrade()
  return (
    <Section id="product">
      <SectionHeading title="Connect once. Every trade, rebuilt.">
        Link your brokerage and Tradstry imports your history, then keeps up as you trade. Scale-ins, partial exits and
        option legs come together as one trade, with average prices, fees and net P&L worked out for you.
      </SectionHeading>

      <Panel className="mt-14">
        <div className="grid items-center gap-4 lg:grid-cols-[1fr_auto_1fr]">
          <Screen>
            <p className="text-sm font-medium">Fills from your broker</p>
            <ul className="mt-3 divide-y divide-border text-sm">
              {DEMO_FILLS.map((fill) => (
                <li key={fill.time} className="flex items-center gap-3 py-2.5">
                  <span className="w-12 text-muted-foreground tabular-nums">{fill.time}</span>
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-xs font-medium',
                      fill.action === 'Buy'
                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
                    )}
                  >
                    {fill.action}
                  </span>
                  <span className="font-medium">AMD</span>
                  <span className="ml-auto text-muted-foreground tabular-nums">
                    {fill.quantity} @ {usd(fill.price)}
                  </span>
                </li>
              ))}
            </ul>
          </Screen>

          <div className="flex justify-center text-muted-foreground" aria-hidden="true">
            <ArrowRight className="hidden size-6 lg:block" />
            <ArrowDown className="size-6 lg:hidden" />
          </div>

          <Screen>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">
                AMD <span className="text-muted-foreground">Long · Sep 24</span>
              </p>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Closed</span>
            </div>
            <p className={cn('mt-3 text-3xl font-semibold tracking-tight tabular-nums', toneClass(trade.net))}>
              {usd(trade.net, { signed: true })}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
              <Fact label="Shares" value={trade.shares} />
              <Fact label="Avg entry" value={usd(trade.entry)} />
              <Fact label="Avg exit" value={usd(trade.exit)} />
              <Fact label="Fees" value={usd(FEES)} />
              <Fact label="Planned risk" value={usd(PLANNED_RISK)} />
              <Fact label="R multiple" value={`+${trade.r.toFixed(1)}R`} className={toneClass(trade.r)} />
            </dl>
          </Screen>
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Trade somewhere Tradstry can't connect to? Add fills by hand and they're grouped the same way.
        </p>
      </Panel>
    </Section>
  )
}

const LABELS = [
  { kind: 'Edge', name: 'Pullback', className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  { kind: 'Entry', name: 'Reclaimed VWAP', className: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
  { kind: 'Mistake', name: 'Sized in late', className: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
]

export function JournalSection() {
  const trade = demoTrade()
  return (
    <Section id="journal">
      <div className="grid items-center gap-12 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <SectionHeading title="Write down the why. Keep the lesson." align="left">
            Every trade gets a journal entry: notes, the edge you traded, how you got in and what you'd change. Labels are
            yours to define, and renaming one updates every trade that uses it.
          </SectionHeading>

          <Screen className="mt-10">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium">
                AMD <span className="font-normal text-muted-foreground">Long · Sep 24</span>
              </p>
              <span className={cn('font-medium tabular-nums', toneClass(trade.net))}>
                {usd(trade.net, { signed: true })} · +{trade.r.toFixed(1)}R
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {LABELS.map((label) => (
                <span key={label.kind} className={cn('rounded-md px-2 py-0.5 text-xs font-medium', label.className)}>
                  {label.kind}: {label.name}
                </span>
              ))}
            </div>
            <div className="mt-4 space-y-2 text-sm leading-relaxed">
              <p>
                Waited for the pullback to hold VWAP before adding. Took half at the first target and trailed the rest.
              </p>
              <p className="text-muted-foreground">
                <strong className="font-medium text-foreground">Next time:</strong> size in earlier. The setup was clear by
                9:45 and I added at a worse price.
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
              <Fact label="Conviction" value="4 of 5" />
              <Fact label="Planned pre-market" value="Yes" />
              <Fact label="Followed my rules" value="5 of 5" />
            </dl>
          </Screen>
        </div>
        <ImageSlot image={LANDING_IMAGES.journal} className="mx-auto max-w-md" />
      </div>
    </Section>
  )
}

const ENTRY = 118.4
const STOP = 116.2
const TARGET = 123.7
const BALANCE = 50_000
const RISK = BALANCE * 0.01

export function PlansSection() {
  const perShare = ENTRY - STOP
  const shares = Math.floor(RISK / perShare)
  const rewardRisk = (TARGET - ENTRY) / perShare
  return (
    <Section id="plans">
      <SectionHeading title="Size it before you take it.">
        Set your entry, stop and the risk you'll accept, and Tradstry works out the shares. Split an entry across
        levels, follow your workspace's rules, then link the plan to the trade that follows.
      </SectionHeading>

      <Panel className="mt-14">
        <div className="grid gap-4 md:grid-cols-2">
          <Screen>
            <p className="text-sm font-medium">AMD · Long</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {[
                ['Entry', usd(ENTRY)],
                ['Stop', usd(STOP)],
                ['Target', usd(TARGET)],
                ['Risk', `${usd(RISK)} · 1% of balance`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-border px-3 py-2.5">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </Screen>
          <Screen className="flex flex-col">
            <p className="text-sm text-muted-foreground">Buy</p>
            <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">{shares} shares</p>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <Fact label="Cost" value={usd(shares * ENTRY)} />
              <Fact label="Risk at stop" value={usd(shares * perShare)} />
              <Fact label="To target" value={`${rewardRisk.toFixed(1)}R`} />
            </dl>
            <p className="mt-auto flex items-center gap-2 pt-5 text-sm text-emerald-700 dark:text-emerald-400">
              <Check className="size-4" /> Within your 3% maximum stop
            </p>
          </Screen>
        </div>
      </Panel>
    </Section>
  )
}

const PROMISES = [
  {
    icon: ShieldCheck,
    title: 'Read-only brokerage access',
    body: 'Tradstry reads your fills, positions and balances. It never places orders or moves money.',
  },
  {
    icon: Lock,
    title: 'Encrypted credentials',
    body: 'The keys that link your brokerage are encrypted before they reach the database.',
  },
  {
    icon: KeyRound,
    title: 'You approve every AI app',
    body: 'Assistants connect only after you approve them, with read access. Writing to your journal needs a separate yes.',
  },
]

export function TrustSection() {
  return (
    <Section id="security">
      <SectionHeading title="Your account stays yours.">
        Your broker holds your money. Tradstry only reads what it needs to build your journal.
      </SectionHeading>
      <div className="mt-14 grid gap-4 md:grid-cols-3">
        {PROMISES.map(({ icon: Icon, title, body }) => (
          <Panel key={title}>
            <Icon className="size-6" aria-hidden="true" />
            <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
            <p className="mt-2 leading-relaxed text-muted-foreground">{body}</p>
          </Panel>
        ))}
      </div>
    </Section>
  )
}
