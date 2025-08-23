'use client';

import type {JSX} from 'react';

type SelectIntrinsicProps = JSX.IntrinsicElements['select'];
interface SelectProps extends SelectIntrinsicProps {
  label: string;
}

export default function Select({
  children,
  label,
  className,
  ...other
}: SelectProps): JSX.Element {
  return (
    <div className="flex flex-row items-center mb-2.5">
      <label style={{marginTop: '-1em'}} className="flex flex-1 text-gray-600">
        {label}
      </label>
      <select {...other} className={className || 'min-w-[160px] max-w-[290px] border border-gray-600 rounded px-2 py-1 text-base cursor-pointer leading-relaxed bg-gradient-to-b from-white to-gray-200'}>
        {children}
      </select>
    </div>
  );
}
