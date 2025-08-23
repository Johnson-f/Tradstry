'use client';

import type {JSX} from 'react';
import {ContentEditable} from '@lexical/react/LexicalContentEditable';

type Props = {
  className?: string;
  placeholderClassName?: string;
  placeholder: string;
};

export default function LexicalContentEditable({
  className,
  placeholder,
  placeholderClassName,
}: Props): JSX.Element {
  return (
    <ContentEditable
      className={className ?? 'border-0 text-base block relative outline-0 px-12 py-2 pb-10 min-h-[150px] max-lg:px-2'}
      aria-placeholder={placeholder}
      placeholder={
        <div className={placeholderClassName ?? 'text-base text-gray-500 overflow-hidden absolute text-ellipsis top-2 left-12 right-7 select-none whitespace-nowrap inline-block pointer-events-none max-lg:left-2 max-lg:right-2'}>
          {placeholder}
        </div>
      }
    />
  );
}
