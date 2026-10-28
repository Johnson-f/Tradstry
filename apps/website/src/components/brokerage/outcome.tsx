import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { panelClass } from '@/components/brokerage/styles'

export function Outcome({ children }: { children: ReactNode }) {
  return (
    <div className={`${panelClass} space-y-2 px-5 py-4`}>
      <p className="text-sm">{children}</p>
      <Link to="/brokerage" className="text-[13px] underline underline-offset-4">
        Back to Brokerage
      </Link>
    </div>
  )
}
