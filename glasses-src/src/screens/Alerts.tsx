import { useState } from 'react';
import { ListItem, TextView, TextStyle, TextColor, useBackNavigation } from '@wearables-ui-toolkit/mrbd';
import { triangleAlertFilled, circleAlertOutline, chevronLeftOutline, circleCheckOutline } from '@wearables-ui-toolkit/icons';
import { onAir, recommendationFor, type Status } from '../data';
import { DemoNote, Screen, useRestoreFocus } from './common';

type Item = { id: string; title: string; subtitle: string; detail: string; tint: 'negative' | 'warning' | 'info' };

function sevTint(sev: string): Item['tint'] {
  return sev === 'SEV-1' || sev === 'SEV-2' ? 'negative' : sev === 'SEV-3' ? 'warning' : 'info';
}

export function AlertsScreen({ status }: { status: Status }) {
  const [sel, setSel] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  useRestoreFocus(last, !sel);
  useBackNavigation(() => { if (!sel) return false; setSel(null); });

  const items: Item[] = [];
  onAir(status).forEach((s) => s.alerts.forEach((a, i) => items.push({
    id: `a-${s.key}-${i}`, title: s.name, subtitle: a, tint: s.health === 'crit' ? 'negative' : 'warning',
    detail: `${s.stage ? s.stage + ': ' : ''}${a}. ${recommendationFor(s)}`,
  })));
  status.openIncidents.forEach((inc) => items.push({
    id: inc.id, title: `${inc.severity} · ${inc.id}`, subtitle: inc.title, tint: sevTint(inc.severity),
    detail: `${inc.show}. ${inc.title}`,
  }));

  const cur = items.find((x) => x.id === sel);
  if (cur) {
    return (
      <Screen title={cur.title}>
          <ListItem icon={chevronLeftOutline} title="Back" onClick={() => setSel(null)} />
          <TextView className="g-pad" textStyle={TextStyle.BODY1}>{cur.detail}</TextView>
      </Screen>
    );
  }

  return (
    <Screen title="Alerts" meta={`${items.length} active`}>
        {items.length === 0 && (
          <ListItem icon={circleCheckOutline} iconTintColor="positive" title="All clear" subtitle="No alerts or open incidents" onClick={() => {}} />
        )}
        {items.map((x) => (
          <ListItem
            key={x.id}
            icon={x.id.startsWith('a-') ? triangleAlertFilled : circleAlertOutline}
            iconTintColor={x.tint}
            title={x.title}
            subtitle={x.subtitle}
            subtitleMaxLines={2}
            data-uit-gid={'alert-' + x.id}
            onClick={() => { setSel(x.id); setLast('alert-' + x.id); }}
          />
        ))}
        <DemoNote status={status} />
        {items.length > 0 && <TextView className="g-pad" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>Select an alert for the summary</TextView>}
    </Screen>
  );
}
