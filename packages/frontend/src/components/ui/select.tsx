'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

export function Select({ value, onValueChange, children }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      className={cn(
        'flex h-8 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors',
        'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        'appearance-none bg-no-repeat'
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundPosition: 'right 0.5rem center',
        backgroundSize: '1rem',
        paddingRight: '2rem',
      }}
    >
      {children}
    </select>
  );
}

export function SelectTrigger({ 
  children, 
  className 
}: { 
  children: React.ReactNode; 
  className?: string;
}) {
  return (
    <div className={cn('flex h-8 w-full items-center rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm', className)}>
      {children}
    </div>
  );
}

export function SelectValue({ 
  placeholder 
}: { 
  placeholder?: string 
}) {
  return <span className="text-muted-foreground">{placeholder}</span>;
}

export function SelectContent({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  return <>{children}</>;
}

export function SelectItem({ 
  value, 
  children 
}: { 
  value: string; 
  children: React.ReactNode 
}) {
  return <option value={value}>{children}</option>;
}
