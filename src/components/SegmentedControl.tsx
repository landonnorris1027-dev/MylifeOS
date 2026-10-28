import React from 'react';

interface Props {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
  /**
   * `segmented` is a filter inside a form (aria-pressed).
   * `navigation` switches the whole view, so the active item is aria-current="page"
   * and the group behaves like a toolbar: one tab stop, arrow keys move between items.
   */
  kind?: 'segmented' | 'navigation';
}

/** Equal tracks keep the shared selection plate stable across font/viewport changes. */
export default function SegmentedControl({ label, value, options, onChange, className = '', kind = 'segmented' }: Props) {
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  const isNavigation = kind === 'navigation';

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isNavigation) return;
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (selected + step + options.length) % options.length;
    onChange(options[next].value);
    event.currentTarget.querySelectorAll('button')[next]?.focus();
  };

  return (
    <div
      role={isNavigation ? 'navigation' : 'group'}
      aria-label={label}
      className={`motion-segments ${className}`}
      style={{ '--segments': options.length, '--selected': selected } as React.CSSProperties}
      onKeyDown={handleKeyDown}
    >
      <span className="motion-segment-plate" aria-hidden="true" />
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            type="button"
            key={option.value}
            aria-current={isNavigation && active ? 'page' : undefined}
            aria-pressed={isNavigation ? undefined : active}
            tabIndex={isNavigation && !active ? -1 : undefined}
            className="motion-segment-button"
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
