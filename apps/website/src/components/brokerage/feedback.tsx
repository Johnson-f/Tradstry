import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export function BrokerageError({
  message,
  retry,
  pending = false,
}: {
  message: string
  retry?: () => void
  pending?: boolean
}) {
  return (
    <Alert variant="destructive" className="rounded-xl p-4">
      <CircleAlert aria-hidden />
      <AlertDescription className="space-y-3">
        <p>{message}</p>
        {retry && (
          <Button variant="outline" size="sm" disabled={pending} onClick={retry}>
            Try again
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
