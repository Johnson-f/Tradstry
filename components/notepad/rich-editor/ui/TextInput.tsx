'use client';

import type {JSX} from 'react';
import * as React from 'react';
import {HTMLInputTypeAttribute} from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Props = Readonly<{
  'data-test-id'?: string;
  label: string;
  onChange: (val: string) => void;
  placeholder?: string;
  value: string;
  type?: HTMLInputTypeAttribute;
  className?: string;
}>;

export default function TextInput({
  label,
  value,
  onChange,
  placeholder = '',
  'data-test-id': dataTestId,
  type = 'text',
  className,
}: Props): JSX.Element {
  return (
    <div className="flex flex-col space-y-2">
      <Label className="text-sm font-medium text-gray-700">{label}</Label>
      <Input
        type={type}
        className={cn("", className)}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        data-test-id={dataTestId}
      />
    </div>
  );
}
