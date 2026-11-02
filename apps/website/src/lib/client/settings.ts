import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { graphql } from '@/lib/client/backend'
import { DEFAULT_PERIOD, type Period, isPeriod } from '@/lib/client/home/home-model'
import { TRADES_KEY } from '@/lib/client/trades/trades'
import type { Decimal } from '@/lib/client/trades/trades-model'

export type DisplayTimeZone = 'MARKET' | 'LOCAL'
export type WeekStart = 'SUNDAY' | 'MONDAY'

export interface UserSettings {
  /** Dollars at risk assumed for a trade with no stop or planned risk. */
  defaultRisk: Decimal | null
  /** Trades within this many dollars of zero count as breakeven. */
  breakevenBand: Decimal
  timeZone: DisplayTimeZone
  weekStart: WeekStart
  defaultPeriod: string
}

export const DEFAULT_SETTINGS: UserSettings = {
  defaultRisk: null,
  breakevenBand: '0',
  timeZone: 'LOCAL',
  weekStart: 'SUNDAY',
  defaultPeriod: DEFAULT_PERIOD,
}

export const SETTINGS_KEY = ['settings']
const FIELDS = 'defaultRisk breakevenBand timeZone weekStart defaultPeriod'

export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => graphql<{ settings: UserSettings }>(`query Settings { settings { ${FIELDS} } }`),
    select: (data) => data.settings,
    staleTime: 5 * 60_000,
  })
}

/** Saving refetches trades too: the default risk and breakeven band change R and win counts. */
export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UserSettings) =>
      graphql<{ updateSettings: UserSettings }>(
        `mutation UpdateSettings($input: UserSettingsInput!) { updateSettings(input: $input) { ${FIELDS} } }`,
        { input },
      ).then((data) => data.updateSettings),
    onSuccess: (settings) => {
      queryClient.setQueryData(SETTINGS_KEY, { settings })
      return queryClient.invalidateQueries({ queryKey: TRADES_KEY })
    },
  })
}

/** The period the dashboard and analytics open on when the URL names none. */
export function useDefaultPeriod(): Period {
  const settings = useSettings()
  const chosen = settings.data?.defaultPeriod
  return isPeriod(chosen) ? chosen : DEFAULT_PERIOD
}
