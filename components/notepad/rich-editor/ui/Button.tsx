'use client';

import type {JSX} from 'react';
import {ReactNode} from 'react';

import joinClasses from '../utils/joinClasses';

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
    <button
      disabled={disabled}
      className={joinClasses(
        // Base button styles
        'py-2.5 px-4 border-0 bg-gray-200 rounded cursor-pointer text-sm hover:bg-gray-300',
        // Small variant
        small && 'py-1.5 px-2.5 text-xs',
        // Disabled state
        disabled && 'cursor-not-allowed hover:bg-gray-200',
        className,
      )}
      onClick={onClick}
      title={title}
      aria-label={title}
      {...(dataTestId && {'data-test-id': dataTestId})}>
      {children}
    </button>
  );
}
