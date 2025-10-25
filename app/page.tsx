{/* This is the landing page for the application, edit this to my style */}
import Link from "next/link";
import { Button } from "@/components/ui/button";

// Force this page to be static - because of SEO 
export const dynamic = 'force-static';
export const revalidate = 3600; // Revalidate every hour (optional)

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16">
        <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
          <div className="flex gap-5 items-center font-semibold">
            <div>TRADISTRY</div>
            <div className="flex items-center gap-2">
              </div>
              </div>
              {/* Move the buttons outside and they'll go to the right */}
              <div className="flex items-center gap-5">
              <Link href="/auth/sign-up">
                <Button size="sm" variant="default">GET STARTED</Button>
                </Link>
                <Link href="/auth/login">
                <Button size="sm" variant="outline">Log in</Button>
                </Link>
                </div>
                </div>
                </nav>
        <div className="flex-1 flex flex-col gap-20 max-w-5xl p-5">
          <div className="flex flex-col gap-6 px-4">
            <h2 className="font-medium text-xl mb-4">Welcome to Tradistry</h2>
            <p>
              Tradistry is a platform for trading and investing. It is a work in progress and will be updated regularly.
            </p>
            <p>
              Please sign up or log in to get started.
            </p>
          </div>
          <main className="flex-1 flex flex-col gap-6 px-4">
            <h2 className="font-medium text-xl mb-4">Next steps</h2>
          </main>
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-16">
        </footer>
      </div>
    </main>
  );
}
