import { useStytchUser } from '@stytch/react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { LogOut, Mail, Receipt, Settings } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSignOut } from '@/lib/auth/use-sign-out'
import { userAvatarUrl, userEmail, userFullName } from '@/lib/auth/stytch'

function initials(name: string, email: string): string {
  const source = name || email
  const parts = source.split(/[\s@.]+/).filter(Boolean)
  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase()
}

const menuItemClass =
  'min-h-8 gap-2.5 rounded-lg px-1.5 py-1.5 text-sm font-normal text-neutral-800 focus:bg-neutral-100 focus:text-neutral-900 dark:text-neutral-200 dark:focus:bg-white/5 dark:focus:text-neutral-100 [&_svg]:text-neutral-700 dark:[&_svg]:text-neutral-300'

export function UserMenu() {
  const { user } = useStytchUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const signOut = useSignOut(queryClient)
  const name = userFullName(user)
  const email = userEmail(user)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="flex size-9 cursor-pointer items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:size-11"
      >
        <Avatar className="size-8">
          <AvatarImage src={userAvatarUrl(user)} alt="" />
          <AvatarFallback>{initials(name, email)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={8}
        className="w-60 max-w-[calc(100vw-24px)] rounded-2xl bg-white p-2 font-[Arial,Helvetica,sans-serif] text-neutral-800 shadow-[0_4px_20px_#0000000a] ring-1 ring-black/8 data-open:animate-none data-closed:animate-none dark:bg-neutral-900 dark:text-neutral-200 dark:ring-white/10"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-1.5 pt-1 pb-2 font-normal">
            <span className="block truncate text-[15px] leading-5 font-medium text-neutral-900 dark:text-neutral-100">
              {user?.name.first_name || name || email}
            </span>
            {name && (
              <span className="block truncate text-[13px] leading-5 font-normal text-neutral-500 dark:text-neutral-400">
                {email}
              </span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuItem
            className={menuItemClass}
            onClick={() => void navigate({ to: '/settings' })}
          >
            <Settings className="size-4" aria-hidden />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem
            className={menuItemClass}
            onClick={() => void navigate({ to: '/tax' })}
          >
            <Receipt className="size-4" aria-hidden />
            Realized gains
          </DropdownMenuItem>
          <DropdownMenuItem
            className={menuItemClass}
            render={<a href="https://www.tradstry.com/support" />}
          >
            <Mail className="size-4" aria-hidden />
            Get help
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="mx-0 my-1 bg-neutral-100 dark:bg-white/10" />
        <DropdownMenuItem className={menuItemClass} onClick={() => void signOut()}>
          <LogOut className="size-4" aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
