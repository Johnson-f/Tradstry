import { Wrench } from 'lucide-react'
import { DEMO_EDGE_BARS, DEMO_MISTAKES, DEMO_NET } from '@/components/landing/demo-data'
import { ImageSlot } from '@/components/landing/image-slot'
import { LANDING_IMAGES } from '@/components/landing/images'
import { Panel, Section, SectionHeading } from '@/components/landing/section'
import { usd } from '@/components/landing/tone'

const CLIENTS = ['Claude', 'ChatGPT', 'Claude Code', 'Any MCP client']

function Ask({ children }: { children: React.ReactNode }) {
  return (
    <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-4 py-2.5 text-sm text-background">
      {children}
    </p>
  )
}

function Tools({ calls }: { calls: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {calls.map((call) => (
        <span
          key={call}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground"
        >
          <Wrench className="size-3" aria-hidden="true" />
          {call}
        </span>
      ))}
    </div>
  )
}

function Answer({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-background px-4 py-3 text-sm leading-relaxed">
      {children}
    </div>
  )
}

export function AiSection() {
  const [leak] = DEMO_MISTAKES
  const [best] = DEMO_EDGE_BARS
  return (
    <Section id="ai">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.3fr]">
        <div>
          <SectionHeading title="Ask Claude or ChatGPT about your trading." align="left">
            Connect Tradstry to your AI assistant and ask about your own numbers: last week's review, your biggest leak,
            the setups worth more size. It can journal a trade or save a plan too, but only if you allow it.
          </SectionHeading>
          <ul className="mt-8 flex flex-wrap gap-2" aria-label="Works with">
            {CLIENTS.map((client) => (
              <li key={client} className="rounded-full border border-border px-3 py-1 text-sm">
                {client}
              </li>
            ))}
          </ul>
          <ImageSlot image={LANDING_IMAGES.ai} className="mt-10 max-w-sm max-lg:hidden" />
        </div>

        <Panel>
          <div className="space-y-3" role="log" aria-label="Example conversation with an AI assistant">
            <Ask>Review my last three months. Where am I leaking money?</Ask>
            <Tools calls={['review_period · 3m', 'analyze · mistake']} />
            <Answer>
              You're up <strong className="font-medium">{usd(DEMO_NET, { signed: true })}</strong> over three months
              with a 61% win rate. Your biggest leak is{' '}
              <strong className="font-medium">{leak.label.toLowerCase()}</strong>: {leak.trades} trades cost you{' '}
              {usd(Math.abs(leak.cost))}. {best.label} trades carried the quarter at{' '}
              {usd(best.value, { signed: true })}.
            </Answer>
            <Ask>Add to the AMD trade: size in earlier next time.</Ask>
            <Tools calls={['journal_trade']} />
            <Answer>Done. It's in the notes on your AMD trade from Sep 24.</Answer>
          </div>
        </Panel>
      </div>
    </Section>
  )
}
