import { useState } from 'react';
import { ListItem, TextView, TextStyle, TextColor, IndeterminateLoader, useBackNavigation } from '@wearables-ui-toolkit/mrbd';
import { microphoneFilled, microphoneOutline, speechBubbleQuestionOutline, chevronLeftOutline } from '@wearables-ui-toolkit/icons';
import { askMuse, startTalking, stopTalking, voiceSupported } from '../muse';
import type { Status } from '../data';
import { Screen, useRestoreFocus } from './common';

const PRESETS = ['Are we healthy?', "What's the biggest risk?", 'Next show on air?'];

export function AskScreen({ status }: { status: Status }) {
  const [view, setView] = useState<'list' | 'answer'>('list');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [source, setSource] = useState<'muse' | 'local' | ''>('');
  const [busy, setBusy] = useState(false);
  const [talking, setTalking] = useState(false);
  const [note, setNote] = useState('');
  const [last, setLast] = useState<string | null>(null);

  useRestoreFocus(last, view === 'list');
  useRestoreFocus('ask-back', view === 'answer');
  useBackNavigation(() => { if (view === 'list') return false; setView('list'); });

  async function ask(q: string, from: string) {
    if (!q || busy) return;
    setLast(from); setQuestion(q); setAnswer(''); setSource(''); setBusy(true); setNote(''); setView('answer');
    const a = await askMuse(q, status);
    setAnswer(a.text); setSource(a.source); setBusy(false);
  }

  async function toggleTalk() {
    setNote('');
    if (!talking) {
      try { await startTalking(); setTalking(true); }
      catch { setNote('Microphone unavailable. Pick a question below.'); }
      return;
    }
    setTalking(false);
    try {
      const text = await stopTalking();
      if (text) ask(text, 'ask-voice'); else setNote("Didn't catch that. Try again.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Voice is unavailable right now.');
    }
  }

  if (view === 'answer') {
    return (
      <Screen title="Muse" meta={`“${question}”`}>
        <div className="g-answer" aria-live="polite">
          {busy ? <IndeterminateLoader /> : <TextView textStyle={TextStyle.HEADING2}>{answer}</TextView>}
          {!busy && source === 'local' && (
            <TextView textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>From the live snapshot (Muse is offline)</TextView>
          )}
        </div>
        <ListItem icon={chevronLeftOutline} title="Ask another" data-uit-gid="ask-back" onClick={() => setView('list')} />
      </Screen>
    );
  }

  return (
    <Screen title="Ask Muse" meta={talking ? 'Listening… select to send' : 'Live broadcast & streaming agent'}>
      {voiceSupported() && (
        <ListItem
          icon={talking ? microphoneFilled : microphoneOutline}
          iconTintColor={talking ? 'negative' : 'accent'}
          title={talking ? 'Listening… select to send' : 'Talk to Muse'}
          subtitle={talking ? undefined : 'Select to start, select again to send'}
          data-uit-gid="ask-voice"
          onClick={toggleTalk}
        />
      )}
      {note && <TextView className="g-pad" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>{note}</TextView>}
      {PRESETS.map((p, i) => (
        <ListItem key={p} icon={speechBubbleQuestionOutline} title={p} data-uit-gid={'ask-' + i} onClick={() => ask(p, 'ask-' + i)} />
      ))}
    </Screen>
  );
}
