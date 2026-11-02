import type { ReactNode } from 'react'

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm">
        <p className="mb-8 text-center text-lg font-semibold tracking-tight">
          Tradstry
        </p>
        <h1 className="text-center text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 text-center text-sm text-muted-foreground">{description}</p>
        )}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  )
}
