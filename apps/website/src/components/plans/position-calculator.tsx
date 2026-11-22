import { AlertCircleIcon, Calculator01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { CalculatorTab } from '@/components/plans/calculator-tab'
import { TabEmpty } from '@/components/plans/calculator-bits'
import { CalculatorSkeleton, RuleSkeleton } from '@/components/plans/calculator-skeletons'
import { HistoryTab } from '@/components/plans/history-tab'
import { PlanComposer, type PlanSeed } from '@/components/plans/plan-composer'
import { PlansTab } from '@/components/plans/plans-tab'
import { RuleTab } from '@/components/plans/rule-tab'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { planForm, riskInDollars } from '@/lib/client/plans/plan-model'
import { usePlanningRule, useTradePlans } from '@/lib/client/plans/plans'
import { useWorkspaces } from '@/lib/client/workspaces'
import { toNumber } from '@/lib/client/trades/trades-model'

function LoadFailed({ what }: { what: string }) {
  return (
    <TabEmpty
      icon={AlertCircleIcon}
      title={`Couldn’t load ${what}`}
      description="Something went wrong on our side. Close the calculator and open it again to retry."
    />
  )
}

type CalculatorTabName = 'calculator' | 'plans' | 'history' | 'rule'

const panelClass = 'flex min-h-0 flex-col overflow-y-auto pr-1 outline-none'

/** v1's position calculator: size a trade, turn it into a plan, look back at past plans, and set the rule. */
export function PositionCalculator({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [tab, setTab] = useState<CalculatorTabName>('calculator')
  const [seed, setSeed] = useState<PlanSeed | null>(null)
  const [planMessage, setPlanMessage] = useState('')
  const rule = usePlanningRule(workspaceId, open)
  const plans = useTradePlans(workspaceId, open)
  const workspaces = useWorkspaces()
  const workspaceName = workspaces.data?.find((workspace) => workspace.id === workspaceId)?.name ?? 'this workspace'
  const openCount = plans.data?.filter((plan) => plan.status === 'OPEN').length ?? 0
  const calculatorReady = Boolean(rule.data)
  const tabHasFooter = ((tab === 'calculator' || tab === 'rule') && calculatorReady) || (tab === 'plans' && !!seed)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setSeed(null)
          setPlanMessage('')
        }
      }}
    >
      <DialogContent
        data-tab={tab}
        data-plan-list={tab === 'plans' && !seed ? '' : undefined}
        className="flex max-h-[calc(100dvh-2rem)] min-h-[min(560px,calc(100dvh-2rem))] flex-col overflow-hidden font-[Arial,Helvetica,sans-serif] data-[tab=calculator]:h-[min(40rem,calc(100dvh-2rem))] data-plan-list:h-[min(35rem,calc(100dvh-2rem))] sm:max-w-2xl sm:data-[tab=plans]:max-w-3xl data-open:animate-none data-closed:animate-none"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 font-[Arial,Helvetica,sans-serif]">
            <span className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
              <HugeiconsIcon icon={Calculator01Icon} strokeWidth={2} className="size-4" />
            </span>
            Position Calculator
          </DialogTitle>
          <DialogDescription className={tab === 'plans' ? 'sr-only' : undefined}>
            {tab === 'plans' ? 'Review and save your trade plans.' : 'Calculate your position size based on your account risk.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(next: CalculatorTabName) => setTab(next)}
          className="min-h-0 flex-1 overflow-y-clip"
        >
          <TabsList className="shrink-0">
            <TabsTrigger value="calculator">Calculator</TabsTrigger>
            <TabsTrigger value="plans">
              Plans
              {openCount > 0 && <span className="ml-1 text-muted-foreground tabular-nums">{openCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="rule">Rule</TabsTrigger>
          </TabsList>

          <TabsContent value="calculator" className={calculatorReady ? 'flex min-h-0 flex-col' : panelClass}>
            {rule.data ? (
              <CalculatorTab
                key={workspaceId}
                workspaceId={workspaceId}
                rule={rule.data}
                onPlan={(form, balance) => {
                  setPlanMessage('')
                  setSeed({
                    draftId: crypto.randomUUID(),
                    form: { ...form, riskMode: 'DOLLARS', risk: (riskInDollars(form, balance) ?? 0).toFixed(2) },
                    balance,
                    editing: null,
                  })
                  setTab('plans')
                }}
              />
            ) : rule.isError ? (
              <LoadFailed what="the calculator" />
            ) : (
              <CalculatorSkeleton />
            )}
          </TabsContent>

          <TabsContent value="plans" keepMounted={!!seed} className="flex min-h-0 flex-col font-sans hidden:hidden">
            {seed ? (
              <PlanComposer
                key={seed.draftId}
                workspaceId={workspaceId}
                seed={seed}
                maxStop={toNumber(rule.data?.maxStopPercent)}
                onCancel={() => {
                  if (!seed.editing) setTab('calculator')
                  setSeed(null)
                }}
                onSaved={() => {
                  setPlanMessage(`${seed.form.symbol} plan saved`)
                  setSeed(null)
                }}
              />
            ) : (
              <PlansTab workspaceId={workspaceId} plans={plans.data} loading={plans.isPending} failed={plans.isError}
                onEdit={(plan) => {
                  setPlanMessage('')
                  setSeed({ draftId: plan.id, form: planForm(plan), balance: null, editing: plan })
                }}
                onCalculator={() => setTab('calculator')}
              />
            )}
          </TabsContent>

          <TabsContent value="history" className={panelClass}>
            <HistoryTab
              workspaceId={workspaceId}
              plans={plans.data}
              loading={plans.isPending}
              onOpenTrade={() => onOpenChange(false)}
              onPlans={() => setTab('plans')}
              onCalculator={() => setTab('calculator')}
            />
          </TabsContent>

          <TabsContent value="rule" className={rule.data ? 'flex min-h-0 flex-col' : panelClass}>
            {rule.data ? (
              <RuleTab
                key={workspaceId}
                workspaceId={workspaceId}
                workspaceName={workspaceName}
                rule={rule.data}
              />
            ) : rule.isError ? (
              <LoadFailed what="your rule" />
            ) : (
              <RuleSkeleton />
            )}
          </TabsContent>
        </Tabs>

        {!tabHasFooter && (
          <div className="flex shrink-0 items-center justify-end gap-2">
            {tab === 'plans' && planMessage && <span role="status" className="mr-auto text-xs text-muted-foreground">{planMessage}</span>}
            <DialogClose render={<Button type="button" variant="outline" />}>Close</DialogClose>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
