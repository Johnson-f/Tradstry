import { Add01Icon, Loading03Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { brokerOptions } from '@/lib/client/brokerage/broker-catalog'
import { startBrokerageConnection, useBrokerageProviders } from '@/lib/client/brokerage/brokerage'
import { brokerageErrorMessage } from '@/lib/client/brokerage/brokerage-model'

const itemClass =
  'min-h-8 gap-2.5 rounded-xl px-2.5 py-1.5 text-sm font-normal data-highlighted:bg-muted focus:bg-muted'

export function ConnectBrokerMenu() {
  const [open, setOpen] = useState(false)
  const providers = useBrokerageProviders(open)
  const start = useMutation({
    mutationFn: (slug: string) => startBrokerageConnection(undefined, slug),
    onSuccess: (url) => window.location.assign(url),
  })
  const brokers = brokerOptions(providers.data)
  const error = start.isError
    ? brokerageErrorMessage(start.error, 'Could not connect this broker. Try again.')
    : null

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        if (start.isPending) return
        setOpen(next)
        if (!next) start.reset()
      }}
    >
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" />}
        className="h-8 shrink-0 gap-1.5 px-3"
      >
        <HugeiconsIcon icon={Add01Icon} className="size-3.5" strokeWidth={1.5} aria-hidden />
        Connect Broker
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={8}
        aria-label="Connect a broker"
        className="flex max-h-(--available-height) w-64 max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl p-1 font-[Arial,Helvetica,sans-serif] shadow-lg ring-border data-open:animate-none data-closed:animate-none"
      >
        <ScrollArea className="h-80 min-h-0 overflow-hidden [&_[data-slot=scroll-area-viewport]]:overscroll-contain">
          <DropdownMenuGroup className="pr-1.5">
            {brokers.map((broker) => {
              const pending = start.isPending && start.variables === broker.slug
              return (
                <DropdownMenuItem
                  key={broker.slug}
                  label={broker.name}
                  closeOnClick={false}
                  disabled={start.isPending || broker.unavailableReason !== null}
                  title={
                    broker.unavailableReason ? `${broker.name} · ${broker.unavailableReason}` : broker.name
                  }
                  className={itemClass}
                  onClick={() => start.mutate(broker.slug)}
                >
                  <Avatar className="size-5 bg-white">
                    <AvatarImage
                      src={broker.logoUrl ?? undefined}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="object-contain"
                    />
                    <AvatarFallback className="text-[10px] font-medium">
                      {broker.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1 truncate">{broker.name}</span>
                  {pending ? (
                    <HugeiconsIcon
                      icon={Loading03Icon}
                      className="size-4 animate-spin motion-reduce:animate-none"
                      aria-label="Connecting"
                    />
                  ) : (
                    broker.unavailableReason && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {broker.unavailableReason}
                      </span>
                    )
                  )}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        </ScrollArea>
        {error && (
          <p role="alert" className="px-3 py-2 text-xs leading-5 text-destructive">
            {error}
          </p>
        )}
        <Separator className="mx-2 my-1 data-horizontal:w-auto" />
        <DropdownMenuItem
          className={`${itemClass} shrink-0 py-2.5`}
          disabled={start.isPending}
          render={<a href="https://tradstry.com/support" target="_blank" rel="noreferrer" />}
        >
          <HugeiconsIcon icon={Search01Icon} className="size-5" strokeWidth={1.5} aria-hidden />
          Can’t find my broker
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
