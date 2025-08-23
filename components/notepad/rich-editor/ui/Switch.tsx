'use client';

import type {JSX} from 'react';
import {useMemo} from 'react';

export default function Switch({
  checked,
  onClick,
  text,
  id,
}: Readonly<{
  checked: boolean;
  id?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  text: string;
}>): JSX.Element {
  const buttonId = useMemo(() => 'id_' + Math.floor(Math.random() * 10000), []);
  return (
    <div className="flex items-center gap-2 p-2" id={id}>
      <label htmlFor={buttonId} className="text-sm font-medium text-gray-700">{text}</label>
      <button
        role="switch"
        aria-checked={checked}
        id={buttonId}
        onClick={onClick}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          checked ? 'bg-blue-600' : 'bg-gray-200'
        }`}>
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
