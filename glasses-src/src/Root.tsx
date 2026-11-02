import { useEffect, useState } from 'react';
import { App, SubNavigationPager } from '@wearables-ui-toolkit/mrbd';
import { circlePlayOutline, triangleAlertOutline, aiStars3Outline, clockOutline } from '@wearables-ui-toolkit/icons';
import { demoStatus, fetchStatus, type Status } from './data';
import { OnAirScreen } from './screens/OnAir';
import { AlertsScreen } from './screens/Alerts';
import { AskScreen } from './screens/Ask';
import { NextScreen } from './screens/Next';

const POLL_MS = 5000;
// ?tab=0..3 opens a specific screen (presenter deep links); ?demo=1 forces demo data.
// ?incident=encoder2 seeds the demo Encoder 2 incident-resolution flow.
const params = new URLSearchParams(location.search);
const START_TAB = Math.min(3, Math.max(0, parseInt(params.get('tab') || '0', 10) || 0));
const FORCE_DEMO = params.get('demo') === '1';
const INCIDENT = params.get('incident') || '';

const TABS = [
  { label: 'On air', icon: circlePlayOutline },
  { label: 'Alerts', icon: triangleAlertOutline },
  { label: 'Ask Muse', icon: aiStars3Outline },
  { label: 'Next up', icon: clockOutline },
];

export function Root() {
  const [status, setStatus] = useState<Status>(() => demoStatus(INCIDENT || undefined));

  useEffect(() => {
    let alive = true;
    const load = () => (FORCE_DEMO || INCIDENT ? Promise.resolve(demoStatus(INCIDENT || undefined)) : fetchStatus()).then((s) => { if (alive) setStatus(s); });
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => { alive = false; window.clearInterval(id); };
  }, []);

  return (
    <App>
      <SubNavigationPager items={TABS} ariaLabel="Muse live ops" defaultPageIndex={START_TAB}>
        <OnAirScreen status={status} />
        <AlertsScreen status={status} onResolve={() => setStatus(demoStatus(INCIDENT || undefined))} />
        <AskScreen status={status} />
        <NextScreen status={status} />
      </SubNavigationPager>
    </App>
  );
}
