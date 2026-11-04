import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Decorative cards follow the reference's cropped, overlapping edge layout.
const cards = [
  { text: 'Keep the lesson behind\nevery trade', avatar: 'chameleon', className: 'top-0 -rotate-8' },
  { text: 'Build a playbook\nI can stick to', avatar: 'fox', className: 'top-[5%] rotate-3' },
  { text: 'Understand what makes\nmy best setups work', avatar: 'owl', className: 'top-[23%] -rotate-12' },
  { text: 'Plan the risk\nbefore the entry', avatar: 'squirrel', className: 'top-[27%] -rotate-17' },
  { text: 'Keep my trading notes\nand charts together', avatar: 'octopus', className: 'top-[36%] rotate-4' },
  { text: 'Review my trades\nwith a clear head', avatar: 'turtle', className: 'top-[46%] -rotate-14' },
  { text: 'Turn the patterns I find\ninto better habits', avatar: 'chameleon', className: 'top-1/2 rotate-7' },
  { text: 'See where I followed\nmy trading rules', avatar: 'owl', className: 'top-[62%] rotate-25' },
  { text: 'Learn from every win\nand every loss', avatar: 'squirrel', className: 'top-[68%] -rotate-22' },
  { text: 'Make time for\nmy weekly review', avatar: 'fox', className: 'top-[76%] rotate-17' },
  { text: 'Keep my process\nconsistent', avatar: 'chameleon', className: 'top-[85%] rotate-20' },
  { text: 'Bring all my trades\ninto one journal', avatar: 'octopus', className: 'top-[91%] rotate-7' },
] as const

const rightCards = [
  { text: 'Protect my capital\nwith a clear plan', avatar: 'beaver', className: 'top-0 -rotate-18' },
  { text: 'Build a record\nI can learn from', avatar: 'owl', className: 'top-[9%] rotate-8' },
  { text: 'Track my progress\none trade at a time', avatar: 'turtle', className: 'top-[13%] rotate-26' },
  { text: 'Understand the story\nbehind my results', avatar: 'squirrel', className: 'top-[22%] rotate-18' },
  { text: 'Keep my entries\nand exits in context', avatar: 'octopus', className: 'top-[38%] -rotate-20' },
  { text: 'See the habits behind\nmy strongest trades', avatar: 'chameleon', className: 'top-[48%] -rotate-5' },
  { text: 'Find the patterns\nin my trading journal', avatar: 'chameleon', className: 'top-[54%] rotate-14' },
  { text: 'Give every trade\na thoughtful review', avatar: 'owl', className: 'top-[60%] rotate-8' },
  { text: 'Build on what\nI learn each week', avatar: 'beaver', className: 'top-[83%] -rotate-6' },
  { text: 'Keep my trading goals\nin sight', avatar: 'fox', className: 'top-[88%] rotate-12' },
  { text: 'Focus on the process\nbehind the outcome', avatar: 'turtle', className: 'top-[92%] rotate-23' },
  { text: 'Turn my trade history\ninto useful lessons', avatar: 'octopus', className: 'top-[97%] rotate-4' },
] as const

export function SignInShell({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 isolate flex flex-col items-center overflow-x-hidden overflow-y-auto overscroll-none bg-white font-[Arial,Helvetica,sans-serif] text-[#080808] [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-neutral-500">
      <div
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden select-none max-[600px]:hidden"
        aria-hidden="true"
      >
        {[cards, rightCards].map((deck, side) => (
          <div
            className={cn(
              'absolute inset-y-0 w-77.5',
              side === 0
                ? '-left-42.5 max-[900px]:-left-61.25'
                : '-right-42.5 max-[900px]:-right-61.25',
            )}
            key={side}
          >
            {deck.map((card, index) => (
              <div
                className={cn(
                  'absolute flex min-h-17.5 w-77.5 items-center gap-3.5 rounded-[19px] border border-[#ececec] bg-white px-4.5 py-3 text-base leading-[1.35] text-[#3d3d3d] shadow-[0_9px_20px_#00000008,0_2px_3px_#00000005] nth-[3n]:opacity-65',
                  side === 0 && 'flex-row-reverse text-right',
                  ['translate-x-0', 'translate-x-3', 'translate-x-6'][index % 3],
                  card.className,
                )}
                key={card.text}
              >
                <img
                  className="h-11.5 w-9 flex-none object-contain"
                  src={`/auth/avatars/${card.avatar}.webp`}
                  alt=""
                  width="36"
                  height="46"
                />
                <span className={cn('whitespace-pre-line', side === 0 && 'flex-1')}>
                  {card.text}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <a
        className="absolute top-[7svh] rounded-lg"
        href="https://tradstry.com"
        aria-label="Tradstry home"
      >
        <img className="size-9 rounded-lg dark:ring-1 dark:ring-white/15" src="/favicon.svg" width="36" height="36" alt="" />
      </a>

      <main className="mt-[max(150px,22svh)] w-[calc(100%-40px)] max-w-100 shrink-0 pb-16 text-center max-[600px]:mt-[max(140px,20svh)]">
        <h1 className="m-0 text-5xl leading-[1.2] font-semibold tracking-[-2px] max-[600px]:text-[42px]">
          Sign in
        </h1>
        <p className="mt-5.5 text-base leading-[1.4] text-neutral-500">
          Continue with Google,<br />
          or with your email and password.
        </p>
        {/* Stytch injects unlayered styles, so its scoped Tailwind overrides
            need ! to take precedence. The separator limits the inline email
            layout to the opening screen, leaving password forms stacked. */}
        <div
          className={cn(
            'mt-10 text-left',
            '[&_[class*=MainContainer][class*=container]]:max-w-none! [&_[class*=MainContainer][class*=container]]:border-0! [&_[class*=MainContainer][class*=container]]:bg-transparent! [&_[class*=MainContainer][class*=container]]:p-0!',
            '[&_[class*=watermarkContainer]]:hidden! [&_[class*=Divider][class*=bar]]:hidden!',
            '[&_[role=separator]]:-my-2.25! [&_[role=separator]]:mx-0! [&_[role=separator]]:h-4! [&_[role=separator]]:justify-center!',
            '[&_button]:min-h-12! [&_button]:text-base!',
            '[&:has([role=separator])_form]:relative! [&:has([role=separator])_form]:block!',
            '[&:has([role=separator])_input[type=email]]:h-12! [&:has([role=separator])_input[type=email]]:bg-transparent! [&:has([role=separator])_input[type=email]]:py-0! [&:has([role=separator])_input[type=email]]:pr-30! [&:has([role=separator])_input[type=email]]:pl-5! [&:has([role=separator])_input[type=email]]:text-base!',
            '[&:has([role=separator])_form>button[type=submit]]:absolute! [&:has([role=separator])_form>button[type=submit]]:top-1.25! [&:has([role=separator])_form>button[type=submit]]:right-1.25! [&:has([role=separator])_form>button[type=submit]]:h-9.5! [&:has([role=separator])_form>button[type=submit]]:min-h-9.5! [&:has([role=separator])_form>button[type=submit]]:w-26.5! [&:has([role=separator])_form>button[type=submit]]:px-4! [&:has([role=separator])_form>button[type=submit]]:py-0!',
          )}
        >
          {children}
        </div>
      </main>

      <footer className="mt-auto w-[calc(100%-40px)] max-w-125 shrink-0 pb-12 text-center text-sm leading-[1.45] text-neutral-500 max-[600px]:pb-7 max-[600px]:text-[13px] [&_a:hover]:text-neutral-900">
        <nav className="mb-3 flex flex-wrap justify-center gap-x-4.5 gap-y-2" aria-label="Helpful links">
          <a href="https://tradstry.com/#product">Product</a>
          <a href="https://tradstry.com/#faq">FAQ</a>
          <a href="https://tradstry.com/security">Security</a>
          <a href="https://tradstry.com/support">Contact us</a>
        </nav>
        <p className="[&_a]:underline [&_a]:underline-offset-2">
          By continuing, you agree to our{' '}
          <a href="https://tradstry.com/terms">Terms</a>
          <br />and <a href="https://tradstry.com/privacy">Privacy Policy</a>.
        </p>
      </footer>
    </div>
  )
}
