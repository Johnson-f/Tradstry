'use client';

import type {JSX} from 'react';
import {useMemo} from 'react';
import { Switch as ShadcnSwitch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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
  
  const handleCheckedChange = (newChecked: boolean) => {
    // Create a synthetic mouse event to maintain compatibility
    const syntheticEvent = {
      currentTarget: { checked: newChecked },
      preventDefault: () => {},
      stopPropagation: () => {},
    } as React.MouseEvent<HTMLButtonElement, MouseEvent>;
    onClick(syntheticEvent);
  };

  return (
    <div className="flex items-center gap-2 p-2" id={id}>
      <Label htmlFor={buttonId} className="text-sm font-medium text-gray-700">
        {text}
      </Label>
      <ShadcnSwitch
        id={buttonId}
        checked={checked}
        onCheckedChange={handleCheckedChange}
      />
    </div>
  );
}
