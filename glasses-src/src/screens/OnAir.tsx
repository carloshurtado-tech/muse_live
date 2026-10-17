import { useState } from 'react';
import { ListItem, TextView, TextStyle, TextColor, useBackNavigation } from '@wearables-ui-toolkit/mrbd';
import { circleFilled, chevronLeftOutline, triangleAlertOutline, circleCheckOutline, aiStars3Outline, chartBarOutline } from '@wearables-ui-toolkit/icons';
import { fmtViewers, onAir, recommendationFor, type Status } from '../data';
import { DemoNote, HEALTH_LABEL, HEALTH_SUBTITLE, Screen, tallyTint, useRestoreFocus } from './common';

export function OnAirScreen({ status }: { status: Status }) {
  const [sel, setSel] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const live = onAir(status);
  useRestoreFocus(last, !sel);
  const show = sel ? status.shows.find((s) => s.key === sel) : null;

  useBackNavigation(() => { if (!sel) return false; setSel(null); });

  if (show) {
    return (
      <Screen title={show.name} meta={`${show.state === 'REHEARSAL' ? 'Rehearsal' : 'Live'} · ${HEALTH_LABEL[show.health]}`}>
          <ListItem icon={chevronLeftOutline} title="Back" onClick={() => setSel(null)} />
          <ListItem
            icon={chartBarOutline}
            title={`${fmtViewers(show.viewers)} viewers`}
            subtitle={show.latency != null ? `${show.latency.toFixed(1)} s glass-to-glass` : 'Latency unavailable'}
            onClick={() => {}}
          />
          <ListItem
            icon={show.alerts.length ? triangleAlertOutline : circleCheckOutline}
            iconTintColor={show.alerts.length ? 'warning' : 'positive'}
            title={show.stage || 'All stages healthy'}
            subtitle={show.alerts[0] || 'Encode → contribute → ingest → package → deliver → watch'}
            subtitleMaxLines={3}
            onClick={() => {}}
          />
          <ListItem icon={aiStars3Outline} iconTintColor="accent" title="Muse recommends" subtitle={recommendationFor(show)} subtitleMaxLines={3} onClick={() => {}} />
      </Screen>
    );
  }

  const viewers = live.reduce((a, s) => a + s.viewers, 0);
  return (
    <Screen title="On air" meta={live.length ? `${live.length} streams · ${fmtViewers(viewers)} viewers` : 'Nothing on air'}>
        {live.length === 0 && (
          <TextView textStyle={TextStyle.BODY1} textColor={TextColor.SECONDARY} className="g-pad">Nothing is on air right now.</TextView>
        )}
        {live.map((s) => (
          <ListItem
            key={s.key}
            icon={circleFilled}
            iconTintColor={tallyTint(s.state, s.health)}
            title={s.name}
            subtitle={`${s.state === 'REHEARSAL' ? 'Rehearsal' : 'Live'} · ${HEALTH_LABEL[s.health]} · ${fmtViewers(s.viewers)}${s.latency != null ? ' · ' + s.latency.toFixed(1) + ' s' : ''}`}
            subtitleTextColor={HEALTH_SUBTITLE[s.health]}
            data-uit-gid={'show-' + s.key}
            onClick={() => { setSel(s.key); setLast('show-' + s.key); }}
          />
        ))}
        <DemoNote status={status} />
    </Screen>
  );
}
