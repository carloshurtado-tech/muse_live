/* Muse Live — Incident Reports.
   Structured incident records and blameless post-mortems for live streams and broadcasts:
   severity, impact (viewers, viewer-minutes, platforms), timeline, root cause, contributing
   factors, what went well / wrong, action items with owners, and the telemetry captured at
   the moment the incident was logged. Full-text search with filters; per-show lists in each
   production's Streaming tab; Muse reads it all (search_incidents / get_incident).
   Seeded reports are authored in each show's original date frame and re-dated through
   MuseDemo.shiftISO (rolling demo dates); the live CDN incident is relative to "now". */
(function (root) {
  'use strict';

  var STORE = 'muselive_incidents_v1';
  var SEVS = {
    'SEV-1': 'Full outage of a live destination, or a safety or legal exposure',
    'SEV-2': 'Major viewer-visible degradation, or loss of redundancy on air',
    'SEV-3': 'Minor viewer-visible issue, or a significant rehearsal or test failure',
    'SEV-4': 'No viewer impact: a near miss or process gap'
  };
  var STATUSES = ['Open', 'Monitoring', 'Resolved', 'Closed'];
  var CATEGORIES = ['Contribution', 'Encoding', 'Cloud / packaging', 'CDN / delivery', 'Playback / QoE', 'Captions / accessibility', 'Audio', 'Comms / IFB', 'Network / venue IT', 'Power', 'Process'];

  /* ---------------- seed post-mortems ---------------- */
  var SEED = [
    {
      id: 'INC-2026-0612', production: 'raybangen3', title: 'Primary SRT contribution lost — 38 s of viewer-visible rebuffering before failover to LiveU',
      severity: 'SEV-2', status: 'Closed', category: 'Contribution', postmortem: 'Published',
      started: '2026-06-26T09:14:32-04:00', detected: '2026-06-26T09:14:41-04:00', mitigated: '2026-06-26T09:15:10-04:00', resolved: '2026-06-26T09:18:13-04:00',
      commander: 'Lila Hart', reporter: 'Streaming on-call (TOC)', platforms: ['Facebook Live', 'Instagram Live', 'meta.com/rayban'],
      summary: 'Fourteen minutes into the live Harbor Reveal, the primary SRT contribution from Pier 26 began dropping packets (0% → 18% in 6 s) and MediaLive did not fail over to the LiveU bonded backup for 29 s. That was the 10 s input-loss threshold plus the ramp before the input was declared lost. Viewers on every destination saw rebuffering for about 38 s. After failover the stream ran on LiveU for 3 min, until the fiber recovered and the TOC switched back manually during a planned VT.',
      impact: { viewers_affected: 297000, viewer_minutes: 96400, peak_concurrent: 412000, rebuffer_peak_pct: 7.8, rebuffer_baseline_pct: 0.4, duration_viewer_visible: '38 s', duration_total: '3 m 41 s', sla: 'Breached the 99.9% availability target for the event (99.55%)' },
      root_cause: 'A failing SFP on the venue access switch in the Pier 26 hut flapped the single 1 GbE municipal fiber circuit. SRT at 1,200 ms latency could not recover bursts longer than the buffer, and MediaLive automatic input failover was set to a 10 s input-loss threshold, which was raised after a false failover in rehearsal.',
      contributing: ['Single fiber circuit into the hut. The 5 GHz microwave link was a backup for comms only, not video.', 'Failover threshold raised from 2 s to 10 s after a rehearsal false positive, without a follow-up review.', 'SRT latency sized for a land venue (1,200 ms). Open-water sites need 2,000 ms+ because of harbor RF and longer paths.', 'The SFP showed CRC errors in the switch logs from 08:40, but nobody was watching switch telemetry.'],
      resolution: 'MediaLive failed over to input 2 (LiveU). The TOC switched back to primary at 09:18:13 during a VT once SRT loss held at 0% for 2 min. The SFP was replaced at 09:40 during the post-show.',
      went_well: ['LiveU backup was hot and failover was seamless once triggered.', 'TOC and streaming on-call were on the bridge within 20 s.', 'Return to primary was done during a VT, so it was invisible to viewers.'],
      went_wrong: ['38 s of rebuffering that a 2 s threshold would have cut to about 4 s.', 'No alarm on venue switch CRC errors.', 'Status page and comms to exec stakeholders lagged by 6 minutes.'],
      timeline: [
        ['2026-06-26T08:40:00-04:00', 'Venue switch logs first CRC errors on port Gi1/0/24 (seen in the post-show review)'],
        ['2026-06-26T09:00:00-04:00', 'Harbor Reveal goes live on all destinations'],
        ['2026-06-26T09:14:32-04:00', 'SRT primary packet loss jumps 0% → 18%; RTT 22 → 310 ms'],
        ['2026-06-26T09:14:41-04:00', 'CloudWatch alarm MediaConnect-SourceLoss pages streaming on-call; TAG probe shows freeze on program'],
        ['2026-06-26T09:14:52-04:00', 'Bridge opened in #live-ops-bridge; TOC confirms the LiveU backup is clean'],
        ['2026-06-26T09:15:10-04:00', 'MediaLive input loss threshold reached, auto failover to input 2 (LiveU)'],
        ['2026-06-26T09:15:24-04:00', 'Player QoE recovers: rebuffer back under 1% on all destinations'],
        ['2026-06-26T09:18:13-04:00', 'Primary stable for 2 min, TOC switches back during VT package'],
        ['2026-06-26T09:40:00-04:00', 'Post-show: SFP replaced on venue access switch'],
        ['2026-06-29T14:00:00-04:00', 'Post-mortem review held and published']
      ],
      actions: [
        ['Set MediaLive automatic input failover to a 2 s input-loss threshold on every show; document the rehearsal false positive and its fix', 'Streaming Eng — K. Rhodes', '2026-07-03', 'Done'],
        ['Require diverse-path contribution (second fiber or Starlink with video) for any waterfront or remote venue', 'Technical Production — L. Hart', '2026-07-15', 'Done'],
        ['Raise the SRT latency standard to 2,000 ms for open-water and long-haul sites', 'Streaming Eng — K. Rhodes', '2026-07-03', 'Done'],
        ['Add venue switch SNMP/syslog (CRC, link flaps) to the TOC monitoring wall', 'Network Eng — D. Okafor', '2026-08-01', 'Open'],
        ['Exec stakeholder comms template in the run-of-show: first update within 3 minutes', 'Production Mgmt — M. Chen', '2026-07-10', 'Done']
      ],
      telemetry: { srt_loss_pct_peak: 18.2, srt_rtt_ms_peak: 310, mediaLive_input: 'Failover → input 2 (LiveU)', cdn_5xx_pct: 0.02, rebuffer_pct_peak: 7.8, startup_s_peak: 3.9, viewers_at_start: 401200 },
      tags: ['srt', 'failover', 'medialive', 'liveu', 'fiber', 'harbor', 'sfp']
    },
    {
      id: 'INC-2026-0613', production: 'raybangen3', title: 'Closed captions missing on Facebook Live for 6 minutes',
      severity: 'SEV-3', status: 'Closed', category: 'Captions / accessibility', postmortem: 'Published',
      started: '2026-06-26T09:15:10-04:00', detected: '2026-06-26T09:17:30-04:00', resolved: '2026-06-26T09:21:12-04:00',
      commander: 'Lila Hart', reporter: 'Accessibility QC (viewer report via support)', platforms: ['Facebook Live'],
      summary: 'After the failover in INC-2026-0612, CEA-608 captions stopped on Facebook Live. The LiveU input did not carry the 608 data, because the caption encoder (EEG Falcon) was inserting only on the primary SDI path. WebVTT on meta.com was unaffected.',
      impact: { viewers_affected: 180000, viewer_minutes: 0, duration_viewer_visible: '6 m 02 s', sla: 'Accessibility commitment missed for 6 minutes on one destination' },
      root_cause: 'Caption insertion happened downstream of the primary encoder only. The backup contribution path had no 608 insertion.',
      contributing: ['The rehearsal failover drill was not checked for captions.', 'There was no automated caption-presence monitor per destination.'],
      resolution: 'Captions came back when the TOC switched back to primary at 09:18:13. Facebook ingest needed about 3 minutes to resume 608 rendering.',
      went_well: ['Viewer report escalated by support within 2 minutes.'],
      went_wrong: ['The caption path was not part of the redundancy design.'],
      timeline: [['2026-06-26T09:15:10-04:00', 'Failover to LiveU; 608 data absent on input 2'], ['2026-06-26T09:17:30-04:00', 'Support escalates a viewer report: no captions on Facebook'], ['2026-06-26T09:18:13-04:00', 'Back on primary path'], ['2026-06-26T09:21:12-04:00', 'Facebook player renders captions again']],
      actions: [['Insert captions upstream of the encoder split (program SDI) so both contribution paths carry 608', 'Broadcast Eng — N. Barrett', '2026-07-10', 'Done'], ['Add a caption-presence probe per destination to the monitoring wall', 'Streaming Eng — K. Rhodes', '2026-08-01', 'Open'], ['Add captions to the failover drill checklist', 'Production Mgmt — M. Chen', '2026-07-03', 'Done']],
      telemetry: { captions_608_present: false, webvtt_present: true },
      tags: ['captions', '608', 'accessibility', 'failover']
    },
    {
      id: 'INC-2026-0625', production: 'raybangen3', title: 'Stream test: one LiveU modem on stale firmware, bonded throughput 30% low',
      severity: 'SEV-4', status: 'Closed', category: 'Contribution', postmortem: 'Not required',
      started: '2026-06-25T07:20:00-04:00', detected: '2026-06-25T07:20:00-04:00', resolved: '2026-06-25T08:05:00-04:00',
      commander: 'Kimber Rhodes', reporter: 'Field engineer', platforms: [],
      summary: 'During the LiveU LU800 signal-path test, one 5G modem was on old firmware and negotiated LTE only. Bonded throughput was 14 Mbps against the 20 Mbps target. The unit was updated on site, and the retest held 24 Mbps.',
      impact: { viewers_affected: 0, viewer_minutes: 0, duration_total: '45 m' }, root_cause: 'Firmware drift on a rental unit.',
      contributing: ['No firmware check in the rental receiving checklist.'], resolution: 'Firmware updated, retest passed.',
      went_well: ['Caught a day before air in the planned test window.'], went_wrong: [],
      timeline: [['2026-06-25T07:20:00-04:00', 'Bonded test shows 14 Mbps'], ['2026-06-25T07:45:00-04:00', 'Modem 3 found on old firmware'], ['2026-06-25T08:05:00-04:00', 'Updated; 24 Mbps sustained']],
      actions: [['Add a firmware version check to the rental receiving checklist', 'Field Ops — R. Diaz', '2026-07-01', 'Done']],
      telemetry: { bonded_mbps: 14, modems_up: '4/4 (1 LTE-only)' }, tags: ['liveu', 'firmware', 'test']
    },
    {
      id: 'INC-2026-1017', production: 'museaitour', title: 'Akamai EU-West edge 5xx spikes. Traffic weighted to CloudFront.',
      rel: { started: -28, detected: -26.8, mitigated: -15, timeline: [-35, -28, -26.8, -22, -15, -1] }, // minutes before "now": always today
      severity: 'SEV-2', status: 'Monitoring', category: 'CDN / delivery', postmortem: 'Draft',
      started: '2026-10-17T08:52:00-04:00', detected: '2026-10-17T08:53:10-04:00', mitigated: '2026-10-17T09:06:00-04:00', resolved: null,
      commander: 'Lila Hart', reporter: 'QoE alerting (player beacons)', platforms: ['meta.com/events embed'],
      summary: 'Players in the UK, Ireland and the Netherlands are seeing intermittent HTTP 503s from Akamai EU-West edges on LL-HLS partial segments. Edge 5xx peaks near 2% with cache hit dropping to 93%, which pushes EU rebuffer to about 2%. The CDN weighting was moved from 60/40 to 20/80 in favour of CloudFront for EU about 15 minutes ago. Bursts still recur about every two minutes while Akamai investigates. Facebook and Instagram Live are unaffected because they use their own delivery.',
      impact: { viewers_affected: 86000, viewer_minutes: 0, peak_concurrent: 1240000, rebuffer_peak_pct: 2.3, rebuffer_baseline_pct: 0.35, duration_total: 'ongoing' },
      root_cause: 'Under investigation (Akamai case #EU-44817). Suspected origin-shield cache-key mismatch on LL-HLS part requests after a config push at 08:45.',
      contributing: ['LL-HLS part requests (_part=) are not normalized in the cache key.', 'The CDN switch is manual, with no automated health-based steering per region.'],
      resolution: 'Mitigated by CDN weighting. Watching for a full fix from Akamai.',
      went_well: ['Regional QoE alerting caught it in 70 s.', 'Multi-CDN let us shift traffic in minutes.'],
      went_wrong: ['A manual weighting change needed two approvals and took 13 minutes.'],
      timeline: [['2026-10-17T08:45:00-04:00', 'Akamai property config push (EU-West)'], ['2026-10-17T08:52:00-04:00', 'Edge 5xx starts rising in EU-West'], ['2026-10-17T08:53:10-04:00', 'QoE alert: EU rebuffer > 1%'], ['2026-10-17T08:58:00-04:00', 'Akamai case opened; bridge with CDN partner manager'], ['2026-10-17T09:06:00-04:00', 'EU traffic weighted 20/80 toward CloudFront'], ['2026-10-17T09:20:00-04:00', 'Recurring 30 s bursts still seen; status: monitoring']],
      actions: [['Normalize the LL-HLS _part / _HLS_msn query params in the cache key on both CDNs', 'Streaming Eng — K. Rhodes', '2026-10-24', 'Open'], ['Automate per-region CDN steering on QoE (e.g. a content-steering manifest)', 'Delivery Eng — S. Patel', '2026-11-15', 'Open'], ['Pre-approve emergency CDN weighting changes for SEV-2 and above', 'Technical Production — L. Hart', '2026-10-20', 'Open']],
      telemetry: { cdn_5xx_pct_peak: 1.9, cache_hit_pct_low: 93.4, ttfb_ms_peak: 168, rebuffer_pct_peak: 2.3, eu_viewers: 86000 },
      tags: ['cdn', 'akamai', 'cloudfront', 'll-hls', 'eu', '5xx', 'multi-cdn']
    },
    {
      id: 'INC-2026-0718', production: 'museaitour', title: 'IFB 3 dropout to the field host during the technical rehearsal',
      severity: 'SEV-3', status: 'Closed', category: 'Comms / IFB', postmortem: 'Published',
      started: '2026-07-18T10:42:00-04:00', detected: '2026-07-18T10:42:00-04:00', resolved: '2026-07-18T10:58:00-04:00',
      commander: 'Noah Barrett', reporter: 'A1', platforms: [],
      summary: 'IFB 3 (RVON) to the outside-announce host dropped intermittently for 16 minutes in the technical rehearsal. The RVON card was sharing a VLAN with the venue guest Wi-Fi uplink, and jitter peaked at 80 ms.',
      impact: { viewers_affected: 0, viewer_minutes: 0, duration_total: '16 m' }, root_cause: 'RVON on a shared VLAN without QoS.',
      contributing: ['Venue IT changed VLAN assignments overnight.'], resolution: 'Moved RVON to the dedicated production VLAN with DSCP EF marking.',
      went_well: ['Caught in rehearsal, not on air.'], went_wrong: ['No sign-off on venue VLAN changes after the network survey.'],
      timeline: [['2026-07-18T10:42:00-04:00', 'Host reports IFB 3 breaking up'], ['2026-07-18T10:50:00-04:00', 'Jitter traced to the shared VLAN'], ['2026-07-18T10:58:00-04:00', 'Moved to the production VLAN; clean']],
      actions: [['Lock production VLANs with venue IT, with change control through T+0', 'Network Eng — D. Okafor', '2026-07-19', 'Done']],
      telemetry: { rvon_jitter_ms_peak: 80 }, tags: ['ifb', 'rvon', 'comms', 'vlan', 'qos', 'linear']
    },
    {
      id: 'INC-2026-1016', production: 'museailaunch', title: 'Dress rehearsal: iOS players stalled on LL-HLS partial segments',
      severity: 'SEV-3', status: 'Resolved', category: 'Playback / QoE', postmortem: 'In review',
      started: '2026-10-16T10:25:00-04:00', detected: '2026-10-16T10:27:00-04:00', resolved: '2026-10-16T11:40:00-04:00',
      commander: 'Kimber Rhodes', reporter: 'Player QA', platforms: ['meta.ai keynote embed'],
      summary: 'In the full dress rehearsal, iOS Safari players stalled every 20–40 s. MediaPackage was advertising 0.5 s partial segments while the encoder GOP was 2 s with a 1 s part target, and EXT-X-PART-INF did not match the actual part durations. Android and desktop (hls.js) were fine.',
      impact: { viewers_affected: 60, viewer_minutes: 0, duration_total: '1 h 15 m (rehearsal only)' },
      root_cause: 'The LL-HLS part target was misaligned between the encoder and the packager after a template change.',
      contributing: ['There was no LL-HLS conformance check (Apple mediastreamvalidator) in the pre-flight.'],
      resolution: 'Aligned the part target to 0.33 s with a 2 s GOP and republished the endpoint. Player QA passed at 11:40.',
      went_well: ['Found a day before the keynote.'], went_wrong: ['The template change was not peer reviewed.'],
      timeline: [['2026-10-16T10:25:00-04:00', 'iOS stalls start'], ['2026-10-16T10:52:00-04:00', 'Part duration mismatch identified with mediastreamvalidator'], ['2026-10-16T11:30:00-04:00', 'Packager endpoint republished'], ['2026-10-16T11:40:00-04:00', 'QA pass on iOS, Android and desktop']],
      actions: [['Run mediastreamvalidator in the T-24h checklist', 'Streaming Eng — K. Rhodes', '2026-10-17', 'Done'], ['Peer review for packager template changes', 'Delivery Eng — S. Patel', '2026-10-31', 'Open']],
      telemetry: { ios_stall_interval_s: 30, part_target_s: 0.5, gop_s: 2 }, tags: ['ll-hls', 'ios', 'mediapackage', 'rehearsal']
    },
    {
      id: 'INC-2026-1009', production: 'whatsapp', title: 'Stream test: LL-HLS glass-to-glass latency 9 s vs 4 s target',
      severity: 'SEV-4', status: 'Open', category: 'Cloud / packaging', postmortem: 'Draft',
      started: '2026-10-09T14:00:00-04:00', detected: '2026-10-09T14:10:00-04:00', resolved: null,
      commander: 'Kimber Rhodes', reporter: 'Streaming Eng', platforms: [],
      summary: 'The end-to-end stream test from Miami measured 9 s glass-to-glass. The player buffer was set to 3 target durations on 6 s segments because the standard-HLS template had been applied to the LL endpoint.',
      impact: { viewers_affected: 0, viewer_minutes: 0 }, root_cause: 'Wrong packaging template on the LL endpoint (suspected; retest pending).',
      contributing: [], resolution: 'Pending retest with the LL template.', went_well: [], went_wrong: [],
      timeline: [['2026-10-09T14:00:00-04:00', 'Stream test begins'], ['2026-10-09T14:10:00-04:00', 'Latency measured at 9 s with a clapper/timecode burn-in']],
      actions: [['Retest with the LL template; target ≤ 4.5 s', 'Streaming Eng — K. Rhodes', '2026-10-23', 'Open']],
      telemetry: { latency_s: 9.1, segment_s: 6 }, tags: ['latency', 'll-hls', 'test']
    },
    {
      id: 'INC-2026-1002', production: 'orion', title: 'Venue firewall blocks outbound UDP 5000 (SRT). Change request pending.',
      severity: 'SEV-4', status: 'Open', category: 'Network / venue IT', postmortem: 'Not required',
      started: '2026-10-02T11:00:00-07:00', detected: '2026-10-02T11:00:00-07:00', resolved: null,
      commander: 'Daniel Okafor', reporter: 'Site survey', platforms: [],
      summary: 'The site-survey connectivity test at Levi\'s Stadium (Santa Clara) found that the stadium firewall drops outbound UDP 5000–5010, so SRT caller mode to MediaConnect cannot connect from the broadcast compound. RTMPS on 443 works. A change request was filed with Levi\'s Stadium IT.',
      impact: { viewers_affected: 0, viewer_minutes: 0 }, root_cause: 'Default venue egress policy.', contributing: [],
      resolution: 'Pending venue IT change. Fallback: SRT listener on MediaConnect over TCP 443 is not possible, so use the LiveU-only path if the change misses T-7d.',
      went_well: ['Caught at survey, months ahead.'], went_wrong: [],
      timeline: [['2026-10-02T11:00:00-07:00', 'Survey test: SRT connect timeout'], ['2026-10-03T09:00:00-07:00', 'Change request filed with venue IT']],
      actions: [['Get the venue firewall change approved and tested', 'Network Eng — D. Okafor', '2027-01-15', 'Open']],
      telemetry: {}, tags: ['firewall', 'srt', 'venue', 'survey']
    },
    {
      id: 'INC-2026-0206', production: 'charm', title: 'Loudness jump on Facebook Live: EBU R128 program hit ATSC-normalized ingest',
      severity: 'SEV-3', status: 'Closed', category: 'Audio', postmortem: 'Published',
      started: '2026-02-06T20:00:00+01:00', detected: '2026-02-06T20:04:00+01:00', resolved: '2026-02-06T20:31:00+01:00',
      commander: 'Lila Hart', reporter: 'Social team (viewer comments)', platforms: ['Facebook Live', 'Instagram Live'],
      summary: 'The Milan program was mixed to -23 LUFS (EBU R128). Facebook\'s ingest normalization and the US-default -24 LKFS on the encoder\'s audio processing applied a second gain stage, so walk-in music jumped about +3 dB and clipped on true peak. Viewers commented that it was too loud.',
      impact: { viewers_affected: 140000, viewer_minutes: 0, duration_viewer_visible: '27 m' },
      root_cause: 'Double loudness processing: the encoder AGC was enabled with a US preset on an EU show.',
      contributing: ['The encoder template was carried over from a US show.'], resolution: 'Disabled encoder AGC and set the limiter at -1 dBTP.',
      went_well: ['The social team relayed viewer comments fast.'], went_wrong: ['No loudness meter on the return feeds from the platforms.'],
      timeline: [['2026-02-06T20:00:00+01:00', 'Keynote live'], ['2026-02-06T20:04:00+01:00', 'Viewer comments: audio too loud'], ['2026-02-06T20:31:00+01:00', 'AGC disabled; levels at target']],
      actions: [['Region-specific encoder audio templates (EBU vs ATSC)', 'Broadcast Eng — N. Barrett', '2026-03-01', 'Done'], ['Loudness meter on the platform return feeds', 'Streaming Eng — K. Rhodes', '2026-03-15', 'Done']],
      telemetry: { program_lufs: -23, platform_return_lufs: -20.1, true_peak_dbtp: 0.4 }, tags: ['loudness', 'ebu r128', 'audio', 'agc']
    },
    {
      id: 'INC-2026-1010', production: 'igcreators', title: 'Route test: Verizon modem congestion near Herald Square, bonded bitrate dipped to 4 Mbps',
      severity: 'SEV-4', status: 'Resolved', category: 'Contribution', postmortem: 'Not required',
      started: '2026-10-10T12:20:00-04:00', detected: '2026-10-10T12:20:00-04:00', resolved: '2026-10-10T12:41:00-04:00',
      commander: 'Kimber Rhodes', reporter: 'Field engineer', platforms: [],
      summary: 'On the takeover route test, cell congestion at Herald Square (lunch hour) dropped one carrier to near zero, and bonded throughput dipped to 4 Mbps for 90 s. The 9:16 ladder top rung needs 6 Mbps.',
      impact: { viewers_affected: 0, viewer_minutes: 0 }, root_cause: 'Carrier congestion at a dense site.', contributing: ['No private 5G / CBRS slice booked for the event.'],
      resolution: 'Booked carrier priority (FirstNet-style event slice) for Nov 27, plus a Starlink Mini on the float cam.',
      went_well: ['Route test done at the same time of day as the show.'], went_wrong: [],
      timeline: [['2026-10-10T12:20:00-04:00', 'Bitrate dips to 4 Mbps'], ['2026-10-10T12:41:00-04:00', 'Recovered as crowds thinned']],
      actions: [['Confirm the carrier priority booking for Nov 27', 'Field Ops — R. Diaz', '2026-11-10', 'Open']],
      telemetry: { bonded_mbps_low: 4.1, modems_up: '3/4' }, tags: ['liveu', 'cellular', 'bonded', 'route test']
    }
  ];

  /* ---------------- store ---------------- */
  var SEED_BY_ID = {}; SEED.forEach(function (x) { SEED_BY_ID[x.id] = x; });
  var list = load();
  var alignedWith = null;
  function shiftOne(key, iso) {
    if (!iso) return iso;
    try { if (root.MuseDemo && typeof root.MuseDemo.shiftISO === 'function') { var r = root.MuseDemo.shiftISO(key, iso); if (r) return new Date(r).toISOString(); } } catch (e) {}
    return iso;
  }
  function relISO(min) { return new Date(Date.now() + min * 60000).toISOString(); }
  // Re-date every seeded report from its original timestamps (user edits and added entries are kept).
  function alignSeeds() {
    var sig = (root.MuseDemo && root.MuseDemo.shiftISO ? 'demo' : 'raw') + ':' + new Date().toDateString();
    if (sig === alignedWith) return; alignedWith = sig;
    list.forEach(function (r) {
      var sd = SEED_BY_ID[r.id]; if (!sd) return;
      ['started', 'detected', 'mitigated', 'resolved'].forEach(function (f) {
        if (f === 'resolved' && r._userResolved) return;
        if (sd.rel && sd.rel[f] != null) r[f] = relISO(sd.rel[f]);
        else if (sd[f] !== undefined) r[f] = sd[f] ? shiftOne(sd.production, sd[f]) : sd[f];
      });
      (sd.timeline || []).forEach(function (t, n) {
        if (r.timeline[n] && r.timeline[n].text === t[1]) r.timeline[n].t = sd.rel && sd.rel.timeline ? relISO(sd.rel.timeline[n]) : shiftOne(sd.production, t[0]);
      });
    });
  }
  function load() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) {}
    if (saved && Array.isArray(saved.items)) {
      // keep user edits, add any seed the browser has not seen yet
      var have = {}; saved.items.forEach(function (i) { have[i.id] = 1; });
      SEED.forEach(function (s) { if (!have[s.id]) saved.items.push(norm(s)); });
      return saved.items;
    }
    return SEED.map(norm);
  }
  function norm(i) {
    var o = JSON.parse(JSON.stringify(i));
    o.timeline = (o.timeline || []).map(function (t) { return Array.isArray(t) ? { t: t[0], text: t[1] } : t; });
    o.actions = (o.actions || []).map(function (a) { return Array.isArray(a) ? { text: a[0], owner: a[1], due: a[2], status: a[3] } : a; });
    delete o.rel;
    return o;
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ items: list })); } catch (e) {} }

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function P() { return root.productions || {}; }
  function prodName(k) { return P()[k] ? P()[k].name : (k || '—'); }
  function fmt(iso) {
    if (!iso) return '—';
    var d = new Date(iso); if (isNaN(d)) return iso;
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function dur(a, b) {
    if (!a) return '—'; var ms = (b ? new Date(b) : new Date()) - new Date(a); if (isNaN(ms) || ms < 0) return '—';
    var m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }
  function words(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9.\-]+/g, ' ').split(' ').filter(function (w) { return w.length > 1; }); }
  function haystack(i) {
    return [i.id, i.title, prodName(i.production), i.production, P()[i.production] && P()[i.production].venue, i.severity, i.status, i.category, i.summary, i.root_cause,
      (i.contributing || []).join(' '), i.resolution, (i.tags || []).join(' '), (i.platforms || []).join(' '), i.commander, i.reporter,
      (i.timeline || []).map(function (t) { return t.text; }).join(' '), (i.actions || []).map(function (a) { return a.text + ' ' + a.owner; }).join(' ')].join(' ').toLowerCase();
  }
  // Scored search: title/id/show/tag hits weigh more than body hits; every word must match somewhere.
  function search(q, f) {
    alignSeeds(); f = f || {};
    var ws = words(q).filter(function (w) { return ['what', 'happened', 'at', 'the', 'event', 'show', 'did', 'any', 'incident', 'incidents', 'for', 'on', 'in', 'with', 'was', 'were', 'is', 'are', 'there'].indexOf(w) < 0; });
    return list.filter(function (i) {
      if (f.production && i.production !== f.production) return false;
      if (f.severity && i.severity !== f.severity) return false;
      if (f.status && i.status !== f.status) return false;
      if (f.category && i.category !== f.category) return false;
      return true;
    }).map(function (i) {
      if (!ws.length) return { i: i, s: 1 };
      var hay = haystack(i), head = (i.id + ' ' + i.title + ' ' + prodName(i.production) + ' ' + (i.tags || []).join(' ')).toLowerCase().replace(/-/g, ' ') + ' ' + (i.id + ' ' + i.title + ' ' + prodName(i.production)).toLowerCase();
      var s = 0, all = true, headC = head.replace(/[\s\-]/g, ''), hayC = hay.replace(/[\s\-]/g, ''); // "rayban" matches "Ray-Ban"
      ws.forEach(function (w) { var stem = w.replace(/s$/, ''); if (head.indexOf(stem) >= 0 || headC.indexOf(stem) >= 0) s += 3; else if (hay.indexOf(stem) >= 0 || hayC.indexOf(stem) >= 0) s += 1; else all = false; });
      return { i: i, s: all ? s : 0 };
    }).filter(function (x) { return x.s > 0; })
      .sort(function (a, b) { return b.s - a.s || a.i.severity.localeCompare(b.i.severity) || new Date(b.i.started) - new Date(a.i.started); })
      .map(function (x) { return x.i; });
  }
  function get(id) { alignSeeds(); id = String(id || '').toUpperCase(); return list.filter(function (i) { return i.id === id; })[0] || null; }

  /* ---------------- rendering ---------------- */
  var ui = { q: '', production: '', severity: '', status: '', category: '', sel: null };
  function sevBadge(s) { return '<span class="mi-sev is-' + String(s).toLowerCase().replace('-', '') + '">' + esc(s) + '</span>'; }
  function statusBadge(s) { return '<span class="mi-status is-' + String(s).toLowerCase() + '">' + esc(s) + '</span>'; }
  function rowHTML(i, compact) {
    var open = (i.actions || []).filter(function (a) { return a.status !== 'Done'; }).length;
    return '<button type="button" class="mi-row' + (ui.sel === i.id && !compact ? ' is-sel' : '') + '" onclick="MuseIncidents.open(\'' + i.id + '\')">' +
      '<div class="mi-row-top">' + sevBadge(i.severity) + statusBadge(i.status) + '<span class="mi-id">' + i.id + '</span><span class="mi-when">' + fmt(i.started) + '</span></div>' +
      '<div class="mi-row-title">' + esc(i.title) + '</div>' +
      '<div class="mi-row-meta">' + esc(prodName(i.production)) + ' · ' + esc(i.category) + (i.impact && i.impact.viewers_affected ? ' · ' + Number(i.impact.viewers_affected).toLocaleString() + ' viewers affected' : '') + (open ? ' · ' + open + ' open action' + (open > 1 ? 's' : '') : '') + '</div></button>';
  }
  function listHTML(items, opts) { opts = opts || {}; return items.length ? '<div class="mi-list' + (opts.compact ? ' is-compact' : '') + '">' + items.map(function (i) { return rowHTML(i, opts.compact); }).join('') + '</div>' : ''; }
  /* ---------------- context: schedule at the time + similar past incidents ---------------- */
  var STOP = ['the', 'and', 'for', 'with', 'from', 'into', 'over', 'after', 'before', 'during', 'show', 'live', 'stream'];
  function tokens(i) { return words((i.title || '') + ' ' + (i.tags || []).join(' ') + ' ' + (i.category || '')).filter(function (w) { return w.length > 2 && STOP.indexOf(w) < 0; }); }
  function similar(i) {
    var a = tokens(i);
    return list.filter(function (x) { return x.id !== i.id; }).map(function (x) {
      var b = tokens(x), inter = a.filter(function (t) { return b.indexOf(t) >= 0; }).length;
      var tagHits = (i.tags || []).filter(function (t) { return (x.tags || []).indexOf(t) >= 0; }).length;
      return { x: x, s: inter / (Math.sqrt(a.length * b.length) || 1) + (x.category === i.category ? 0.3 : 0) + tagHits * 0.15 };
    }).filter(function (o) { return o.s >= 0.35; }).sort(function (p, q) { return q.s - p.s; }).slice(0, 3).map(function (o) { return o.x; });
  }
  function contextHTML(i) {
    var from = i.started, to = i.resolved || i.mitigated || new Date(new Date(i.started).getTime() + 2 * 36e5).toISOString();
    var bks = [], names = {};
    try {
      if (root.MuseSchedule) {
        (root.MuseSchedule.resources() || []).forEach(function (r) { names[r.id] = r.name; });
        bks = root.MuseSchedule.bookings({ prod: i.production, from: from, to: to }) || [];
      }
    } catch (e) {}
    var state = ''; try { state = root.MuseStreaming.stateOf(i.production); } catch (e) {}
    var sched = bks.length ? '<ul class="mi-ctx-list">' + bks.slice(0, 8).map(function (b) {
      return '<li><b>' + esc(names[b.res] || b.res) + '</b><span>' + esc(b.title) + ' · ' + fmt(b.start) + ' – ' + fmt(b.end) + (b.onAir ? ' · <em>ON AIR</em>' : '') + ' · ' + esc(b.status) + '</span></li>';
    }).join('') + '</ul>' : '<p class="mi-muted">No Muse Schedule bookings overlap this incident window.</p>';
    var sim = similar(i), fixes = [];
    sim.forEach(function (x) { (x.actions || []).forEach(function (a) { if (a.status === 'Done' && fixes.length < 5 && !fixes.some(function (f) { return f.text === a.text; })) fixes.push({ text: a.text, id: x.id }); }); });
    return '<section><h3>Stream &amp; schedule at the time</h3>' +
        '<p class="mi-d-meta">Window ' + fmt(from) + ' – ' + fmt(to) + ' · stream state now: ' + esc(state || '—') + ' · <button type="button" class="ms-link" onclick="MuseStreaming.openShow(\'' + i.production + '\')">Open the streaming tab</button></p>' + sched + '</section>' +
      '<section><h3>Similar past incidents</h3>' + (sim.length ? listHTML(sim, { compact: true }) : '<p class="mi-muted">No similar incidents on record.</p>') +
        (fixes.length ? '<h4 class="mi-h4">Recommended fixes (proven on similar incidents)</h4><ul class="mi-ul">' + fixes.map(function (f) { return '<li>' + esc(f.text) + ' <span class="mi-muted">(' + f.id + ')</span></li>'; }).join('') + '</ul>' : '') + '</section>';
  }
  function bullets(a) { return a && a.length ? '<ul class="mi-ul">' + a.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p class="mi-muted">—</p>'; }
  function detailHTML(i) {
    if (!i) return '<div class="mi-empty"><p>Select an incident to read the report.</p></div>';
    var im = i.impact || {};
    var kpis = [['Duration', im.duration_total || dur(i.started, i.resolved)], ['Viewer-visible', im.duration_viewer_visible || '—'], ['Viewers affected', im.viewers_affected != null ? Number(im.viewers_affected).toLocaleString() : '—'], ['Viewer-minutes lost', im.viewer_minutes ? Number(im.viewer_minutes).toLocaleString() : '—'], ['Time to detect', dur(i.started, i.detected)], ['Time to mitigate', dur(i.started, i.mitigated || i.resolved)]];
    var tele = i.telemetry && Object.keys(i.telemetry).length ? '<div class="mi-tele">' + Object.keys(i.telemetry).map(function (k) { var v = i.telemetry[k]; return '<div><span>' + esc(k.replace(/_/g, ' ')) + '</span><b>' + esc(typeof v === 'object' ? JSON.stringify(v) : v) + '</b></div>'; }).join('') + '</div>' : '<p class="mi-muted">No telemetry captured.</p>';
    return '<article class="mi-detail">' +
      '<header class="mi-d-head"><div class="mi-row-top">' + sevBadge(i.severity) +
        '<select class="mi-status-sel" aria-label="Status" onchange="MuseIncidents.setStatus(\'' + i.id + '\',this.value)">' + STATUSES.map(function (s) { return '<option' + (s === i.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
        '<span class="mi-id">' + i.id + '</span><span class="mi-when">Post-mortem: ' + esc(i.postmortem || 'Draft') + '</span></div>' +
        '<h2>' + esc(i.title) + '</h2>' +
        '<p class="mi-d-meta"><button type="button" class="ms-link" onclick="MuseStreaming.openShow(\'' + i.production + '\')">' + esc(prodName(i.production)) + '</button> · ' + esc(i.category) + ' · Incident commander ' + esc(i.commander || '—') + ' · Reported by ' + esc(i.reporter || '—') + (i.platforms && i.platforms.length ? ' · ' + esc(i.platforms.join(', ')) : '') + '</p>' +
        '<div class="mi-d-actions"><button type="button" class="ms-btn ms-btn-primary" onclick="museaiAsk(\'Brief me on incident ' + i.id + '\')">Ask Muse to brief me</button><button type="button" class="ms-btn" onclick="MuseIncidents.copy(\'' + i.id + '\')">Copy post-mortem</button></div>' +
      '</header>' +
      '<div class="mi-kpis">' + kpis.map(function (k) { return '<div><span>' + k[0] + '</span><b>' + esc(k[1]) + '</b></div>'; }).join('') + '</div>' +
      (im.sla ? '<p class="mi-sla">' + esc(im.sla) + '</p>' : '') +
      '<section><h3>Summary</h3><p>' + esc(i.summary) + '</p></section>' +
      '<section><h3>Timeline</h3><ol class="mi-timeline">' + (i.timeline || []).map(function (t) { return '<li><time>' + fmt(t.t) + '</time><span>' + esc(t.text) + '</span></li>'; }).join('') + '</ol>' +
        '<form class="mi-inline" onsubmit="event.preventDefault();MuseIncidents.addTimeline(\'' + i.id + '\',this)"><input name="text" placeholder="Add a timeline entry (timestamped now)" aria-label="Timeline entry" required><button class="ms-btn">Add</button></form></section>' +
      '<section><h3>Root cause</h3><p>' + esc(i.root_cause || '—') + '</p></section>' +
      '<section><h3>Contributing factors</h3>' + bullets(i.contributing) + '</section>' +
      '<section><h3>Resolution</h3><p>' + esc(i.resolution || '—') + '</p></section>' +
      '<div class="mi-two"><section><h3>What went well</h3>' + bullets(i.went_well) + '</section><section><h3>What went wrong</h3>' + bullets(i.went_wrong) + '</section></div>' +
      '<section><h3>Action items</h3><div class="mi-actions">' + (i.actions || []).map(function (a, n) {
        return '<label class="mi-action' + (a.status === 'Done' ? ' is-done' : '') + '"><input type="checkbox" ' + (a.status === 'Done' ? 'checked ' : '') + 'onchange="MuseIncidents.toggleAction(\'' + i.id + '\',' + n + ',this.checked)"><span class="mi-a-text">' + esc(a.text) + '</span><span class="mi-a-meta">' + esc(a.owner || '') + (a.due ? ' · due ' + esc(a.due) : '') + '</span></label>';
      }).join('') + '</div>' +
        '<form class="mi-inline" onsubmit="event.preventDefault();MuseIncidents.addAction(\'' + i.id + '\',this)"><input name="text" placeholder="New action item" aria-label="Action item" required><input name="owner" placeholder="Owner" aria-label="Owner"><input name="due" type="date" aria-label="Due date"><button class="ms-btn">Add</button></form></section>' +
      '<section><h3>Telemetry at the time of the incident</h3>' + tele + '</section>' +
      contextHTML(i) +
      (i.tags && i.tags.length ? '<p class="mi-tags">' + i.tags.map(function (t) { return '<span>#' + esc(t) + '</span>'; }).join('') + '</p>' : '') +
    '</article>';
  }
  function filters() {
    var ks = (root.order || Object.keys(P())).filter(function (k) { return P()[k]; });
    function sel(name, label, opts) { return '<select aria-label="' + label + '" onchange="MuseIncidents.filter(\'' + name + '\',this.value)"><option value="">' + label + '</option>' + opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (ui[name] === v ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>'; }
    return sel('production', 'All shows', ks.map(function (k) { return [k, prodName(k)]; })) + sel('severity', 'Any severity', Object.keys(SEVS)) + sel('status', 'Any status', STATUSES) + sel('category', 'Any category', CATEGORIES);
  }
  function render() {
    var host = document.getElementById('incidentsHost'); if (!host) return;
    alignSeeds();
    var items = search(ui.q, ui);
    if (!ui.sel || !items.some(function (i) { return i.id === ui.sel; })) ui.sel = items[0] ? items[0].id : null;
    var open = list.filter(function (i) { return i.status === 'Open' || i.status === 'Monitoring'; }).length;
    var sev12 = list.filter(function (i) { return i.severity === 'SEV-1' || i.severity === 'SEV-2'; }).length;
    var acts = 0; list.forEach(function (i) { (i.actions || []).forEach(function (a) { if (a.status !== 'Done') acts++; }); });
    var mttr = list.filter(function (i) { return i.resolved; }).map(function (i) { return (new Date(i.resolved) - new Date(i.started)) / 60000; });
    var mttrAvg = mttr.length ? Math.round(mttr.reduce(function (a, b) { return a + b; }, 0) / mttr.length) : 0;
    host.innerHTML = '<div class="ms-wrap">' +
      '<div class="ms-page-h"><div><h1>Incident Reports</h1><p>Blameless post-mortems for every live stream and broadcast: what happened, the impact, the root cause and follow-ups.</p></div>' +
        '<button type="button" class="ms-btn ms-btn-primary" onclick="MuseIncidents.openNew()">+ New incident</button></div>' +
      '<div class="ms-kpis"><div><span>Open / monitoring</span><b>' + open + '</b></div><div><span>SEV-1 / SEV-2 this year</span><b>' + sev12 + '</b></div><div><span>Mean time to resolve</span><b>' + (mttrAvg >= 60 ? Math.floor(mttrAvg / 60) + ' h ' + (mttrAvg % 60) + ' m' : mttrAvg + ' min') + '</b></div><div><span>Open action items</span><b>' + acts + '</b></div></div>' +
      '<div class="mi-search"><input id="miSearch" type="search" value="' + esc(ui.q) + '" placeholder="Search incidents: show, venue, symptom, gear, owner… e.g. “Ray-Ban failover”, “captions”, “CDN”" aria-label="Search incidents" oninput="MuseIncidents.query(this.value)">' +
        '<div class="mi-filters">' + filters() + '</div></div>' +
      '<div class="mi-layout"><div class="mi-col-list"><p class="mi-count">' + items.length + ' report' + (items.length === 1 ? '' : 's') + '</p>' + (listHTML(items) || '<p class="mi-muted">No incidents match.</p>') + '</div>' +
        '<div class="mi-col-detail" id="miDetail">' + detailHTML(get(ui.sel)) + '</div></div></div>';
  }
  function rerender() {
    render();
    // the streaming tab of the affected show lists incidents too
    try { var a = document.querySelector('.view-pane.active'); var k = a && a.id.replace(/^view-/, ''); if (P()[k]) root.renderProjectView(k); } catch (e) {}
  }

  /* ---------------- new incident ---------------- */
  function openNew(key) {
    var ks = (root.order || Object.keys(P())).filter(function (k) { return P()[k]; });
    var now = new Date(); var local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    var ov = document.createElement('div'); ov.className = 'mi-modal'; ov.id = 'miNew';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'New incident');
    ov.onclick = function (e) { if (e.target === ov) ov.remove(); };
    ov.innerHTML = '<form class="mi-modal-box" onsubmit="event.preventDefault();MuseIncidents.create(this)">' +
      '<h2>New incident</h2><p class="mi-muted">The current stream telemetry for the show is attached automatically, for the post-mortem.</p>' +
      '<label>Title<input name="title" required placeholder="e.g. Program stream frozen on Instagram Live"></label>' +
      '<div class="mi-grid2"><label>Show<select name="production">' + ks.map(function (k) { return '<option value="' + k + '"' + (k === key ? ' selected' : '') + '>' + esc(prodName(k)) + '</option>'; }).join('') + '</select></label>' +
      '<label>Severity<select name="severity">' + Object.keys(SEVS).map(function (s) { return '<option value="' + s + '"' + (s === 'SEV-3' ? ' selected' : '') + '>' + s + ' — ' + esc(SEVS[s]) + '</option>'; }).join('') + '</select></label>' +
      '<label>Category<select name="category">' + CATEGORIES.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label>Started<input name="started" type="datetime-local" value="' + local + '" required></label></div>' +
      '<label>What is happening<textarea name="summary" rows="3" required placeholder="Symptoms, which destinations, what viewers see"></textarea></label>' +
      '<div class="mi-grid2"><label>Incident commander<input name="commander" placeholder="Name"></label><label>Viewers affected (estimate)<input name="viewers" type="number" min="0" placeholder="0"></label></div>' +
      '<div class="mi-modal-btns"><button type="button" class="ms-btn" onclick="document.getElementById(\'miNew\').remove()">Cancel</button><button type="submit" class="ms-btn ms-btn-primary">Log incident</button></div></form>';
    document.body.appendChild(ov);
    setTimeout(function () { var t = ov.querySelector('input[name=title]'); if (t) t.focus(); }, 30);
  }
  function nextId() {
    var y = new Date().getFullYear(), n = 0;
    list.forEach(function (i) { var m = new RegExp('^INC-' + y + '-N(\\d+)$').exec(i.id); if (m) n = Math.max(n, +m[1]); });
    return 'INC-' + y + '-N' + String(n + 1).padStart(3, '0');
  }
  function snapshotTele(key) {
    var tele = {};
    try { var sm = root.MuseStreaming.summary(key); var pr = sm.streams[0]; if (pr && typeof pr.telemetry === 'object') { tele = JSON.parse(JSON.stringify(pr.telemetry)); tele.health = pr.health; tele.data_source = pr.data_source && pr.data_source.viewers; } } catch (e) {}
    return tele;
  }
  // Programmatic create (Muse, pre-flight, proactive alerts). Returns the saved record.
  function createRecord(o) {
    o = o || {};
    if (!o.production || !P()[o.production]) throw new Error('Unknown production "' + (o.production || '') + '"');
    var now = new Date().toISOString();
    var rec = norm({ id: nextId(), production: o.production, title: String(o.title || 'Untitled incident').slice(0, 160),
      severity: SEVS[o.severity] ? o.severity : 'SEV-3', status: 'Open', category: CATEGORIES.indexOf(o.category) >= 0 ? o.category : 'Process', postmortem: 'Draft',
      started: o.started ? new Date(o.started).toISOString() : now, detected: now, commander: String(o.commander || ''), reporter: o.reporter || (root.currentUserName && root.currentUserName()) || 'Muse Live user',
      summary: String(o.summary || ''), impact: { viewers_affected: Number(o.viewers) || 0 },
      timeline: (o.timeline || []).map(function (t) { return Array.isArray(t) ? t : [t.t || now, t.text]; }).concat([[now, 'Incident logged in Muse Live']]),
      actions: [], telemetry: o.telemetry || snapshotTele(o.production), tags: o.tags || [] });
    list.unshift(rec); save();
    try { var v = document.getElementById('view-incidents'); if (v && v.classList.contains('active')) render(); } catch (e) {}
    return rec;
  }
  var CAT_OF_STAGE = { cdn: 'CDN / delivery', contribution: 'Contribution', encoder: 'Encoding', cloud: 'Cloud / packaging', origin: 'Cloud / packaging', viewers: 'Playback / QoE' };
  // Unsaved draft built from what the telemetry shows right now (for Muse's proactive alerts).
  function draftFromTelemetry(key) {
    var an = [], log = [], h = {};
    try { an = root.MuseStreaming.anomalies().filter(function (a) { return a.key === key; }); } catch (e) {}
    try { log = root.MuseStreaming.anomalyLog(key) || []; } catch (e) {}
    try { h = root.MuseStreaming.health(key) || {}; } catch (e) {}
    an.sort(function (a, b) { return (b.level === 'crit') - (a.level === 'crit'); });
    var w = an[0], viewers = h.viewers || 0;
    var sev = !w ? 'SEV-4' : w.level === 'crit' ? (viewers > 100000 ? 'SEV-2' : 'SEV-3') : (viewers > 500000 ? 'SEV-3' : 'SEV-4');
    return {
      saved: false, production: key, show: prodName(key),
      title: w ? (w.text.split(' · ')[0] + ' on ' + prodName(key)) : 'No active anomalies on ' + prodName(key),
      severity: sev, category: w ? (CAT_OF_STAGE[w.stage] || 'Process') : 'Process',
      summary: an.length ? 'Detected from live telemetry: ' + an.map(function (a) { return a.text; }).join('; ') + '.' + (viewers ? ' ' + Number(viewers).toLocaleString() + ' concurrent viewers at detection.' : '') : 'No active anomalies.',
      started: log.length ? log[0].t : new Date().toISOString(),
      timeline: log.map(function (l) { return [l.t, l.text]; }),
      viewers: w && w.level === 'crit' ? viewers : 0,
      telemetry: snapshotTele(key), recommendations: an.map(function (a) { return a.recommendation; })
    };
  }
  function create(form) {
    var rec = createRecord({ production: form.production.value, title: form.title.value.trim(), severity: form.severity.value, category: form.category.value,
      started: new Date(form.started.value).toISOString(), commander: form.commander.value.trim(), summary: form.summary.value.trim(), viewers: form.viewers.value });
    var id = rec.id;
    var m = document.getElementById('miNew'); if (m) m.remove();
    ui.sel = id; ui.q = ''; root.toast && root.toast(id + ' logged');
    if (document.getElementById('view-incidents') && document.getElementById('view-incidents').classList.contains('active')) render(); else root.navGo('incidents');
  }

  function markdown(i) {
    var im = i.impact || {};
    return ['# ' + i.id + ' — ' + i.title, '', '**Show:** ' + prodName(i.production) + '  ', '**Severity:** ' + i.severity + ' · **Status:** ' + i.status + ' · **Category:** ' + i.category + '  ',
      '**Started:** ' + fmt(i.started) + ' · **Resolved:** ' + fmt(i.resolved) + '  ', '**Incident commander:** ' + (i.commander || '—'), '',
      '## Impact', '- Viewers affected: ' + (im.viewers_affected != null ? im.viewers_affected : '—'), '- Viewer-minutes lost: ' + (im.viewer_minutes || '—'), '- Viewer-visible duration: ' + (im.duration_viewer_visible || '—'), im.sla ? '- ' + im.sla : '',
      '', '## Summary', i.summary, '', '## Timeline'].concat((i.timeline || []).map(function (t) { return '- ' + fmt(t.t) + ' — ' + t.text; }))
      .concat(['', '## Root cause', i.root_cause || '—', '', '## Contributing factors']).concat((i.contributing || []).map(function (c) { return '- ' + c; }))
      .concat(['', '## Resolution', i.resolution || '—', '', '## Action items']).concat((i.actions || []).map(function (a) { return '- [' + (a.status === 'Done' ? 'x' : ' ') + '] ' + a.text + ' — ' + (a.owner || '') + (a.due ? ' (due ' + a.due + ')' : ''); }))
      .join('\n');
  }

  /* ---------------- public API ---------------- */
  var MI = root.MuseIncidents = {
    all: function () { alignSeeds(); return list.slice(); },
    get: get,
    search: search,
    byProduction: function (key) { alignSeeds(); return list.filter(function (i) { return i.production === key; }).sort(function (a, b) { return new Date(b.started) - new Date(a.started); }); },
    listHTML: listHTML,
    render: render,
    open: function (id) { ui.sel = id; if (document.getElementById('view-incidents') && document.getElementById('view-incidents').classList.contains('active')) render(); else { ui.q = ''; ui.production = ''; ui.severity = ''; ui.status = ''; ui.category = ''; ui.sel = id; root.navGo('incidents'); } },
    query: function (q) {
      ui.q = q; var pos = null, el = document.getElementById('miSearch'); if (el) pos = el.selectionStart;
      render(); el = document.getElementById('miSearch'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (e) {} }
    },
    filter: function (name, v) { ui[name] = v; render(); },
    setStatus: function (id, s) {
      var i = get(id); if (!i) return; i.status = s;
      if ((s === 'Resolved' || s === 'Closed') && !i.resolved) { i.resolved = new Date().toISOString(); i._userResolved = true; }
      i.timeline.push({ t: new Date().toISOString(), text: 'Status → ' + s }); save(); rerender();
    },
    addTimeline: function (id, form) { var i = get(id); if (!i) return; i.timeline.push({ t: new Date().toISOString(), text: form.text.value.trim() }); save(); rerender(); },
    addAction: function (id, form) { var i = get(id); if (!i) return; i.actions.push({ text: form.text.value.trim(), owner: form.owner.value.trim(), due: form.due.value, status: 'Open' }); save(); rerender(); },
    toggleAction: function (id, n, done) { var i = get(id); if (!i || !i.actions[n]) return; i.actions[n].status = done ? 'Done' : 'Open'; save(); rerender(); },
    openNew: openNew, create: create, createRecord: createRecord, draftFromTelemetry: draftFromTelemetry, similar: similar,
    copy: function (id) { var i = get(id); if (!i) return; try { navigator.clipboard.writeText(markdown(i)); root.toast && root.toast('Post-mortem copied as Markdown'); } catch (e) {} },
    // For Muse
    brief: function (i) {
      var open = (i.actions || []).filter(function (a) { return a.status !== 'Done'; });
      return { id: i.id, show: prodName(i.production), title: i.title, severity: i.severity, status: i.status, category: i.category, started: i.started, resolved: i.resolved,
        duration: (i.impact && i.impact.duration_total) || dur(i.started, i.resolved), viewers_affected: i.impact && i.impact.viewers_affected, summary: i.summary, open_action_items: open.length };
    },
    full: function (i) { var o = JSON.parse(JSON.stringify(i)); o.show = prodName(i.production); o.time_to_detect = dur(i.started, i.detected); o.time_to_mitigate = dur(i.started, i.mitigated || i.resolved); return o; },
    severities: SEVS
  };
})(typeof window !== 'undefined' ? window : globalThis);
