'use client';

import type {JSX} from 'react';
import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SelectProps {
  children: React.ReactNode;
  label: string;
  className?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
}

export default function Select({
  children,
  label,
  className,
  value,
  onValueChange,
  placeholder,
}: SelectProps): JSX.Element {
  return (
    <div className="flex flex-row items-center mb-2.5 space-x-2">
      <Label className="text-gray-600 whitespace-nowrap">
        {label}
      </Label>
      <ShadcnSelect value={value} onValueChange={onValueChange}>
        <SelectTrigger className={cn("min-w-[160px] max-w-[290px]", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {children}
        </SelectContent>
      </ShadcnSelect>
    </div>
  );
}

// Export SelectItem for use in components that use this Select
export { SelectItem };
