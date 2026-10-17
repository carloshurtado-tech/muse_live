import { useEffect } from 'react';
import type React from 'react';
import { Page, VerticalList, TextView, TextStyle, TextColor } from '@wearables-ui-toolkit/mrbd';
import type { Health, Status } from '../data';

export const HEALTH_LABEL: Record<Health, string> = { ok: 'Healthy', warn: 'Degraded', crit: 'Critical', off: 'Off air' };
export const HEALTH_SUBTITLE: Record<Health, 'positive' | 'warning' | 'negative' | 'secondary'> = { ok: 'positive', warn: 'warning', crit: 'negative', off: 'secondary' };

// Tally: red while on air and healthy, amber when degraded, green for a healthy rehearsal.
export function tallyTint(state: string, health: Health): 'negative' | 'warning' | 'positive' | 'secondary' {
  if (health === 'warn' || health === 'crit') return 'warning';
  if (state === 'LIVE') return 'negative';
  if (state === 'REHEARSAL') return 'positive';
  return 'secondary';
}

export function DemoNote({ status }: { status: Status }) {
  if (!status.demo) return null;
  return (
    <TextView className="g-demo" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>
      Demo data · open Muse Live to stream live status
    </TextView>
  );
}

// Pages inside SubNavigationPager: the tab bar floats over the top of the page, so the page
// renders its own compact title below it instead of a Page header (which would collide).
export function Screen({ title, meta, children, scroll = true }: { title: string; meta?: string; children: React.ReactNode; scroll?: boolean }) {
  const head = (
    <div className="g-head">
      <TextView as="h1" textStyle={TextStyle.HEADING2}>{title}</TextView>
      {meta && <TextView textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>{meta}</TextView>}
    </div>
  );
  return (
    <Page showHeader={false}>
      {scroll ? (
        <VerticalList contentClassName="g-list">
          {head}
          {children}
        </VerticalList>
      ) : (
        <div className="g-fill">{head}{children}</div>
      )}
    </Page>
  );
}

// After returning from a detail view, put focus back on the row the wearer came from
// (the toolkit otherwise leaves focus on <body> once the detail unmounts).
export function useRestoreFocus(id: string | null, when: boolean) {
  useEffect(() => {
    if (!when || !id) return;
    const t = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-uit-gid="${CSS.escape(id)}"]`);
      if (el) el.focus({ preventScroll: false });
    }, 60);
    return () => window.clearTimeout(t);
  }, [id, when]);
}
