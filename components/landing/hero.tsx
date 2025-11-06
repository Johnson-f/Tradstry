"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

export function Hero() {
  return (
    <section className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-4 pt-32 pb-20 sm:px-6 lg:px-8">
      <div className="container mx-auto max-w-5xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-4 py-1.5 text-sm">
          <Sparkles className="size-4" />
          <span>AI-Powered Trading Journal</span>
        </div>
        
        <h1 className="mb-6 text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          Elevate Your Trading
          <span className="block mt-2 bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            Performance
          </span>
        </h1>
        
        <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          Track, analyze, and improve your trading with comprehensive journaling, 
          real-time analytics, and AI-powered insights. Transform your trading journey 
          with data-driven decisions.
        </p>
        
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/auth/sign-up">
            <Button size="lg" className="group shadow-lg">
              Start Trading Journal
              <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
          <Link href="/auth/login">
            <Button size="lg" variant="outline">
              Sign In
            </Button>
          </Link>
        </div>
        
        <p className="mt-6 text-sm text-muted-foreground">
          Free to get started • No credit card required
        </p>
      </div>
    </section>
  );
}

