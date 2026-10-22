'use client';

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function CollapsibleOverview({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();
  const label = collapsed ? '조회 날짜와 요약 펼치기' : '조회 날짜와 요약 접기';
  return <section className={`ops-overview${collapsed ? ' is-collapsed' : ''}`} aria-label="조회 날짜와 운영 요약">
    <button type="button" className="overview-toggle" aria-label={label} title={label}
      aria-expanded={!collapsed} aria-controls={contentId} onClick={() => setCollapsed(value => !value)}>
      {collapsed ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronUp size={18} aria-hidden="true" />}
    </button>
    <div id={contentId} hidden={collapsed}>{children}</div>
  </section>;
}
