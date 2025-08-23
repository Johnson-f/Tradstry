'use client';

import type {JSX} from 'react';
import {ReactNode} from 'react';
import {createPortal} from 'react-dom';

export interface FlashMessageProps {
  children: ReactNode;
}

export default function FlashMessage({
  children,
}: FlashMessageProps): JSX.Element {
  return createPortal(
    <div className="flex justify-center items-center fixed pointer-events-none top-0 bottom-0 left-0 right-0" role="dialog">
      <p className="bg-black/80 text-white p-5 text-2xl rounded-2xl py-2 px-6" role="alert">
        {children}
      </p>
    </div>,
    document.body,
  );
}
