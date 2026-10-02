'use client';
import { useId, useLayoutEffect, useRef } from 'react';
import { clockToWheel, wheelToClock, type WheelTime } from '@/lib/operations/time-wheel';

const ROW_HEIGHT = 44;
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function Wheel({ label, options, value, disabled, onChange }: {
  label: string; options: string[]; value: number; disabled: boolean; onChange: (value: number) => void;
}) {
  const id = useId(), scroll = useRef<HTMLDivElement>(null), initial = useRef(value);
  useLayoutEffect(() => { if (scroll.current) scroll.current.scrollTop = initial.current * ROW_HEIGHT; }, []);
  const choose = (index: number) => {
    if (disabled) return;
    const next = Math.max(0, Math.min(options.length - 1, index));
    if (scroll.current) scroll.current.scrollTop = next * ROW_HEIGHT;
    onChange(next);
  };
  return <div className="time-wheel-column"><span className="time-wheel-heading" id={`${id}-label`}>{label}</span>
    <div className="time-wheel-window">
      <div ref={scroll} className="time-wheel-scroll" role="listbox" aria-labelledby={`${id}-label`} aria-activedescendant={`${id}-${value}`} aria-disabled={disabled} tabIndex={disabled ? -1 : 0}
        onScroll={e => {
          if (disabled) return;
          const next = Math.max(0, Math.min(options.length - 1, Math.round(e.currentTarget.scrollTop / ROW_HEIGHT)));
          if (next !== value) onChange(next);
        }}
        onKeyDown={e => {
          const offset = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 }[e.key];
          if (offset !== undefined || e.key === 'Home' || e.key === 'End') {
            e.preventDefault(); choose(e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : value + (offset || 0));
          }
        }}>
        {options.map((option, index) => <div id={`${id}-${index}`} key={option} role="option" aria-selected={value === index} className={`time-wheel-option${value === index ? ' selected' : ''}`} onClick={() => choose(index)}>{option}</div>)}
      </div>
    </div>
  </div>;
}

export function TimeWheelPicker({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  const selected = clockToWheel(value);
  const update = (part: Partial<WheelTime>) => onChange(wheelToClock({ ...selected, ...part }));
  return <div className="time-wheel-picker" role="group" aria-label="출석 시간">
    <div className="time-wheel-columns">
      <Wheel label="시" options={HOURS} value={selected.hour} disabled={disabled} onChange={hour => update({ hour })} />
      <Wheel label="분" options={MINUTES} value={selected.minute} disabled={disabled} onChange={minute => update({ minute })} />
    </div>
    <p className="time-wheel-hint">위아래로 스크롤하거나 숫자를 눌러 선택하세요.</p>
    <output className="time-wheel-value" aria-live="polite">{wheelToClock(selected)}</output>
  </div>;
}
