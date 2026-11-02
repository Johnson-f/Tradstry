import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { graphql } from '@/lib/client/backend'
import { useInvalidateTrades } from '@/lib/client/trades/trades'
import type { PlanningRule, TradePlan } from './plan-model'

const PLAN_FIELDS = `id workspaceId assetClass symbol direction entry stop target risk quantity
  tranches { percent entry quantity risk } roundUp actualRisk cost note status tradeId createdAt updatedAt`

const plansKey = (workspaceId: string) => ['plans', workspaceId]
const ruleKey = (workspaceId: string) => ['planning-rule', workspaceId]

export function useTradePlans(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: plansKey(workspaceId),
    enabled,
    queryFn: () =>
      graphql<{ tradePlans: TradePlan[] }>(`query TradePlans($w: ID!) { tradePlans(workspaceId: $w) { ${PLAN_FIELDS} } }`, {
        w: workspaceId,
      }).then((data) => data.tradePlans),
  })
}

const RULE_FIELDS = 'balance source asOf linked manualBalance riskPercent maxStopPercent'

export function usePlanningRule(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: ruleKey(workspaceId),
    enabled,
    queryFn: () =>
      graphql<{ planningRule: PlanningRule }>(`query PlanningRule($w: ID!) { planningRule(workspaceId: $w) { ${RULE_FIELDS} } }`, {
        w: workspaceId,
      }).then((data) => data.planningRule),
  })
}

export function useSavePlanningRule(workspaceId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { manualBalance: string | null; riskPercent: string | null; maxStopPercent: string | null }) =>
      graphql<{ savePlanningRule: PlanningRule }>(
        `mutation SavePlanningRule($w: ID!, $input: PlanningRuleInput!) {
          savePlanningRule(workspaceId: $w, input: $input) { ${RULE_FIELDS} }
        }`,
        { w: workspaceId, input },
      ).then((data) => data.savePlanningRule),
    onSuccess: (rule) => client.setQueryData(ruleKey(workspaceId), rule),
  })
}

/** A plan change that refreshes the workspace's plans, and its statistics when `trades` is set. */
function usePlanMutation<T>(workspaceId: string, run: (variables: T) => Promise<unknown>, trades = false) {
  const client = useQueryClient()
  const invalidateTrades = useInvalidateTrades()
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: plansKey(workspaceId) })
      if (trades) await invalidateTrades()
    },
  })
}

export function useSavePlan(workspaceId: string) {
  return usePlanMutation(workspaceId, ({ id, input }: { id: string | null; input: Record<string, unknown> }) =>
    id
      ? graphql(`mutation UpdatePlan($id: ID!, $input: TradePlanInput!) { updateTradePlan(id: $id, input: $input) { id } }`, {
          id,
          input,
        })
      : graphql(
          `mutation CreatePlan($w: ID!, $input: TradePlanInput!) { createTradePlan(workspaceId: $w, input: $input) { id } }`,
          { w: workspaceId, input },
        ),
  )
}

export function useSkipPlan(workspaceId: string) {
  return usePlanMutation(
    workspaceId,
    ({ id, skipped }: { id: string; skipped: boolean }) =>
      graphql('mutation SkipPlan($id: ID!, $s: Boolean!) { skipTradePlan(id: $id, skipped: $s) { id } }', { id, s: skipped }),
    true,
  )
}

export function useDeletePlan(workspaceId: string) {
  return usePlanMutation(workspaceId, (id: string) =>
    graphql('mutation DeletePlan($id: ID!) { deleteTradePlan(id: $id) }', { id }),
  )
}

export function useLinkPlan(workspaceId: string) {
  return usePlanMutation(
    workspaceId,
    ({ id, tradeId }: { id: string; tradeId: string }) =>
      graphql('mutation LinkPlan($id: ID!, $t: ID!) { linkTradePlan(id: $id, tradeId: $t) { id } }', { id, t: tradeId }),
    true,
  )
}

export function useUnlinkPlan(workspaceId: string) {
  return usePlanMutation(
    workspaceId,
    (id: string) => graphql('mutation UnlinkPlan($id: ID!) { unlinkTradePlan(id: $id) { id } }', { id }),
    true,
  )
}
