import { Plus } from 'lucide-react'
import { QUESTIONS } from '@/components/landing/faq'
import { Section, SectionHeading } from '@/components/landing/section'

export function FaqSection() {
  return (
    <Section id="faq" className="max-w-3xl">
      <SectionHeading title="Questions" />
      <div className="mt-12 divide-y divide-border border-y border-border">
        {QUESTIONS.map(({ question, answer }) => (
          <details key={question} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-lg font-medium [&::-webkit-details-marker]:hidden">
              {question}
              <Plus
                className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                aria-hidden="true"
              />
            </summary>
            <p className="mt-3 leading-relaxed text-pretty text-muted-foreground">{answer}</p>
          </details>
        ))}
      </div>
    </Section>
  )
}
