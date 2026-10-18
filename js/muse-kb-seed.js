/* Muse Live Wiki — seed encyclopedia (live television broadcast). */
(function (root) {
  'use strict';
  function row(ns, title, kind, team, cats, text, extra) {
    extra = extra || {};
    return {
      ns: ns, title: title, kind: kind, team: team, cats: cats, text: text,
      barcode: extra.barcode || '', show: extra.show || '', verified: extra.verified
    };
  }
  root.MUSE_WIKI_SEED = function () {
    return [
      row('Template', 'Hatnote', 'template', '', ['Templates'], "{{{1}}}"),
      row('Template', 'Main', 'template', '', ['Templates'], "Main article: [[{{{1}}}]]"),
      row('Template', 'See also', 'template', '', ['Templates'], "See also: [[{{{1}}}]]"),
      row('Template', 'Procedure', 'template', '', ['Templates'], "Day-of procedure — EIC verifies before air."),

      row('', 'Main_Page', 'article', 'ENG', ['Muse Live'],
        "{{Stats}}\n{{Hub}}\n\n'''Muse Live Wiki''' is the plan-of-record knowledge base for '''live television broadcast'''. It is the place an engineer, producer, technical manager, TOC operator, or truck A1 goes to find how a box powers up, how it is repaired, and what to do when the picture dies.\n\nThis is not a generic wiki. Pages are tagged by department so [[Muse Live:About|Muse]] and the truck can retrieve them in one search.\n\n== Equipment ==\nSystem cameras, box lenses, consoles, wireless, leaf switches, bonded cellular, production switchers, EVS, intercom, and the 2110 plant.\n\n* [[Sony HDC-5500]] · [[Sony HDC-5500]] · [[Fujinon UA80x9]]\n* [[Calrec Artemis]] · [[Shure Axient Digital AD4Q + AD1]] · [[RTS ADAM]] · [[RTS ADAM]]\n* [[Cisco Catalyst 9300]] · [[SMPTE ST 2110]] · [[TAC-12 fiber]]\n* [[LiveU LU800]] · [[Grass Valley Kayenne]] · [[EVS XT-VIA]] · [[APC Smart-UPS SRT 8kVA UPS]]\n\n== Manuals ==\nField power-up, pinouts, firmware. Start at [[Manual:Sony HDC-5500]], [[Manual:Shure Axient Digital AD4Q + AD1]], [[Manual:Calrec Artemis]], [[Manual:LiveU LU800]], [[Manual:Cisco Catalyst 9300]], [[Manual:Grass Valley Kayenne]].\n\n== Repairs ==\nWhat actually failed, and the FRU that fixed it: [[Repair:Sony HDC-5500 CCU no LINK]], [[Repair:Axient AD4Q RF dropout]], [[Repair:LiveU LU800 under 12 Mbps]], [[Repair:Nexus 9336C PSU fail]], [[Repair:Calrec Artemis no MADI]], [[Repair:TAC-12 bulkhead pin damage]], [[Repair:Truck UPS batteries]].\n\n== Troubleshooting ==\nDecision trees for air. Start at the source, not the TOC monitor.\n\n* [[Troubleshooting:No picture at TOC]]\n* [[Troubleshooting:Truck voltage sag]]\n* [[Troubleshooting:RF 200 kHz clash]]\n* [[Troubleshooting:No program audio]]\n* [[Troubleshooting:IFB talent cannot hear]]\n* [[Troubleshooting:2110 PTP unlocked]]\n* [[Troubleshooting:REMI delay over budget]]\n* [[Troubleshooting:Encoder freeze on air]]\n\n== Day-of procedures ==\n* [[Fiber bulkhead strike]]\n* [[GNG weather hold]]\n* [[Sony HDC-5500 power-up]]\n* [[LiveU LU800 failover]]\n* [[Day-of RF scan]]\n* [[Shore to gen transfer]]\n\n== Help ==\n* [[Help:Contents]] — how this wiki is organized\n* [[Help:Wikitext]] — markup used on every page\n* [[Help:Integration]] — Muse + Action API\n* [[Sandbox]] — safe place to edit\n* [[Special:AllPages]] · [[Special:RecentChanges]] · [[Special:ApiSandbox]]\n"),

      row('Muse Live', 'About', 'article', 'ENG', ['Muse Live'],
        "'''Muse Live Wiki''' is the knowledge plane of Muse Live, the Meta Broadcast Operations.\n\nIt stores procedures, equipment manuals, repair notes, troubleshooting trees, specs, schematics, and incident logs — tagged by department so Muse can answer \"how do I power up an Sony HDC-5500\" from the same pages the EIC edits.\n\nSitename: Muse Live Wiki. Article path in the app: Wiki rail. CSRF for the in-app Action API is the MediaWiki anonymous token <code>+\\</code>.\n\nNot Wikipedia. Not a switcher. Not an NLE."),

      row('', 'Sandbox', 'article', 'ENG', ['Muse Live'],
        "'''Sandbox''' — edit freely. This page is for trying wikitext: headings, lists, infoboxes, and <code>[[links]]</code>.\n\n== Try it ==\n# Click '''Edit'''\n# Change this list\n# Save with a summary\n\nSee also [[Help:Wikitext]]."),

      row('Talk', 'Main_Page', 'talk', 'ENG', ['Muse Live'],
        "== Welcome ==\nUse talk pages for EIC notes that should not live in the procedure itself (vendor loaners, compound politics, \"do not unmate this TAC-12\"). Keep day-of truth on the article."),

      row('Help', 'Contents', 'help', 'ENG', ['Help', 'Muse Live'],
        "{{Hatnote|Human guide to the Muse Live knowledge base.}}\n\n'''Help:Contents''' explains how knowledge is filed so anyone on the truck can find it.\n\n== What belongs here ==\n; Equipment\n: One article per box or plant system, with an infobox (manufacturer, power, connectors, barcode).\n; Manuals\n: Namespace <code>Manual:</code> — power-up, pinouts, firmware. Link from the equipment article.\n; Repairs\n: Namespace <code>Repair:</code> — symptom, cause, field fix, parts. Link from the equipment article.\n; Troubleshooting\n: Decision trees. Start at the source (camera, CCU, encoder), not the TOC monitor.\n; Procedures\n: Day-of steps (strike, GNG, RF scan). Numbered lists. Mark '''verified''' after EIC sign-off.\n; Incidents\n: What actually happened. Hardware-in-the-loop and compound faults land here automatically.\n\n== How to search ==\nType a model, barcode, or department in the search box. Muse uses the same index — ask \"how do I fail over LiveU LU800\" without opening Wiki first.\n\n== How to edit ==\nArticle / Talk · Read / Edit / History. Wikitext, not a mystery editor. Summary + minor. History compares two revisions.\n\n== Namespaces ==\nMain · Talk · Muse Live · Help · Category · Manual · Repair · Template · Special\n"),

      row('Help', 'Wikitext', 'help', 'ENG', ['Help'],
        "== Basics ==\n* <code>'''bold'''</code> and <code>''italic''</code>\n* <code>[[Sony HDC-5500]]</code> or <code>[[Sony HDC-5500|the 5500]]</code>\n* <code>[[Category:Cameras]]</code> (hidden from prose, listed under the article)\n* Headings: <code>== Section ==</code> <code>=== Sub ===</code>\n* Lists: <code>*</code> bullets, <code>#</code> numbered\n* <code>#REDIRECT [[Target]]</code>\n\n== Infobox ==\n<pre>{{Infobox equipment\n| name = Sony HDC-5500\n| manufacturer = Sony\n| type = System camera\n| department = Cameras\n| power = 240 V / 2.5 A\n| connector = SMPTE 304\n| barcode = MUSE-EQ-341506\n}}</pre>\n\n== Tables ==\n<pre>{| class=\"wikitable\"\n! Pin !! Signal\n|-\n| 1 || DC\n|}</pre>\n\nRedlinks (missing pages) are spectrum red. Create them — that is how the knowledge base grows."),

      row('Help', 'Integration', 'help', 'ENG', ['Help', 'Muse Live'],
        "{{Hatnote|How Muse and bots read this wiki.}}\n\n== Muse ==\nMuseAi retrieves wiki chunks via <code>MuseKB.chunksForMuseAi(q)</code>. Procedures, specs, trees, and gear keywords (fiber bulkhead, RF 200 kHz, Sony HDC-5500, LiveU LU800, Calrec, Axient, Nexus, no picture, voltage sag) answer from these pages.\n\n== Action API (in-app) ==\nSame verbs as MediaWiki, no PHP:\n\n* <code>MuseKB.action({ action:'query', meta:'siteinfo', siprop:'general|namespaces|statistics' })</code>\n* <code>action:'parse', page:'Sony HDC-5500'</code>\n* <code>action:'edit', title:'Sandbox', text:'…', token:'+\\\\'</code>\n* <code>action:'opensearch', search:'API'</code>\n\nAnonymous CSRF <code>+\\</code> is accepted. Try [[Special:ApiSandbox]].\n\n== REST-shaped helpers ==\n<code>MuseKB.bySlug</code> · <code>MuseKB.search</code> · <code>MuseKB.parse</code> · <code>MuseKB.openByTitle</code>"),

      /* ---- Equipment ---- */
      row('', "Sony HDC-5500", 'equipment', 'Cameras', ['Equipment', 'Cameras', '4K'],
        "{{Infobox equipment\n| name = Sony HDC-5500\n| manufacturer = Sony\n| type = 4K/HDR system camera\n| department = Cameras\n| power = 240 V · 2.5 A at CCU\n| connector = SMPTE 304 fiber\n| format = 3840×2160 / 1080p HDR\n| barcode = MUSE-EQ-341506\n| spare = HDC-3100\n| firmware = match CCU HDCU-5500\n}}\n{{Main|Manual:Sony HDC-5500}}\n\nThe '''Sony HDC-5500''' is the hard-cam / studio 4K system camera on tentpole trucks. CCU is the [[Sony HDCU-3500]]. Pair with [[Fujinon UA80x9]] on sticks + wedge.\n\n== Role on the truck ==\n* Game / ceremony hard cams and tower positions\n* Fiber first, then DC — never hot-plug the SMPTE with iris open\n* Paint: 3200 K tungsten / 5600 K daylight as booked\n\n== Power and connectors ==\nCCU HDCU-5500 on 240 V / 20 A. Typical draw 2.5 A. Fiber is SMPTE 304 to the camera head. Confirm LINK green before opening iris.\n\n== Related manuals and repairs ==\n* [[Manual:Sony HDC-5500]] — power-up\n* [[Sony HDC-5500 power-up]] — day-of procedure\n* [[Repair:Sony HDC-5500 CCU no LINK]]\n* [[Troubleshooting:No picture at TOC]]\n\n== Inventory ==\nBarcode checkout on PackList before the camera leaves the bay.", { barcode: "MUSE-EQ-341506" }),

      row('', "Sony HDCU-3500", 'equipment', 'Cameras', ['Equipment', 'Cameras'],
        "{{Infobox equipment\n| name = Sony HDCU-3500\n| manufacturer = Sony\n| type = Camera control unit\n| department = Cameras\n| power = 240 V / 20 A\n| connector = SMPTE 304 + BNC + SDI/2110\n| barcode = MUSE-CCU-100482\n}}\nCCU for [[Sony HDC-5500]]. Lives in the camera bay. Dual power if the truck supports it. LINK LED is the first question on [[Troubleshooting:No picture at TOC]].\n\nSee [[Manual:Sony HDC-5500]] and [[Repair:Sony HDC-5500 CCU no LINK]].", { barcode: 'MUSE-CCU-100482' }),

      row('', "Sony HDC-5500", 'equipment', 'Cameras', ['Equipment', 'Cameras'],
        "{{Infobox equipment\n| name = Sony HDC-5500\n| manufacturer = Sony\n| type = HD/4K system camera\n| department = Cameras\n| power = 240 V at CCU\n| connector = SMPTE fiber\n| barcode = MUSE-CAM-100350\n}}\nWorkhorse system camera on mid-size shows and Muse AI World Tour sidelines. Same fiber-then-DC discipline as the [[Sony HDC-5500]]. Spare paint setup in the CCU scene file.\n\n[[Category:Specs]]", { barcode: 'MUSE-CAM-100350' }),

      row('', "Fujinon UA80x9", 'equipment', 'Cameras', ['Equipment', 'Cameras'],
        "{{Infobox equipment\n| name = Fujinon UA80x9\n| manufacturer = Canon\n| type = 90x box lens\n| department = Cameras\n| connector = B4 / support wedge\n| barcode = MUSE-EQ-338198\n| spare = UJ86x9\n}}\n90x box lens. Pair with [[Sony HDC-5500]] hard cam. Support: heavy sticks + wedge. Do not walk the head with the lens unlocked.\n\nSee [[Sony HDC-5500 power-up]].", { barcode: "MUSE-EQ-338198" }),

      row('', "Calrec Artemis", 'equipment', 'Audio', ['Equipment', 'Audio'],
        "{{Infobox equipment\n| name = Calrec Artemis\n| manufacturer = Calrec\n| type = Digital broadcast console\n| department = Audio\n| power = dual PSU, separate phases\n| connector = MADI / AES67\n| barcode = MUSE-AUD-330010\n}}\nTentpole truck mixer. MADI and AES67 to the plant. Confirm both PSUs before rehearsal. If program is gone, do not rebuild the show file on air — see [[Troubleshooting:No program audio]] and [[Repair:Calrec Artemis no MADI]].\n\n[[Manual:Calrec Artemis]]", { barcode: 'MUSE-AUD-330010' }),

      row('', "Shure Axient Digital AD4Q + AD1", 'equipment', 'RF', ['Equipment', 'RF'],
        "{{Infobox equipment\n| name = Shure Axient Digital AD4Q + AD1\n| manufacturer = Sennheiser\n| type = Quad digital wireless receiver\n| department = RF\n| power = 12 V DC / AC brick\n| connector = BNC antenna, analog/AES out\n| barcode = MUSE-EQ-633334\n| spare = wired lav\n}}\nQuad receiver. Coordinate '''±200 kHz''' versus other UHF. Spare path is wired lav / IFB. Clash response: [[RF 200 kHz clash response]]. Dropout repair: [[Repair:Axient AD4Q RF dropout]]. Manual: [[Manual:Shure Axient Digital AD4Q + AD1]].", { barcode: "MUSE-EQ-633334" }),

      row('', "Cisco Catalyst 9300", 'equipment', 'TX', ['Equipment', 'Networking', '2110'],
        "{{Infobox equipment\n| name = Cisco Catalyst 9300\n| manufacturer = Cisco\n| type = 2110 leaf switch\n| department = TX\n| power = dual PSU, separate phases\n| connector = QSFP / fiber\n| barcode = MUSE-NET-9336C\n}}\nLeaf for the [[SMPTE ST 2110]] fabric. Keep dual PSUs on '''separate phases'''. PTP is a plant problem, not a camera problem — [[Troubleshooting:2110 PTP unlocked]]. PSU fail: [[Repair:Nexus 9336C PSU fail]].", { barcode: 'MUSE-NET-9336C' }),

      row('', 'SMPTE ST 2110', 'spec', 'TX', ['Specs', 'Networking', '2110', 'Equipment'],
        "{{Infobox equipment\n| name = SMPTE ST 2110\n| type = Essence-over-IP suite\n| department = TX\n| format = 2110-10/-20/-30/-40 + 2059 PTP\n}}\nPlant format on modern trucks. Video, audio, and ancillary on separate flows. Timing is [[Troubleshooting:2110 PTP unlocked|PTP (ST 2059)]]. Leaf: [[Cisco Catalyst 9300]]. Do not duplicate the live hop chain here — open Broadcast Ops for the path; this page is the spec.\n\n== Related ==\n* [[TAC-12 fiber]]\n* [[Troubleshooting:No picture at TOC]]"),

      row('', 'TAC-12 fiber', 'equipment', 'TX', ['Equipment', 'Fiber', 'TX'],
        "{{Infobox equipment\n| name = TAC-12 SMPTE fiber\n| type = Ruggedized 12-strand\n| department = TX\n| connector = expanded-beam / SMPTE hybrid\n}}\nCompound backbone between truck bulkhead and venue. '''Caps on immediately. Photograph both ends before unmate.''' Procedure: [[Fiber bulkhead strike]]. Pin damage: [[Repair:TAC-12 bulkhead pin damage]]. Schematic note: [[Muse AI World Tour finale signal path (MPK)]]."),

      row('', "LiveU LU800", 'equipment', 'TX', ['Equipment', 'TX'],
        "{{Infobox equipment\n| name = LiveU LU800\n| manufacturer = LiveU LU800\n| type = Bonded cellular encoder\n| department = TX\n| power = 12–19 V DC, do not cycle on air\n| connector = SDI in, bonded LTE/5G\n| barcode = MUSE-TX-LU800\n}}\nBonded contribution. Watch Mbps at TOC. If '''< 12 Mbps for 8 s''', TOC hits backup — do not power-cycle mid-hit. [[LiveU LU800 failover]] · [[Repair:LiveU LU800 under 12 Mbps]] · [[Manual:LiveU LU800]].", { barcode: 'MUSE-TX-LU800' }),

      row('', "Grass Valley Kayenne", 'equipment', 'ENG', ['Equipment', 'ENG'],
        "{{Infobox equipment\n| name = Grass Valley Kayenne\n| manufacturer = Grass Valley\n| type = Production switcher\n| department = ENG\n| power = dual PSU\n| connector = SDI / 2110\n}}\nSwitcher in PCR. ME layout lives in the show file. Do not load yesterday's file after paint. Manual: [[Manual:Grass Valley Kayenne]]. If program out dies, check PTP and the leaf before reseating the panel."),

      row('', "EVS XT-VIA", 'equipment', 'ENG', ['Equipment', 'ENG'],
        "{{Infobox equipment\n| name = EVS XT-VIA\n| manufacturer = EVS\n| type = Live slow-motion server\n| department = ENG\n| connector = SDI / 2110\n}}\nReplay server. Record ports must be armed before toss. If the operator has no record, it is often PTP or a 2110 flow — not the LSM panel."),

      row('', "RTS ADAM", 'equipment', 'Audio', ['Equipment', 'Audio'],
        "{{Infobox equipment\n| name = RTS ADAM\n| manufacturer = Riedel\n| type = Digital matrix intercom\n| department = Audio\n| connector = AES67 / CAT / fiber\n}}\nMatrix for truck + compound. Talent IFB often leaves here. If talent cannot hear, do not rebuild the whole matrix — [[Troubleshooting:IFB talent cannot hear]]."),

      row('', "RTS ADAM", 'equipment', 'Audio', ['Equipment', 'Audio'],
        "{{Infobox equipment\n| name = RTS ADAM\n| manufacturer = RTS / Bosch\n| type = Digital partyline / matrix\n| department = Audio\n}}\nIntercom on mid-size shows and ENG kits. Same IFB tree as [[RTS ADAM]] when talent goes quiet."),

      row('', "APC Smart-UPS SRT 8kVA UPS", 'equipment', 'Power', ['Equipment', 'Power', 'Truck'],
        "{{Infobox equipment\n| name = APC Smart-UPS SRT 8kVA UPS\n| manufacturer = APC\n| type = Modular UPS\n| department = Power\n| power = ride-through for PCR + leaf\n}}\nRide-through when shore sags or gens transfer. If UPS < 40%, load-shed RF first. [[Troubleshooting:Truck voltage sag]] · [[Repair:Truck UPS batteries]] · [[Shore to gen transfer]]."),

      row('', 'Leader LV5600', 'equipment', 'ENG', ['Equipment', 'ENG', 'TOC'],
        "{{Infobox equipment\n| name = Leader LV5600\n| manufacturer = Tektronix\n| type = Waveform / IP analyzer\n| department = ENG\n}}\nPicture legalizer and 2110 inspector at TOC. First instrument on [[Troubleshooting:No picture at TOC]] after CCU LINK."),

      row('', "Shure Axient Digital AD4Q", 'equipment', 'RF', ['Equipment', 'RF'],
        "{{Infobox equipment\n| name = Shure Axient Digital AD4Q\n| manufacturer = Lectrosonics\n| type = Quad digital receiver\n| department = RF\n}}\nTalent wireless on many ENG and takeover routes. Same ±200 kHz rule as [[Shure Axient Digital AD4Q + AD1]]."),

      row('', "Riedel Bolero", 'equipment', 'Audio', ['Equipment', 'Audio', 'RF'],
        "{{Infobox equipment\n| name = Riedel Bolero\n| manufacturer = Clear-Com\n| type = DECT wireless intercom\n| department = Audio\n}}\nBeltpacks for compound and sideline. If packs drop, check DECT crowding before blaming [[RTS ADAM]]."),

      /* ---- Manuals ---- */
      row('Manual', "Sony HDC-5500", 'manual', 'Cameras', ['Manuals', 'Cameras'],
        "{{Procedure}}\n{{Main|Sony HDC-5500}}\n\n== Scope ==\nPower-up and fiber for Sony HDC-5500 + HDCU-5500 on tentpole trucks.\n\n== Power-up ==\n# Confirm '''240 V / 20 A''' at the CCU. Breaker labeled camera bay.\n# Mate '''fiber first''', then DC at the head.\n# Wait for '''LINK green''' on the CCU before opening iris.\n# Load paint: 3200 K tungsten / 5600 K daylight as booked.\n# Barcode checkout [[Sony HDC-5500|MUSE-EQ-341506]] on PackList.\n\n== If LINK stays dark ==\nFollow [[Repair:Sony HDC-5500 CCU no LINK]] then [[Troubleshooting:No picture at TOC]].\n\n== Firmware ==\nCamera and CCU must match. Do not mix 5500/3500 scene files."),

      row('Manual', "Shure Axient Digital AD4Q + AD1", 'manual', 'RF', ['Manuals', 'RF'],
        "{{Main|Shure Axient Digital AD4Q + AD1}}\n\n== Scan ==\n# Clear-scan the venue before talent walk.\n# Park every TX at least '''200 kHz''' from neighbors.\n# Note license / coordinator sheet in Broadcast Ops → RF.\n# Spare: wired lav. Do not \"turn it up\" into a clash.\n\n== Antenna ==\nHelical or paddle as plotted. If dropout: [[Repair:Axient AD4Q RF dropout]]. Clash: [[RF 200 kHz clash response]]."),

      row('Manual', "Calrec Artemis", 'manual', 'Audio', ['Manuals', 'Audio'],
        "{{Main|Calrec Artemis}}\n\n== Boot ==\n# Both PSUs on '''separate phases'''\n# Load the '''show file''' named for this production — not last week's\n# Confirm MADI / AES67 sync before A1 sits\n# PGM bus to plant. If no MADI: [[Repair:Calrec Artemis no MADI]]\n\n== On air ==\nDo not save over the show file during a hit."),

      row('Manual', "LiveU LU800", 'manual', 'TX', ['Manuals', 'TX'],
        "{{Main|LiveU LU800}}\n\n== Arm ==\n# Bonded SIMs seated, firmware current\n# SDI present, encoder not in standby\n# TOC watching bonded Mbps\n# Backup path identified (second LU, fiber, or sat)\n\n== Failover ==\nIf < 12 Mbps for 8 s: [[LiveU LU800 failover]]. Never power-cycle mid-hit. After air: log serial on the incident."),

      row('Manual', "Cisco Catalyst 9300", 'manual', 'Networking', ['Manuals', 'Networking', '2110'],
        "{{Main|Cisco Catalyst 9300}}\n\n== Plant rules ==\n# Dual PSU, '''separate phases'''\n# PTP grandmaster reachable (ST 2059)\n# Do not disable both uplinks to the spine during air\n# If PSU LED red: [[Repair:Nexus 9336C PSU fail]]\n# If cameras drift: [[Troubleshooting:2110 PTP unlocked]]"),

      row('Manual', "Grass Valley Kayenne", 'manual', 'ENG', ['Manuals', 'ENG'],
        "{{Main|Grass Valley Kayenne}}\n\n== Show file ==\nLoad the file named for this production. Confirm ME tally and PGM/PVW routing to TOC before rehearsal. If PGM disappears, check [[SMPTE ST 2110]] PTP and the [[Cisco Catalyst 9300]] before reseating the panel cable."),

      /* ---- Repairs ---- */
      row('Repair', 'Sony HDC-5500 CCU no LINK', 'repair', 'Cameras', ['Repairs', 'Cameras'],
        "{{Main|Sony HDC-5500}}\n\n== Symptom ==\nCCU LINK dark. No raster at truck. TOC already staring at black.\n\n== Likely cause ==\n# Fiber not seated / dust in the SMPTE\n# DC mated before fiber\n# CCU breaker or 240 V missing\n# Damaged TAC / camera cable\n\n== Field fix ==\n# Confirm 240 V / 20 A at CCU\n# Unmate DC. Clean and reseat fiber. Then DC.\n# Swap to spare SMPTE if LINK stays dark\n# If still dark: spare CCU or spare head ([[Sony HDC-5500]] as last resort)\n# Log [[Troubleshooting:No picture at TOC]] outcome\n\n== Parts ==\nSMPTE 304 jumpers, dust caps, spare HDCU-5500."),

      row('Repair', 'Axient AD4Q RF dropout', 'repair', 'RF', ['Repairs', 'RF'],
        "== Symptom ==\nAxient receiver RF / audio drops on talent.\n\n== Likely cause ==\n# Clash within 200 kHz\n# Antenna line crushed at the bulkhead\n# Bodypack battery\n# Venue LTE hash\n\n== Field fix ==\n# Open Broadcast Ops → RF. Park lower-priority TX +200 kHz.\n# Walk the antenna line. Reseat BNCs.\n# Fresh battery. If still dirty, drop to '''wired lav'''.\n# Log frequencies on the incident.\n\nSee [[RF 200 kHz clash response]] and [[Manual:Shure Axient Digital AD4Q + AD1]]."),

      row('Repair', "LiveU LU800 under 12 Mbps", 'repair', 'TX', ['Repairs', 'TX'],
        "== Symptom ==\nLU800 bonded path < 12 Mbps for ≥ 8 s. Picture tiles or freezes.\n\n== Field fix ==\n# TOC hits backup (second encoder / fiber / sat) — '''do not power-cycle'''\n# After the hit: note encoder serial, SIM RSSI, location\n# Swap SIM or antenna only when off air\n# Log [[LiveU LU800 failover]]\n\n== Parts ==\nSpare LU800, spare SIM tray, mag-mount antenna."),

      row('Repair', 'Nexus 9336C PSU fail', 'repair', 'Networking', ['Repairs', 'Networking', 'Power'],
        "== Symptom ==\nLeaf PSU LED red / amber. Alarms on the fabric.\n\n== Field fix ==\n# Confirm the surviving PSU is on a live phase\n# Do '''not''' pull both PSUs\n# Hot-swap the failed module with the spare in the networking drawer\n# If PTP dies during the swap: [[Troubleshooting:2110 PTP unlocked]]\n\n== Parts ==\nNexus 9336C PSU module, labeled spare."),

      row('Repair', "Calrec Artemis no MADI", 'repair', 'Audio', ['Repairs', 'Audio'],
        "== Symptom ==\nConsole up, no MADI / AES67 to plant. Silence on PGM.\n\n== Field fix ==\n# Check both PSUs and sync clock\n# Reseat MADI SFP / AES67 NIC — only between hits\n# Fail over to the spare MADI card if plotted\n# Do not rebuild the show file on air\n\nSee [[Troubleshooting:No program audio]]."),

      row('Repair', 'TAC-12 bulkhead pin damage', 'repair', 'TX', ['Repairs', 'Fiber', 'TX'],
        "== Symptom ==\nStrand errors, intermittent raster, or physical pin damage at the truck bulkhead.\n\n== Field fix ==\n# [[GNG weather hold|GNG HOLD]] before unmate if this is a live path\n# Photograph both ends\n# Cap immediately. Do not blow into the ferrule\n# Swap to spare TAC-12. Log strand IDs in PackList\n# Send damaged connector to fiber shop — do not \"fix\" pins in the lot\n\nProcedure: [[Fiber bulkhead strike]]."),

      row('Repair', 'Truck UPS batteries', 'repair', 'Power', ['Repairs', 'Power', 'Truck'],
        "== Symptom ==\n[[APC Smart-UPS SRT 8kVA UPS]] runtime < 4 minutes or failed self-test.\n\n== Field fix ==\n# Load-shed RF first if already sagging\n# Replace modular battery packs with dated spares (FIFO)\n# Recalibrate after the show, not during\n# Note install date on the pack\n\nSee [[Troubleshooting:Truck voltage sag]] and [[Shore to gen transfer]]."),

      /* ---- Troubleshooting ---- */
      row('Troubleshooting', 'No picture at TOC', 'troubleshooting', 'Cameras', ['Troubleshooting', 'Cameras', 'TOC'],
        "{{Hatnote|Start at the camera, not the TOC monitor.}}\n\n== Tree ==\n# '''Any raster at the truck?''' If no → power / CCU. If yes → path.\n# '''CCU LINK green?''' If no: reseat fiber, [[Sony HDC-5500 power-up]], [[Repair:Sony HDC-5500 CCU no LINK]].\n# '''Encoder bitrate healthy?''' If no: [[LiveU LU800 failover]]. If yes: TOC router / Harmonic XOS / 2110 flow.\n# '''PTP locked?''' If no: [[Troubleshooting:2110 PTP unlocked]].\n# Confirm on [[Leader LV5600]] before calling the camera \"dead.\"\n\nRelated: [[Sony HDC-5500]], [[Muse AI World Tour finale signal path (MPK)]]."),

      row('Troubleshooting', 'Truck voltage sag', 'troubleshooting', 'Power', ['Troubleshooting', 'Power', 'Truck'],
        "== Tree ==\n# '''Shore vs gen?''' Shore: venue electrician. Gen: fuel + load share.\n# '''UPS online?''' Ride through on [[APC Smart-UPS SRT 8kVA UPS]]. If UPS < 40% load-shed '''RF first'''.\n# Do not transfer gens during a hit unless GNG is already HOLD.\n# After: [[Shore to gen transfer]] notes in the log.\n\nWeather: [[GNG weather hold]]."),

      row('Troubleshooting', 'RF 200 kHz clash', 'troubleshooting', 'RF', ['Troubleshooting', 'RF'],
        "== Tree ==\n# Open Broadcast Ops → RF. Identify overlapping TX within 200 kHz.\n# Park the lower-priority service '''+200 kHz''' or to spare.\n# Recheck license note.\n# Re-scan. If still hot, drop to wired [[Shure Axient Digital AD4Q + AD1|IFB / lav]].\n# Log both frequencies as an incident.\n\nProcedure: [[RF 200 kHz clash response]]. Repair: [[Repair:Axient AD4Q RF dropout]]."),

      row('Troubleshooting', 'No program audio', 'troubleshooting', 'Audio', ['Troubleshooting', 'Audio'],
        "== Tree ==\n# Is the A1 hearing PGM in the cans? If yes, the plant is downstream.\n# Console PSU and sync: [[Calrec Artemis]]\n# MADI / AES67 present? If no: [[Repair:Calrec Artemis no MADI]]\n# Router / 2110 audio flow / embedder\n# Do not load a new show file on air\n\nIFB is a different tree: [[Troubleshooting:IFB talent cannot hear]]."),

      row('Troubleshooting', 'IFB talent cannot hear', 'troubleshooting', 'Audio', ['Troubleshooting', 'Audio', 'RF'],
        "== Tree ==\n# Wired IFB at the chair work? If yes → wireless.\n# [[Shure Axient Digital AD4Q + AD1]] / [[Shure Axient Digital AD4Q]] clash? Park +200 kHz.\n# [[RTS ADAM]] / [[RTS ADAM]] port still patched to that talent?\n# Battery on the pack. Spare wired earpiece is the air-safe out.\n\nDo not rebuild the whole matrix during a toss."),

      row('Troubleshooting', '2110 PTP unlocked', 'troubleshooting', 'Networking', ['Troubleshooting', 'Networking', '2110'],
        "== Tree ==\n# Grandmaster reachable from [[Cisco Catalyst 9300]]?\n# One GM. Two GMs fighting will smear every camera.\n# Check ST 2059 domain. Do not change it mid-show.\n# If a single endpoint is unlocked, reseat that NIC — not the GM.\n# Picture legalizer: [[Leader LV5600]]\n\nRelated: [[SMPTE ST 2110]]."),

      row('Troubleshooting', 'REMI delay over budget', 'troubleshooting', 'TX', ['Troubleshooting', 'TX'],
        "== Tree ==\n# Measure contrib + return vs booked window (Broadcast Ops).\n# Bonded cellular adding seconds? Fail over to fiber/sat: [[LiveU LU800 failover]].\n# Frame-synces stacked in the plant — bypass one.\n# Do not \"fix\" delay by skipping color on air.\n\nLog the measured ms on the incident."),

      row('Troubleshooting', 'Encoder freeze on air', 'troubleshooting', 'TX', ['Troubleshooting', 'TX'],
        "== Tree ==\n# Is it the encoder or the path? Check a second monitor at the encoder.\n# If LU800: [[Repair:LiveU LU800 under 12 Mbps]] — do not power-cycle.\n# If plant encoder (Harmonic / similar): switch to spare encode, then log serial.\n# After air: firmware + temperature notes."),

      /* ---- Procedures ---- */
      row('', 'Fiber bulkhead strike', 'procedure', 'TX', ['Procedures', 'Fiber', 'TX'],
        "{{Procedure}}\n\n# Confirm GNG is '''HOLD''' ([[GNG weather hold]]).\n# Cap live TAC-12 at the truck bulkhead.\n# Photograph both ends before unmate.\n# Dust caps on immediately.\n# Log strand IDs in PackList.\n# Muse / TOC: \"bulkhead struck, dark.\"\n\nIf pins are bent: [[Repair:TAC-12 bulkhead pin damage]]. Path: [[Muse AI World Tour finale signal path (MPK)]]."),

      row('', 'RF 200 kHz clash response', 'procedure', 'RF', ['Procedures', 'RF'],
        "{{Procedure}}\n\n# Open Broadcast Ops → RF.\n# Identify overlapping TX within 200 kHz.\n# Park the lower-priority service +200 kHz or to spare.\n# Recheck license note.\n# Re-scan. If still hot, drop to wired IFB.\n# Log incident with both frequencies.\n\nGear: [[Shure Axient Digital AD4Q + AD1]]. Tree: [[Troubleshooting:RF 200 kHz clash]]."),

      row('', 'GNG weather hold', 'procedure', 'ENG', ['Procedures', 'ENG'],
        "{{Procedure}}\n\n# Ops manager sets Go/No-Go to CONDITIONAL or NO-GO.\n# Field stands down RF masts and flown PA.\n# Power stays on UPS, gens throttle.\n# Open this procedure from the Day-of banner.\n# Resume only after GNG returns GO and EIC signs.\n\nPower tree: [[Troubleshooting:Truck voltage sag]]."),

      row('', 'Sony HDC-5500 power-up', 'procedure', 'Cameras', ['Procedures', 'Cameras'],
        "{{Procedure}}\n{{Main|Manual:Sony HDC-5500}}\n\n# Confirm 240 V / 20 A at CCU.\n# Fiber first, then DC.\n# Wait for green LINK before opening iris.\n# Paint: 3200 K tungsten / 5600 K daylight as booked.\n# Barcode checkout on PackList.\n\nNo LINK: [[Repair:Sony HDC-5500 CCU no LINK]]."),

      row('', "LiveU LU800 failover", 'procedure', 'TX', ['Procedures', 'TX'],
        "{{Procedure}}\n\n# Watch bonded Mbps on the encoder.\n# If < 12 Mbps for 8 s, TOC hits backup path.\n# Do not power-cycle mid-hit.\n# After air: log incident + encoder serial.\n\nRepair: [[Repair:LiveU LU800 under 12 Mbps]]. Manual: [[Manual:LiveU LU800]]."),

      row('', 'Day-of RF scan', 'procedure', 'RF', ['Procedures', 'RF'],
        "{{Procedure}}\n\n# Clear-scan before talent walk and again after neighboring trucks power up.\n# Apply ±200 kHz packing.\n# Enter the plot in Broadcast Ops → RF.\n# Keep wired IFB ready.\n\n[[Troubleshooting:RF 200 kHz clash]]"),

      row('', 'Shore to gen transfer', 'procedure', 'Power', ['Procedures', 'Power', 'Truck'],
        "{{Procedure}}\n\n# GNG HOLD if transferring during occupied PCR.\n# UPS must be online ([[APC Smart-UPS SRT 8kVA UPS]]).\n# Transfer, confirm phases, then release HOLD.\n# If sag continues: [[Troubleshooting:Truck voltage sag]]."),

      /* ---- Specs / schematic / incidents ---- */
      row('', 'Muse AI World Tour finale signal path (MPK)', 'spec', 'TX', ['Specs', 'Fiber', 'TX'],
        "{{Hatnote|Hop chain lives in Broadcast Ops for Muse AI World Tour. Do not duplicate it here.}}\n\nOpen the live path on the production → Broadcast Ops tab. This page only records exceptions and fiber discipline ([[Fiber bulkhead strike]], [[TAC-12 fiber]], [[Cisco Catalyst 9300]]).", { show: 'museaitour' }),

      row('', 'RF clash — Muse AI World Tour compound (demo)', 'incident', 'RF', ['Incidents', 'RF'],
        "Two UHF mics within 200 kHz at the Muse AI World Tour compound. Parked IFB +200 kHz. Cleared. Logged from [[RF 200 kHz clash response]].\n\nBy Maya Okonkwo · 2026-07-12.", { show: 'museaitour', verified: false }),

      row('', "LiveU LU800 drop — Ray-Ban Meta Gen 3 Launch (demo)", 'incident', 'TX', ['Incidents', 'TX'],
        "Bonded path < 12 Mbps for 8 s on Ray-Ban Meta Gen 3 Launch. TOC hit backup. Encoder left powered. Serial logged. See [[LiveU LU800 failover]].\n\nBy Avery Nolan · 2026-06-26.", { show: 'raybangen3', verified: false }),

      /* ---- Categories ---- */
      row('Category', 'Equipment', 'category', '', ['Muse Live'], "Boxes and plant systems on the truck, compound, and TOC."),
      row('Category', 'Cameras', 'category', 'Cameras', ['Equipment'], "System cameras, CCUs, and box lenses."),
      row('Category', 'Audio', 'category', 'Audio', ['Equipment'], "Consoles, intercom, IFB, MADI / AES67."),
      row('Category', 'RF', 'category', 'RF', ['Equipment'], "Wireless mics, IFB, DECT, coordination."),
      row('Category', 'Power', 'category', 'Power', ['Equipment'], "Shore, gen, UPS, phase."),
      row('Category', 'Fiber', 'category', 'TX', ['Equipment'], "TAC-12, SMPTE, bulkhead discipline."),
      row('Category', 'TX', 'category', 'TX', ['Equipment'], "Contribution: fiber, sat, bonded cellular."),
      row('Category', 'Networking', 'category', 'TX', ['Equipment'], "2110 leaf, PTP, spine."),
      row('Category', 'Troubleshooting', 'category', '', ['Muse Live'], "Decision trees. Start at the source."),
      row('Category', 'Repairs', 'category', '', ['Muse Live'], "Field fixes and FRU notes."),
      row('Category', 'Procedures', 'category', '', ['Muse Live'], "Day-of verified steps."),
      row('Category', 'Manuals', 'category', '', ['Muse Live'], "Power-up, pinout, firmware."),
      row('Category', 'Incidents', 'category', '', ['Muse Live'], "What actually happened."),
      row('Category', 'Help', 'category', '', ['Muse Live'], "How to use this wiki."),
      row('Category', 'Truck', 'category', 'Truck', ['Equipment'], "Power, HVAC, weight, UPS."),
      row('Category', 'TOC', 'category', 'TOC', ['Equipment'], "Network operations and return."),
      row('Category', 'Specs', 'category', '', ['Muse Live'], "Formats and plant specs."),
      row('Category', '4K', 'category', 'Cameras', ['Cameras'], "UHD / HDR camera chain."),
      row('Category', '2110', 'category', 'TX', ['Networking'], "SMPTE ST 2110 plant."),
      row('Category', 'Muse Live', 'category', 'ENG', [], "Muse Live knowledge base."),
      row('Category', 'Templates', 'category', '', ['Muse Live'], "Wikitext templates."),
      row('Category', 'ENG', 'category', 'ENG', [], "Engineering department pages.")
    ];
  };
})(typeof window !== 'undefined' ? window : this);

