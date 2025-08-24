'use client';

import type {JSX} from 'react';
import {ReactNode} from 'react';
import { Button as ShadcnButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function Button({
  'data-test-id': dataTestId,
  children,
  className,
  onClick,
  disabled,
  small,
  title,
}: {
  'data-test-id'?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  small?: boolean;
  title?: string;
}): JSX.Element {
  return (
    <ShadcnButton
      variant="outline"
      size={small ? "sm" : "default"}
      disabled={disabled}
      className={cn(
        "border-0 bg-gray-100 hover:bg-gray-200 text-gray-700",
        className,
      )}
      onClick={onClick}
      title={title}
      aria-label={title}
      {...(dataTestId && {'data-test-id': dataTestId})}>
      {children}
    </ShadcnButton>
  );
}
