/* The Slot Agent — deterministic, offline, event-sourced browser prototype. */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const DOMAINS = ['DISCOVERY', 'SELECTION', 'SCHEDULE', 'IDENTITY', 'MONEY', 'COMMITMENT', 'DISCLOSURE'];
  const SCENARIOS = {
    S1: { name: 'Inside the envelope', note: 'The agent confirms without interrupting Dad.', fare: 2150, depart: 1245, train: '12394', domain: 'COMMITMENT' },
    S2: { name: 'One dimension outside', note: 'Only departure time is unresolved.', fare: 1850, depart: 1340, train: '12310', domain: 'COMMITMENT' },
    S3: { name: 'Approver unreachable', note: 'Silence follows the declared fallback.', fare: 1850, depart: 1340, train: '12310', domain: 'COMMITMENT', unreachable: true },
    S4: { name: 'Slot expires during approval', note: 'The free hold is released honestly.', fare: 1850, depart: 1340, train: '12310', domain: 'COMMITMENT', expires: true },
    S5: { name: 'Booker tries a MONEY decision', note: 'The wrong owner gets a hard lock.', fare: 1850, depart: 1245, train: '12394', domain: 'MONEY', actor: 'arjun' },
    S6: { name: 'Budget breach', note: 'A ceiling is refused; it is never negotiated.', fare: 3400, depart: 1150, train: '12802', domain: 'COMMITMENT' },
    S7: { name: 'Two slots qualify', note: 'The agent will not coin-flip a booking.', fare: 1920, depart: 1265, train: '12418 + 12554', domain: 'COMMITMENT', tie: true },
    S8: { name: 'Healthcare, same engine', note: 'MONEY belongs to daughter; time belongs to Amma.', fare: 900, depart: 990, train: 'Dr Sharma · Cardiology', domain: 'SCHEDULE', health: true },
    S9: { name: 'Revoked mid-flight', note: 'A revocation beats preparation before capture.', fare: 1850, depart: 1340, train: '12310', domain: 'COMMITMENT', revokeAfterApproval: true },
    S10: { name: 'Ambiguous voice reply', note: '“Jo theek lage” requires a re-ask.', fare: 1850, depart: 1340, train: '12310', domain: 'COMMITMENT' },
  };

  const state = { scenario: 'S2', view: 'landing', events: [], replay: null };
  const badge = (kind) => '<span class="badge ' + (kind === 'SIMULATED' ? 'simulated' : kind === 'REAL' ? 'real' : 'local') + '">' + kind + '</span>';
  const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (min) => pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  const name = (id) => ({ AGENT: 'Agent', dad: 'Dad', amma: 'Amma', arjun: 'You', meera: 'You' }[id] || id);
  const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

  function baseControls(id) {
    const s = SCENARIOS[id];
    return {
      moneyOwner: s.health ? 'meera' : 'dad',
      scheduleOwner: s.health ? 'amma' : 'dad',
      actor: s.actor || (s.health ? 'meera' : 'arjun'),
      envelope: true,
      envelopeFare: 2500,
      envelopeEnd: 1320,
      budget: 3000,
      foundFare: s.fare,
      foundDepart: s.depart,
      reachable: !s.unreachable,
      identityMapped: true,
      language: s.health ? 'en' : 'hi',
    };
  }

  function stamp(seq) {
    const sec = seq * 7;
    return 'T+' + pad(Math.floor(sec / 60)) + ':' + pad(sec % 60);
  }

  function append(type, detail, provenance, payload) {
    state.events.push({
      seq: state.events.length + 1,
      at: stamp(state.events.length + 1),
      type,
      detail,
      provenance: provenance || 'LOCAL',
      payload: payload || {},
    });
    state.replay = null;
  }

  function has(type, events) {
    return (events || state.events).some((e) => e.type === type);
  }

  function controls(events) {
    const c = baseControls(state.scenario);
    (events || state.events).forEach((e) => {
      if (Object.prototype.hasOwnProperty.call(e.payload, 'control')) c[e.payload.control] = e.payload.value;
    });
    return c;
  }

  function owner(domain, c) {
    if (domain === 'DISCOVERY') return 'AGENT';
    if (domain === 'MONEY') return c.moneyOwner;
    if (domain === 'SCHEDULE') return c.scheduleOwner;
    return SCENARIOS[state.scenario].health ? 'amma' : 'dad';
  }

  function envelope(c) {
    return [
      { kind: 'fare', label: 'Fare at or below ' + money(c.envelopeFare), pass: c.foundFare <= c.envelopeFare },
      { kind: 'class', label: 'Class 3A or 2A', pass: true },
      { kind: 'departure', label: 'Departure between 18:00 and ' + clock(c.envelopeEnd), pass: c.foundDepart >= 1080 && c.foundDepart <= c.envelopeEnd },
      { kind: 'cancel', label: 'Free cancellation at least 24 hours before', pass: true },
    ];
  }

  function runtime(events) {
    const e = events || state.events;
    if (has('MANDATE_VOIDED', e) || has('ENVELOPE_REVOKED', e)) return 'REVOKED';
    if (has('SLOT_EXPIRED', e)) return 'EXPIRED';
    if (has('APPROVAL_TIMEOUT', e)) return 'TIMEOUT';
    if (has('APPROVAL_AMBIGUOUS', e) && !has('APPROVAL_RECEIVED', e)) return 'AMBIGUOUS';
    if (has('PAYMENT_CAPTURED', e)) return 'CAPTURED';
    if (has('APPROVAL_RECEIVED', e)) return 'APPROVED';
    return 'PENDING';
  }

  function decision(events) {
    const e = events || state.events;
    const c = controls(e);
    const s = SCENARIOS[state.scenario];
    const domain = s.domain;
    const who = owner(domain, c);
    const checks = envelope(c);
    const pass = checks.filter((x) => x.pass);
    const fail = checks.filter((x) => !x.pass);
    const run = runtime(e);
    let verdict = 'ASK';
    let reason = 'outside';
    let rules = ['R1_DOMAIN_RESOLVED'];

    if (run === 'REVOKED') {
      verdict = 'MANDATE_VOIDED'; reason = 'revoked'; rules = ['R5_ENVELOPE_VALIDITY', 'R15_REVOCATION_BEATS_PREPARATION'];
    } else if (run === 'EXPIRED') {
      verdict = 'SLOT_EXPIRED'; reason = 'expired'; rules = ['R12_SILENCE_NOT_CONSENT'];
    } else if (run === 'TIMEOUT') {
      verdict = 'SLOT_RELEASED'; reason = 'timeout'; rules = ['R12_SILENCE_NOT_CONSENT'];
    } else if (run === 'AMBIGUOUS') {
      verdict = 'ASK'; reason = 'ambiguous'; rules = ['R10_AMBIGUITY_NOT_CONSENT'];
    } else if (!c.identityMapped) {
      verdict = 'REFUSE'; reason = 'unmapped'; rules = ['R1_DOMAIN_RESOLVED'];
    } else if (c.foundFare > c.budget) {
      verdict = 'REFUSE'; reason = 'budget'; rules = ['R1_DOMAIN_RESOLVED', 'R8_BUDGET_CEILING'];
    } else if (s.tie) {
      verdict = 'ASK'; reason = 'tie'; rules = ['R1_DOMAIN_RESOLVED', 'R5_ENVELOPE_VALIDITY', 'R6_ENVELOPE_CONJUNCTION', 'R11_TIE_NOT_AUTORESOLVED'];
    } else if (domain === 'MONEY' && c.actor !== c.moneyOwner) {
      verdict = 'LOCK'; reason = 'cross-owner'; rules = ['R1_DOMAIN_RESOLVED', 'R7_MONEY_NOT_INHERITED', 'R14_CROSS_OWNER_LOCK'];
    } else if (domain === 'MONEY' && c.actor === c.moneyOwner) {
      verdict = 'EXECUTE'; reason = 'owner-present'; rules = ['R1_DOMAIN_RESOLVED', 'R7_MONEY_NOT_INHERITED'];
    } else if (s.health) {
      verdict = 'ASK'; reason = 'health'; rules = ['R1_DOMAIN_RESOLVED', 'R6_ENVELOPE_CONJUNCTION', 'R7_MONEY_NOT_INHERITED'];
    } else if (!c.envelope) {
      verdict = 'ASK'; reason = 'no-envelope'; rules = ['R1_DOMAIN_RESOLVED', 'R5_ENVELOPE_VALIDITY'];
    } else if (!fail.length) {
      verdict = 'EXECUTE_UNDER_CONSENT'; reason = 'inside'; rules = ['R1_DOMAIN_RESOLVED', 'R5_ENVELOPE_VALIDITY', 'R6_ENVELOPE_CONJUNCTION'];
    } else {
      verdict = 'ASK'; reason = 'outside'; rules = ['R1_DOMAIN_RESOLVED', 'R5_ENVELOPE_VALIDITY', 'R6_ENVELOPE_CONJUNCTION', 'R7_MONEY_NOT_INHERITED'];
    }
    const d = { verdict, reason, rules, domain, owner: who, controls: c, checks, pass, fail, runtime: run, envelopeId: c.envelope ? 'env_dad_01' : null };
    d.explanation = explain(d);
    return d;
  }

  function explain(d) {
    const c = d.controls;
    const who = name(d.owner);
    if (d.reason === 'revoked') return who + ' pulled the envelope before capture. The mandate is void, so nothing was charged.';
    if (d.reason === 'expired') return 'The hold expired before ' + who + ' answered. I released it and kept the watch armed for the next qualifying option.';
    if (d.reason === 'timeout') return who + ' did not answer in the declared window. The chosen fallback is “let it go”, so the held option is released.';
    if (d.reason === 'ambiguous') return '“Jo theek lage” is not a yes from where I’m standing. ' + clock(c.foundDepart) + ' — should I take it or keep looking?';
    if (d.reason === 'unmapped') return 'Nobody owns the traveller’s details yet. I will not guess who can disclose them.';
    if (d.reason === 'budget') return money(c.foundFare) + ' is above the ' + money(c.budget) + ' hard ceiling. I will not ask to exceed it.';
    if (d.reason === 'cross-owner') return 'Everything is prepared. ' + d.domain + ' belongs to ' + who + ', not to whoever is holding the phone — so I cannot take it from you either.';
    if (d.reason === 'owner-present') return d.domain + ' belongs to the person present and is inside the recorded boundary, so the agent can proceed.';
    if (d.reason === 'tie') return 'Two options qualify and no stated preference orders them. I will ask ' + who + ' rather than coin-flip an irreversible choice.';
    if (d.reason === 'health') return 'The consultation fee belongs to You. The appointment time belongs to Amma, so I am asking only about her schedule.';
    if (d.reason === 'no-envelope') return who + ' has not recorded a bounded envelope for this decision, so I prepared the option and asked before the irreversible step.';
    if (d.reason === 'inside') return 'The fare, class, departure and cancellation are all inside what ' + who + ' approved in advance, so I can proceed without interrupting.';
    const failed = d.fail[0];
    const delta = failed.kind === 'fare'
      ? money(c.foundFare) + ' is ' + money(c.foundFare - c.envelopeFare) + ' above the approved ceiling'
      : clock(c.foundDepart) + ' is ' + (c.foundDepart - c.envelopeEnd) + ' minutes past the approved window';
    return 'I prepared everything. Fare, class and cancellation are inside what ' + who + ' already approved. ' + delta + ' — that is the one thing ' + who + ' has not pre-decided.';
  }

  function reset(id, view) {
    state.scenario = id || state.scenario;
    state.events = [];
    state.replay = null;
    const s = SCENARIOS[state.scenario];
    append('MISSION_CREATED', 'Fixture mission loaded: ' + s.name, 'LOCAL', { scenario: state.scenario });
    append('AUTHORITY_MAPPED', s.health ? 'Seven domains resolved; SCHEDULE → Amma, MONEY → You.' : 'Seven decision domains resolved; MONEY remains separate from commitment.', 'LOCAL');
    append('ENVELOPE_GRANTED', s.health ? 'Healthcare fixture loaded on the same decision engine.' : 'Dad recorded a bounded selection and commitment envelope.', 'LOCAL');
    append('WATCH_ARMED', s.note, 'SIMULATED');
    append('RUN_RESET', 'Deterministic run ready for ' + state.scenario + '.', 'LOCAL');
    state.view = view || 'watch';
    render();
  }

  function setControl(key, value, label) {
    append('POLICY_INPUT_CHANGED', (label || key) + ' → ' + value, 'LOCAL', { control: key, value });
    render();
  }

  function go(view, label) {
    append('VIEW_OPENED', label, 'LOCAL', { view });
    state.view = view;
    render();
  }

  function header() {
    const options = Object.keys(SCENARIOS).map((id) => '<option value="' + id + '"' + (id === state.scenario ? ' selected' : '') + '>Judge mode · ' + id + ' · ' + SCENARIOS[id].name + '</option>').join('');
    return '<header class="topbar"><div class="brand-lockup"><div class="brand-mark">◇</div><div><div class="brand-name">THE <span>SLOT</span> AGENT</div><div class="brand-caption">Authority-aware coordination · offline prototype</div></div></div><div class="top-actions"><select id="scenario-picker" class="select-control" aria-label="Choose a fixture">' + options + '</select><button class="btn secondary" data-action="lab">Authority Lab</button><button class="btn secondary" data-action="brain">Agent Brain</button><button class="btn primary" data-action="reset">Reset run</button></div></header>';
  }

  function tabs(active) {
    const links = [['watch', 'Mission'], ['lab', 'Authority Lab'], ['brain', 'Agent Brain'], ['receipt', 'Decision Receipt'], ['insights', 'Trust surfaces']];
    return '<nav class="nav-tabs" aria-label="Prototype sections">' + links.map((x) => '<button class="nav-tab ' + (active === x[0] ? 'active' : '') + '" data-action="navigate" data-view="' + x[0] + '">' + x[1] + '</button>').join('') + '</nav>';
  }

  function footer() {
    return '<footer class="footer">All inventory, approvals and payment rails are fixture data. ' + badge('SIMULATED') + ' · policy and audit log run in this browser ' + badge('LOCAL') + ' · no network calls.</footer>';
  }

  function device(label, person, provenance, body) {
    return '<article class="device"><div class="device-top"><div class="device-person"><span class="avatar ' + (person === 'A' ? 'agent-avatar' : '') + '">' + person + '</span>' + label + '</div>' + badge(provenance) + '</div><div class="device-body">' + body + '</div></article>';
  }

  function landing() {
    return '<div class="app">' + header() + '<section class="landing"><div class="landing-copy"><div class="eyebrow">Decision-latency agent ' + badge('LOCAL') + '</div><h1>Find the opportunity.<br><em>Preserve the decision.</em></h1><p class="lead">An agent that does everything around a fast-moving booking except the part that is not its decision to make.</p><div class="landing-actions"><button class="btn primary" data-action="start">Start the demo →</button><button class="btn secondary" data-action="lab">Open judge mode</button></div><div class="landing-note"><i></i> Deterministic run · Wi‑Fi not required · every change has an audit event</div></div><div class="hero-canvas"><div class="canvas-orbit"></div><div class="canvas-bar"><span>LIVE DECISION MAP</span>' + badge('LOCAL') + '</div><div class="mini-system"><div class="mini-card"><div class="mini-card-top"><span>Opportunity detected</span>' + badge('SIMULATED') + '</div><strong style="display:block;margin:8px 0 4px;font-size:16px">Train 12310 · 3A</strong><span class="small">' + money(1850) + ' · 22:20 departure · 2 seats</span></div><div class="mini-route"><div class="avatar-row"><span class="avatar agent-avatar">◇</span>Agent</div><div class="route-line"></div><div class="avatar-row"><span class="avatar">D</span>Dad</div></div><div class="mini-card mini-policy"><div class="mini-card-top"><span>Policy decision</span><span class="semantic-time">ASK</span></div><strong>One thing remains.</strong><p>22:20 is 20 minutes beyond Dad’s recorded window. Fare, class and cancellation stay quiet.</p></div><div class="mini-card"><div class="mini-card-top"><span>Authority boundary</span>' + badge('LOCAL') + '</div><div class="avatar-row" style="margin-top:9px"><span class="avatar">D</span><span><span class="semantic-money">MONEY</span> · Dad owns payment</span></div></div></div></div></section>' + footer() + '</div>';
  }

  function mission() {
    const left = '<div class="eyebrow">New mission</div><h1 class="page-title">Set the boundary once.</h1><p class="lead">Four questions. Then I take it from here.</p><div class="form-card"><div class="field"><label>1 · What are you trying to book?</label><input class="input" value="A train for Dad to Patna next Tuesday" readonly></div><div class="field"><label>2 · Who is it for?</label><div class="choice-row"><span class="choice">Me</span><span class="choice active">Dad</span><span class="choice">Mum</span><span class="choice">+ someone else</span></div></div><div class="field"><label>3 · When does it need to happen?</label><div class="choice-row"><span class="choice active">Tue 24 Sep</span><span class="choice">± 1 day</span></div></div><div class="field"><label>4 · If the decision owner does not answer?</label><select class="input"><option>Let it go — do not decide for him</option></select></div><p class="input-note">You choose the fallback now so I never have to improvise it later.</p><button class="btn primary wide" data-action="authority">Set up authority →</button></div>';
    const right = '<div class="approver-empty"><div><div class="empty-icon">✓</div><h2 class="section-title">No interruptions yet.</h2><p class="lead">Dad decides preferences early, while he is available.</p></div></div>';
    return '<div class="app">' + header() + tabs('watch') + '<section class="workspace">' + device('BOOKER · YOU', 'A', 'LOCAL', left) + '<div class="channel-rail"><i></i> LOCAL SETUP · 0.0s</div>' + device('APPROVER · DAD', 'D', 'LOCAL', right) + '</section>' + footer() + '</div>';
  }

  function authority() {
    const c = controls();
    const s = SCENARIOS[state.scenario];
    const rows = DOMAINS.map((d) => '<div class="domain-row ' + (d === 'MONEY' ? 'money-row' : '') + '"><span class="domain-name">' + d + '</span><span class="domain-owner"><i class="owner-dot"></i>' + name(owner(d, c)) + '</span></div>').join('');
    const rules = ['Fare at or below ' + money(c.envelopeFare), 'Class 3A or 2A', 'Departure between 18:00 and ' + clock(c.envelopeEnd), 'Free cancellation at least 24 hours before'];
    const left = '<div class="eyebrow violet">Authority graph</div><h1 class="page-title">Who owns each decision?</h1><p class="lead">Seven kinds of decision. They stay separate even when the person is the same.</p><div class="authority-list">' + rows + '</div><div class="notice ' + (s.health ? 'violet' : '') + '">' + (s.health ? 'Amma chooses the appointment and the time. You pay. Payer and beneficiary remain separate authorities.' : 'You can search, compare and prepare. Dad owns the choice, timing, money and the final commitment.') + '</div>';
    const list = rules.map((r) => '<div class="constraint"><i>✓</i>' + r + '</div>').join('');
    const right = '<div class="eyebrow violet">Consent envelope</div><h1 class="page-title">Bounded, not blank.</h1><div class="envelope-card"><div class="envelope-head"><div><div class="eyebrow violet">Recorded authority</div><h3>' + (s.health ? 'Fixture schedule preference' : 'Dad approved in advance') + '</h3></div>' + badge('LOCAL') + '</div><div class="envelope-meta">1 use left · revocable any time<br>valid until Thu 25 Sep, 23:59</div><div class="constraint-list">' + list + '</div><div class="coverage-note">' + (s.health ? 'This fixture retains payment authority with You. It does not imply permission to schedule for Amma.' : 'Covers selection and commitment. Does not cover money. Payment authority remains separate.') + '</div></div><div style="margin-top:14px"><button class="btn danger" data-action="revoke">Revoke envelope</button><button class="btn primary" style="float:right" data-action="arm">Arm the agent →</button></div>';
    return '<div class="app">' + header() + tabs('watch') + '<section class="workspace">' + device('BOOKER · YOU', 'A', 'LOCAL', left) + '<div class="channel-rail"><i></i> CONSENT · LOCAL</div>' + device('APPROVER · ' + (s.health ? 'AMMA' : 'DAD'), s.health ? 'L' : 'D', 'LOCAL', right) + '</section>' + footer() + '</div>';
  }

  function question(d) {
    const c = d.controls;
    if (d.reason === 'tie') return { title: 'Two options. One choice.', prompt: '21:05 at ' + money(1920) + ' or 21:35 at ' + money(1980) + '? You did not tell me how to break a tie.', inside: 'Both are inside the fixture envelope. I only need the preference that orders them.', fields: 2 };
    if (SCENARIOS[state.scenario].health) return { title: 'One thing to decide.', prompt: 'Dr Sharma is available at 16:30. Can Amma attend then?', inside: 'The ' + money(c.foundFare) + ' fee belongs to You; the appointment time belongs to Amma.', fields: 2 };
    if (d.fail[0] && d.fail[0].kind === 'fare') return { title: 'One thing to decide.', prompt: 'Fare is ' + money(c.foundFare) + '. You had approved up to ' + money(c.envelopeFare) + '.', inside: 'Everything else — 3A, ' + clock(c.foundDepart) + ' and cancellation — is inside what you approved.', fields: 2 };
    return { title: 'One thing to decide.', prompt: 'Departure is ' + clock(c.foundDepart) + '. You had approved “Departure between 18:00 and ' + clock(c.envelopeEnd) + '”.', inside: 'Everything else — ' + money(c.foundFare) + ', 3A and free cancellation until 48h — is inside what you already approved.', fields: 2 };
  }

  function approver(d) {
    const c = d.controls;
    const s = SCENARIOS[state.scenario];
    if (d.runtime === 'REVOKED' || d.runtime === 'TIMEOUT' || d.runtime === 'EXPIRED') return '<div class="runtime-card"><div class="eyebrow" style="color:var(--refuse-ink)">Runtime guard</div><h3>' + d.verdict.replaceAll('_', ' ') + '</h3><p class="small" style="color:inherit;margin:0">' + d.explanation + '</p></div>';
    if (d.verdict !== 'ASK') return '<div class="approver-empty"><div><div class="empty-icon">' + (d.verdict === 'EXECUTE_UNDER_CONSENT' ? '✓' : '◇') + '</div><h2 class="section-title">' + d.verdict.replaceAll('_', ' ') + '</h2><p class="lead">' + d.explanation + '</p>' + (d.verdict === 'EXECUTE_UNDER_CONSENT' ? '<button class="btn primary" style="margin-top:17px" data-action="silent-confirm">Create receipt →</button>' : '') + '</div></div>';
    const q = question(d);
    const hindi = c.language === 'hi' && !s.health;
    const prompt = hindi ? 'गाड़ी ' + clock(c.foundDepart) + ' पर निकलती है। आपने 18:00 से ' + clock(c.envelopeEnd) + ' के बीच की मंज़ूरी दी थी।' : q.prompt;
    const inside = hindi ? 'बाकी सब — ' + money(c.foundFare) + ', 3A, 48 घंटे तक मुफ़्त रद्द — आपकी मंज़ूरी के अंदर है।' : q.inside;
    const options = '<button class="option" data-action="approve-once">' + (hindi ? 'हाँ — सिर्फ़ इस बार' : 'Yes — just this once') + '</button><button class="option" data-action="approve-remember">' + (hindi ? 'हाँ — और आगे के लिए भी याद रखो' : 'Yes — and remember this') + '</button><button class="option" data-action="reject">' + (hindi ? 'नहीं — और देखो' : 'No — keep looking') + '</button><button class="option" data-action="counter">' + (hindi ? money(1500) + ' से कम हो तभी' : 'Only if it’s under ' + money(1500)) + '</button><button class="option" data-action="ambiguous">' + (hindi ? 'फिर से पूछो' : 'Send ambiguous voice reply') + '</button>';
    const failAction = !c.reachable ? '<button class="btn danger wide" style="margin-top:13px" data-action="timeout">Run declared fallback</button>' : s.expires ? '<button class="btn danger wide" style="margin-top:13px" data-action="expire">Expire the hold</button>' : '';
    return '<div class="language-toggle"><button class="lang-button ' + (c.language === 'en' ? 'active' : '') + '" data-action="language" data-language="en">English</button><button class="lang-button ' + (c.language === 'hi' ? 'active' : '') + '" data-action="language" data-language="hi">हिंदी</button></div><section class="mvq"><div class="eyebrow blue">Minimum viable question</div><h2>' + (hindi ? 'एक बात तय करनी है।' : q.title) + '</h2><p class="mvq-question">' + prompt + '</p><div class="inside-summary">' + inside + '</div><div class="option-stack">' + options + '</div><p class="payload">payload: ' + q.fields + ' fields · full booking: 9</p></section>' + failAction;
  }

  function watch() {
    const d = decision();
    const c = d.controls;
    const s = SCENARIOS[state.scenario];
    const lines = d.checks.map((x) => '<span class="chip ' + (x.pass ? 'pass' : 'fail') + '"><span class="tick">' + (x.pass ? '✓' : '×') + '</span>' + x.label + (!x.pass ? ' · found ' + (x.kind === 'fare' ? money(c.foundFare) : clock(c.foundDepart)) : '') + '</span>').join('');
    const subject = s.health ? 'Dr Sharma · Cardiology' : 'Train ' + s.train + ' · New Delhi → Patna';
    const left = '<div class="eyebrow">Watch console</div><h1 class="page-title">Opportunity detected.</h1><div class="watch-layout"><section class="console"><div class="console-head"><span style="display:flex;align-items:center;gap:7px"><i class="live-dot"></i> WATCHING</span>' + badge('SIMULATED') + '</div><div class="console-lines"><div class="console-line"><span class="console-time">22:17:41</span>scan 41 · 0 matches</div><div class="console-line"><span class="console-time">22:17:49</span>scan 42 · 0 matches</div><div class="console-line"><span class="console-time">22:17:57</span>scan 43 · 0 matches</div><div class="console-line new"><span class="console-time">22:18:03</span>slot detected · policy evaluated</div></div></section><section class="opportunity-card"><div class="eyebrow">Slot found</div><h3>' + subject + '</h3><div class="opportunity-sub">' + (s.health ? '16:30 · Sector 12 clinic' : '3A · ' + money(c.foundFare) + ' · departs ' + clock(c.foundDepart) + ' · 2 seats') + '</div><div class="timer">' + (s.expires ? '00:06' : '01:41') + '</div><div class="opportunity-facts"><div><span>Fare</span><b>' + money(c.foundFare) + '</b></div><div><span>Hold</span><b>free · auto-expiring</b></div></div></section></div><div class="moment"><div class="chip-row">' + lines + '</div><div class="prepared"><div class="prepared-top"><span>Prepared transaction</span><b>96%</b></div><div class="progress"><i></i></div></div><div class="lock-button"><span>' + (d.verdict === 'EXECUTE_UNDER_CONSENT' ? '✓ Confirmed under consent' : '🔒 Confirm & pay ' + money(c.foundFare)) + '</span><span class="money-label">MONEY · owner: ' + name(c.moneyOwner) + '</span></div><div class="decision-explanation">' + d.explanation + '</div><div class="status-line">Seats held · ' + (s.expires ? '00:06' : '01:41') + ' remaining · ' + badge('LOCAL') + '</div></div>';
    return '<div class="app">' + header() + tabs('watch') + '<section class="workspace">' + device('BOOKER · YOU', 'A', 'LOCAL', left) + '<div class="channel-rail"><i></i> ' + (c.reachable ? 'WHATSAPP · SIMULATED · 8.0s' : 'NO REACHABLE CHANNEL') + '</div>' + device('APPROVER · ' + (s.health ? 'AMMA' : 'DAD'), s.health ? 'L' : 'D', 'SIMULATED', approver(d)) + '</section>' + footer() + '</div>';
  }

  function payment() {
    const d = decision();
    const c = d.controls;
    const run = runtime();
    const voided = run === 'REVOKED';
    const captured = run === 'CAPTURED';
    const status = voided ? 'VOIDED' : captured ? money(c.foundFare) + ' CAPTURED' : 'LOCKED · MONEY → ' + name(c.moneyOwner);
    const left = '<div class="eyebrow ochre">Payment mandate</div><h1 class="page-title">Capture stays separate.</h1><p class="lead">Approval for the booking did not inherit payment authority.</p><div class="card" style="margin-top:20px"><div class="domain-row"><span class="domain-name">MANDATE</span><b>pl_mnd_7K2X4Q</b></div><div class="domain-row"><span class="domain-name">PAYER</span><b class="semantic-money">' + name(c.moneyOwner) + '</b></div><div class="domain-row"><span class="domain-name">INITIATED BY</span><b>You · booker</b></div><div class="domain-row money-row"><span class="domain-name">CAPTURE</span><b class="' + (voided ? 'semantic-refuse' : captured ? 'semantic-confirm' : 'semantic-money') + '">' + status + '</b></div></div>' + (voided ? '<div class="runtime-card" style="margin-top:15px"><h3>Mandate voided</h3><p class="small" style="color:inherit;margin:0">' + d.explanation + '</p></div>' : captured ? '<div class="notice" style="margin-top:15px">Payment captured only after identity, envelope and revocation checks were logged.</div>' : '<button class="btn money wide" style="margin-top:15px" data-action="capture">Re-check and capture ' + money(c.foundFare) + ' →</button>');
    const right = '<div class="eyebrow">Pre-capture guards</div><h1 class="page-title">' + (voided ? 'Nothing moved.' : captured ? 'Captured safely.' : 'Still locked.') + '</h1><div class="authority-list"><div class="domain-row"><span class="domain-name">IDENTITY VERIFIED</span><span class="' + (has('IDENTITY_VERIFIED') ? 'semantic-confirm' : 'semantic-refuse') + '">' + (has('IDENTITY_VERIFIED') ? 'R9 · PASS' : 'required') + '</span></div><div class="domain-row"><span class="domain-name">ENVELOPE RE-CHECKED</span><span class="' + (voided ? 'semantic-refuse' : 'semantic-confirm') + '">' + (voided ? 'R15 · VOID' : 'R5 · PASS') + '</span></div><div class="domain-row"><span class="domain-name">PAYMENT CAPTURE</span><span>' + (captured ? 'PAYMENT_CAPTURED' : voided ? 'MANDATE_VOIDED' : 'awaiting final check') + '</span></div></div>' + (captured ? '<button class="btn primary wide" data-action="receipt">Open decision receipt →</button>' : voided ? '<button class="btn secondary wide" data-action="brain">Inspect the audit trace →</button>' : '<div class="notice ochre">Pine Labs is simulated. A COMMITMENT-only envelope cannot capture payment.</div>');
    return '<div class="app">' + header() + tabs('watch') + '<section class="workspace">' + device('BOOKER · YOU', 'A', 'LOCAL', left) + '<div class="channel-rail"><i></i> PAYMENT RAIL · ' + badge('SIMULATED') + '</div>' + device('AUTHORITY TRACE', 'D', 'LOCAL', right) + '</section>' + footer() + '</div>';
  }

  function lab() {
    const d = decision();
    const c = d.controls;
    const klass = d.verdict.indexOf('EXECUTE') >= 0 ? 'execute' : d.verdict.indexOf('LOCK') >= 0 ? 'lock' : d.verdict.indexOf('REFUSE') >= 0 || d.verdict.indexOf('VOID') >= 0 || d.verdict.indexOf('EXPIRE') >= 0 || d.verdict.indexOf('RELEASE') >= 0 ? 'refuse' : 'ask';
    const field = (label, key, options) => '<div class="field"><label>' + label + '</label><select data-control="' + key + '" aria-label="' + label + '" class="input">' + options.map((x) => '<option value="' + x[0] + '"' + (String(c[key]) === String(x[0]) ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select></div>';
    const range = (label, key, min, max, step, fmt) => '<div class="field"><label>' + label + ' <span class="range-value">' + fmt(c[key]) + '</span></label><input data-control="' + key + '" aria-label="' + label + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + c[key] + '"></div>';
    const left = '<div class="eyebrow">Judge-breakable engine</div><h2>Authority Lab</h2><p class="small">Every input appends an event, replays through the same local policy, and changes the verdict in-frame.</p><div class="divider"></div>' + field('Owner of money', 'moneyOwner', [['dad', 'Dad'], ['arjun', 'You'], ['meera', 'You (Meera)']]) + field('Owner of schedule', 'scheduleOwner', [['dad', 'Dad'], ['amma', 'Amma'], ['arjun', 'You']]) + field('Who holds the phone', 'actor', [['arjun', 'You (Arjun)'], ['dad', 'Dad'], ['meera', 'You (Meera)'], ['amma', 'Amma']]) + field('Consent envelope', 'envelope', [['true', 'Active'], ['false', 'Absent']]) + field('Identity owner mapped', 'identityMapped', [['true', 'Mapped'], ['false', 'Missing']]) + field('Approver channel', 'reachable', [['true', 'Reachable'], ['false', 'Unreachable']]) + range('Envelope fare', 'envelopeFare', 1200, 3500, 50, money) + range('Hard budget', 'budget', 1000, 4000, 100, money) + range('Found fare', 'foundFare', 900, 4000, 50, money) + range('Found departure', 'foundDepart', 1020, 1410, 5, clock) + '<div class="divider"></div><div class="eyebrow" style="color:var(--refuse-ink)">Attack presets</div><div class="attack-list"><button class="attack" data-action="attack-money">Give the booker the money<small>R14 stops firing</small></button><button class="attack" data-action="attack-revoke">Revoke Dad mid-flight<small>R15 voids capture</small></button><button class="attack" data-action="attack-unreachable">Make Dad unreachable<small>R12 declared fallback</small></button><button class="attack" data-action="attack-ambiguous">Send an ambiguous yes<small>R10 re-asks one dimension</small></button><button class="attack" data-action="attack-identity">Delete the owner of IDENTITY<small>R1 refuses rather than guessing</small></button></div>';
    const right = '<div class="eyebrow">Live local policy decision ' + badge('LOCAL') + '</div><div class="verdict-word ' + klass + '">' + d.verdict + '</div><p class="verdict-reason">' + d.explanation + '</p><div class="verdict-spec"><div class="spec-item"><span>Domain</span><b>' + d.domain + '</b></div><div class="spec-item"><span>Owner</span><b class="semantic-authority">' + name(d.owner) + '</b></div><div class="spec-item"><span>Fixture</span><b>' + state.scenario + '</b></div></div><div class="eyebrow">Ordered rule trace</div><div class="rule-trace" style="margin-top:10px">' + d.rules.map((r) => '<span class="rule">' + r + '</span>').join('') + '</div><div class="policy-proof">Try the inputs: reassignment can flip a lock, envelope absence asks rather than assumes, and the budget ceiling refuses instead of composing an “exceed?” option.</div>';
    return '<div class="app">' + header() + tabs('lab') + '<section class="panel-grid"><aside class="control-panel">' + left + '</aside><section class="verdict-panel">' + right + '</section></section>' + footer() + '</div>';
  }

  function brain() {
    const live = state.events;
    const visible = state.replay === null ? live : live.slice(0, state.replay);
    const value = state.replay === null ? live.length : state.replay;
    const d = decision(visible);
    const timeline = visible.length ? visible.map((e) => '<div class="event ' + (e.provenance === 'SIMULATED' ? 'event-sim' : e.type.indexOf('VOID') >= 0 || e.type.indexOf('REVOK') >= 0 || e.type.indexOf('EXPIRE') >= 0 ? 'event-danger' : '') + '"><div class="event-meta">' + e.at + ' · ' + e.type + ' · ' + badge(e.provenance) + '</div>' + esc(e.detail) + '</div>').join('') : '<div class="empty-trace">At the beginning of the run. Advance the scrubber to replay the audit log.</div>';
    const obj = { verdict: d.verdict, action: { domain: d.domain, reversibility: 'IRREVERSIBLE' }, owner: name(d.owner), envelope: d.envelopeId, satisfied: d.pass.map((x) => x.label), violated: d.fail.map((x) => x.label), ruleTrace: d.rules, humanExplanation: d.explanation, provenance: 'LOCAL' };
    const left = '<div class="eyebrow">Event-sourced audit</div><h2 class="section-title" style="margin-top:7px">Agent Brain</h2><p class="small">This view renders the same append-only log as the mission. Delete an event, and exactly one trace line disappears.</p><div class="scrubber"><label for="replay"><span>Time-travel scrubber</span><b>' + value + ' / ' + live.length + ' events</b></label><input id="replay" type="range" min="0" max="' + live.length + '" value="' + value + '" step="1"></div><div class="trace-key"><strong>Current replay state</strong><span class="small">The decision object is recomputed from events 1–' + value + '. The future remains visible only when you scrub forward.</span></div><button class="btn secondary wide" style="margin-top:14px" data-action="replay-live">Return to live state</button>';
    const right = '<div class="trace-meta"><div><div class="eyebrow">Causal timeline</div><h2>One source of truth.</h2></div>' + badge('LOCAL') + '</div><div class="timeline">' + timeline + '</div>';
    return '<div class="app">' + header() + tabs('brain') + '<section class="trace-layout"><aside class="content-panel">' + left + '</aside><section class="content-panel">' + right + '</section></section><section class="content-panel" style="margin-top:18px"><div class="eyebrow">Policy object at replay point</div><pre class="decision-object">' + esc(JSON.stringify(obj, null, 2)) + '</pre></section>' + footer() + '</div>';
  }

  function receipt() {
    const d = decision();
    const c = d.controls;
    const s = SCENARIOS[state.scenario];
    const item = s.health ? 'Appointment · Dr Sharma · Cardiology' : 'Booked · Train ' + s.train + ' · 3A · ' + money(c.foundFare);
    const time = s.health ? 'Tue 24 Sep, 16:30 · Sector 12 clinic' : 'Tue 24 Sep, ' + clock(c.foundDepart) + ' · New Delhi → Patna';
    const rows = [['Searching and comparing', 'Agent', 'reversible'], ['Fare, class, cancellation', s.health ? 'You, in advance' : 'Dad, in advance', d.envelopeId || 'no envelope'], [s.health ? 'Appointment time' : 'Departure time', name(d.owner) + ', at ' + (has('APPROVAL_RECEIVED') ? 'T+01:03' : 'recorded'), 'verified'], ['Payment of ' + money(c.foundFare), name(c.moneyOwner), 'pl_mnd_7K2X4Q'], ['Final confirmation', 'Agent, on recorded authority', has('PAYMENT_CAPTURED') ? 'confirmed' : 'simulated receipt']];
    return '<div class="app">' + header() + tabs('receipt') + '<section class="receipt"><div class="receipt-head"><div class="eyebrow">Decision receipt ' + badge('LOCAL') + '</div><h1>' + item + '</h1><p class="lead" style="font-size:13px">' + time + '</p></div><div class="receipt-body"><h2>Who decided what</h2>' + rows.map((r) => '<div class="receipt-row"><span>' + r[0] + '</span><b>' + r[1] + '</b><i>' + r[2] + '</i></div>').join('') + '<div class="receipt-attention">Total human attention: 6 seconds. One question, two fields.</div><button class="btn secondary wide" style="margin-top:16px" data-action="brain">Inspect the decision trace →</button></div></section>' + footer() + '</div>';
  }

  function insights() {
    const c = controls();
    const agent = [3, 2, 1, 1, 0];
    const bot = [1, 1, 1, 1, 1];
    const bars = agent.map((x, i) => '<div class="bar-pair"><div class="bar agent" style="height:' + (x / 3 * 100) + '%"><em>' + x + '</em></div><div class="bar bot" style="height:' + (bot[i] / 3 * 100) + '%"><em>1</em></div></div>').join('');
    const coverage = c.envelopeEnd >= 1320 && c.envelopeFare >= 2500 ? 7 : c.envelopeEnd >= 1260 && c.envelopeFare >= 2000 ? 5 : 3;
    const ledger = '<article class="analytics-card"><div class="eyebrow">Trust ledger ' + badge('SIMULATED') + '</div><h2>Interruptions fall as decisions are bounded.</h2><p class="small">Five fixture missions, not production data. The agent learns only when the approver explicitly widens an envelope.</p><div class="legend"><span><i class="agent-dot"></i>The Slot Agent</span><span><i class="bot-dot"></i>Booking bot</span></div><div class="chart">' + bars + '</div><div class="chart-labels"><span>M1</span><span>M2</span><span>M3</span><span>M4</span><span>M5</span></div></article>';
    const studio = '<article class="analytics-card"><div class="eyebrow violet">Envelope studio ' + badge('LOCAL') + '</div><h2>Build the boundary yourself.</h2><p class="small">Tune the fixture envelope. Coverage is computed against nine simulated requests, never presented as user research.</p><div class="field" style="margin-top:20px"><label>Latest departure <span class="range-value">' + clock(c.envelopeEnd) + '</span></label><input data-control="envelopeEnd" aria-label="Latest departure" type="range" min="1140" max="1380" step="5" value="' + c.envelopeEnd + '"></div><div class="field"><label>Maximum fare <span class="range-value">' + money(c.envelopeFare) + '</span></label><input data-control="envelopeFare" aria-label="Maximum fare" type="range" min="1200" max="3500" step="50" value="' + c.envelopeFare + '"></div><div class="studio-summary"><strong>This envelope would cover ' + coverage + ' of 9 simulated requests.</strong><span class="small">The remaining fixtures are deliberately outside the selected boundary and would still trigger an ask.</span></div><div class="fixture-request-list"><div class="fixture-request"><span>22:20 departure · 24 Sep</span><b class="' + (c.envelopeEnd >= 1340 ? 'semantic-confirm' : 'semantic-refuse') + '">' + (c.envelopeEnd >= 1340 ? 'covered' : 'ask') + '</b></div><div class="fixture-request"><span>' + money(2700) + ' fare · 11 Aug</span><b class="' + (c.envelopeFare >= 2700 ? 'semantic-confirm' : 'semantic-refuse') + '">' + (c.envelopeFare >= 2700 ? 'covered' : 'ask') + '</b></div></div></article>';
    const race = '<article class="analytics-card"><div class="eyebrow blue">Counterfactual race ' + badge('SIMULATED') + '</div><h2>Same clock. Different authority model.</h2><p class="small">A fixture comparison of two paths, rendered as a static state rather than a claim about real booking performance.</p><div class="race"><div class="race-lane manual"><h3>Manual path</h3><div class="race-clock">02:00</div><div class="race-event">Slot appears · call Dad · no answer</div><div class="race-event semantic-refuse">Slot gone at 02:00</div></div><div class="race-lane agent"><h3>Agent path</h3><div class="race-clock">00:31</div><div class="race-event">Slot prepared · one bounded question</div><div class="race-event semantic-confirm">Confirmed on verified approval</div></div></div></article>';
    const integrity = '<article class="analytics-card"><div class="eyebrow">Integrity surface ' + badge('LOCAL') + '</div><h2>What this prototype will and will not claim.</h2><div class="constraint-list" style="margin-top:18px"><div class="constraint"><i>✓</i>Inventory, payment and approvals are labelled SIMULATED.</div><div class="constraint"><i>✓</i>Every visible decision is derived from a local policy object.</div><div class="constraint"><i>✓</i>Every interaction appends an audit event before re-render.</div><div class="constraint"><i>✓</i>No live APIs, user counts, quotes or performance statistics.</div></div><button class="btn secondary wide" style="margin-top:18px" data-action="brain">Review the audit trace →</button></article>';
    return '<div class="app">' + header() + tabs('insights') + '<section class="analytics-grid">' + ledger + studio + race + integrity + '</section>' + footer() + '</div>';
  }

  function render() {
    const views = { landing, mission, authority, watch, payment, lab, brain, receipt, insights };
    $('#app').innerHTML = views[state.view]();
    bind();
  }

  function approve(remember) {
    const who = SCENARIOS[state.scenario].health ? 'Amma' : 'Dad';
    append('IDENTITY_VERIFIED', who + ' identity verified for this approval request.', 'LOCAL');
    if (remember) append('ENVELOPE_AMENDED', 'Approval received; a widened future boundary is proposed.', 'SIMULATED');
    append('APPROVAL_RECEIVED', 'Approval received for the one unresolved dimension.', 'SIMULATED');
    if (SCENARIOS[state.scenario].revokeAfterApproval) append('ENVELOPE_REVOKED', 'Dad revoked the envelope after approval and before capture.', 'SIMULATED');
    append('PAYMENT_RAIL_OPENED', 'Payment rail opened; capture remains separately locked.', 'SIMULATED');
    state.view = 'payment';
    render();
  }

  function capture() {
    append('CAPTURE_RECHECKED', 'Envelope validity and revocation status checked immediately before capture.', 'LOCAL');
    if (has('ENVELOPE_REVOKED')) {
      append('MANDATE_VOIDED', 'Mandate voided: envelope was no longer valid at capture.', 'SIMULATED');
    } else {
      append('PAYMENT_CAPTURED', 'Captured ' + money(decision().controls.foundFare) + ' after pre-capture guards passed.', 'SIMULATED');
      append('BOOKING_CONFIRMED', 'Irreversible confirmation completed on verified authority.', 'SIMULATED');
    }
    render();
  }

  function attack(kind) {
    if (kind === 'money') {
      append('AUTHORITY_REASSIGNED', 'MONEY reassigned to the booker for this fixture attack.', 'LOCAL', { control: 'moneyOwner', value: 'arjun' });
      append('ACTOR_PRESENT', 'Booker is the current actor.', 'LOCAL', { control: 'actor', value: 'arjun' });
    }
    if (kind === 'revoke') append('ENVELOPE_REVOKED', 'Dad revoked the envelope mid-flight.', 'SIMULATED');
    if (kind === 'unreachable') append('REACHABILITY_CHANGED', 'No approved channel can reach Dad.', 'SIMULATED', { control: 'reachable', value: false });
    if (kind === 'ambiguous') append('APPROVAL_AMBIGUOUS', 'Voice fixture: “jo theek lage” classified AMBIGUOUS at 0.61 confidence.', 'SIMULATED');
    if (kind === 'identity') append('IDENTITY_OWNER_REMOVED', 'IDENTITY has no mapped owner.', 'LOCAL', { control: 'identityMapped', value: false });
    render();
  }

  function action(a, node) {
    if (a === 'start') go('mission', 'Mission composer opened.');
    else if (a === 'authority') go('authority', 'Mission fields accepted; authority setup opened.');
    else if (a === 'arm') {
      append('OPPORTUNITY_DETECTED', 'Fixture watch found ' + SCENARIOS[state.scenario].train + '.', 'SIMULATED');
      append('POLICY_EVALUATED', decision().explanation, 'LOCAL');
      state.view = 'watch';
      render();
    } else if (a === 'lab') go('lab', 'Authority Lab opened.');
    else if (a === 'brain') go('brain', 'Agent Brain opened.');
    else if (a === 'receipt') go('receipt', 'Decision receipt opened.');
    else if (a === 'navigate') go(node.dataset.view, node.textContent + ' opened.');
    else if (a === 'reset') reset(state.scenario, state.view === 'landing' ? 'landing' : 'watch');
    else if (a === 'revoke') {
      append('ENVELOPE_REVOKED', 'Approver revoked the active envelope.', 'LOCAL');
      state.view = 'watch';
      render();
    } else if (a === 'silent-confirm') {
      append('IDENTITY_VERIFIED', 'Identity verified against recorded consent.', 'LOCAL');
      append('PAYMENT_CAPTURED', 'Captured ' + money(decision().controls.foundFare) + ' under the fixture mandate.', 'SIMULATED');
      append('BOOKING_CONFIRMED', 'Booking confirmed under bounded consent.', 'SIMULATED');
      state.view = 'receipt';
      render();
    } else if (a === 'approve-once') approve(false);
    else if (a === 'approve-remember') approve(true);
    else if (a === 'reject') {
      append('REJECTION_RECEIVED', 'Approver chose “keep looking”; watch remains armed.', 'SIMULATED');
      render();
    } else if (a === 'counter') {
      append('COUNTER_RECEIVED', 'Approver countered with fare at or below ' + money(1500) + '.', 'SIMULATED', { control: 'envelopeFare', value: 1500 });
      append('POLICY_REEVALUATED', 'Counter re-entered the policy engine before any execution.', 'LOCAL');
      render();
    } else if (a === 'ambiguous') {
      append('APPROVAL_AMBIGUOUS', 'Voice fixture: “jo theek lage” classified AMBIGUOUS at 0.61 confidence.', 'SIMULATED');
      render();
    } else if (a === 'timeout') {
      append('APPROVAL_TIMEOUT', 'No response in 90 simulated seconds; declared fallback evaluated.', 'SIMULATED');
      render();
    } else if (a === 'expire') {
      append('SLOT_EXPIRED', 'Free hold expired before the requested approval arrived.', 'SIMULATED');
      render();
    } else if (a === 'capture') capture();
    else if (a === 'language') setControl('language', node.dataset.language, 'Approver language');
    else if (a === 'attack-money') attack('money');
    else if (a === 'attack-revoke') attack('revoke');
    else if (a === 'attack-unreachable') attack('unreachable');
    else if (a === 'attack-ambiguous') attack('ambiguous');
    else if (a === 'attack-identity') attack('identity');
    else if (a === 'replay-live') {
      append('REPLAY_RETURNED_TO_LIVE', 'Trace returned to the live end of the event log.', 'LOCAL');
      state.replay = null;
      render();
    }
  }

  function bind() {
    $$('[data-action]').forEach((node) => node.addEventListener('click', () => action(node.dataset.action, node)));
    const picker = $('#scenario-picker');
    if (picker) picker.addEventListener('change', (e) => reset(e.target.value, 'watch'));
    $$('[data-control]').forEach((node) => node.addEventListener(node.type === 'range' ? 'input' : 'change', () => {
      let value = node.value;
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (node.type === 'range') value = Number(value);
      setControl(node.dataset.control, value, node.dataset.control.replace(/[A-Z]/g, (x) => ' ' + x.toLowerCase()));
    }));
    const replay = $('#replay');
    if (replay) replay.addEventListener('input', () => {
      append('REPLAY_POSITION_SET', 'Replay cursor moved to event ' + replay.value + '.', 'LOCAL');
      state.replay = Number(replay.value);
      render();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (/^[1-9]$/.test(e.key)) reset('S' + e.key, 'watch');
    if (e.key === '0') reset('S10', 'watch');
  });

  reset('S2', 'landing');
})();
