import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';

const V = {
  navy: '#041E42', navyMid: '#0a2d5e', gold: '#B9975B', goldLight: '#CDB5A7', goldMuted: '#9a7d4a',
  cream: '#FAF8F7', taupe: '#E4D5D3', light: '#f0eae9', gray: '#948794', dark: '#2a1f28',
  white: '#FFFFFF', red: '#C0392B', green: '#1A6B3C',
};
const FONT = {
  heading: "'GFS Didot', Didot, Georgia, serif",
  body: "'Nunito Sans', 'Avenir Next', Avenir, sans-serif",
};

const LAST_4 = ['2026-03-30', '2026-04-06', '2026-04-13', '2026-04-20'];
const LAST_1 = ['2026-04-20'];
const PRIOR_4 = ['2026-03-02', '2026-03-09', '2026-03-16', '2026-03-23'];

const fmt = (v, d = 2) => (v || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = (v, d = 0) => '$' + fmt(v, d);

function NavBar() {
  return (
    <div style={{ background: V.navy, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: FONT.heading, fontSize: 16, color: V.gold, letterSpacing: 6 }}>A M P</span>
        </a>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 20 }}>|</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: V.white, letterSpacing: 2, textTransform: 'uppercase', fontFamily: FONT.body }}>ADVANCED MEDAESTHETIC PARTNERS</span>
      </div>
      <span style={{ fontSize: 9, fontWeight: 600, color: V.goldLight, letterSpacing: 2, textTransform: 'uppercase', fontFamily: FONT.body }}>PM HOURS-REDUCTION BRIEFING</span>
    </div>
  );
}

function Delta({ value, unit = '', digits = 2, suffix = '' }) {
  const v = value || 0;
  const color = v > 0.0001 ? V.green : v < -0.0001 ? V.red : V.gray;
  const sign = v > 0.0001 ? '+' : v < -0.0001 ? '' : '';
  const inner = unit === '$' ? `${sign}$${fmt(Math.abs(v), digits)}${v < 0 ? '' : ''}` : `${sign}${fmt(v, digits)}${unit}`;
  const display = v < 0 && unit === '$' ? `-$${fmt(Math.abs(v), digits)}` : inner;
  return <span style={{ color, fontWeight: 600 }}>{display}{suffix}</span>;
}

function KPI({ label, value, sub }) {
  return (
    <div style={{ background: V.white, borderRadius: 8, border: `1px solid ${V.taupe}`, padding: '14px 18px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: V.gold, marginBottom: 8, fontFamily: FONT.body }}>{label}</div>
      <div style={{ fontFamily: FONT.heading, fontSize: 28, color: V.navy, fontWeight: 400, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: V.gray, marginTop: 6, fontFamily: FONT.body }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, lede }) {
  return (
    <div style={{ marginTop: 28, marginBottom: 12 }}>
      <h2 style={{ fontFamily: FONT.heading, fontSize: 22, fontWeight: 400, color: V.navy, margin: 0 }}>{children}</h2>
      {lede && <div style={{ fontSize: 12, color: V.gray, marginTop: 4, fontFamily: FONT.body }}>{lede}</div>}
      <div style={{ width: 32, height: 2, background: V.gold, borderRadius: 2, marginTop: 8 }} />
    </div>
  );
}

function Table({ headers, rows, totalRow }) {
  return (
    <div style={{ background: V.white, borderRadius: 8, border: `1px solid ${V.taupe}`, overflow: 'hidden', marginTop: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT.body }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{ background: V.navy, color: V.gold, padding: '10px 14px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? V.white : V.cream }}>
              {row.map((c, j) => (
                <td key={j} style={{ padding: '9px 14px', textAlign: j === 0 ? 'left' : 'right', borderBottom: `1px solid ${V.light}`, color: V.dark, fontSize: 12.5 }}>{c}</td>
              ))}
            </tr>
          ))}
          {totalRow && (
            <tr style={{ background: V.light }}>
              {totalRow.map((c, j) => (
                <td key={j} style={{ padding: '11px 14px', textAlign: j === 0 ? 'left' : 'right', color: V.navy, fontSize: 12.5, fontWeight: 700, borderTop: `2px solid ${V.gold}` }}>{c}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function PMReport() {
  const { location } = useParams();
  const loc = decodeURIComponent(location || '');
  const [data, setData] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch('/data/performance/weekly-rev-coll-provider.json').then(r => r.json()),
      fetch('/data/performance/weekly-util-hours-provider.json').then(r => r.json()),
      fetch('/data/performance/weekly-metrics.json').then(r => r.json()),
      fetch('/data/performance/weekly-utilization.json').then(r => r.json()),
      fetch('/data/performance/weekly-provider-hours.json').then(r => r.json()),
    ]).then(([revColl, utilH, metrics, utilLoc, provHrs]) => setData({ revColl, utilH, metrics, utilLoc, provHrs }));
  }, []);

  const computed = useMemo(() => {
    if (!data) return null;
    const { revColl, utilH, metrics, utilLoc, provHrs } = data;
    const aggProv = (weeks) => {
      const o = {};
      utilH.filter(r => r.c === loc && weeks.includes(r.w)).forEach(r => {
        o[r.pr] = o[r.pr] || { rev: 0, coll: 0, h: 0, sh: 0 };
        o[r.pr].h += r.h || 0; o[r.pr].sh += r.sh || 0;
      });
      revColl.filter(r => r.c === loc && weeks.includes(r.w)).forEach(r => {
        o[r.pr] = o[r.pr] || { rev: 0, coll: 0, h: 0, sh: 0 };
        o[r.pr].rev += r.rev || 0; o[r.pr].coll += r.coll || 0;
      });
      return o;
    };
    const aggLoc = (weeks) => {
      let rev = 0, coll = 0, h = 0, uS = 0, uN = 0;
      metrics.filter(r => r.c === loc && weeks.includes(r.w)).forEach(r => { rev += r.s || 0; coll += r.co || 0; });
      provHrs.filter(r => r.c === loc && weeks.includes(r.w)).forEach(r => { h += r.h || 0; });
      utilLoc.filter(r => r.c === loc && weeks.includes(r.w) && r.ur != null).forEach(r => { uS += r.ur; uN += 1; });
      return { rev, coll, h, ur: uN > 0 ? uS / uN : 0 };
    };
    const a4 = aggProv(LAST_4), a1 = aggProv(LAST_1), aP = aggProv(PRIOR_4);
    const d4 = aggLoc(LAST_4), d1 = aggLoc(LAST_1), dP = aggLoc(PRIOR_4);
    const provs = [...new Set([...Object.keys(a4), ...Object.keys(a1), ...Object.keys(aP)])];
    const rows = provs.map(p => {
      const x = a4[p] || { rev: 0, coll: 0, h: 0, sh: 0 };
      const y = a1[p] || { rev: 0, coll: 0, h: 0, sh: 0 };
      const z = aP[p] || { rev: 0, coll: 0, h: 0, sh: 0 };
      return {
        pr: p,
        h4: x.h, sh4: x.sh, ur4: x.h > 0 ? x.sh / x.h * 100 : 0, rh4: x.h > 0 ? x.rev / x.h : 0, ch4: x.h > 0 ? x.coll / x.h : 0,
        h1: y.h, sh1: y.sh, ur1: y.h > 0 ? y.sh / y.h * 100 : 0, rh1: y.h > 0 ? y.rev / y.h : 0, ch1: y.h > 0 ? y.coll / y.h : 0,
        hP: z.h, urP: z.h > 0 ? z.sh / z.h * 100 : 0, rhP: z.h > 0 ? z.rev / z.h : 0, chP: z.h > 0 ? z.coll / z.h : 0,
        hWk4: x.h / 4, hWkP: z.h / 4,
      };
    }).filter(r => r.h4 > 0 || r.h1 > 0).sort((a, b) => b.h4 - a.h4);
    const cuts = rows.map(r => {
      if (r.h4 === 0) return null;
      const cut = Math.max(0, r.h4 - r.sh4 / 0.75) / 4;
      return { pr: r.pr, ur4: r.ur4, hWk4: r.hWk4, ch4: r.ch4, cut, pct: r.hWk4 > 0 ? cut / r.hWk4 * 100 : 0 };
    }).filter(x => x && x.cut > 0.5).sort((a, b) => b.cut - a.cut);
    const totalCut = cuts.reduce((s, c) => s + c.cut, 0);
    return { rows, cuts, totalCut, d4, d1, dP };
  }, [data, loc]);

  if (!data || !computed) return <div style={{ minHeight: '100vh', background: V.cream, fontFamily: FONT.body, padding: 40 }}><NavBar />Loading…</div>;

  const { rows, cuts, totalCut, d4, d1, dP } = computed;
  const rh4 = d4.h > 0 ? d4.rev / d4.h : 0;
  const ch4 = d4.h > 0 ? d4.coll / d4.h : 0;
  const rhP = dP.h > 0 ? dP.rev / dP.h : 0;
  const chP = dP.h > 0 ? dP.coll / dP.h : 0;

  return (
    <div style={{ minHeight: '100vh', background: V.cream, fontFamily: FONT.body }}>
      <NavBar />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 32px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: V.gold, marginBottom: 8 }}>Provider Hour Productivity</div>
        <h1 style={{ fontFamily: FONT.heading, fontSize: 36, fontWeight: 400, color: V.navy, margin: '0 0 6px' }}>{loc}</h1>
        <div style={{ fontSize: 13, color: V.gray }}>4 weeks ending 4/20/2026 · Generated 4/26/2026</div>
        <div style={{ width: 40, height: 3, background: V.gold, borderRadius: 2, marginTop: 14, marginBottom: 24 }} />

        <SectionTitle lede="Comparison vs prior 4 weeks (3/02 – 3/23). Matches dashboard methodology.">Location Snapshot — Last 4 Weeks</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <KPI label="Provider Hours" value={fmt(d4.h, 0)} sub={<><Delta value={d4.h - dP.h} digits={1} /> vs prior 4w</>} />
          <KPI label="Utilization" value={`${fmt(d4.ur, 1)}%`} sub={<><Delta value={d4.ur - dP.ur} digits={1} suffix="pp" /> vs prior 4w</>} />
          <KPI label="Collections / Hour" value={`$${fmt(ch4, 0)}`} sub={<><Delta value={ch4 - chP} unit="$" /> vs prior 4w</>} />
          <KPI label="Revenue" value={`$${fmt(d4.rev, 0)}`} sub={<><Delta value={d4.rev - dP.rev} unit="$" digits={0} /> vs prior 4w</>} />
          <KPI label="Collections" value={`$${fmt(d4.coll, 0)}`} sub={<><Delta value={d4.coll - dP.coll} unit="$" digits={0} /> vs prior 4w</>} />
          <KPI label="Revenue / Hour" value={`$${fmt(rh4, 0)}`} sub={<><Delta value={rh4 - rhP} unit="$" /> vs prior 4w</>} />
        </div>

        <SectionTitle lede="Rev/h and Coll/h reflect provider-attributed dollars only.">By Provider — Last 4 Weeks</SectionTitle>
        <Table
          headers={['Provider', 'Hrs/wk', 'Booked/wk', 'Util %', 'Rev / h', 'Coll / h']}
          rows={rows.map(r => [r.pr, fmt(r.hWk4, 1), fmt(r.sh4 / 4, 1), `${fmt(r.ur4, 1)}%`, money(r.rh4, 2), money(r.ch4, 2)])}
        />

        <SectionTitle>By Provider — Past Week (W/E 4/20)</SectionTitle>
        <Table
          headers={['Provider', 'Hrs', 'Booked', 'Util %', 'Rev / h', 'Coll / h']}
          rows={rows.filter(r => r.h1 > 0).map(r => [r.pr, fmt(r.h1, 1), fmt(r.sh1, 1), `${fmt(r.ur1, 1)}%`, money(r.rh1, 2), money(r.ch1, 2)])}
        />

        <SectionTitle>Trend by Provider · Last 4w vs Prior 4w</SectionTitle>
        <Table
          headers={['Provider', 'Hrs/wk Δ', 'Util Δ', 'Rev/h Δ', 'Coll/h Δ']}
          rows={rows.filter(r => r.hP > 0 || r.h4 > 0).map(r => [
            r.pr,
            <Delta value={r.hWk4 - r.hWkP} digits={1} />,
            <Delta value={r.ur4 - r.urP} digits={1} suffix="pp" />,
            <Delta value={r.rh4 - r.rhP} unit="$" />,
            <Delta value={r.ch4 - r.chP} unit="$" />,
          ])}
        />

        <SectionTitle lede="Method: bring each under-75% provider down to a 75% utilization floor at their current booked-hour pattern. Adjust for known PTO / onboarding before applying.">Recommended Hour Reductions for Upcoming Week</SectionTitle>
        <Table
          headers={['Provider', 'Current Hrs/wk', '4w Util %', '4w Coll/h', 'Cut (hrs/wk)', 'Cut %']}
          rows={cuts.map(c => [
            c.pr, fmt(c.hWk4, 1), `${fmt(c.ur4, 1)}%`, money(c.ch4, 2),
            <span style={{ color: V.red, fontWeight: 700 }}>{fmt(c.cut, 1)}</span>,
            `${fmt(c.pct, 1)}%`,
          ])}
          totalRow={['TOTAL', '', '', '', fmt(totalCut, 1), '']}
        />

        <div style={{ background: V.navy, color: V.cream, padding: '22px 26px', borderRadius: 10, marginTop: 22, display: 'flex', alignItems: 'center', gap: 24 }}>
          <div>
            <div style={{ fontFamily: FONT.heading, fontSize: 40, color: V.gold, fontWeight: 400, lineHeight: 1 }}>~{fmt(totalCut, 0)} hrs</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: V.goldLight, marginTop: 6 }}>Target reduction for upcoming week</div>
          </div>
          <div style={{ flex: 1, fontSize: 13, color: V.cream, lineHeight: 1.5 }}>Action items have been pre-allocated by provider above. Apply in next week's schedule, accounting for any planned PTO or onboarding.</div>
        </div>

        <div style={{ marginTop: 32, padding: '14px 20px', background: V.white, borderRadius: 12, border: `1px solid ${V.taupe}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: V.gray }}>← <a href="/" style={{ color: V.navy, textDecoration: 'none', fontWeight: 600 }}>Back to Performance Tracker Hub</a></span>
          <span style={{ fontSize: 11, color: V.gray }}>DRAFT · Data sourced from CorralData</span>
        </div>
      </div>
    </div>
  );
}
