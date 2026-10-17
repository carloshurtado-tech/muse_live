import { useEffect, useState } from 'react';
import { TextView, TextStyle, TextColor } from '@wearables-ui-toolkit/mrbd';
import { Screen } from './common';
import type { Status } from '../data';

function countdown(ms: number) {
  if (ms <= 0) return 'On air';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (d ? d + 'd ' : '') + pad(h) + ':' + pad(m) + ':' + pad(sec);
}

export function NextScreen({ status }: { status: Status }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  const next = status.next;

  return (
    <Screen title="Next up" scroll={false}>
      <div className="g-next">
        {next ? (
          <>
            <TextView textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>Next on air</TextView>
            <TextView textStyle={TextStyle.HEADING1}>{next.name}</TextView>
            <TextView className="g-count" textStyle={TextStyle.NUMERAL1} aria-live="off">{countdown(next.startsAt - now)}</TextView>
            <TextView textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
              {new Date(next.startsAt).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}{next.venue ? ' · ' + next.venue : ''}
            </TextView>
          </>
        ) : (
          <TextView textStyle={TextStyle.BODY1} textColor={TextColor.SECONDARY}>Nothing scheduled.</TextView>
        )}
      </div>
    </Screen>
  );
}
