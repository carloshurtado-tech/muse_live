import { useState } from 'react';
import { ListItem, TextView, TextStyle, TextColor, IndeterminateLoader, useBackNavigation } from '@wearables-ui-toolkit/mrbd';
import { triangleAlertFilled, circleAlertOutline, chevronLeftOutline, circleCheckOutline, speechBubbleQuestionOutline } from '@wearables-ui-toolkit/icons';
import { onAir, recommendationFor, resolveDemoIncident, DEMO_INCIDENT_ID, type Status } from '../data';
import { askMuse } from '../muse';
import { DemoNote, Screen, useRestoreFocus } from './common';

type Item = { id: string; title: string; subtitle: string; detail: string; tint: 'negative' | 'warning' | 'info' };

function sevTint(sev: string): Item['tint'] {
  return sev === 'SEV-1' || sev === 'SEV-2' ? 'negative' : sev === 'SEV-3' ? 'warning' : 'info';
}

export function AlertsScreen({ status, onResolve }: { status: Status; onResolve?: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [fixAnswer, setFixAnswer] = useState<string | null>(null);
  const [fixBusy, setFixBusy] = useState(false);
  useRestoreFocus(last, !sel);
  useBackNavigation(() => { if (!sel) return false; back(); return true; });
  function pick(id: string) { setSel(id); setLast('alert-' + id); setFixAnswer(null); setFixBusy(false); }
  function back() { setSel(null); setFixAnswer(null); setFixBusy(false); }

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

  async function askFix() {
    if (fixBusy || !cur) return;
    setFixBusy(true); setFixAnswer(null);
    try {
      const a = await askMuse('Encoder 2 is showing a black frame for 45 seconds on the Meta Connect 2026 Keynote. The backup path is clean. Should I approve the failover to the backup?', status);
      setFixAnswer(a.text);
    } catch {
      setFixAnswer('Muse is unreachable right now. The backup path is clean — fail over manually from the streaming plan.');
    }
    setFixBusy(false);
  }
  function approve() {
    resolveDemoIncident(DEMO_INCIDENT_ID);
    back();
    try { onResolve && onResolve(); } catch { /* the 5 s poll converges anyway */ }
  }

  if (cur) {
    const isDemo = cur.id === DEMO_INCIDENT_ID;
    return (
      <Screen title={cur.title}>
          <ListItem icon={chevronLeftOutline} title="Back" onClick={back} />
          <TextView className="g-pad" textStyle={TextStyle.BODY1}>{cur.detail}</TextView>
          {isDemo && !fixAnswer && !fixBusy && (
            <ListItem icon={speechBubbleQuestionOutline} title="Ask Muse for the fix" subtitle="Encoder 2 black frame · backup clean" data-uit-gid="alert-fix" onClick={askFix} />
          )}
          {isDemo && fixBusy && <IndeterminateLoader />}
          {isDemo && fixAnswer && (
            <TextView className="g-pad" textStyle={TextStyle.BODY1}>{fixAnswer}</TextView>
          )}
          {isDemo && fixAnswer && !fixBusy && (
            <ListItem icon={circleCheckOutline} iconTintColor="positive" title="Approve failover" subtitle="Fail over to the clean backup path" data-uit-gid="alert-approve" onClick={approve} />
          )}
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
            onClick={() => pick(x.id)}
          />
        ))}
        <DemoNote status={status} />
        {items.length > 0 && <TextView className="g-pad" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>Select an alert for the summary</TextView>}
    </Screen>
  );
}
