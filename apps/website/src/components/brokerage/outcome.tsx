import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function Outcome({
  children,
  retry,
  pending,
}: {
  children: ReactNode
  retry?: () => void
  pending?: boolean
}) {
  return (
    <Card className="gap-5 p-6 shadow-none">
      <p className="text-sm leading-6 text-muted-foreground" role="status">
        {children}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" nativeButton={false} render={<Link to="/brokerage/connections" />}>
          <ArrowLeft aria-hidden />
          Back to Brokerage
        </Button>
        {retry && (
          <Button disabled={pending} onClick={retry}>
            Try again
          </Button>
        )}
      </div>
    </Card>
  )
}
