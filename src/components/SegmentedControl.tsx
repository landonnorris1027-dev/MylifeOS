import React from 'react';

interface Props {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
}

/** Equal tracks keep the shared selection plate stable across font/viewport changes. */
export default function SegmentedControl({ label, value, options, onChange, className = '' }: Props) {
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  return (
    <div role="group" aria-label={label} className={`motion-segments ${className}`}
      style={{ '--segments': options.length, '--selected': selected } as React.CSSProperties}>
      <span className="motion-segment-plate" aria-hidden="true" />
      {options.map(option => <button type="button" key={option.value} aria-pressed={value === option.value}
        className="motion-segment-button" onClick={() => onChange(option.value)}>{option.label}</button>)}
    </div>
  );
}
