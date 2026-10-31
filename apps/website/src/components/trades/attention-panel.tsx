import { Alert02Icon, InformationCircleIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { DecisionDialog } from '@/components/trades/decision-dialog'
import { OpeningDialog } from '@/components/trades/opening-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  type TradeAttention,
  useAnswerAlias,
  useDeleteAnnotation,
  useDeleteOpeningPosition,
  useTradeAttention,
  useUndoDecision,
} from '@/lib/client/trades/trades'
import {
  decisionMessage,
  instrumentLabel,
  issueAction,
  issueTitle,
  keySymbol,
  money,
  quantity,
  tradeErrorMessage,
} from '@/lib/client/trades/trades-model'
import { formatDate } from '@/lib/format'
import { noteText } from '@/lib/client/trades/note-document'

function Row({
  icon = 'info',
  title,
  detail,
  children,
}: {
  icon?: 'info' | 'warning'
  title: string
  detail?: string
  children?: React.ReactNode
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 gap-2.5">
        <HugeiconsIcon
          icon={icon === 'warning' ? Alert02Icon : InformationCircleIcon}
          className={`mt-0.5 size-4 shrink-0 ${icon === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
          strokeWidth={1.8}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          {detail && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{detail}</p>}
        </div>
      </div>
      {children && <div className="flex shrink-0 gap-1.5">{children}</div>}
    </li>
  )
}

const DECISION_KIND: Record<string, string> = {
  merge: 'Merged trades',
  split: 'Split a trade',
  combine_legs: 'Combined legs into a strategy',
}

function count(attention: TradeAttention): number {
  return (
    attention.aliasSuggestions.length +
    attention.strategySuggestions.length +
    attention.issues.filter((i) => i.severity !== 'info').length +
    attention.orphanedAnnotations.length +
    attention.decisions.filter((d) => d.status !== 'applied').length
  )
}

/** Problems, suggestions and earlier decisions for a workspace's trades. */
export function AttentionPanel({ workspaceId }: { workspaceId: string }) {
  const attention = useTradeAttention(workspaceId)
  const answer = useAnswerAlias()
  const undo = useUndoDecision()
  const deleteOpening = useDeleteOpeningPosition()
  const deleteAnnotation = useDeleteAnnotation()
  const [opening, setOpening] = useState<string | null>(null)
  const [combine, setCombine] = useState<string[] | null>(null)
  const [showAll, setShowAll] = useState(false)
  const data = attention.data
  if (!data) return null
  const pending = count(data)
  const info = data.issues.filter((i) => i.severity === 'info')
  const hasHistory = data.decisions.length + data.openingPositions.length + data.aliases.length + info.length > 0
  if (pending === 0 && !hasHistory) return null
  const error = answer.error ?? undo.error ?? deleteOpening.error ?? deleteAnnotation.error

  return (
    <section aria-labelledby="attention-heading" className={pending > 0 || showAll ? 'w-full space-y-2' : 'ml-auto'}>
      <div className={`flex items-center gap-3 ${pending > 0 ? 'justify-between' : 'justify-end'}`}>
        <h2 id="attention-heading" className={pending > 0 ? 'text-sm font-medium' : 'sr-only'}>
          {pending > 0 ? `Needs your attention (${pending})` : 'Adjustments'}
        </h2>
        {hasHistory && (
          <Button variant="ghost" size="sm" className="font-normal text-muted-foreground" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Hide adjustments' : 'Show adjustments'}
            <ChevronDown aria-hidden className={`size-3.5 ${showAll ? 'rotate-180' : ''}`} />
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {tradeErrorMessage(error, 'Could not make that change. Try again.')}
        </p>
      )}
      {(pending > 0 || showAll) && <Card className="gap-0 py-0 shadow-none">
        <ul className="divide-y">
          {data.aliasSuggestions.map((s) => (
            <Row
              key={`${s.fromKey}-${s.toKey}`}
              icon="warning"
              title={`Is ${s.fromSymbol} the same stock as ${s.toSymbol}?`}
              detail={`${s.reason}. Confirming joins them from ${formatDate(s.effectiveAt)}.`}
            >
              <Button size="sm" variant="ghost" disabled={answer.isPending} onClick={() => answer.mutate({ suggestion: s, confirm: false })}>
                No
              </Button>
              <Button size="sm" disabled={answer.isPending} onClick={() => answer.mutate({ suggestion: s, confirm: true })}>
                Yes, join them
              </Button>
            </Row>
          ))}
          {data.strategySuggestions.map((s) => (
            <Row
              key={s.trades.map((t) => t.id).join()}
              title={`${s.trades.length} ${s.underlying} option legs opened together`}
              detail={s.trades.map((t) => instrumentLabel(t)).join(', ')}
            >
              <Button size="sm" variant="secondary" onClick={() => setCombine(s.trades.map((t) => t.id))}>
                Combine
              </Button>
            </Row>
          ))}
          {data.issues
            .filter((i) => i.severity !== 'info')
            .map((issue) => (
              <Row
                key={`${issue.code}-${issue.instrumentKey}-${issue.fillKey}`}
                icon="warning"
                title={issueTitle(issue.code)}
                detail={issue.message}
              >
                {issueAction(issue) === 'opening-position' && (
                  <Button size="sm" variant="secondary" onClick={() => setOpening(keySymbol(issue.instrumentKey))}>
                    Add opening position
                  </Button>
                )}
              </Row>
            ))}
          {data.orphanedAnnotations.map((note) => (
            <Row
              key={note.id}
              icon="warning"
              title="A journal entry lost its trade"
              detail={noteText(note.notes).trim() ? `“${noteText(note.notes).slice(0, 120)}”` : 'Its trade was regrouped or its fills were removed.'}
            >
              <Button
                size="sm"
                variant="ghost"
                disabled={deleteAnnotation.isPending}
                onClick={() => {
                  if (window.confirm('Delete this journal entry?')) deleteAnnotation.mutate(note.id)
                }}
              >
                Delete
              </Button>
            </Row>
          ))}
          {data.decisions
            .filter((d) => showAll || d.status !== 'applied')
            .map((d) => (
              <Row
                key={d.id}
                icon={d.status === 'applied' ? 'info' : 'warning'}
                title={`${DECISION_KIND[d.kind] ?? 'Change'} on ${formatDate(d.createdAt)}`}
                detail={d.status === 'applied' ? undefined : decisionMessage(d.code)}
              >
                {d.status === 'applied' && d.tradeIds[0] && (
                  <Button
                    size="sm"
                    variant="ghost"
                    nativeButton={false}
                    render={<Link to="/w/$workspaceId/journal/$tradeId" params={{ workspaceId, tradeId: d.tradeIds[0] }} />}
                  >
                    View
                  </Button>
                )}
                <Button size="sm" variant="secondary" disabled={undo.isPending} onClick={() => undo.mutate(d.id)}>
                  Undo
                </Button>
              </Row>
            ))}
          {showAll &&
            data.openingPositions.map((o) => (
              <Row
                key={o.id}
                title={`Opening position: ${quantity(o.quantity)} ${o.symbol} at ${money(o.costPerUnit)}`}
                detail={`Held as of ${formatDate(o.asOf)}, acquired ${formatDate(o.acquiredAt)}`}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={deleteOpening.isPending}
                  onClick={() => {
                    if (window.confirm('Remove this opening position?')) deleteOpening.mutate(o.id)
                  }}
                >
                  Remove
                </Button>
              </Row>
            ))}
          {showAll &&
            data.aliases.map((a) => (
              <Row
                key={`${a.fromKey}-${a.toKey}`}
                title={`${keySymbol(a.fromKey)} is treated as ${keySymbol(a.toKey)}`}
                detail={`From ${formatDate(a.effectiveAt)}`}
              />
            ))}
          {showAll && info.map((issue) => (
            <Row key={`${issue.code}-${issue.fillKey}-${issue.instrumentKey}`} title={issueTitle(issue.code)} detail={issue.message} />
          ))}
          {showAll &&
            data.unattributedIncome.map((income) => (
              <Row
                key={`${income.symbol}-${income.at}`}
                title={`${money(income.amount)} dividend from ${income.symbol}`}
                detail={`Paid ${formatDate(income.at)} with no trade open to attach it to`}
              />
            ))}
        </ul>
      </Card>}
      {opening !== null && <OpeningDialog workspaceId={workspaceId} symbol={opening} onClose={() => setOpening(null)} />}
      {combine && (
        <DecisionDialog
          workspaceId={workspaceId}
          decision={{ kind: 'combine_legs', tradeIds: combine }}
          onClose={() => setCombine(null)}
        />
      )}
    </section>
  )
}
