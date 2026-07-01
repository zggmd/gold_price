'use client';

interface RangeTabsProps {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}

export default function RangeTabs({ value, options, onChange }: RangeTabsProps) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-slate-700/70 bg-slate-900/60 p-1 backdrop-blur">
      {options.map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={
              'min-w-[44px] rounded-lg px-3 py-1.5 text-sm font-medium transition ' +
              (active
                ? 'bg-gold-500 text-slate-900 shadow'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white')
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
