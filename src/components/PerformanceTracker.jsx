import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ComposedChart, Area
} from 'recharts';

/* ═══════════════════════════════════════════════════════════════
   AMP Performance Tracker — Dynamic Data from JSON
   Design system: navy + gold on cream  ·  GFS Didot + Nunito Sans
   ═══════════════════════════════════════════════════════════════ */

// ── CSS Variables (inline, matching ampintelligence.ai) ──────
const V = {
  navy:      '#041E42',
  navyMid:   '#0a2d5e',
  gold:      '#B9975B',
  goldLight: '#CDB5A7',
  goldMuted: '#9a7d4a',
  cream:     '#FAF8F7',
  taupe:     '#E4D5D3',
  light:     '#f0eae9',
  gray:      '#948794',
  dark:      '#2a1f28',
  white:     '#FFFFFF',
  red:       '#C0392B',
  green:     '#1A6B3C',
  mauve:     '#948794',
  blush:     '#CDB5A7',
};

const FONT = {
  heading: "'GFS Didot', Didot, Georgia, serif",
  body:    "'Nunito Sans', 'Avenir Next', Avenir, sans-serif",
};

// Chart color palette for multi-series lines
const CHART_COLORS = [
  V.gold, V.navy, V.goldLight, '#5B8CB9', V.goldMuted,
  '#7B6B8D', '#4A7C6F', V.red, '#D4A574', '#6B8FA3',
  '#8B4513', '#2E8B57', '#6A5ACD', '#DC143C', '#20B2AA',
  '#DAA520', '#4682B4', '#9370DB', '#CD853F', '#708090',
];

const MAX_SERIES = 12;

// ── Stable Color Map ──────────────────────────────────────────
// Every location/provider name is hashed to a deterministic index so the same
// name ALWAYS gets the same color across every chart on the page.
const _colorCache = {};
function stableHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function getStableColor(name, allNames) {
  // If we have a pre-assigned set of names, assign colors in a stable sorted order
  // so that the same set of names always gets the same assignment
  if (allNames) {
    const sorted = [...allNames].sort();
    const idx = sorted.indexOf(name);
    if (idx >= 0) return CHART_COLORS[idx % CHART_COLORS.length];
  }
  // Fallback: hash-based assignment
  if (!_colorCache[name]) {
    _colorCache[name] = CHART_COLORS[stableHash(name) % CHART_COLORS.length];
  }
  return _colorCache[name];
}

// Master sorted list of all location names — built once when locations.json loads.
// This ensures every location keeps its color even when chart series differ.
let _masterLocationNames = null;
function getMasterLocationColors(locations) {
  if (!_masterLocationNames) {
    _masterLocationNames = locations.map(l => l.name).sort();
  }
  return _masterLocationNames;
}

// ── Formatting helpers ───────────────────────────────────────
const fmtK = (v) => {
  if (v == null) return '';
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v}`;
};
const fmtDollar = (v) => v == null ? '' : `$${v?.toLocaleString()}`;
const fmtPct = (v) => v == null ? '' : `${v}%`;

function formatWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Format month label
function formatMonth(monthKey, isCurrent = false) {
  const d = new Date(monthKey + '-01T00:00:00');
  const label = d.toLocaleString('en', { month: 'short' });
  return isCurrent ? label + ' (MTD)' : label;
}

// Get effective time range for a chart
function getTimeRange(allWeeks, mode, count) {
  const sorted = [...allWeeks].sort();
  if (mode === 'monthly') {
    // Group weeks into months
    const months = [...new Set(sorted.map(w => w.substring(0, 7)))].sort();
    const sliced = months.slice(-count);
    const today = new Date();
    const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    return {
      periods: sliced,
      isMonthly: true,
      weekSet: new Set(sorted.filter(w => sliced.includes(w.substring(0, 7)))),
      formatLabel: (w) => {
        const mk = w.substring(0, 7);
        return formatMonth(mk, mk === curMonth);
      },
    };
  }
  // Weekly mode
  const sliced = sorted.slice(-count);
  return {
    periods: sliced,
    isMonthly: false,
    weekSet: new Set(sliced),
    formatLabel: formatWeek,
  };
}

// Aggregate weekly data into monthly buckets
// aggregationType: 'sum' | 'average' | 'weightedAvg'
function aggregateToMonthly(weeklyRows, valueField, aggregationType = 'sum', weightField = null) {
  const byMonth = {};
  weeklyRows.forEach(r => {
    const mk = r.w.substring(0, 7);
    if (!byMonth[mk]) byMonth[mk] = { values: [], weights: [] };
    const val = Number(r[valueField]) || 0;
    byMonth[mk].values.push(val);
    if (weightField) byMonth[mk].weights.push(Number(r[weightField]) || 0);
  });
  return Object.entries(byMonth).sort(([a],[b]) => a.localeCompare(b)).map(([mk, d]) => {
    let value;
    switch (aggregationType) {
      case 'sum': value = d.values.reduce((s, v) => s + v, 0); break;
      case 'average': value = d.values.length ? d.values.reduce((s, v) => s + v, 0) / d.values.length : 0; break;
      case 'weightedAvg': {
        const totalWeight = d.weights.reduce((s, w) => s + w, 0);
        value = totalWeight > 0 ? d.values.reduce((s, v, i) => s + v * d.weights[i], 0) / totalWeight : 0;
        break;
      }
      default: value = d.values.reduce((s, v) => s + v, 0);
    }
    return { month: mk, value: Math.round(value * 100) / 100 };
  });
}

// ── Ops name mapping ─────────────────────────────────────────
// Maps ops long names like "Avelure Med Spa - Creve Coeur, MO" → "Avelure-Creve Coeur"
function buildOpsNameMap(locations, opsData) {
  const opsNames = [...new Set(opsData.map(r => r.c))];
  const map = {};
  for (const opsName of opsNames) {
    if (!opsName) continue;
    // Try to find a location whose short name is contained in the ops name
    for (const loc of locations) {
      const shortParts = loc.name.replace(/^(Avelure-|Ever\/Body-|Blush - |Back to 30 - )/, '').split(/[\s-]+/);
      // Check if the main distinguishing part of the short name appears in the ops name
      const keyPart = shortParts[0];
      if (keyPart && keyPart.length > 2 && opsName.includes(keyPart)) {
        // Verify it's the right match (avoid "Greenwood" matching "Greenville")
        if (!map[opsName]) {
          map[opsName] = loc.name;
        } else {
          // If we already matched, pick the better match (more chars in common)
          const existingScore = scoreMatch(map[opsName], opsName);
          const newScore = scoreMatch(loc.name, opsName);
          if (newScore > existingScore) map[opsName] = loc.name;
        }
      }
    }
  }
  return map;
}

function scoreMatch(shortName, longName) {
  // Count how many words from shortName appear in longName
  const words = shortName.split(/[\s\-]+/).filter(w => w.length > 2);
  return words.filter(w => longName.includes(w)).length;
}


// ══════════════════════════════════════════════════════════════
//  Reusable Components
// ══════════════════════════════════════════════════════════════

// ── Multi-Select Dropdown ───────────────────────────────
function MultiSelectDropdown({ label, options, selected, onChange, minWidth = 200 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const displayText = selected.length === 0
    ? `All ${label}s`
    : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '8px 32px 8px 12px', border: `1.5px solid ${V.taupe}`,
          borderRadius: 6, fontSize: 13, fontFamily: FONT.body,
          color: selected.length ? V.navy : V.gray, background: V.cream,
          minWidth, cursor: 'pointer', userSelect: 'none',
          position: 'relative', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {displayText}
        <span style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          fontSize: 10, color: V.gray, pointerEvents: 'none',
        }}>▼</span>
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 1000,
          marginTop: 4, minWidth: 220, maxHeight: 320, overflowY: 'auto',
          background: V.white, border: `1.5px solid ${V.taupe}`,
          borderRadius: 8, boxShadow: '0 4px 16px rgba(4,30,66,0.12)',
          padding: '6px 0',
        }}>
          {/* Select All / Clear All */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '4px 12px 8px',
            borderBottom: `1px solid ${V.light}`, marginBottom: 4,
          }}>
            <button onClick={(e) => { e.stopPropagation(); onChange([...options]); }} style={{
              background: 'none', border: 'none', color: V.gold, fontSize: 11,
              fontFamily: FONT.body, fontWeight: 600, cursor: 'pointer', padding: 0,
            }}>Select All</button>
            <button onClick={(e) => { e.stopPropagation(); onChange([]); }} style={{
              background: 'none', border: 'none', color: V.gray, fontSize: 11,
              fontFamily: FONT.body, fontWeight: 600, cursor: 'pointer', padding: 0,
            }}>Clear All</button>
          </div>
          {options.map(opt => (
            <div
              key={opt}
              onClick={(e) => { e.stopPropagation(); toggle(opt); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', cursor: 'pointer', fontSize: 12,
                fontFamily: FONT.body, color: V.dark,
                background: selected.includes(opt) ? V.light : 'transparent',
              }}
              onMouseEnter={e => { if (!selected.includes(opt)) e.currentTarget.style.background = V.cream; }}
              onMouseLeave={e => { e.currentTarget.style.background = selected.includes(opt) ? V.light : 'transparent'; }}
            >
              <span style={{
                width: 16, height: 16, borderRadius: 3,
                border: `1.5px solid ${selected.includes(opt) ? V.gold : V.taupe}`,
                background: selected.includes(opt) ? V.gold : V.white,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'all 0.15s',
              }}>
                {selected.includes(opt) && (
                  <span style={{ color: V.white, fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>
                )}
              </span>
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionSeparator({ number, title }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      margin: '48px 0 24px', paddingBottom: 12,
      borderBottom: `2px solid ${V.gold}`,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 8,
        background: V.navy, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT.heading, fontSize: 22, color: V.gold,
      }}>{number}</div>
      <h2 style={{
        fontFamily: FONT.heading, fontSize: 24, fontWeight: 400,
        color: V.navy, margin: 0,
      }}>{title}</h2>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: V.gold, letterSpacing: 1.5,
      textTransform: 'uppercase', fontFamily: FONT.body, marginBottom: 4,
    }}>{children}</div>
  );
}

function ChartCard({ title, tooltip, children, width = '100%', height, headerRight }) {
  return (
    <div style={{
      background: V.white, borderRadius: 10, border: `1px solid ${V.taupe}`,
      padding: '20px 24px', width, boxSizing: 'border-box',
      minHeight: height || 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
        <h3 style={{
          fontFamily: FONT.heading, fontSize: 16, fontWeight: 400,
          color: V.navy, margin: 0, flexShrink: 0,
        }}>{title}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {headerRight}
          {tooltip && (
            <span style={{
              fontSize: 11, color: V.gray, fontFamily: FONT.body,
              cursor: 'help',
            }} title={tooltip}>ⓘ</span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function KPICard({ label, value, change, format = 'dollar' }) {
  const isPositive = change > 0;
  const displayValue = format === 'dollar' ? fmtDollar(value)
    : format === 'pct' ? fmtPct(value)
    : value?.toLocaleString();
  return (
    <div style={{
      background: V.white, borderRadius: 8, border: `1px solid ${V.taupe}`,
      padding: '16px 20px', flex: 1, minWidth: 160,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 600, color: V.blush, letterSpacing: 2,
        textTransform: 'uppercase', fontFamily: FONT.body, marginBottom: 8,
      }}>{label}</div>
      <div style={{
        fontFamily: FONT.heading, fontSize: 28, color: V.navy,
      }}>{displayValue}</div>
      {change !== undefined && (
        <div style={{
          fontSize: 12, fontFamily: FONT.body, marginTop: 4,
          color: isPositive ? V.green : V.red, fontWeight: 600,
        }}>
          {isPositive ? '↑' : '↓'} {Math.abs(change)}% vs prior period
        </div>
      )}
    </div>
  );
}

// Ensure tooltip text is readable on navy background — lighten dark colors
function readableOnNavy(hexColor) {
  if (!hexColor) return V.cream;
  const hex = hexColor.replace('#', '');
  if (hex.length < 6) return V.cream;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Perceived brightness (0-255)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  // If too dark to read on navy (#041E42 ≈ brightness 25), lighten it
  if (brightness < 100) {
    const lift = 160;
    return `rgb(${Math.min(r + lift, 255)}, ${Math.min(g + lift, 255)}, ${Math.min(b + lift, 255)})`;
  }
  return hexColor;
}

function MultiLineChart({ data, series, height = 320, formatter = fmtK, rightAxisFormatter, yLabel, note, colorMap, rightAxisSeries = [] }) {
  const rightSet = new Set(rightAxisSeries);
  const hasRightAxis = rightAxisSeries.length > 0;
  const rightFmt = rightAxisFormatter || formatter;

  const getSeriesColor = (name, i) => colorMap ? (colorMap[name] || CHART_COLORS[i % CHART_COLORS.length]) : CHART_COLORS[i % CHART_COLORS.length];

  const customTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;
    return (
      <div style={{ background: V.navy, border: 'none', borderRadius: 6, padding: '8px 12px', fontFamily: FONT.body, fontSize: 12 }}>
        <div style={{ color: V.gold, fontWeight: 600, marginBottom: 4 }}>{label}</div>
        {payload.map((entry, i) => {
          const val = rightSet.has(entry.name) ? rightFmt(entry.value) : formatter(entry.value);
          const rawColor = entry.color || entry.stroke || V.cream;
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '1px 0' }}>
              <span style={{ color: readableOnNavy(rawColor) }}>{entry.name}</span>
              <span style={{ color: V.cream, fontWeight: 600 }}>{val}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: hasRightAxis ? 48 : 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={V.taupe} />
          <XAxis dataKey="week" tick={{ fontSize: 11, fontFamily: FONT.body, fill: V.gray }} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fontFamily: FONT.body, fill: V.gray }}
            tickFormatter={formatter}
          />
          {hasRightAxis && (
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 10, fontFamily: FONT.body, fill: V.goldMuted || V.gray }}
              tickFormatter={rightFmt}
              stroke={V.goldLight}
            />
          )}
          <Tooltip content={customTooltip} />
          <Legend
            wrapperStyle={{ fontFamily: FONT.body, fontSize: 11 }}
            iconType="line"
          />
          {series.map((s, i) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              yAxisId={rightSet.has(s) ? 'right' : 'left'}
              stroke={colorMap ? (colorMap[s] || CHART_COLORS[i % CHART_COLORS.length]) : CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={rightSet.has(s) ? 1.5 : 2}
              strokeDasharray={rightSet.has(s) ? '6 3' : ''}
              dot={{ r: rightSet.has(s) ? 2.5 : 3 }}
              activeDot={{ r: 5 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {note && (
        <div style={{ fontSize: 10, color: V.gray, fontFamily: FONT.body, marginTop: 4, textAlign: 'right' }}>
          {note}
        </div>
      )}
    </div>
  );
}

function WeeklyBarChart({ data, series, height = 320, formatter = fmtPct, goalLine, colorMap }) {
  const barTooltip = ({ active, payload, label }) => {
    if (!active || !payload) return null;
    return (
      <div style={{ background: V.navy, border: 'none', borderRadius: 6, padding: '8px 12px', fontFamily: FONT.body, fontSize: 12 }}>
        <div style={{ color: V.gold, fontWeight: 600, marginBottom: 4 }}>{label}</div>
        {payload.map((entry, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '1px 0' }}>
            <span style={{ color: readableOnNavy(entry.color || entry.fill) }}>{entry.name}</span>
            <span style={{ color: V.cream, fontWeight: 600 }}>{formatter(entry.value)}</span>
          </div>
        ))}
      </div>
    );
  };
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={V.taupe} />
        <XAxis dataKey="week" tick={{ fontSize: 11, fontFamily: FONT.body, fill: V.gray }} />
        <YAxis tick={{ fontSize: 11, fontFamily: FONT.body, fill: V.gray }} tickFormatter={formatter} />
        <Tooltip content={barTooltip} />
        <Legend wrapperStyle={{ fontFamily: FONT.body, fontSize: 11 }} />
        {series.map((s, i) => (
          <Bar
            key={s}
            dataKey={s}
            fill={colorMap ? (colorMap[s] || CHART_COLORS[i % CHART_COLORS.length]) : CHART_COLORS[i % CHART_COLORS.length]}
            radius={[3, 3, 0, 0]}
            maxBarSize={40}
          />
        ))}
        {goalLine && (
          <Line
            type="monotone"
            dataKey={() => goalLine.value}
            stroke={V.red}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            name={goalLine.label}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function MTDSummaryTable({ data }) {
  // data = { revenue: [{label, actual, budget, isTotal?}], collections: [...] }
  if (!data || !data.revenue) return null;
  const renderSection = (title, rows) => {
    if (!rows || !rows.length) return null;
    const hdr = { fontSize: 9, fontWeight: 600, color: V.blush, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: FONT.body, textAlign: 'right' };
    return (
      <div style={{ marginBottom: 16 }}>
        {/* Section title header */}
        <div style={{ borderRadius: '8px 8px 0 0', overflow: 'hidden', border: `1px solid ${V.taupe}` }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr',
            background: V.navy, padding: '8px 12px',
          }}>
            <div style={{ ...hdr, textAlign: 'left' }}></div>
            <div style={hdr}>Actual</div>
            <div style={hdr}>Budget</div>
            <div style={hdr}>Variance</div>
          </div>
          {/* Title bar */}
          <div style={{
            background: V.navy, padding: '4px 12px 8px',
            borderTop: `1px solid rgba(255,255,255,0.08)`,
          }}>
            <div style={{
              fontFamily: FONT.heading, fontSize: 15, color: V.gold, fontWeight: 400,
            }}>{title}</div>
          </div>
          {/* Rows */}
          {rows.map((row, i) => {
            const variance = row.budget > 0 ? ((row.actual - row.budget) / row.budget * 100) : 0;
            const isPositive = variance >= 0;
            const isTotal = row.isTotal;
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '60px 1fr 1fr 1fr',
                padding: '7px 12px',
                background: isTotal ? V.light : (i % 2 === 0 ? V.cream : V.white),
                borderTop: `1px solid ${V.taupe}`,
                fontWeight: isTotal ? 700 : 400,
              }}>
                <div style={{ fontFamily: FONT.body, fontSize: 12, fontWeight: isTotal ? 700 : 600, color: V.navy }}>
                  {row.label}
                </div>
                <div style={{ fontFamily: FONT.body, fontSize: 12, color: V.dark, textAlign: 'right' }}>
                  {fmtK(row.actual)}
                </div>
                <div style={{ fontFamily: FONT.body, fontSize: 12, color: V.gray, textAlign: 'right' }}>
                  {row.budget > 0 ? fmtK(row.budget) : '—'}
                </div>
                <div style={{
                  fontFamily: FONT.body, fontSize: 12, fontWeight: 600, textAlign: 'right',
                  color: row.budget > 0 ? (isPositive ? V.green : V.red) : V.gray,
                }}>
                  {row.budget > 0
                    ? `${isPositive ? '' : ''}${variance >= 0 ? '+' : ''}${variance.toFixed(0)}%`
                    : '—'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div>
      {renderSection('Revenue', data.revenue || [])}
      {renderSection('Collections', data.collections || [])}
    </div>
  );
}

function ServiceMixTable({ data, compact = false }) {
  const cols = ['Inject.', 'Body', 'Laser', 'Facials', 'Retail', 'Other'];
  const keys = ['injectables', 'body', 'laser', 'facials', 'retail', 'other'];
  const colTemplate = compact
    ? `100px repeat(${cols.length}, 1fr)`
    : `180px repeat(${cols.length}, 1fr)`;
  const pad = compact ? '6px 10px' : '10px 14px';
  const fontSize = compact ? 10 : 12;
  const headerSize = compact ? 8 : 9;
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${V.taupe}` }}>
      <div style={{
        display: 'grid', gridTemplateColumns: colTemplate,
        background: V.navy, padding: pad,
      }}>
        <div style={{ fontSize: headerSize, fontWeight: 600, color: V.blush, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: FONT.body }}>
          Location
        </div>
        {cols.map(s => (
          <div key={s} style={{
            fontSize: headerSize, fontWeight: 600, color: V.blush, letterSpacing: 1,
            textTransform: 'uppercase', fontFamily: FONT.body, textAlign: 'right',
          }}>{s}</div>
        ))}
      </div>
      {data.map((row, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: colTemplate,
          padding: pad,
          background: i % 2 === 0 ? V.cream : V.white,
          borderTop: `1px solid ${V.taupe}`,
        }}>
          <div style={{ fontFamily: FONT.body, fontSize, fontWeight: 600, color: V.navy, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</div>
          {keys.map(k => (
            <div key={k} style={{ fontFamily: FONT.body, fontSize, color: V.dark, textAlign: 'right' }}>
              {row[k]}%
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PlaceholderCard({ title, message }) {
  return (
    <div style={{
      padding: '20px 24px', background: V.white, borderRadius: 10,
      border: `1px solid ${V.taupe}`, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontFamily: FONT.heading, fontSize: 16, color: V.navy, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 12, color: V.gray, fontFamily: FONT.body }}>{message}</div>
    </div>
  );
}

// ── Chart Time Control (per-chart override for time range) ───
function ChartTimeControl({ chartId, globalMode, globalCount, overrides, setOverrides }) {
  const override = overrides[chartId];
  const effectiveMode = override?.mode || globalMode;
  const effectiveCount = override?.count || globalCount;
  const isOverridden = !!override;

  const handleModeChange = (e) => {
    const mode = e.target.value;
    setOverrides(prev => ({ ...prev, [chartId]: { mode, count: effectiveCount } }));
  };
  const handleCountChange = (e) => {
    const count = Number(e.target.value);
    setOverrides(prev => ({ ...prev, [chartId]: { mode: effectiveMode, count } }));
  };
  const handleReset = () => {
    setOverrides(prev => { const next = { ...prev }; delete next[chartId]; return next; });
  };

  const selectStyle = {
    padding: '3px 6px', fontSize: 10, fontFamily: FONT.body,
    border: `1px solid ${isOverridden ? V.gold : V.taupe}`,
    borderRadius: 4, background: isOverridden ? 'rgba(185,151,91,0.08)' : V.cream,
    color: V.navy, cursor: 'pointer', minWidth: 65,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <select value={effectiveMode} onChange={handleModeChange} style={selectStyle}>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
      <select value={effectiveCount} onChange={handleCountChange} style={{ ...selectStyle, minWidth: 40 }}>
        {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      {isOverridden && (
        <button onClick={handleReset} style={{
          background: 'none', border: 'none', color: V.gold,
          fontSize: 10, cursor: 'pointer', fontFamily: FONT.body,
          textDecoration: 'underline', padding: 0,
        }}>Reset</button>
      )}
    </div>
  );
}

// ── Data transformation helpers ──────────────────────────────

/**
 * Build a weekly chart dataset from metrics. Returns { data, series, note }.
 * If >MAX_SERIES locations, picks the top ones by total value and adds a note.
 */
function buildWeeklyChart(metrics, filteredNames, valueKey, labelFn) {
  const centerNames = new Set(filteredNames);
  const filtered = metrics.filter(m => centerNames.has(m.c));
  const weeks = [...new Set(filtered.map(m => m.w))].sort();

  // Compute totals per center to pick top N
  const totals = {};
  filtered.forEach(m => {
    totals[m.c] = (totals[m.c] || 0) + (m[valueKey] || 0);
  });

  let series = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  let note = null;
  if (series.length > MAX_SERIES) {
    note = `Showing top ${MAX_SERIES} of ${series.length} locations by total`;
    series = series.slice(0, MAX_SERIES);
  }

  const seriesSet = new Set(series);
  const data = weeks.map(w => {
    const row = { week: formatWeek(w) };
    filtered.filter(m => m.w === w && seriesSet.has(m.c)).forEach(m => {
      row[m.c] = m[valueKey];
    });
    return row;
  });

  return { data, series, note };
}

/**
 * Build a weekly chart with computed values (e.g. avg rev per patient, retail %).
 */
function buildWeeklyComputedChart(metrics, filteredNames, computeFn) {
  const centerNames = new Set(filteredNames);
  const filtered = metrics.filter(m => centerNames.has(m.c));
  const weeks = [...new Set(filtered.map(m => m.w))].sort();

  // Compute values per center per week, then get totals for ranking
  const allValues = {}; // { center: { week: value } }
  filtered.forEach(m => {
    const val = computeFn(m);
    if (val == null) return;
    if (!allValues[m.c]) allValues[m.c] = {};
    allValues[m.c][m.w] = val;
  });

  // Rank by average value
  const avgTotals = {};
  Object.entries(allValues).forEach(([c, wvals]) => {
    const vals = Object.values(wvals).filter(v => v != null);
    avgTotals[c] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  });

  let series = Object.keys(avgTotals).sort((a, b) => avgTotals[b] - avgTotals[a]);
  let note = null;
  if (series.length > MAX_SERIES) {
    note = `Showing top ${MAX_SERIES} of ${series.length} locations`;
    series = series.slice(0, MAX_SERIES);
  }

  const seriesSet = new Set(series);
  const data = weeks.map(w => {
    const row = { week: formatWeek(w) };
    series.forEach(c => {
      if (allValues[c] && allValues[c][w] != null) {
        row[c] = allValues[c][w];
      }
    });
    return row;
  });

  return { data, series, note };
}

/**
 * Build ops chart (noshow/cancel rate). Needs ops name mapping.
 */
function buildOpsChart(opsData, filteredNames, opsNameMap, valueKey) {
  // Reverse map: short name → ops name
  const reverseMap = {};
  Object.entries(opsNameMap).forEach(([opsName, shortName]) => {
    reverseMap[shortName] = opsName;
  });

  const centerNames = new Set(filteredNames);
  const relevantOpsNames = new Set();
  filteredNames.forEach(n => {
    if (reverseMap[n]) relevantOpsNames.add(reverseMap[n]);
  });

  const filtered = opsData.filter(m => relevantOpsNames.has(m.c));
  const weeks = [...new Set(filtered.map(m => m.w))].sort();

  // Map ops names back to short names for display
  const opsToShort = {};
  filtered.forEach(m => { if (opsNameMap[m.c]) opsToShort[m.c] = opsNameMap[m.c]; });

  // Compute totals for ranking
  const totals = {};
  filtered.forEach(m => {
    const shortName = opsToShort[m.c] || m.c;
    totals[shortName] = (totals[shortName] || 0) + (m[valueKey] || 0);
  });

  let series = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  let note = null;
  if (series.length > MAX_SERIES) {
    note = `Showing top ${MAX_SERIES} of ${series.length} locations`;
    series = series.slice(0, MAX_SERIES);
  }

  const seriesSet = new Set(series);
  const data = weeks.map(w => {
    const row = { week: formatWeek(w) };
    filtered.filter(m => m.w === w).forEach(m => {
      const shortName = opsToShort[m.c] || m.c;
      if (seriesSet.has(shortName)) {
        row[shortName] = m[valueKey];
      }
    });
    return row;
  });

  return { data, series, note };
}


// ══════════════════════════════════════════════════════════════
//  Location Performance Report (collapsible, shown for single location)
// ══════════════════════════════════════════════════════════════

function LocationReport({ location, locations, metrics, opsData, btxData, syringeLocData, utilizationData, providerHoursData, injRevProviderData, btxProviderData, syringeProvData, revCollProvData }) {
  const [expandedSections, setExpandedSections] = useState({ kpi: false, efficiency: false, providers: false, recommendations: false });
  const toggleSection = (key) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const reportData = useMemo(() => {
    if (!location || !locations.length || !metrics.length) return null;

    const locObj = locations.find(l => l.name === location);
    const locType = locObj?.types?.[0] || '';
    const peers = locations.filter(l => l.types?.includes(locType)).map(l => l.name);
    const allWeeks = [...new Set(metrics.map(r => r.w))].sort();
    const last4Weeks = allWeeks.slice(-4);
    const last4Set = new Set(last4Weeks);

    // Helpers using ACTUAL JSON field names
    const avg = (data, locName, field) => {
      if (!data || !data.length) return null;
      const rows = data.filter(r => r.c === locName && last4Set.has(r.w));
      if (!rows.length) return null;
      return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0) / rows.length;
    };
    const sum4 = (data, locName, field) => {
      if (!data || !data.length) return 0;
      return data.filter(r => r.c === locName && last4Set.has(r.w)).reduce((s, r) => s + (Number(r[field]) || 0), 0);
    };
    const avgMulti = (data, locNames, field) => {
      if (!data || !data.length) return null;
      const vals = locNames.map(n => avg(data, n, field)).filter(v => v != null);
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };

    // KPI calculations
    const locRev = sum4(metrics, location, 's');
    const locPt = sum4(metrics, location, 'p');
    const locRevPerPt = locPt > 0 ? locRev / locPt : null;
    const peerRev = peers.reduce((s, p) => s + sum4(metrics, p, 's'), 0);
    const peerPt = peers.reduce((s, p) => s + sum4(metrics, p, 'p'), 0);
    const peerRevPerPt = peerPt > 0 ? peerRev / peerPt : null;

    const locRetailPct = locRev > 0 ? sum4(metrics, location, 'rt') / locRev * 100 : null;
    const peerRetailPct = peerRev > 0 ? peers.reduce((s, p) => s + sum4(metrics, p, 'rt'), 0) / peerRev * 100 : null;

    const locInjPct = locRev > 0 ? sum4(metrics, location, 'inj') / locRev * 100 : null;
    const peerInjPct = peerRev > 0 ? peers.reduce((s, p) => s + sum4(metrics, p, 'inj'), 0) / peerRev * 100 : null;

    const locColl = sum4(metrics, location, 'co');
    const locCollPct = locRev > 0 ? locColl / locRev * 100 : null;
    const peerColl = peers.reduce((s, p) => s + sum4(metrics, p, 'co'), 0);
    const peerCollPct = peerRev > 0 ? peerColl / peerRev * 100 : null;

    const locBtxUnits = avg(btxData, location, 'b');
    const peerBtxUnits = avgMulti(btxData, peers, 'b');

    const locSyringes = avg(syringeLocData, location, 'sf');
    const peerSyringes = avgMulti(syringeLocData, peers, 'sf');

    const locCancelRate = avg(opsData, location, 'cn');
    const peerCancelRate = avgMulti(opsData, peers, 'cn');

    const locNoshowRate = avg(opsData, location, 'ns');
    const peerNoshowRate = avgMulti(opsData, peers, 'ns');

    const locUtil = avg(utilizationData, location, 'ur');
    const peerUtil = avgMulti(utilizationData, peers, 'ur');

    const locPatients = avg(metrics, location, 'p');
    const peerPatients = avgMulti(metrics, peers, 'p');

    // ── 4-Week Trend calculation per KPI ──
    const computeTrend = (data, locName, field, divisorData, divisorField) => {
      if (!data || !data.length || last4Weeks.length < 2) return null;
      const sorted = data.filter(r => r.c === locName && last4Set.has(r.w)).sort((a, b) => a.w.localeCompare(b.w));
      if (sorted.length < 2) return null;
      const half = Math.ceil(sorted.length / 2);
      const first = sorted.slice(0, half);
      const second = sorted.slice(half);
      const avgField = (rows) => rows.length ? rows.reduce((s, r) => s + (Number(r[field]) || 0), 0) / rows.length : 0;
      const v1 = avgField(first);
      const v2 = avgField(second);
      if (v1 === 0 && v2 === 0) return 0;
      return v1 !== 0 ? ((v2 - v1) / Math.abs(v1)) * 100 : (v2 > 0 ? 100 : -100);
    };

    // Per-KPI trends
    const revPerPtTrend = (() => {
      const sorted = metrics.filter(r => r.c === location && last4Set.has(r.w)).sort((a, b) => a.w.localeCompare(b.w));
      if (sorted.length < 2) return null;
      const half = Math.ceil(sorted.length / 2);
      const avgRpp = (rows) => {
        const rev = rows.reduce((s, r) => s + (Number(r.s) || 0), 0);
        const pts = rows.reduce((s, r) => s + (Number(r.p) || 0), 0);
        return pts > 0 ? rev / pts : 0;
      };
      const v1 = avgRpp(sorted.slice(0, half));
      const v2 = avgRpp(sorted.slice(half));
      return v1 !== 0 ? ((v2 - v1) / Math.abs(v1)) * 100 : 0;
    })();

    const retailPctTrend = (() => {
      const sorted = metrics.filter(r => r.c === location && last4Set.has(r.w)).sort((a, b) => a.w.localeCompare(b.w));
      if (sorted.length < 2) return null;
      const half = Math.ceil(sorted.length / 2);
      const avgPct = (rows) => {
        const rev = rows.reduce((s, r) => s + (Number(r.s) || 0), 0);
        const rt = rows.reduce((s, r) => s + (Number(r.rt) || 0), 0);
        return rev > 0 ? rt / rev * 100 : 0;
      };
      const v1 = avgPct(sorted.slice(0, half));
      const v2 = avgPct(sorted.slice(half));
      return v2 - v1; // pct point change
    })();

    const injPctTrend = (() => {
      const sorted = metrics.filter(r => r.c === location && last4Set.has(r.w)).sort((a, b) => a.w.localeCompare(b.w));
      if (sorted.length < 2) return null;
      const half = Math.ceil(sorted.length / 2);
      const avgPct = (rows) => {
        const rev = rows.reduce((s, r) => s + (Number(r.s) || 0), 0);
        const inj = rows.reduce((s, r) => s + (Number(r.inj) || 0), 0);
        return rev > 0 ? inj / rev * 100 : 0;
      };
      const v1 = avgPct(sorted.slice(0, half));
      const v2 = avgPct(sorted.slice(half));
      return v2 - v1;
    })();

    const collPctTrend = (() => {
      const sorted = metrics.filter(r => r.c === location && last4Set.has(r.w)).sort((a, b) => a.w.localeCompare(b.w));
      if (sorted.length < 2) return null;
      const half = Math.ceil(sorted.length / 2);
      const avgPct = (rows) => {
        const rev = rows.reduce((s, r) => s + (Number(r.s) || 0), 0);
        const co = rows.reduce((s, r) => s + (Number(r.co) || 0), 0);
        return rev > 0 ? co / rev * 100 : 0;
      };
      const v1 = avgPct(sorted.slice(0, half));
      const v2 = avgPct(sorted.slice(half));
      return v2 - v1;
    })();

    const btxTrend = computeTrend(btxData, location, 'b');
    const syringeTrend = computeTrend(syringeLocData, location, 'sf');
    const cancelTrend = computeTrend(opsData, location, 'cn');
    const noshowTrend = computeTrend(opsData, location, 'ns');
    const utilTrend = computeTrend(utilizationData, location, 'ur');
    const patientTrend = computeTrend(metrics, location, 'p');

    // Revenue trend (overall)
    const locMetrics4 = metrics.filter(r => r.c === location && last4Set.has(r.w)).sort((a, b) => a.w.localeCompare(b.w));
    const half = Math.ceil(locMetrics4.length / 2);
    const firstHalf = locMetrics4.slice(0, half);
    const secondHalf = locMetrics4.slice(half);
    const avgRevFn = (rows) => rows.length ? rows.reduce((s, r) => s + (Number(r.s) || 0), 0) / rows.length : 0;
    const avgPtsFn = (rows) => rows.length ? rows.reduce((s, r) => s + (Number(r.p) || 0), 0) / rows.length : 0;
    const revTrend = firstHalf.length && secondHalf.length ? (avgRevFn(secondHalf) - avgRevFn(firstHalf)) / (avgRevFn(firstHalf) || 1) * 100 : 0;
    const ptTrend = firstHalf.length && secondHalf.length ? (avgPtsFn(secondHalf) - avgPtsFn(firstHalf)) / (avgPtsFn(firstHalf) || 1) * 100 : 0;

    // ── Section 2: Revenue & Efficiency ──
    const locHours = sum4(providerHoursData || [], location, 'h');
    const locRevPerHour = locHours > 0 ? locRev / locHours : null;
    const locCollPerHour = locHours > 0 ? locColl / locHours : null;
    const locAvgHoursPerWeek = avg(providerHoursData || [], location, 'h');
    // Peer averages for efficiency
    const peerHours = peers.reduce((s, p) => s + sum4(providerHoursData || [], p, 'h'), 0);
    const peerRevPerHour = peerHours > 0 ? peerRev / peerHours : null;
    const peerCollPerHour = peerHours > 0 ? peerColl / peerHours : null;
    const peerAvgHoursPerWeek = avgMulti(providerHoursData || [], peers, 'h');

    // ── Section 3: Provider Performance ──
    const providerCards = (() => {
      if (!injRevProviderData || !injRevProviderData.length) return [];
      const provRows = injRevProviderData.filter(r => r.c === location && last4Set.has(r.w));
      const providerNames = [...new Set(provRows.map(r => r.pr))].filter(Boolean);

      // Peer averages for provider-level metrics
      const peerInjRevRows = injRevProviderData.filter(r => peers.includes(r.c) && last4Set.has(r.w));
      const allPeerProviders = [...new Set(peerInjRevRows.map(r => r.pr))];
      const peerAvgInjRev = allPeerProviders.length > 0
        ? allPeerProviders.map(pr => peerInjRevRows.filter(r => r.pr === pr).reduce((s, r) => s + (Number(r.r) || 0), 0)).reduce((s, v) => s + v, 0) / allPeerProviders.length
        : null;

      const peerBtxRows = (btxProviderData || []).filter(r => peers.includes(r.c) && last4Set.has(r.w));
      const peerBtxProviders = [...new Set(peerBtxRows.map(r => r.pr))];
      const peerAvgBtx = peerBtxProviders.length > 0
        ? (() => {
          const totalUnits = peerBtxRows.reduce((s, r) => s + (Number(r.b) || 0) * (Number(r.n) || 1), 0);
          const totalN = peerBtxRows.reduce((s, r) => s + (Number(r.n) || 1), 0);
          return totalN > 0 ? totalUnits / totalN : null;
        })()
        : null;

      const peerSyrRows = (syringeProvData || []).filter(r => peers.includes(r.c) && last4Set.has(r.w));
      const peerSyrProviders = [...new Set(peerSyrRows.map(r => r.pr))];
      const peerAvgSyrInj = peerSyrProviders.length > 0
        ? (() => {
          const vals = peerSyrProviders.map(pr => {
            const rows = peerSyrRows.filter(r => r.pr === pr);
            return rows.length ? rows.reduce((s, r) => s + (Number(r.si) || 0), 0) / rows.length : null;
          }).filter(v => v != null);
          return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        })()
        : null;
      const peerAvgSyrFiller = peerSyrProviders.length > 0
        ? (() => {
          const vals = peerSyrProviders.map(pr => {
            const rows = peerSyrRows.filter(r => r.pr === pr);
            return rows.length ? rows.reduce((s, r) => s + (Number(r.sf) || 0), 0) / rows.length : null;
          }).filter(v => v != null);
          return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
        })()
        : null;

      const peerRevCollRows = (revCollProvData || []).filter(r => peers.includes(r.c) && last4Set.has(r.w));
      const peerRevCollProviders = [...new Set(peerRevCollRows.map(r => r.pr))];
      const peerAvgCollPct = peerRevCollProviders.length > 0
        ? (() => {
          const totalRev = peerRevCollRows.reduce((s, r) => s + (Number(r.rev) || 0), 0);
          const totalColl = peerRevCollRows.reduce((s, r) => s + (Number(r.coll) || 0), 0);
          return totalRev > 0 ? (totalColl / totalRev) * 100 : null;
        })()
        : null;

      return providerNames.map(pr => {
        // Injectable revenue (sum over 4 weeks)
        const prInjRows = provRows.filter(r => r.pr === pr);
        const injRev = prInjRows.reduce((s, r) => s + (Number(r.r) || 0), 0);

        // Botox units (weighted avg)
        const prBtxRows = (btxProviderData || []).filter(r => r.c === location && r.pr === pr && last4Set.has(r.w));
        const btxTotal = prBtxRows.reduce((s, r) => s + (Number(r.b) || 0) * (Number(r.n) || 1), 0);
        const btxN = prBtxRows.reduce((s, r) => s + (Number(r.n) || 1), 0);
        const avgBtx = btxN > 0 ? btxTotal / btxN : null;

        // Syringe data
        const prSyrRows = (syringeProvData || []).filter(r => r.c === location && r.pr === pr && last4Set.has(r.w));
        const avgSyrInj = prSyrRows.length ? prSyrRows.reduce((s, r) => s + (Number(r.si) || 0), 0) / prSyrRows.length : null;
        const avgSyrFiller = prSyrRows.length ? prSyrRows.reduce((s, r) => s + (Number(r.sf) || 0), 0) / prSyrRows.length : null;

        // Collections %
        const prCollRows = (revCollProvData || []).filter(r => r.c === location && r.pr === pr && last4Set.has(r.w));
        const prRev = prCollRows.reduce((s, r) => s + (Number(r.rev) || 0), 0);
        const prCollVal = prCollRows.reduce((s, r) => s + (Number(r.coll) || 0), 0);
        const collPct = prRev > 0 ? (prCollVal / prRev) * 100 : null;

        // Determine weakest metric vs peers
        const gaps = [];
        if (avgBtx != null && peerAvgBtx != null && avgBtx < peerAvgBtx) gaps.push({ metric: 'btx', gap: (peerAvgBtx - avgBtx) / peerAvgBtx });
        if (avgSyrInj != null && peerAvgSyrInj != null && avgSyrInj < peerAvgSyrInj) gaps.push({ metric: 'syrInj', gap: (peerAvgSyrInj - avgSyrInj) / peerAvgSyrInj });
        if (avgSyrFiller != null && peerAvgSyrFiller != null && avgSyrFiller < peerAvgSyrFiller) gaps.push({ metric: 'syrFiller', gap: (peerAvgSyrFiller - avgSyrFiller) / peerAvgSyrFiller });
        if (collPct != null && peerAvgCollPct != null && collPct < peerAvgCollPct) gaps.push({ metric: 'coll', gap: (peerAvgCollPct - collPct) / peerAvgCollPct });
        if (peerAvgInjRev != null && injRev < peerAvgInjRev) gaps.push({ metric: 'injRev', gap: (peerAvgInjRev - injRev) / peerAvgInjRev });
        gaps.sort((a, b) => b.gap - a.gap);
        const weakest = gaps[0]?.metric || null;

        const recMap = {
          btx: `Consider full-face assessment protocols to increase neurotoxin dosing.`,
          syrInj: `Review injectable treatment plans -- opportunity to increase volume per appointment.`,
          syrFiller: `Review filler treatment plans -- opportunity to increase volume per appointment.`,
          coll: `Focus on point-of-sale collection and reducing outstanding balances.`,
          injRev: `Schedule injectable-focused training and increase consultation-to-treatment conversion.`,
        };

        return {
          name: pr, injRev, avgBtx, avgSyrInj, avgSyrFiller, collPct,
          peerAvgInjRev, peerAvgBtx, peerAvgSyrInj, peerAvgSyrFiller, peerAvgCollPct,
          recommendation: weakest ? recMap[weakest] : null,
        };
      }).sort((a, b) => b.injRev - a.injRev);
    })();

    // Identify improved / declined metrics
    const improved = [];
    const declined = [];
    if (locRetailPct != null) { if (locRetailPct >= 7.5) improved.push('Retail %'); else declined.push('Retail %'); }
    if (locBtxUnits != null) { if (locBtxUnits >= 40) improved.push('Botox Units'); else declined.push('Botox Units'); }
    if (locCancelRate != null) { if (locCancelRate <= 5) improved.push('Cancellation Rate'); else declined.push('Cancellation Rate'); }
    if (locUtil != null) { if (locUtil >= 70) improved.push('Utilization'); else declined.push('Utilization'); }

    // Date range
    const fmtDate = (ds) => new Date(ds + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const periodStart = last4Weeks[0];
    const periodEnd = last4Weeks[last4Weeks.length - 1];

    // ── Section 4: Enhanced Recommendations ──
    const recommendations = [];

    // Quick wins
    if (locCancelRate != null && locCancelRate > 5) {
      const weeklyAppts = avg(opsData, location, 't') || 0;
      const excessRate = locCancelRate - 5;
      const lostAppts = Math.round(weeklyAppts * excessRate / 100);
      const avgRevPerAppt = locPt > 0 ? locRev / locPt : 0;
      const weeklyImpact = lostAppts * avgRevPerAppt / 4;
      recommendations.push({
        title: 'Confirmation Protocol Improvement',
        description: `Cancellation rate at ${locCancelRate.toFixed(1)}% exceeds the 5% goal (~${lostAppts} excess cancellations/week, ~$${Math.round(weeklyImpact).toLocaleString()}/week revenue impact). Implement 48-hour and 24-hour confirmation touchpoints via text and phone.`,
        priority: 'CRITICAL', quickWin: true,
      });
    }
    if (locNoshowRate != null && locNoshowRate > 5) {
      const weeklyAppts = avg(opsData, location, 't') || 0;
      const excessRate = locNoshowRate - 5;
      const lostAppts = Math.round(weeklyAppts * excessRate / 100);
      const avgRevPerAppt = locPt > 0 ? locRev / locPt : 0;
      const weeklyImpact = lostAppts * avgRevPerAppt / 4;
      recommendations.push({
        title: 'No-Show Reduction',
        description: `No-show rate at ${locNoshowRate.toFixed(1)}% (~${lostAppts} excess no-shows/week, ~$${Math.round(weeklyImpact).toLocaleString()}/week). Activate automated SMS reminders at 72h, 24h, and 2h before appointments.`,
        priority: locNoshowRate > 10 ? 'CRITICAL' : 'IMPORTANT', quickWin: true,
      });
    }

    if (locRetailPct != null && locRetailPct < 7.5) {
      const gap = 7.5 - locRetailPct;
      const weeklyRevImpact = (locRev / 4) * (gap / 100);
      recommendations.push({
        title: 'Retail Strategy Enhancement',
        description: `Retail at ${locRetailPct.toFixed(1)}% vs 7.5% goal (~$${Math.round(weeklyRevImpact).toLocaleString()}/week gap). Introduce product bundling with service packages and ensure all providers recommend post-treatment products at checkout.`,
        priority: gap > 3 ? 'CRITICAL' : 'IMPORTANT',
      });
    }

    // Provider-specific botox recommendation
    const lowBtxProviders = providerCards.filter(p => p.avgBtx != null && p.peerAvgBtx != null && p.avgBtx < p.peerAvgBtx);
    if (locBtxUnits != null && locBtxUnits < 40) {
      const provNames = lowBtxProviders.slice(0, 3).map(p => p.name);
      const provStr = provNames.length > 0 ? ` Focus training on ${provNames.join(', ')}.` : '';
      recommendations.push({
        title: 'Neurotoxin Dosing Training',
        description: `Avg Botox units at ${locBtxUnits.toFixed(1)} vs 40-unit goal. Schedule provider education on full-face treatment protocols.${provStr}`,
        priority: (40 - locBtxUnits) > 10 ? 'CRITICAL' : 'IMPORTANT',
      });
    }

    if (locUtil != null && locUtil < 70) {
      const gap = 70 - locUtil;
      const hoursVal = locAvgHoursPerWeek != null ? ` (currently ${locAvgHoursPerWeek.toFixed(0)} net hrs/week)` : '';
      recommendations.push({
        title: 'Schedule Optimization',
        description: `Utilization at ${locUtil.toFixed(1)}% vs 70% target${hoursVal}. Review provider scheduling templates to minimize gaps. ${locUtil < 55 ? 'Consider reducing blockout hours and maximizing appointment density during peak times.' : 'Offer last-minute booking promotions for open slots.'}`,
        priority: gap > 15 ? 'CRITICAL' : 'IMPORTANT',
      });
    }

    if (locCollPct != null && peerCollPct != null && locCollPct < peerCollPct) {
      const lowCollProviders = providerCards.filter(p => p.collPct != null && p.peerAvgCollPct != null && p.collPct < p.peerAvgCollPct);
      const provStr = lowCollProviders.slice(0, 2).map(p => p.name).join(', ');
      recommendations.push({
        title: 'Collections Follow-Up Process',
        description: `Collections at ${locCollPct.toFixed(1)}% vs peer avg ${peerCollPct.toFixed(1)}%.${provStr ? ` Key providers: ${provStr}.` : ''} Audit outstanding balances weekly and implement payment plans for larger invoices.`,
        priority: (peerCollPct - locCollPct) > 5 ? 'CRITICAL' : 'IMPORTANT',
      });
    }

    if (locRevPerPt != null && peerRevPerPt != null && locRevPerPt < peerRevPerPt) {
      recommendations.push({
        title: 'Treatment Plan Optimization',
        description: `Avg revenue/patient $${locRevPerPt.toFixed(0)} vs peer avg $${peerRevPerPt.toFixed(0)} (-$${Math.round(peerRevPerPt - locRevPerPt)}/patient). Encourage comprehensive treatment plans combining multiple services.`,
        priority: (peerRevPerPt - locRevPerPt) / peerRevPerPt > 0.15 ? 'CRITICAL' : 'OPTIMIZE',
      });
    }

    if (locRevPerHour != null && peerRevPerHour != null && locRevPerHour < peerRevPerHour) {
      recommendations.push({
        title: 'Revenue Per Provider Hour',
        description: `Revenue/hour at $${Math.round(locRevPerHour)} vs peer avg $${Math.round(peerRevPerHour)}. Consider reducing blockout hours and maximizing appointment density during peak times.`,
        priority: 'OPTIMIZE',
      });
    }

    if (locInjPct != null && peerInjPct != null && (peerInjPct - locInjPct) > 5) {
      recommendations.push({
        title: 'Injectable Service Promotion',
        description: `Injectables at ${locInjPct.toFixed(1)}% vs peer avg ${peerInjPct.toFixed(1)}%. Run targeted injectable promotions and ensure consultations include injectable assessments.`,
        priority: 'OPTIMIZE',
      });
    }

    const priorityOrder = { CRITICAL: 0, IMPORTANT: 1, OPTIMIZE: 2 };
    recommendations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    const quickWins = recommendations.filter(r => r.quickWin);
    const topRecs = recommendations.filter(r => !r.quickWin).slice(0, 6);

    return {
      locType, peers,
      periodLabel: `${fmtDate(periodStart)} - ${fmtDate(periodEnd)}, ${new Date(periodEnd + 'T00:00:00').getFullYear()}`,
      kpis: [
        { name: 'Avg Revenue Per Patient', value: locRevPerPt, peerAvg: peerRevPerPt, goal: null, format: 'dollar', higherBetter: true, trend: revPerPtTrend },
        { name: 'Retail % of Sales', value: locRetailPct, peerAvg: peerRetailPct, goal: 7.5, format: 'pct', higherBetter: true, trend: retailPctTrend },
        { name: 'Injectables % of Sales', value: locInjPct, peerAvg: peerInjPct, goal: null, format: 'pct', higherBetter: true, trend: injPctTrend },
        { name: 'Collections % of Revenue', value: locCollPct, peerAvg: peerCollPct, goal: null, format: 'pct', higherBetter: true, trend: collPctTrend },
        { name: 'Avg Botox Units', value: locBtxUnits, peerAvg: peerBtxUnits, goal: 40, format: 'num', higherBetter: true, trend: btxTrend },
        { name: 'Avg Syringes / Filler Appt', value: locSyringes, peerAvg: peerSyringes, goal: null, format: 'num1', higherBetter: true, trend: syringeTrend },
        { name: 'Cancellation Rate', value: locCancelRate, peerAvg: peerCancelRate, goal: 5, format: 'pct', higherBetter: false, trend: cancelTrend },
        { name: 'No-Show Rate', value: locNoshowRate, peerAvg: peerNoshowRate, goal: 5, format: 'pct', higherBetter: false, trend: noshowTrend },
        { name: 'Utilization Rate', value: locUtil, peerAvg: peerUtil, goal: 70, format: 'pct', higherBetter: true, trend: utilTrend },
        { name: 'Avg Weekly Patients', value: locPatients, peerAvg: peerPatients, goal: null, format: 'num', higherBetter: true, trend: patientTrend },
      ],
      revTrend, ptTrend, improved, declined,
      // Section 2 data
      efficiency: {
        revPerHour: locRevPerHour, peerRevPerHour,
        collPerHour: locCollPerHour, peerCollPerHour,
        avgHoursPerWeek: locAvgHoursPerWeek, peerAvgHoursPerWeek,
        utilRate: locUtil, peerUtilRate: peerUtil,
      },
      // Section 3 data
      providerCards,
      // Section 4 data
      quickWins, recommendations: topRecs,
    };
  }, [location, locations, metrics, opsData, btxData, syringeLocData, utilizationData, providerHoursData, injRevProviderData, btxProviderData, syringeProvData, revCollProvData]);

  if (!reportData) return null;

  const fmtVal = (v, format) => {
    if (v == null) return '--';
    switch (format) {
      case 'dollar': return `$${Math.round(v).toLocaleString()}`;
      case 'pct': return `${v.toFixed(1)}%`;
      case 'num': return Math.round(v).toLocaleString();
      case 'num1': return v.toFixed(1);
      default: return String(v);
    }
  };

  const trendArrow = (pct, higherBetter) => {
    if (pct == null) return { arrow: '--', color: V.gray };
    const effective = higherBetter ? pct : -pct; // flip for "lower is better"
    if (effective > 5) return { arrow: '\u2191', color: V.green };       // up
    if (effective > 1) return { arrow: '\u2197', color: V.green };       // up-right
    if (effective > -1) return { arrow: '\u2192', color: V.gray };       // flat
    if (effective > -5) return { arrow: '\u2198', color: V.red };        // down-right
    return { arrow: '\u2193', color: V.red };                             // down
  };

  const statusDot = (value, goal, peerAvg, higherBetter) => {
    if (value == null) return { color: V.gray, label: 'N/A' };
    // Check goal first
    const target = goal != null ? goal : peerAvg;
    if (target == null) return { color: V.gray, label: '--' };
    if (higherBetter) {
      if (value >= target) return { color: V.green, label: 'On Track' };
      if (value >= target * 0.9) return { color: V.gold, label: 'Near Goal' };
      return { color: V.red, label: 'Below' };
    } else {
      if (value <= target) return { color: V.green, label: 'On Track' };
      if (value <= target * 1.1) return { color: V.gold, label: 'Near Goal' };
      return { color: V.red, label: 'Below' };
    }
  };

  const trendColor = (pct) => pct > 2 ? V.green : pct < -2 ? V.red : V.gray;
  const trendWord = (pct) => pct > 2 ? 'trending up' : pct < -2 ? 'trending down' : 'flat';
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const priorityColors = { CRITICAL: V.red, IMPORTANT: V.gold, OPTIMIZE: V.gray };

  const SectionHeader = ({ label, sectionKey, title }) => (
    <button
      onClick={() => toggleSection(sectionKey)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer',
        borderBottom: `1px solid ${V.taupe}`, marginBottom: expandedSections[sectionKey] ? 14 : 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: V.gold, letterSpacing: 1.5,
          textTransform: 'uppercase', fontFamily: FONT.body,
        }}>{label}</span>
        <span style={{ fontSize: 13, fontFamily: FONT.body, fontWeight: 600, color: V.navy }}>{title}</span>
      </div>
      <span style={{
        color: V.gray, fontSize: 12, transition: 'transform 0.2s',
        transform: expandedSections[sectionKey] ? 'rotate(180deg)' : 'rotate(0deg)',
      }}>{'\u25BC'}</span>
    </button>
  );

  // Horizontal comparison bar
  const ComparisonBar = ({ locValue, peerValue, format, label, higherBetter }) => {
    if (locValue == null && peerValue == null) return null;
    const maxVal = Math.max(locValue || 0, peerValue || 0) * 1.15 || 1;
    const locPct = ((locValue || 0) / maxVal) * 100;
    const peerPct = ((peerValue || 0) / maxVal) * 100;
    const isAbove = higherBetter ? (locValue || 0) >= (peerValue || 0) : (locValue || 0) <= (peerValue || 0);
    return (
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontFamily: FONT.body, fontWeight: 600, color: V.dark }}>{label}</span>
          <span style={{ fontSize: 11, fontFamily: FONT.body, color: V.gray }}>
            {fmtVal(locValue, format)} vs {fmtVal(peerValue, format)} peer
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, fontFamily: FONT.body, color: V.gray, width: 32 }}>You</span>
            <div style={{ flex: 1, height: 10, background: V.light, borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${locPct}%`, height: '100%', background: isAbove ? V.green : V.red, borderRadius: 5, transition: 'width 0.4s' }} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, fontFamily: FONT.body, color: V.gray, width: 32 }}>Peer</span>
            <div style={{ flex: 1, height: 10, background: V.light, borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${peerPct}%`, height: '100%', background: V.goldLight, borderRadius: 5, transition: 'width 0.4s' }} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      background: V.white, borderRadius: 10, border: `1px solid ${V.taupe}`,
      marginBottom: 32, overflow: 'hidden',
    }}>
      {/* Main header */}
      <div style={{
        padding: '16px 24px', background: V.navy,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: FONT.heading, fontSize: 18, color: V.gold, letterSpacing: 1 }}>
            Location Performance Report
          </span>
          <span style={{
            fontSize: 10, fontFamily: FONT.body, fontWeight: 700,
            color: V.navy, background: V.gold, padding: '3px 10px',
            borderRadius: 12, letterSpacing: 0.5, textTransform: 'uppercase',
          }}>{reportData.locType}</span>
        </div>
      </div>

      <div style={{ padding: '24px 28px 28px' }}>
        {/* Report Header */}
        <div style={{ marginBottom: 24 }}>
          <h2 style={{
            fontFamily: FONT.heading, fontSize: 28, fontWeight: 400,
            color: V.navy, margin: '0 0 6px',
          }}>{location}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontFamily: FONT.body, color: V.gray }}>
              Period: {reportData.periodLabel}
            </span>
            <span style={{ fontSize: 11, fontFamily: FONT.body, color: V.blush, fontStyle: 'italic' }}>
              Generated {today}
            </span>
          </div>
        </div>

        {/* ── Section A: KPI Scorecard ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader label="A." sectionKey="kpi" title="KPI Scorecard" />
          {expandedSections.kpi && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse', fontFamily: FONT.body, fontSize: 12,
              }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${V.navy}` }}>
                    {['KPI', 'Value', 'Peer Avg', 'Goal', 'Status', '4-Week Trend'].map(h => (
                      <th key={h} style={{
                        padding: '8px 10px', textAlign: 'left', fontSize: 9, fontWeight: 700,
                        color: V.gold, letterSpacing: 1.2, textTransform: 'uppercase',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.kpis.map((kpi, i) => {
                    const status = statusDot(kpi.value, kpi.goal, kpi.peerAvg, kpi.higherBetter);
                    const trend = trendArrow(kpi.trend, kpi.higherBetter);
                    return (
                      <tr key={kpi.name} style={{
                        borderBottom: `1px solid ${V.light}`,
                        background: i % 2 === 0 ? V.white : V.cream,
                      }}>
                        <td style={{ padding: '10px', fontWeight: 600, color: V.navy, fontSize: 12 }}>{kpi.name}</td>
                        <td style={{ padding: '10px', fontFamily: FONT.heading, fontSize: 16, color: V.navy }}>
                          {fmtVal(kpi.value, kpi.format)}
                        </td>
                        <td style={{ padding: '10px', color: V.gray }}>{fmtVal(kpi.peerAvg, kpi.format)}</td>
                        <td style={{ padding: '10px', color: V.gray }}>
                          {kpi.goal != null ? `${kpi.higherBetter ? '\u2265' : '\u2264'}${kpi.format === 'pct' ? `${kpi.goal}%` : kpi.goal}` : '--'}
                        </td>
                        <td style={{ padding: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{
                              width: 10, height: 10, borderRadius: '50%', background: status.color,
                              display: 'inline-block', flexShrink: 0,
                            }} />
                            <span style={{ fontSize: 10, color: status.color, fontWeight: 600 }}>{status.label}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px' }}>
                          <span style={{ fontSize: 16, color: trend.color, fontWeight: 700 }}>{trend.arrow}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Section B: Revenue & Efficiency Analysis ── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader label="B." sectionKey="efficiency" title="Revenue & Efficiency Analysis" />
          {expandedSections.efficiency && (
            <div style={{
              background: V.cream, borderRadius: 8, border: `1px solid ${V.taupe}`,
              padding: '20px 24px',
            }}>
              <ComparisonBar
                locValue={reportData.efficiency.revPerHour}
                peerValue={reportData.efficiency.peerRevPerHour}
                format="dollar" label="Revenue Per Net Provider Hour" higherBetter={true}
              />
              <ComparisonBar
                locValue={reportData.efficiency.collPerHour}
                peerValue={reportData.efficiency.peerCollPerHour}
                format="dollar" label="Collections Per Net Provider Hour" higherBetter={true}
              />
              <ComparisonBar
                locValue={reportData.efficiency.avgHoursPerWeek}
                peerValue={reportData.efficiency.peerAvgHoursPerWeek}
                format="num" label="Avg Net Provider Hours/Week" higherBetter={true}
              />
              <ComparisonBar
                locValue={reportData.efficiency.utilRate}
                peerValue={reportData.efficiency.peerUtilRate}
                format="pct" label="Utilization Rate" higherBetter={true}
              />
              {/* Efficiency recommendation */}
              {reportData.efficiency.revPerHour != null && reportData.efficiency.peerRevPerHour != null && reportData.efficiency.revPerHour < reportData.efficiency.peerRevPerHour && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', background: V.white, borderRadius: 6,
                  border: `1px solid ${V.taupe}`, fontSize: 12, fontFamily: FONT.body,
                  color: V.dark, lineHeight: 1.6,
                }}>
                  <span style={{ fontWeight: 700, color: V.navy }}>Insight: </span>
                  Revenue per provider hour is ${Math.round(reportData.efficiency.peerRevPerHour - reportData.efficiency.revPerHour)} below peer average.
                  Consider reducing blockout hours and maximizing appointment density during peak times.
                </div>
              )}
              {reportData.efficiency.utilRate != null && reportData.efficiency.peerUtilRate != null && reportData.efficiency.utilRate < reportData.efficiency.peerUtilRate && (
                <div style={{
                  marginTop: 8, padding: '10px 14px', background: V.white, borderRadius: 6,
                  border: `1px solid ${V.taupe}`, fontSize: 12, fontFamily: FONT.body,
                  color: V.dark, lineHeight: 1.6,
                }}>
                  <span style={{ fontWeight: 700, color: V.navy }}>Insight: </span>
                  Utilization is {(reportData.efficiency.peerUtilRate - reportData.efficiency.utilRate).toFixed(1)} points below peers.
                  Review provider scheduling templates to minimize gaps between appointments.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Section C: Provider Performance Cards ── */}
        {reportData.providerCards.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <SectionHeader label="C." sectionKey="providers" title="Provider Performance" />
            {expandedSections.providers && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
                {reportData.providerCards.map(prov => {
                  const metricRows = [
                    { label: '4-Week Inj Revenue', value: prov.injRev, peerAvg: prov.peerAvgInjRev, format: 'dollar', higherBetter: true },
                    { label: 'Avg Botox Units', value: prov.avgBtx, peerAvg: prov.peerAvgBtx, format: 'num1', higherBetter: true },
                    { label: 'Avg Syr/Inj Appt', value: prov.avgSyrInj, peerAvg: prov.peerAvgSyrInj, format: 'num1', higherBetter: true },
                    { label: 'Avg Syr/Filler Appt', value: prov.avgSyrFiller, peerAvg: prov.peerAvgSyrFiller, format: 'num1', higherBetter: true },
                    { label: 'Collections %', value: prov.collPct, peerAvg: prov.peerAvgCollPct, format: 'pct', higherBetter: true },
                  ];
                  return (
                    <div key={prov.name} style={{
                      background: V.cream, borderRadius: 8, border: `1px solid ${V.taupe}`,
                      padding: '16px 18px', display: 'flex', flexDirection: 'column',
                    }}>
                      <div style={{
                        fontFamily: FONT.heading, fontSize: 16, color: V.navy,
                        marginBottom: 10, borderBottom: `1px solid ${V.taupe}`, paddingBottom: 8,
                      }}>{prov.name}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                        {metricRows.map(m => {
                          const abovePeer = m.value != null && m.peerAvg != null
                            ? (m.higherBetter ? m.value >= m.peerAvg : m.value <= m.peerAvg)
                            : null;
                          return (
                            <div key={m.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                                  background: abovePeer == null ? V.gray : abovePeer ? V.green : V.red,
                                  display: 'inline-block',
                                }} />
                                <span style={{ fontSize: 11, fontFamily: FONT.body, color: V.dark }}>{m.label}</span>
                              </div>
                              <span style={{ fontSize: 12, fontFamily: FONT.body, fontWeight: 700, color: V.navy }}>
                                {fmtVal(m.value, m.format)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {prov.recommendation && (
                        <div style={{
                          marginTop: 10, padding: '8px 10px', background: V.white, borderRadius: 5,
                          fontSize: 11, fontFamily: FONT.body, color: V.dark, lineHeight: 1.5,
                          borderLeft: `3px solid ${V.gold}`,
                        }}>
                          {prov.recommendation}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Section D: Operational Recommendations ── */}
        {(reportData.quickWins.length > 0 || reportData.recommendations.length > 0) && (
          <div>
            <SectionHeader label="D." sectionKey="recommendations" title="Operational Recommendations" />
            {expandedSections.recommendations && (
              <div>
                {/* Quick Wins */}
                {reportData.quickWins.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, color: V.navy, letterSpacing: 1,
                      textTransform: 'uppercase', fontFamily: FONT.body, marginBottom: 8,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{
                        background: V.green, color: V.white, padding: '2px 8px',
                        borderRadius: 10, fontSize: 9, letterSpacing: 0.5,
                      }}>QUICK WINS</span>
                      Low-Effort, High-Impact
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {reportData.quickWins.map((rec, i) => (
                        <div key={`qw-${i}`} style={{
                          background: V.cream, borderRadius: 8, border: `1px solid ${V.taupe}`,
                          padding: '12px 18px', display: 'flex', gap: 14, alignItems: 'flex-start',
                          borderLeft: `4px solid ${V.green}`,
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontFamily: FONT.body, fontSize: 13, fontWeight: 700, color: V.navy }}>{rec.title}</span>
                              <span style={{
                                fontSize: 9, fontWeight: 700, fontFamily: FONT.body,
                                color: V.white, background: priorityColors[rec.priority],
                                padding: '2px 8px', borderRadius: 10, letterSpacing: 0.5,
                                textTransform: 'uppercase',
                              }}>{rec.priority}</span>
                            </div>
                            <p style={{ margin: 0, fontSize: 12, fontFamily: FONT.body, color: V.dark, lineHeight: 1.6 }}>
                              {rec.description}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Main recommendations */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {reportData.recommendations.map((rec, i) => (
                    <div key={i} style={{
                      background: V.cream, borderRadius: 8, border: `1px solid ${V.taupe}`,
                      padding: '14px 20px', display: 'flex', gap: 16, alignItems: 'flex-start',
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 6, background: V.navy,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: FONT.heading, fontSize: 14, color: V.gold, flexShrink: 0,
                      }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontFamily: FONT.body, fontSize: 13, fontWeight: 700, color: V.navy }}>{rec.title}</span>
                          <span style={{
                            fontSize: 9, fontWeight: 700, fontFamily: FONT.body,
                            color: V.white, background: priorityColors[rec.priority],
                            padding: '2px 8px', borderRadius: 10, letterSpacing: 0.5,
                            textTransform: 'uppercase',
                          }}>{rec.priority}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: 12, fontFamily: FONT.body, color: V.dark, lineHeight: 1.6 }}>
                          {rec.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Trend summary at bottom */}
                <div style={{
                  marginTop: 16, background: V.cream, borderRadius: 8, border: `1px solid ${V.taupe}`,
                  padding: '14px 18px', fontFamily: FONT.body, fontSize: 12, color: V.dark, lineHeight: 1.7,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: V.gold, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 }}>
                    4-Week Trend Summary
                  </div>
                  <p style={{ margin: '0 0 4px' }}>
                    <strong>Revenue</strong> is{' '}
                    <span style={{ color: trendColor(reportData.revTrend), fontWeight: 600 }}>{trendWord(reportData.revTrend)}</span>
                    {' '}({reportData.revTrend > 0 ? '+' : ''}{reportData.revTrend.toFixed(1)}%).
                    {' '}<strong>Patient volume</strong> is{' '}
                    <span style={{ color: trendColor(reportData.ptTrend), fontWeight: 600 }}>{trendWord(reportData.ptTrend)}</span>
                    {' '}({reportData.ptTrend > 0 ? '+' : ''}{reportData.ptTrend.toFixed(1)}%).
                  </p>
                  {reportData.improved.length > 0 && (
                    <p style={{ margin: '0 0 2px' }}>
                      <span style={{ color: V.green, fontWeight: 600 }}>Meeting goals:</span> {reportData.improved.join(', ')}.
                    </p>
                  )}
                  {reportData.declined.length > 0 && (
                    <p style={{ margin: 0 }}>
                      <span style={{ color: V.red, fontWeight: 600 }}>Below goals:</span> {reportData.declined.join(', ')}.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ══════════════════════════════════════════════════════════════
//  Main Component
// ══════════════════════════════════════════════════════════════

export default function PerformanceTracker({ initialLocTypes, initialPractices, initialLocations }) {
  const [locations, setLocations] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [opsData, setOpsData] = useState([]);
  const [btxData, setBtxData] = useState([]);
  const [budgetData, setBudgetData] = useState([]);
  const [injRevProviderData, setInjRevProviderData] = useState([]);
  const [btxProviderData, setBtxProviderData] = useState([]);
  const [ntxFillerData, setNtxFillerData] = useState([]);
  const [syringeLocData, setSyringeLocData] = useState([]);
  const [syringeProvData, setSyringeProvData] = useState([]);
  const [revCollProvData, setRevCollProvData] = useState([]);
  const [providerHoursData, setProviderHoursData] = useState([]);
  const [utilizationData, setUtilizationData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedLocTypes, setSelectedLocTypes] = useState(initialLocTypes || []);
  const [selectedPractices, setSelectedPractices] = useState(initialPractices || []);
  const [globalSelectedLocs, setGlobalSelectedLocs] = useState(initialLocations || []);
  const hasInitialFilter = !!(initialLocTypes?.length || initialPractices?.length || initialLocations?.length);
  const dataLoadedRef = useRef(false);
  const TOTAL = 'Total';
  const isSingleLocation = initialLocations?.length === 1;
  const [injRevProviders, setInjRevProviders] = useState(isSingleLocation ? null : []); // null = auto-select all, [] = empty
  const [btxProviders, setBtxProviders] = useState(isSingleLocation ? null : []);
  // For single-location views, default chart dropdowns to show that location's data (not "Total")
  const defaultChartLoc = isSingleLocation ? initialLocations : [TOTAL];
  const [globalTimeMode, setGlobalTimeMode] = useState('weekly');
  const [globalPeriodCount, setGlobalPeriodCount] = useState(12);
  const [chartTimeOverrides, setChartTimeOverrides] = useState({});

  // Sections always start expanded
  const [sectionsMinimized, setSectionsMinimized] = useState({
    section1: false,
    section2: false,
    section3: false,
    section4: false,
    appendix: false,
  });
  const toggleSection = (key) => setSectionsMinimized(prev => ({ ...prev, [key]: !prev[key] }));

  const getEffectiveTime = (chartId) => {
    const override = chartTimeOverrides[chartId];
    return {
      mode: override?.mode || globalTimeMode,
      count: override?.count || globalPeriodCount,
    };
  };

  const [revChartLocs, setRevChartLocs] = useState(defaultChartLoc);
  const [collChartLocs, setCollChartLocs] = useState(defaultChartLoc);
  const [avgRevLocs, setAvgRevLocs] = useState(defaultChartLoc);
  const [uniquePtLocs, setUniquePtLocs] = useState(defaultChartLoc);
  const [retailLocs, setRetailLocs] = useState(defaultChartLoc);
  const [retailPctLocs, setRetailPctLocs] = useState(defaultChartLoc);
  const [injSalesLocs, setInjSalesLocs] = useState(defaultChartLoc);
  const [injPctLocs, setInjPctLocs] = useState(defaultChartLoc);
  const [btxLocs, setBtxLocs] = useState(defaultChartLoc);
  const [aggBtxLocs, setAggBtxLocs] = useState(defaultChartLoc);
  const [cancelLocs, setCancelLocs] = useState(defaultChartLoc);
  const [utilizationLocs, setUtilizationLocs] = useState(defaultChartLoc);
  const [netHoursLocs, setNetHoursLocs] = useState(defaultChartLoc);
  const [noshowLocs, setNoshowLocs] = useState(defaultChartLoc);
  const [ntxFillerLocs, setNtxFillerLocs] = useState(defaultChartLoc);
  const [revCollHoursLocs, setRevCollHoursLocs] = useState(defaultChartLoc);
  const [revPerHourLocs, setRevPerHourLocs] = useState(defaultChartLoc);
  const [syrInjLocs, setSyrInjLocs] = useState(defaultChartLoc);
  const [syrFillerLocs, setSyrFillerLocs] = useState(defaultChartLoc);
  const [syrInjProviders, setSyrInjProviders] = useState(null);
  const [syrFillerProviders, setSyrFillerProviders] = useState(null);
  const [revCollAppendixLocs, setRevCollAppendixLocs] = useState(defaultChartLoc);
  const [revCollProvAppendixProviders, setRevCollProvAppendixProviders] = useState(null);
  const [revCollProvAppendixLocs, setRevCollProvAppendixLocs] = useState([]);
  const [revCollHoursProviders, setRevCollHoursProviders] = useState(null); // null = show total (no provider filter)
  const [revPerHourProviders, setRevPerHourProviders] = useState(null);

  // Fetch all data on mount
  useEffect(() => {
    Promise.all([
      fetch('/data/performance/locations.json').then(r => r.json()),
      fetch('/data/performance/weekly-metrics.json').then(r => r.json()),
      fetch('/data/performance/weekly-ops.json').then(r => r.json()),
      fetch('/data/performance/weekly-btx.json').then(r => r.json()).catch(() => []),
      fetch('/data/performance/weekly-budget.json').then(r => r.json()).catch(() => []),
      fetch('/data/performance/weekly-inj-rev-provider.json').then(r => r.json()).catch(() => []),
      fetch('/data/performance/weekly-btx-provider.json').then(r => r.json()).catch(() => []),
      fetch('/data/performance/weekly-ntx-filler.json').then(r => r.json()).catch(() => []),
      fetch('/data/performance/weekly-syringe-loc.json').then(r => r.json()).catch(() => []),
      fetch('/data/performance/weekly-syringe-provider.json').then(r => r.json()).catch(() => []),
      fetch('/data/performance/weekly-rev-coll-provider.json').then(r => r.json()).catch(() => []),
      fetch('/data/performance/weekly-provider-hours.json').then(r => r.json()).catch(() => []),
      fetch('/data/performance/weekly-utilization.json').then(r => r.json()).catch(() => []),
    ]).then(([locs, met, ops, btx, bud, injRevProv, btxProv, ntxFiller, syrLoc, syrProv, revCollProv, provHours, utilization]) => {
      setLocations(locs);
      setMetrics(met);
      setOpsData(ops);
      setBtxData(btx);
      setBudgetData(bud);
      setInjRevProviderData(injRevProv);
      setBtxProviderData(btxProv);
      setNtxFillerData(ntxFiller);
      setSyringeLocData(syrLoc);
      setSyringeProvData(syrProv);
      setRevCollProvData(revCollProv);
      setProviderHoursData(provHours);
      setUtilizationData(utilization);
      setLoading(false);
      // Mark data as loaded so cleanup effects can run
      // Use a timeout to let the first render with data settle before enabling cleanup
      setTimeout(() => { dataLoadedRef.current = true; }, 100);
    });
  }, []);

  // Derive filter options from loaded locations
  // Each location has `types` (array) — flatten all unique types for the dropdown
  const locationTypes = useMemo(() => {
    const allTypes = new Set();
    locations.forEach(l => {
      const t = l.types || (l.type ? [l.type] : []);  // support both old and new format
      t.forEach(v => allTypes.add(v));
    });
    return [...allTypes].sort();
  }, [locations]);
  // Practices filtered by selected Location Types
  const practices = useMemo(() => {
    let pool = locations;
    if (selectedLocTypes.length) {
      pool = locations.filter(l => {
        const locTypes = l.types || (l.type ? [l.type] : []);
        return locTypes.some(t => selectedLocTypes.includes(t));
      });
    }
    return [...new Set(pool.map(l => l.practice))].sort();
  }, [locations, selectedLocTypes]);

  // Clear practice selections that are no longer available (skip before data loads with initial filters)
  useEffect(() => {
    if (hasInitialFilter && !dataLoadedRef.current) return;
    setSelectedPractices(prev => prev.filter(p => practices.includes(p)));
  }, [practices]);

  // Filter locations based on multi-select dropdowns
  // A location matches if ANY of its types is in the selected types
  const filteredLocations = useMemo(() => {
    return locations.filter(l => {
      if (selectedLocTypes.length) {
        const locTypes = l.types || (l.type ? [l.type] : []);
        if (!locTypes.some(t => selectedLocTypes.includes(t))) return false;
      }
      if (selectedPractices.length && !selectedPractices.includes(l.practice)) return false;
      // For pre-filtered views, also restrict to the initially selected locations
      if (globalSelectedLocs.length && !globalSelectedLocs.includes(l.name)) return false;
      return true;
    });
  }, [locations, selectedLocTypes, selectedPractices, globalSelectedLocs]);

  const locationNames = useMemo(() => filteredLocations.map(l => l.name), [filteredLocations]);

  // Whether any top-level filter is active (determines provider chart behavior)
  const hasActiveFilter = selectedLocTypes.length > 0 || selectedPractices.length > 0 || globalSelectedLocs.length > 0;

  // All chart-level setters for bulk operations
  const allChartSetters = [
    setRevChartLocs, setCollChartLocs, setAvgRevLocs, setUniquePtLocs,
    setRetailLocs, setRetailPctLocs, setInjSalesLocs, setInjPctLocs,
    setBtxLocs, setAggBtxLocs, setCancelLocs, setNoshowLocs,
    setNtxFillerLocs, setSyrInjLocs, setSyrFillerLocs,
    setUtilizationLocs, setNetHoursLocs,
    setRevCollAppendixLocs, setRevCollHoursLocs,
  ];

  // Clear chart-level location picks when top filters change (skip before data loads with initial filters)
  useEffect(() => {
    if (hasInitialFilter && !dataLoadedRef.current) return;
    const filterStale = (setter) => setter(prev => prev.filter(n => n === 'Total' || locationNames.includes(n)));
    allChartSetters.forEach(filterStale);
    // Also clear global selections that are no longer in filtered locations
    setGlobalSelectedLocs(prev => prev.filter(n => locationNames.includes(n)));
    // Provider charts: auto-select all when filter is active, empty when no filter
    if (hasActiveFilter) {
      setInjRevProviders(null);  // null = auto-select all
      setBtxProviders(null);
      setSyrInjProviders(null);
      setSyrFillerProviders(null);
      setRevCollProvAppendixProviders(null);
    } else {
      setInjRevProviders([]);    // empty = no providers, chart shows message
      setBtxProviders([]);
      setSyrInjProviders([]);
      setSyrFillerProviders([]);
      setRevCollProvAppendixProviders([]);
    }
  }, [locationNames, hasActiveFilter]);

  // Sync global Location dropdown → all chart dropdowns
  const prevGlobalRef = useRef([]);
  useEffect(() => {
    const prev = prevGlobalRef.current;
    const added = globalSelectedLocs.filter(n => !prev.includes(n));
    const removed = prev.filter(n => !globalSelectedLocs.includes(n));
    if (added.length > 0) {
      allChartSetters.forEach(setter => setter(p => [...new Set([...p, ...added])]));
    }
    if (removed.length > 0) {
      const removedSet = new Set(removed);
      allChartSetters.forEach(setter => setter(p => p.filter(n => !removedSet.has(n))));
    }
    prevGlobalRef.current = [...globalSelectedLocs];
  }, [globalSelectedLocs]);

  // Build ops name map
  const opsNameMap = useMemo(() => buildOpsNameMap(locations, opsData), [locations, opsData]);

  // ── Date range label ──
  const dateRangeLabel = useMemo(() => {
    if (!metrics.length) return '';
    const weeks = [...new Set(metrics.map(m => m.w))].sort();
    const first = weeks[0];
    const last = weeks[weeks.length - 1];
    const fmt = (ds) => { const d = new Date(ds + 'T00:00:00'); return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`; };
    return `${fmt(first)} – ${fmt(last)}, ${new Date(last + 'T00:00:00').getFullYear()}`;
  }, [metrics]);

  // ── Filter context label ──
  const filterLabel = useMemo(() => {
    const parts = [];
    if (selectedLocTypes.length) parts.push(selectedLocTypes.join(', '));
    if (selectedPractices.length) parts.push(selectedPractices.join(', '));
    return parts.length ? parts.join(' · ') : 'All Locations';
  }, [selectedLocTypes, selectedPractices]);

  // ══════════════════════════════════════════════════════════
  //  Stable color assignment — same name = same color everywhere
  // ══════════════════════════════════════════════════════════
  const locationColorMap = useMemo(() => {
    // Sort ALL location names alphabetically, assign colors in that fixed order
    const allNames = locations.map(l => l.name).sort();
    const map = {};
    allNames.forEach((name, i) => {
      map[name] = CHART_COLORS[i % CHART_COLORS.length];
    });
    return map;
  }, [locations]);

  // Available providers for provider-level charts, filtered by current locations
  // When specific locations are selected in the top Location dropdown,
  // narrow provider lists to only those locations' providers
  const effectiveProviderLocNames = useMemo(() => {
    if (globalSelectedLocs.length > 0) return globalSelectedLocs;
    return locationNames;
  }, [locationNames, globalSelectedLocs]);

  const availableInjProviders = useMemo(() => {
    const centerNames = new Set(effectiveProviderLocNames);
    const providers = new Set();
    injRevProviderData.filter(m => centerNames.has(m.c)).forEach(m => providers.add(m.pr));
    return [...providers].sort();
  }, [injRevProviderData, effectiveProviderLocNames]);

  const availableBtxProviders = useMemo(() => {
    const centerNames = new Set(effectiveProviderLocNames);
    const providers = new Set();
    btxProviderData.filter(m => centerNames.has(m.c)).forEach(m => providers.add(m.pr));
    return [...providers].sort();
  }, [btxProviderData, effectiveProviderLocNames]);

  const providerColorMap = useMemo(() => {
    const allProviders = [...new Set([...availableInjProviders, ...availableBtxProviders])].sort();
    const map = {};
    allProviders.forEach((name, i) => {
      map[name] = CHART_COLORS[i % CHART_COLORS.length];
    });
    return map;
  }, [availableInjProviders, availableBtxProviders]);

  // ══════════════════════════════════════════════════════════
  //  Chart data transformations
  // ══════════════════════════════════════════════════════════

  // ── Avg Revenue Per Patient (weighted average Total + per-location) ──
  const { avgRevData, avgRevSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('avgRev');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const totalSales = weekRows.reduce((s, m) => s + (m.s || 0), 0);
        const totalPatients = weekRows.reduce((s, m) => s + (m.p || 0), 0);
        const row = { week: formatWeek(w), Total: totalPatients > 0 ? +(totalSales / totalPatients).toFixed(2) : null };
        avgRevLocs.forEach(loc => {
          const m = weekRows.find(r => r.c === loc);
          if (m && m.p > 0) row[loc] = +(m.s / m.p).toFixed(2);
        });
        return row;
      });
      const locs = avgRevLocs.filter(n => n !== 'Total');
      return { avgRevData: data, avgRevSeries: [...(avgRevLocs.includes('Total') ? ['Total'] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const totalSales = monthRows.reduce((s, m) => s + (m.s || 0), 0);
        const totalPatients = monthRows.reduce((s, m) => s + (m.p || 0), 0);
        const row = { week: formatMonth(mk, mk === curMonth), Total: totalPatients > 0 ? +(totalSales / totalPatients).toFixed(2) : null };
        avgRevLocs.forEach(loc => {
          const locRows = monthRows.filter(r => r.c === loc);
          const locSales = locRows.reduce((s, m) => s + (m.s || 0), 0);
          const locPt = locRows.reduce((s, m) => s + (m.p || 0), 0);
          if (locPt > 0) row[loc] = +(locSales / locPt).toFixed(2);
        });
        return row;
      });
      const locs = avgRevLocs.filter(n => n !== 'Total');
      return { avgRevData: data, avgRevSeries: [...(avgRevLocs.includes('Total') ? ['Total'] : []), ...locs] };
    }
  }, [metrics, locationNames, avgRevLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Unique Patients (sum Total + per-location) ──
  const { uniquePtData, uniquePtSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('uniquePt');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const row = { week: formatWeek(w), Total: weekRows.reduce((s, m) => s + (m.p || 0), 0) };
        uniquePtLocs.forEach(loc => {
          const m = weekRows.find(r => r.c === loc);
          if (m) row[loc] = m.p || 0;
        });
        return row;
      });
      const locs = uniquePtLocs.filter(n => n !== 'Total');
      return { uniquePtData: data, uniquePtSeries: [...(uniquePtLocs.includes('Total') ? ['Total'] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const row = { week: formatMonth(mk, mk === curMonth), Total: monthRows.reduce((s, m) => s + (m.p || 0), 0) };
        uniquePtLocs.forEach(loc => {
          const locRows = monthRows.filter(r => r.c === loc);
          row[loc] = locRows.reduce((s, m) => s + (m.p || 0), 0);
        });
        return row;
      });
      const locs = uniquePtLocs.filter(n => n !== 'Total');
      return { uniquePtData: data, uniquePtSeries: [...(uniquePtLocs.includes('Total') ? ['Total'] : []), ...locs] };
    }
  }, [metrics, locationNames, uniquePtLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Retail Sales (sum Total + per-location) ──
  const { retailData, retailSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('retail');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const row = { week: formatWeek(w), Total: weekRows.reduce((s, m) => s + (m.rt || 0), 0) };
        retailLocs.forEach(loc => {
          const m = weekRows.find(r => r.c === loc);
          if (m) row[loc] = m.rt || 0;
        });
        return row;
      });
      const locs = retailLocs.filter(n => n !== 'Total');
      return { retailData: data, retailSeries: [...(retailLocs.includes('Total') ? ['Total'] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const row = { week: formatMonth(mk, mk === curMonth), Total: monthRows.reduce((s, m) => s + (m.rt || 0), 0) };
        retailLocs.forEach(loc => {
          const locRows = monthRows.filter(r => r.c === loc);
          row[loc] = locRows.reduce((s, m) => s + (m.rt || 0), 0);
        });
        return row;
      });
      const locs = retailLocs.filter(n => n !== 'Total');
      return { retailData: data, retailSeries: [...(retailLocs.includes('Total') ? ['Total'] : []), ...locs] };
    }
  }, [metrics, locationNames, retailLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Retail % of Total Sales (weighted average Total + per-location) ──
  const { retailPctData, retailPctSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('retailPct');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const totalSales = weekRows.reduce((s, m) => s + (m.s || 0), 0);
        const totalRetail = weekRows.reduce((s, m) => s + (m.rt || 0), 0);
        const row = { week: formatWeek(w), Total: totalSales > 0 ? +((totalRetail / totalSales) * 100).toFixed(1) : null };
        retailPctLocs.forEach(loc => {
          const m = weekRows.find(r => r.c === loc);
          if (m && m.s > 0) row[loc] = +((m.rt / m.s) * 100).toFixed(1);
        });
        return row;
      });
      const locs = retailPctLocs.filter(n => n !== 'Total');
      return { retailPctData: data, retailPctSeries: [...(retailPctLocs.includes('Total') ? ['Total'] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const totalSales = monthRows.reduce((s, m) => s + (m.s || 0), 0);
        const totalRetail = monthRows.reduce((s, m) => s + (m.rt || 0), 0);
        const row = { week: formatMonth(mk, mk === curMonth), Total: totalSales > 0 ? +((totalRetail / totalSales) * 100).toFixed(1) : null };
        retailPctLocs.forEach(loc => {
          const locRows = monthRows.filter(r => r.c === loc);
          const locSales = locRows.reduce((s, m) => s + (m.s || 0), 0);
          const locRetail = locRows.reduce((s, m) => s + (m.rt || 0), 0);
          if (locSales > 0) row[loc] = +((locRetail / locSales) * 100).toFixed(1);
        });
        return row;
      });
      const locs = retailPctLocs.filter(n => n !== 'Total');
      return { retailPctData: data, retailPctSeries: [...(retailPctLocs.includes('Total') ? ['Total'] : []), ...locs] };
    }
  }, [metrics, locationNames, retailPctLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Injectables Sales (sum Total + per-location) ──
  const { injSalesData, injSalesSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('injSales');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const row = { week: formatWeek(w), Total: weekRows.reduce((s, m) => s + (m.inj || 0), 0) };
        injSalesLocs.forEach(loc => {
          const m = weekRows.find(r => r.c === loc);
          if (m) row[loc] = m.inj || 0;
        });
        return row;
      });
      const locs = injSalesLocs.filter(n => n !== 'Total');
      return { injSalesData: data, injSalesSeries: [...(injSalesLocs.includes('Total') ? ['Total'] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const row = { week: formatMonth(mk, mk === curMonth), Total: monthRows.reduce((s, m) => s + (m.inj || 0), 0) };
        injSalesLocs.forEach(loc => {
          const locRows = monthRows.filter(r => r.c === loc);
          row[loc] = locRows.reduce((s, m) => s + (m.inj || 0), 0);
        });
        return row;
      });
      const locs = injSalesLocs.filter(n => n !== 'Total');
      return { injSalesData: data, injSalesSeries: [...(injSalesLocs.includes('Total') ? ['Total'] : []), ...locs] };
    }
  }, [metrics, locationNames, injSalesLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Injectables % of Total Sales (weighted average Total + per-location) ──
  const { injPctData, injPctSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('injPct');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const totalSales = weekRows.reduce((s, m) => s + (m.s || 0), 0);
        const totalInj = weekRows.reduce((s, m) => s + (m.inj || 0), 0);
        const row = { week: formatWeek(w), Total: totalSales > 0 ? +((totalInj / totalSales) * 100).toFixed(1) : null };
        injPctLocs.forEach(loc => {
          const m = weekRows.find(r => r.c === loc);
          if (m && m.s > 0) row[loc] = +((m.inj / m.s) * 100).toFixed(1);
        });
        return row;
      });
      const locs = injPctLocs.filter(n => n !== 'Total');
      return { injPctData: data, injPctSeries: [...(injPctLocs.includes('Total') ? ['Total'] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const totalSales = monthRows.reduce((s, m) => s + (m.s || 0), 0);
        const totalInj = monthRows.reduce((s, m) => s + (m.inj || 0), 0);
        const row = { week: formatMonth(mk, mk === curMonth), Total: totalSales > 0 ? +((totalInj / totalSales) * 100).toFixed(1) : null };
        injPctLocs.forEach(loc => {
          const locRows = monthRows.filter(r => r.c === loc);
          const locSales = locRows.reduce((s, m) => s + (m.s || 0), 0);
          const locInj = locRows.reduce((s, m) => s + (m.inj || 0), 0);
          if (locSales > 0) row[loc] = +((locInj / locSales) * 100).toFixed(1);
        });
        return row;
      });
      const locs = injPctLocs.filter(n => n !== 'Total');
      return { injPctData: data, injPctSeries: [...(injPctLocs.includes('Total') ? ['Total'] : []), ...locs] };
    }
  }, [metrics, locationNames, injPctLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Botox Units per Appointment (weighted average Total + per-location) ──
  const { btxData: btxChartData, btxSeries } = useMemo(() => {
    if (!btxData.length) return { btxData: null, btxSeries: [] };
    const centerNames = new Set(locationNames);
    const filtered = btxData.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('btxLoc');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const totalUnits = weekRows.reduce((s, m) => s + (m.b || 0), 0);
        const count = weekRows.filter(m => m.b != null).length;
        const row = { week: formatWeek(w), Total: count > 0 ? +(totalUnits / count).toFixed(1) : null };
        btxLocs.forEach(loc => {
          const m = weekRows.find(r => r.c === loc);
          if (m) row[loc] = m.b;
        });
        return row;
      });
      const locs = btxLocs.filter(n => n !== 'Total');
      return { btxData: data, btxSeries: [...(btxLocs.includes('Total') ? ['Total'] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const totalUnits = monthRows.reduce((s, m) => s + (m.b || 0), 0);
        const count = monthRows.filter(m => m.b != null).length;
        const row = { week: formatMonth(mk, mk === curMonth), Total: count > 0 ? +(totalUnits / count).toFixed(1) : null };
        btxLocs.forEach(loc => {
          const locRows = monthRows.filter(r => r.c === loc);
          const locUnits = locRows.reduce((s, m) => s + (m.b || 0), 0);
          const locCount = locRows.filter(m => m.b != null).length;
          if (locCount > 0) row[loc] = +(locUnits / locCount).toFixed(1);
        });
        return row;
      });
      const locs = btxLocs.filter(n => n !== 'Total');
      return { btxData: data, btxSeries: [...(btxLocs.includes('Total') ? ['Total'] : []), ...locs] };
    }
  }, [btxData, locationNames, btxLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Utilization Rate (average Total + per-location) ──
  const { utilizationChartData, utilizationSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = utilizationData.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('utilization');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const vals = weekRows.map(m => m.ur).filter(v => v != null && v > 0);
        const row = { week: timeRange.formatLabel(w), Total: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null };
        utilizationLocs.forEach(loc => {
          if (loc === TOTAL) return;
          const m = weekRows.find(r => r.c === loc);
          if (m) row[loc] = m.ur;
        });
        return row;
      });
      const locs = utilizationLocs.filter(n => n !== TOTAL);
      return { utilizationChartData: data, utilizationSeries: [...(utilizationLocs.includes(TOTAL) ? [TOTAL] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const vals = monthRows.map(m => m.ur).filter(v => v != null && v > 0);
        const row = { week: timeRange.formatLabel(mk + '-01'), Total: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null };
        utilizationLocs.forEach(loc => {
          if (loc === TOTAL) return;
          const locRows = monthRows.filter(r => r.c === loc);
          const locVals = locRows.map(r => r.ur).filter(v => v > 0);
          if (locVals.length) row[loc] = +(locVals.reduce((a, b) => a + b, 0) / locVals.length).toFixed(1);
        });
        return row;
      });
      const locs = utilizationLocs.filter(n => n !== TOTAL);
      return { utilizationChartData: data, utilizationSeries: [...(utilizationLocs.includes(TOTAL) ? [TOTAL] : []), ...locs] };
    }
  }, [utilizationData, locationNames, utilizationLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Net Provider Hours (sum Total + per-location) ──
  const { netHoursChartData, netHoursSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = providerHoursData.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('netHours');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const row = { week: timeRange.formatLabel(w), Total: Math.round(weekRows.reduce((s, m) => s + (m.h || 0), 0)) };
        netHoursLocs.forEach(loc => {
          if (loc === TOTAL) return;
          const m = weekRows.find(r => r.c === loc);
          if (m) row[loc] = Math.round(m.h);
        });
        return row;
      });
      const locs = netHoursLocs.filter(n => n !== TOTAL);
      return { netHoursChartData: data, netHoursSeries: [...(netHoursLocs.includes(TOTAL) ? [TOTAL] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const row = { week: timeRange.formatLabel(mk + '-01'), Total: Math.round(monthRows.reduce((s, m) => s + (m.h || 0), 0)) };
        netHoursLocs.forEach(loc => {
          if (loc === TOTAL) return;
          const locRows = monthRows.filter(r => r.c === loc);
          if (locRows.length) row[loc] = Math.round(locRows.reduce((s, r) => s + (r.h || 0), 0));
        });
        return row;
      });
      const locs = netHoursLocs.filter(n => n !== TOTAL);
      return { netHoursChartData: data, netHoursSeries: [...(netHoursLocs.includes(TOTAL) ? [TOTAL] : []), ...locs] };
    }
  }, [providerHoursData, locationNames, netHoursLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Cancel Rate (average Total + per-location) ──
  // NOTE: ops data now uses center_name directly (no more display_name mapping needed)
  const { cancelData, cancelSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = opsData.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('cancel');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const vals = weekRows.map(m => m.cn).filter(v => v != null);
        const row = { week: timeRange.formatLabel(w), Total: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null };
        cancelLocs.forEach(loc => {
          if (loc === TOTAL) return;
          const m = weekRows.find(r => r.c === loc);
          if (m) row[loc] = m.cn;
        });
        return row;
      });
      const locs = cancelLocs.filter(n => n !== TOTAL);
      return { cancelData: data, cancelSeries: [...(cancelLocs.includes(TOTAL) ? [TOTAL] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const vals = monthRows.map(m => m.cn).filter(v => v != null);
        const row = { week: timeRange.formatLabel(mk + '-01'), Total: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null };
        cancelLocs.forEach(loc => {
          if (loc === TOTAL) return;
          const locRows = monthRows.filter(r => r.c === loc);
          const locVals = locRows.map(m => m.cn).filter(v => v != null);
          if (locVals.length) row[loc] = +(locVals.reduce((a, b) => a + b, 0) / locVals.length).toFixed(1);
        });
        return row;
      });
      const locs = cancelLocs.filter(n => n !== TOTAL);
      return { cancelData: data, cancelSeries: [...(cancelLocs.includes(TOTAL) ? [TOTAL] : []), ...locs] };
    }
  }, [opsData, locationNames, cancelLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── No-Show Rate (average Total + per-location) ──
  const { noshowData, noshowSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = opsData.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('noshow');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const vals = weekRows.map(m => m.ns).filter(v => v != null);
        const row = { week: timeRange.formatLabel(w), Total: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null };
        noshowLocs.forEach(loc => {
          if (loc === TOTAL) return;
          const m = weekRows.find(r => r.c === loc);
          if (m) row[loc] = m.ns;
        });
        return row;
      });
      const locs = noshowLocs.filter(n => n !== TOTAL);
      return { noshowData: data, noshowSeries: [...(noshowLocs.includes(TOTAL) ? [TOTAL] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const vals = monthRows.map(m => m.ns).filter(v => v != null);
        const row = { week: timeRange.formatLabel(mk + '-01'), Total: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null };
        noshowLocs.forEach(loc => {
          if (loc === TOTAL) return;
          const locRows = monthRows.filter(r => r.c === loc);
          const locVals = locRows.map(m => m.ns).filter(v => v != null);
          if (locVals.length) row[loc] = +(locVals.reduce((a, b) => a + b, 0) / locVals.length).toFixed(1);
        });
        return row;
      });
      const locs = noshowLocs.filter(n => n !== TOTAL);
      return { noshowData: data, noshowSeries: [...(noshowLocs.includes(TOTAL) ? [TOTAL] : []), ...locs] };
    }
  }, [opsData, locationNames, noshowLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Aggregated weekly revenue vs budget (+ per-location breakdowns) ──
  const { revChartData, revChartSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const weekMap = {};
    const locWeekMap = {};
    filtered.forEach(m => {
      if (!weekMap[m.w]) weekMap[m.w] = 0;
      weekMap[m.w] += (m.s || 0);
      if (revChartLocs.includes(m.c)) {
        if (!locWeekMap[m.w]) locWeekMap[m.w] = {};
        locWeekMap[m.w][m.c] = (locWeekMap[m.w][m.c] || 0) + (m.s || 0);
      }
    });
    // Budget: scope to the locations actually shown on the chart
    // If "Total" is selected, sum all filtered locations' budgets
    // If specific locations are selected, only sum those locations' budgets
    const budgetWeekMap = {};
    if (budgetData.length) {
      const budgetCenterNames = revChartLocs.includes('Total')
        ? centerNames
        : new Set(revChartLocs.filter(n => n !== 'Total'));
      const budgetFiltered = budgetData.filter(b => budgetCenterNames.has(b.c));
      budgetFiltered.forEach(b => {
        if (!budgetWeekMap[b.w]) budgetWeekMap[b.w] = 0;
        budgetWeekMap[b.w] += (b.b || 0);
      });
    }
    const allWeeks = Object.keys(weekMap).sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('revChart');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);
    const hasBudget = Object.keys(budgetWeekMap).length > 0;

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const budgetVal = budgetWeekMap[w] != null ? budgetWeekMap[w] : null;
        const row = { week: formatWeek(w), 'All Locations': weekMap[w] || 0 };
        if (budgetVal != null) row.Budget = budgetVal;
        revChartLocs.filter(n => n !== 'Total').forEach(loc => { row[loc] = locWeekMap[w]?.[loc] || 0; });
        return row;
      });
      const locs = revChartLocs.filter(n => n !== 'Total');
      const series = [...(revChartLocs.includes('Total') ? ['All Locations'] : []), ...(hasBudget ? ['Budget'] : []), ...locs];
      return { revChartData: data, revChartSeries: series };
    } else {
      const months = timeRange.periods;
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = months.map(mk => {
        const monthWeeks = allWeeks.filter(w => w.startsWith(mk));
        const rev = monthWeeks.reduce((s, w) => s + (weekMap[w] || 0), 0);
        const bud = monthWeeks.reduce((s, w) => s + (budgetWeekMap[w] || 0), 0);
        const row = { week: formatMonth(mk, mk === curMonth), 'All Locations': rev };
        if (hasBudget) row.Budget = bud;
        revChartLocs.filter(n => n !== 'Total').forEach(loc => {
          row[loc] = monthWeeks.reduce((s, w) => s + (locWeekMap[w]?.[loc] || 0), 0);
        });
        return row;
      });
      const locs = revChartLocs.filter(n => n !== 'Total');
      const series = [...(revChartLocs.includes('Total') ? ['All Locations'] : []), ...(hasBudget ? ['Budget'] : []), ...locs];
      return { revChartData: data, revChartSeries: series };
    }
  }, [metrics, locationNames, revChartLocs, budgetData, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  const { collChartData, collChartSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const weekMap = {};
    const locWeekMap = {};
    filtered.forEach(m => {
      if (!weekMap[m.w]) weekMap[m.w] = 0;
      weekMap[m.w] += (m.co || 0);
      if (collChartLocs.includes(m.c)) {
        if (!locWeekMap[m.w]) locWeekMap[m.w] = {};
        locWeekMap[m.w][m.c] = (locWeekMap[m.w][m.c] || 0) + (m.co || 0);
      }
    });
    // Collections budget: no separate collections budget data exists, so omit budget line entirely
    // (previously used average collections as a flat "budget" line which was misleading)
    const allWeeks = Object.keys(weekMap).sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('collChart');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const row = { week: formatWeek(w), 'All Locations': weekMap[w] || 0 };
        collChartLocs.filter(n => n !== 'Total').forEach(loc => { row[loc] = locWeekMap[w]?.[loc] || 0; });
        return row;
      });
      const locs = collChartLocs.filter(n => n !== 'Total');
      const series = [...(collChartLocs.includes('Total') ? ['All Locations'] : []), ...locs];
      return { collChartData: data, collChartSeries: series };
    } else {
      const months = timeRange.periods;
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = months.map(mk => {
        const monthWeeks = allWeeks.filter(w => w.startsWith(mk));
        const coll = monthWeeks.reduce((s, w) => s + (weekMap[w] || 0), 0);
        const row = { week: formatMonth(mk, mk === curMonth), 'All Locations': coll };
        collChartLocs.filter(n => n !== 'Total').forEach(loc => {
          row[loc] = monthWeeks.reduce((s, w) => s + (locWeekMap[w]?.[loc] || 0), 0);
        });
        return row;
      });
      const locs = collChartLocs.filter(n => n !== 'Total');
      const series = [...(collChartLocs.includes('Total') ? ['All Locations'] : []), ...locs];
      return { collChartData: data, collChartSeries: series };
    }
  }, [metrics, locationNames, collChartLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── MTD Summary ──
  const mtdSummary = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const filteredBudget = budgetData.filter(b => centerNames.has(b.c));

    // Group metrics by month
    const byMonth = {};
    filtered.forEach(m => {
      const month = m.w.substring(0, 7); // "2026-02" or "2026-03"
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push(m);
    });

    // Group budgets by month
    const budgetByMonth = {};
    filteredBudget.forEach(b => {
      const month = b.w.substring(0, 7);
      if (!budgetByMonth[month]) budgetByMonth[month] = [];
      budgetByMonth[month].push(b);
    });

    // Current month (for MTD label) and previous 3 months window
    const today = new Date();
    const curMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

    // Build the 4-month window: previous 3 complete months + current MTD
    const targetMonths = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      targetMonths.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    // Build monthly rows for only the target months
    const monthRows = targetMonths
      .filter(m => byMonth[m]) // only include months that have data
      .map(m => {
        const rows = byMonth[m] || [];
        const bRows = budgetByMonth[m] || [];
        const revActual = rows.reduce((s, r) => s + (r.s || 0), 0);
        const collActual = rows.reduce((s, r) => s + (r.co || 0), 0);
        const revBudget = bRows.reduce((s, b) => s + (b.b || 0), 0);
        const collBudget = bRows.reduce((s, b) => s + (b.cb || 0), 0);
        const [yr, mo] = m.split('-').map(Number);
        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        const label = m === curMonthKey
          ? 'MTD'
          : monthNames[mo - 1];
        return { label, revActual, revBudget, collActual, collBudget, isMTD: m === curMonthKey };
      });

    // YTD totals
    const ytdRev = monthRows.reduce((s, r) => s + r.revActual, 0);
    const ytdRevBudget = monthRows.reduce((s, r) => s + r.revBudget, 0);
    const ytdColl = monthRows.reduce((s, r) => s + r.collActual, 0);
    const ytdCollBudget = monthRows.reduce((s, r) => s + r.collBudget, 0);

    return {
      revenue: [
        ...monthRows.map(r => ({ label: r.label, actual: Math.round(r.revActual), budget: Math.round(r.revBudget) })),
        { label: 'YTD', actual: Math.round(ytdRev), budget: Math.round(ytdRevBudget), isTotal: true },
      ],
      collections: [
        ...monthRows.map(r => ({ label: r.label, actual: Math.round(r.collActual), budget: Math.round(r.collBudget) })),
        { label: 'YTD', actual: Math.round(ytdColl), budget: Math.round(ytdCollBudget), isTotal: true },
      ],
    };
  }, [metrics, locationNames, budgetData]);

  // ── Service Mix ──
  const serviceMixData = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    // Sum by center
    const agg = {};
    filtered.forEach(m => {
      if (!agg[m.c]) agg[m.c] = { s: 0, r: 0, i: 0 };
      agg[m.c].s += (m.s || 0);
      agg[m.c].r += (m.rt || 0);
      agg[m.c].i += (m.inj || 0);
    });
    // Compute percentages. We only have injectable, retail from the data. Body/laser/facials not available.
    let rows = Object.entries(agg).map(([name, d]) => {
      const total = d.s || 1;
      const injPct = +((d.i / total) * 100).toFixed(1);
      const retPct = +((d.r / total) * 100).toFixed(1);
      const otherPct = +(100 - injPct - retPct).toFixed(1);
      return {
        name,
        injectables: injPct,
        body: 0,
        laser: 0,
        facials: 0,
        retail: retPct,
        other: otherPct < 0 ? 0 : otherPct,
      };
    });
    // Sort by total sales descending, limit to top 12 for display
    rows.sort((a, b) => {
      const aTot = agg[a.name]?.s || 0;
      const bTot = agg[b.name]?.s || 0;
      return bTot - aTot;
    });
    if (rows.length > 12) rows = rows.slice(0, 12);
    return rows;
  }, [metrics, locationNames]);

  // ── Avg Botox Units — All Locations aggregated (weighted avg Total + per-location) ──
  const { aggBtxChartData, aggBtxSeries } = useMemo(() => {
    if (!btxData.length) return { aggBtxChartData: null, aggBtxSeries: [] };
    const centerNames = new Set(locationNames);
    const filtered = btxData.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('btxLoc');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const weekRows = filtered.filter(m => m.w === w);
        const totalUnits = weekRows.reduce((s, m) => s + (m.b || 0), 0);
        const count = weekRows.filter(m => m.b != null).length;
        const row = { week: formatWeek(w), Total: count > 0 ? +(totalUnits / count).toFixed(1) : null };
        aggBtxLocs.forEach(loc => {
          const m = weekRows.find(r => r.c === loc);
          if (m) row[loc] = m.b;
        });
        return row;
      });
      const locs = aggBtxLocs.filter(n => n !== 'Total');
      return { aggBtxChartData: data, aggBtxSeries: [...(aggBtxLocs.includes('Total') ? ['Total'] : []), ...locs] };
    } else {
      const months = timeRange.periods;
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = months.map(mk => {
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        const totalUnits = monthRows.reduce((s, m) => s + (m.b || 0), 0);
        const count = monthRows.filter(m => m.b != null).length;
        const row = { week: formatMonth(mk, mk === curMonth), Total: count > 0 ? +(totalUnits / count).toFixed(1) : null };
        aggBtxLocs.forEach(loc => {
          const locRows = monthRows.filter(r => r.c === loc);
          const locUnits = locRows.reduce((s, m) => s + (m.b || 0), 0);
          const locCount = locRows.filter(m => m.b != null).length;
          if (locCount > 0) row[loc] = +(locUnits / locCount).toFixed(1);
        });
        return row;
      });
      const locs = aggBtxLocs.filter(n => n !== 'Total');
      return { aggBtxChartData: data, aggBtxSeries: [...(aggBtxLocs.includes('Total') ? ['Total'] : []), ...locs] };
    }
  }, [btxData, locationNames, aggBtxLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Injectables Revenue by Provider ──
  const { injRevProvData, injRevProvSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = injRevProviderData.filter(m => centerNames.has(m.c));
    const selectedProvs = injRevProviders || availableInjProviders;
    const provSet = new Set(selectedProvs);
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('injRevProv');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    if (!timeRange.isMonthly) {
      const weeks = timeRange.periods;
      const data = weeks.map(w => {
        const row = { week: formatWeek(w) };
        const weekRows = filtered.filter(m => m.w === w);
        weekRows.forEach(m => {
          if (provSet.has(m.pr)) {
            row[m.pr] = (row[m.pr] || 0) + (Number(m.r) || 0);
          }
        });
        return row;
      });
      return { injRevProvData: data, injRevProvSeries: selectedProvs.filter(p => provSet.has(p)) };
    } else {
      const months = timeRange.periods;
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = months.map(mk => {
        const row = { week: formatMonth(mk, mk === curMonth) };
        const monthRows = filtered.filter(m => m.w.startsWith(mk));
        monthRows.forEach(m => {
          if (provSet.has(m.pr)) {
            row[m.pr] = (row[m.pr] || 0) + (Number(m.r) || 0);
          }
        });
        return row;
      });
      return { injRevProvData: data, injRevProvSeries: selectedProvs.filter(p => provSet.has(p)) };
    }
  }, [injRevProviderData, locationNames, injRevProviders, availableInjProviders, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Avg Botox Units per Appointment by Provider ──
  const { btxProvData, btxProvSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = btxProviderData.filter(m => centerNames.has(m.c));
    const selectedProvs = btxProviders || availableBtxProviders;
    const provSet = new Set(selectedProvs);
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('btxProv');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    const computeRow = (rows, label) => {
      const row = { week: label };
      const provTotals = {};
      const provCounts = {};
      rows.forEach(m => {
        if (provSet.has(m.pr)) {
          const units = Number(m.b) || 0;
          const count = Number(m.n) || 0;
          provTotals[m.pr] = (provTotals[m.pr] || 0) + (units * count);
          provCounts[m.pr] = (provCounts[m.pr] || 0) + count;
        }
      });
      Object.keys(provTotals).forEach(pr => {
        row[pr] = provCounts[pr] > 0 ? +(provTotals[pr] / provCounts[pr]).toFixed(1) : null;
      });
      return row;
    };

    if (!timeRange.isMonthly) {
      const data = timeRange.periods.map(w => computeRow(filtered.filter(m => m.w === w), formatWeek(w)));
      return { btxProvData: data, btxProvSeries: selectedProvs.filter(p => provSet.has(p)) };
    } else {
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      const data = timeRange.periods.map(mk => computeRow(filtered.filter(m => m.w.startsWith(mk)), formatMonth(mk, mk === curMonth)));
      return { btxProvData: data, btxProvSeries: selectedProvs.filter(p => provSet.has(p)) };
    }
  }, [btxProviderData, locationNames, btxProviders, availableBtxProviders, globalTimeMode, globalPeriodCount, chartTimeOverrides]);


  // ── Neurotoxin vs Filler Sales (Total + per-location) ──
  const { ntxFillerChartData, ntxFillerSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = ntxFillerData.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('ntxFiller');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    const buildRow = (rows, label) => {
      const row = {
        week: label,
        'Neurotoxin (Total)': rows.reduce((s, m) => s + (m.ntx || 0), 0),
        'Filler (Total)': rows.reduce((s, m) => s + (m.filler || 0), 0),
      };
      ntxFillerLocs.forEach(loc => {
        if (loc === TOTAL) return;
        const locRows = rows.filter(r => r.c === loc);
        if (locRows.length) {
          row[loc + ' NTX'] = locRows.reduce((s, m) => s + (m.ntx || 0), 0);
          row[loc + ' Filler'] = locRows.reduce((s, m) => s + (m.filler || 0), 0);
        }
      });
      return row;
    };

    let data;
    if (!timeRange.isMonthly) {
      data = timeRange.periods.map(w => buildRow(filtered.filter(m => m.w === w), formatWeek(w)));
    } else {
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      data = timeRange.periods.map(mk => buildRow(filtered.filter(m => m.w.startsWith(mk)), formatMonth(mk, mk === curMonth)));
    }
    const series = ['Neurotoxin (Total)', 'Filler (Total)'];
    ntxFillerLocs.filter(n => n !== TOTAL).forEach(loc => {
      series.push(loc + ' NTX', loc + ' Filler');
    });
    return { ntxFillerChartData: data, ntxFillerSeries: ntxFillerLocs.includes(TOTAL) ? series : series.filter(s => !s.includes('(Total)')) };
  }, [ntxFillerData, locationNames, ntxFillerLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Filler Syringes Per Injectable Appointment by Location ──
  const { syrInjData, syrInjSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = syringeLocData.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('syrInjLoc');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    const buildRow = (rows, label) => {
      const totalSyr = rows.reduce((s, m) => s + (m.si * m.ni), 0);
      const totalAppts = rows.reduce((s, m) => s + m.ni, 0);
      const row = { week: label, Total: totalAppts > 0 ? +(totalSyr / totalAppts).toFixed(2) : null };
      syrInjLocs.forEach(loc => {
        if (loc === TOTAL) return;
        const locRows = rows.filter(r => r.c === loc);
        const locSyr = locRows.reduce((s, m) => s + (m.si * m.ni), 0);
        const locN = locRows.reduce((s, m) => s + m.ni, 0);
        if (locN > 0) row[loc] = +(locSyr / locN).toFixed(2);
      });
      return row;
    };

    let data;
    if (!timeRange.isMonthly) {
      data = timeRange.periods.map(w => buildRow(filtered.filter(m => m.w === w), formatWeek(w)));
    } else {
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      data = timeRange.periods.map(mk => buildRow(filtered.filter(m => m.w.startsWith(mk)), formatMonth(mk, mk === curMonth)));
    }
    const locs = syrInjLocs.filter(n => n !== TOTAL);
    return { syrInjData: data, syrInjSeries: [...(syrInjLocs.includes(TOTAL) ? [TOTAL] : []), ...locs] };
  }, [syringeLocData, locationNames, syrInjLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Filler Syringes Per Filler Appointment by Location ──
  const { syrFillerData, syrFillerSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = syringeLocData.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('syrFillerLoc');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    const buildRow = (rows, label) => {
      const totalSyr = rows.reduce((s, m) => s + (m.sf * m.nf), 0);
      const totalAppts = rows.reduce((s, m) => s + m.nf, 0);
      const row = { week: label, Total: totalAppts > 0 ? +(totalSyr / totalAppts).toFixed(2) : null };
      syrFillerLocs.forEach(loc => {
        if (loc === TOTAL) return;
        const locRows = rows.filter(r => r.c === loc);
        const locSyr = locRows.reduce((s, m) => s + (m.sf * m.nf), 0);
        const locN = locRows.reduce((s, m) => s + m.nf, 0);
        if (locN > 0) row[loc] = +(locSyr / locN).toFixed(2);
      });
      return row;
    };

    let data;
    if (!timeRange.isMonthly) {
      data = timeRange.periods.map(w => buildRow(filtered.filter(m => m.w === w), formatWeek(w)));
    } else {
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      data = timeRange.periods.map(mk => buildRow(filtered.filter(m => m.w.startsWith(mk)), formatMonth(mk, mk === curMonth)));
    }
    const locs = syrFillerLocs.filter(n => n !== TOTAL);
    return { syrFillerData: data, syrFillerSeries: [...(syrFillerLocs.includes(TOTAL) ? [TOTAL] : []), ...locs] };
  }, [syringeLocData, locationNames, syrFillerLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Available Syringe Providers (from filtered/selected locations) ──
  const availableSyrProviders = useMemo(() => {
    const centerNames = new Set(effectiveProviderLocNames);
    const provs = new Set();
    syringeProvData.filter(m => centerNames.has(m.c)).forEach(m => provs.add(m.pr));
    return [...provs].sort();
  }, [syringeProvData, effectiveProviderLocNames]);

  // ── Filler Syringes Per Injectable Appointment by Provider ──
  const { syrInjProvData, syrInjProvSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = syringeProvData.filter(m => centerNames.has(m.c));
    const selectedProvs = syrInjProviders || availableSyrProviders;
    const provSet = new Set(selectedProvs);
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('syrInjProv');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    const buildRow = (rows, label) => {
      const row = { week: label };
      const agg = {};
      rows.forEach(m => {
        if (provSet.has(m.pr)) {
          if (!agg[m.pr]) agg[m.pr] = { totalSyr: 0, totalN: 0 };
          agg[m.pr].totalSyr += m.si * m.n;
          agg[m.pr].totalN += m.n;
        }
      });
      Object.entries(agg).forEach(([pr, d]) => {
        row[pr] = d.totalN > 0 ? +(d.totalSyr / d.totalN).toFixed(2) : null;
      });
      return row;
    };

    let data;
    if (!timeRange.isMonthly) {
      data = timeRange.periods.map(w => buildRow(filtered.filter(m => m.w === w), formatWeek(w)));
    } else {
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      data = timeRange.periods.map(mk => buildRow(filtered.filter(m => m.w.startsWith(mk)), formatMonth(mk, mk === curMonth)));
    }
    return { syrInjProvData: data, syrInjProvSeries: selectedProvs.filter(p => provSet.has(p)) };
  }, [syringeProvData, locationNames, syrInjProviders, availableSyrProviders, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Filler Syringes Per Filler Appointment by Provider ──
  const { syrFillerProvData, syrFillerProvSeries } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = syringeProvData.filter(m => centerNames.has(m.c));
    const selectedProvs = syrFillerProviders || availableSyrProviders;
    const provSet = new Set(selectedProvs);
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('syrFillerProv');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    const buildRow = (rows, label) => {
      const row = { week: label };
      const agg = {};
      rows.forEach(m => {
        if (provSet.has(m.pr) && m.sf > 0) {
          if (!agg[m.pr]) agg[m.pr] = { totalSyr: 0, totalN: 0 };
          agg[m.pr].totalSyr += m.sf * m.n;
          agg[m.pr].totalN += m.n;
        }
      });
      Object.entries(agg).forEach(([pr, d]) => {
        row[pr] = d.totalN > 0 ? +(d.totalSyr / d.totalN).toFixed(2) : null;
      });
      return row;
    };

    let data;
    if (!timeRange.isMonthly) {
      data = timeRange.periods.map(w => buildRow(filtered.filter(m => m.w === w), formatWeek(w)));
    } else {
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      data = timeRange.periods.map(mk => buildRow(filtered.filter(m => m.w.startsWith(mk)), formatMonth(mk, mk === curMonth)));
    }
    return { syrFillerProvData: data, syrFillerProvSeries: selectedProvs.filter(p => provSet.has(p)) };
  }, [syringeProvData, locationNames, syrFillerProviders, availableSyrProviders, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Appendix: Revenue + Collections + Collections % of Revenue ──
  const { revCollAppendixData, revCollAppendixSeries, revCollAppendixRightAxis } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('revCollAppendix');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    const buildRow = (rows, label) => {
      const totalRev = rows.reduce((s, m) => s + (m.s || 0), 0);
      const totalColl = rows.reduce((s, m) => s + (m.co || 0), 0);
      const collPct = totalRev > 0 ? +((totalColl / totalRev) * 100).toFixed(1) : null;
      const row = { week: label };
      if (revCollAppendixLocs.includes(TOTAL)) {
        row['Revenue'] = totalRev;
        row['Collections'] = totalColl;
        row['Coll % of Rev'] = collPct;
      }
      revCollAppendixLocs.filter(n => n !== TOTAL).forEach(loc => {
        const locRows = rows.filter(m => m.c === loc);
        const locRev = locRows.reduce((s, m) => s + (m.s || 0), 0);
        const locColl = locRows.reduce((s, m) => s + (m.co || 0), 0);
        row[loc + ' Rev'] = locRev;
        row[loc + ' Coll'] = locColl;
        row[loc + ' %'] = locRev > 0 ? +((locColl / locRev) * 100).toFixed(1) : null;
      });
      return row;
    };

    let data;
    if (!timeRange.isMonthly) {
      data = timeRange.periods.map(w => buildRow(filtered.filter(m => m.w === w), formatWeek(w)));
    } else {
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      data = timeRange.periods.map(mk => buildRow(filtered.filter(m => m.w.startsWith(mk)), formatMonth(mk, mk === curMonth)));
    }

    const series = [];
    const rightAxis = [];
    if (revCollAppendixLocs.includes(TOTAL)) {
      series.push('Revenue', 'Collections', 'Coll % of Rev');
      rightAxis.push('Coll % of Rev');
    }
    revCollAppendixLocs.filter(n => n !== TOTAL).forEach(loc => {
      series.push(loc + ' Rev', loc + ' Coll', loc + ' %');
      rightAxis.push(loc + ' %');
    });

    return { revCollAppendixData: data, revCollAppendixSeries: series, revCollAppendixRightAxis: rightAxis };
  }, [metrics, locationNames, revCollAppendixLocs, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Available providers for Rev/Coll+Hours and Rev/Hour charts ──
  const availableRevCollHoursProviders = useMemo(() => {
    const centerNames = new Set(locationNames);
    const clinicalSet = new Set(injRevProviderData.map(m => m.pr));
    const provs = new Set();
    revCollProvData.filter(m => centerNames.has(m.c) && clinicalSet.has(m.pr)).forEach(m => provs.add(m.pr));
    return [...provs].sort();
  }, [revCollProvData, locationNames, injRevProviderData]);

  // ── Revenue + Collections + Net Scheduled Provider Hours (with optional provider filter) ──
  const { revCollHoursData, revCollHoursSeries, revCollHoursRightAxis } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const filteredHours = providerHoursData.filter(m => centerNames.has(m.c));
    // Provider-filtered rev/coll data
    const selectedProvs = revCollHoursProviders;
    const useProvFilter = selectedProvs && selectedProvs.length > 0;
    const provSet = useProvFilter ? new Set(selectedProvs) : null;
    const filteredProvData = useProvFilter
      ? revCollProvData.filter(m => centerNames.has(m.c) && provSet.has(m.pr))
      : null;

    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('revCollHours');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    // Build per-location week maps for hours
    const locHoursMap = {};
    filteredHours.forEach(m => {
      if (!locHoursMap[m.w]) locHoursMap[m.w] = {};
      locHoursMap[m.w][m.c] = (locHoursMap[m.w][m.c] || 0) + (m.h || 0);
    });

    const buildRow = (weekKeys, label) => {
      const rows = filtered.filter(m => weekKeys.includes(m.w));
      // If provider filter active, use provider-level data for rev/coll
      const totalRev = useProvFilter
        ? filteredProvData.filter(m => weekKeys.includes(m.w)).reduce((s, m) => s + (m.rev || 0), 0)
        : rows.reduce((s, m) => s + (m.s || 0), 0);
      const totalColl = useProvFilter
        ? filteredProvData.filter(m => weekKeys.includes(m.w)).reduce((s, m) => s + (m.coll || 0), 0)
        : rows.reduce((s, m) => s + (m.co || 0), 0);
      const totalHours = weekKeys.reduce((s, w) => {
        const weekHoursMap = locHoursMap[w] || {};
        return s + Object.values(weekHoursMap).reduce((ss, h) => ss + h, 0);
      }, 0);

      const row = { week: label };
      if (revCollHoursLocs.includes(TOTAL)) {
        row['Revenue'] = totalRev;
        row['Collections'] = totalColl;
        row['Net Sched Hours'] = Math.round(totalHours);
      }
      revCollHoursLocs.filter(n => n !== TOTAL).forEach(loc => {
        const locRev = rows.filter(m => m.c === loc).reduce((s, m) => s + (m.s || 0), 0);
        const locColl = rows.filter(m => m.c === loc).reduce((s, m) => s + (m.co || 0), 0);
        const locHours = weekKeys.reduce((s, w) => s + ((locHoursMap[w] || {})[loc] || 0), 0);
        row[loc + ' Rev'] = locRev;
        row[loc + ' Coll'] = locColl;
        row[loc + ' Hours'] = Math.round(locHours);
      });
      return row;
    };

    let data;
    if (!timeRange.isMonthly) {
      data = timeRange.periods.map(w => buildRow([w], formatWeek(w)));
    } else {
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      data = timeRange.periods.map(mk => buildRow(allWeeks.filter(w => w.startsWith(mk)), formatMonth(mk, mk === curMonth)));
    }

    const series = [];
    const rightAxis = [];
    if (revCollHoursLocs.includes(TOTAL)) {
      series.push('Revenue', 'Collections', 'Net Sched Hours');
      rightAxis.push('Net Sched Hours');
    }
    revCollHoursLocs.filter(n => n !== TOTAL).forEach(loc => {
      series.push(loc + ' Rev', loc + ' Coll', loc + ' Hours');
      rightAxis.push(loc + ' Hours');
    });

    return { revCollHoursData: data, revCollHoursSeries: series, revCollHoursRightAxis: rightAxis };
  }, [metrics, providerHoursData, locationNames, revCollHoursLocs, revCollHoursProviders, revCollProvData, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Revenue/Hour, Collections/Hour, Utilization Rate (with optional provider filter) ──
  const { revPerHourChartData, revPerHourSeries, revPerHourRightAxis } = useMemo(() => {
    const centerNames = new Set(locationNames);
    const filtered = metrics.filter(m => centerNames.has(m.c));
    const filteredHours = providerHoursData.filter(m => centerNames.has(m.c));
    const filteredUtil = utilizationData.filter(m => centerNames.has(m.c));
    // Provider-filtered rev/coll
    const selectedProvs = revPerHourProviders;
    const useProvFilter = selectedProvs && selectedProvs.length > 0;
    const provSet = useProvFilter ? new Set(selectedProvs) : null;
    const filteredProvData = useProvFilter
      ? revCollProvData.filter(m => centerNames.has(m.c) && provSet.has(m.pr))
      : null;

    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('revPerHour');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    const locHoursMap = {};
    filteredHours.forEach(m => {
      if (!locHoursMap[m.w]) locHoursMap[m.w] = {};
      locHoursMap[m.w][m.c] = (locHoursMap[m.w][m.c] || 0) + (m.h || 0);
    });
    const locUtilMap = {};
    filteredUtil.forEach(m => {
      if (!locUtilMap[m.w]) locUtilMap[m.w] = {};
      locUtilMap[m.w][m.c] = m.ur;
    });

    const buildRow = (weekKeys, label) => {
      const rows = filtered.filter(m => weekKeys.includes(m.w));
      const totalRev = useProvFilter
        ? filteredProvData.filter(m => weekKeys.includes(m.w)).reduce((s, m) => s + (m.rev || 0), 0)
        : rows.reduce((s, m) => s + (m.s || 0), 0);
      const totalColl = useProvFilter
        ? filteredProvData.filter(m => weekKeys.includes(m.w)).reduce((s, m) => s + (m.coll || 0), 0)
        : rows.reduce((s, m) => s + (m.co || 0), 0);
      const totalHours = weekKeys.reduce((s, w) => s + Object.values(locHoursMap[w] || {}).reduce((ss, h) => ss + h, 0), 0);
      // Utilization: weighted average across locations and weeks
      let utilSum = 0, utilCount = 0;
      weekKeys.forEach(w => {
        const wm = locUtilMap[w] || {};
        Object.values(wm).forEach(v => { if (v != null) { utilSum += v; utilCount++; } });
      });

      const row = { week: label };
      if (revPerHourLocs.includes(TOTAL)) {
        row['Rev / Hour'] = totalHours > 0 ? Math.round(totalRev / totalHours) : null;
        row['Coll / Hour'] = totalHours > 0 ? Math.round(totalColl / totalHours) : null;
        row['Utilization %'] = utilCount > 0 ? +(utilSum / utilCount).toFixed(1) : null;
      }
      revPerHourLocs.filter(n => n !== TOTAL).forEach(loc => {
        const locRev = rows.filter(m => m.c === loc).reduce((s, m) => s + (m.s || 0), 0);
        const locColl = rows.filter(m => m.c === loc).reduce((s, m) => s + (m.co || 0), 0);
        const locHours = weekKeys.reduce((s, w) => s + ((locHoursMap[w] || {})[loc] || 0), 0);
        let locUtilSum = 0, locUtilN = 0;
        weekKeys.forEach(w => { const v = (locUtilMap[w] || {})[loc]; if (v != null) { locUtilSum += v; locUtilN++; } });
        row[loc + ' Rev/Hr'] = locHours > 0 ? Math.round(locRev / locHours) : null;
        row[loc + ' Coll/Hr'] = locHours > 0 ? Math.round(locColl / locHours) : null;
        row[loc + ' Util%'] = locUtilN > 0 ? +(locUtilSum / locUtilN).toFixed(1) : null;
      });
      return row;
    };

    let data;
    if (!timeRange.isMonthly) {
      data = timeRange.periods.map(w => buildRow([w], formatWeek(w)));
    } else {
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      data = timeRange.periods.map(mk => buildRow(allWeeks.filter(w => w.startsWith(mk)), formatMonth(mk, mk === curMonth)));
    }

    const series = [];
    const rightAxis = [];
    if (revPerHourLocs.includes(TOTAL)) {
      series.push('Rev / Hour', 'Coll / Hour', 'Utilization %');
      rightAxis.push('Utilization %');
    }
    revPerHourLocs.filter(n => n !== TOTAL).forEach(loc => {
      series.push(loc + ' Rev/Hr', loc + ' Coll/Hr', loc + ' Util%');
      rightAxis.push(loc + ' Util%');
    });

    return { revPerHourChartData: data, revPerHourSeries: series, revPerHourRightAxis: rightAxis };
  }, [metrics, providerHoursData, utilizationData, locationNames, revPerHourLocs, revPerHourProviders, revCollProvData, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ── Appendix: Revenue + Collections + Coll% by Provider ──
  // Effective locations for the appendix provider chart (chart-level loc filter → top-level filter)
  const revCollProvEffectiveLocs = useMemo(() => {
    if (revCollProvAppendixLocs.length > 0) return revCollProvAppendixLocs;
    return globalSelectedLocs.length > 0 ? globalSelectedLocs : locationNames;
  }, [revCollProvAppendixLocs, locationNames, globalSelectedLocs]);

  const availableRevCollProviders = useMemo(() => {
    const centerNames = new Set(revCollProvEffectiveLocs);
    // Only include clinical providers (those who have injectable revenue data)
    const clinicalProviders = new Set(injRevProviderData.map(m => m.pr));
    const provs = new Set();
    revCollProvData.filter(m => centerNames.has(m.c) && clinicalProviders.has(m.pr)).forEach(m => provs.add(m.pr));
    return [...provs].sort();
  }, [revCollProvData, revCollProvEffectiveLocs, injRevProviderData]);

  // Reset provider selection when chart-level locations change
  useEffect(() => {
    if (hasActiveFilter) {
      setRevCollProvAppendixProviders(null); // auto-select all for the new location set
    }
  }, [revCollProvEffectiveLocs]);

  const { revCollProvChartData, revCollProvBarSeries, revCollProvLineSeries } = useMemo(() => {
    const centerNames = new Set(revCollProvEffectiveLocs);
    const clinicalSet = new Set(injRevProviderData.map(m => m.pr));
    const filtered = revCollProvData.filter(m => centerNames.has(m.c) && clinicalSet.has(m.pr));
    const selectedProvs = revCollProvAppendixProviders || availableRevCollProviders;
    const provSet = new Set(selectedProvs);
    const allWeeks = [...new Set(filtered.map(m => m.w))].sort();
    const { mode: tMode, count: tCount } = getEffectiveTime('revCollProv');
    const timeRange = getTimeRange(allWeeks, tMode, tCount);

    const buildRow = (rows, label) => {
      const row = { week: label };
      const provAgg = {};
      rows.forEach(m => {
        if (provSet.has(m.pr)) {
          if (!provAgg[m.pr]) provAgg[m.pr] = { rev: 0, coll: 0 };
          provAgg[m.pr].rev += m.rev || 0;
          provAgg[m.pr].coll += m.coll || 0;
        }
      });
      Object.entries(provAgg).forEach(([pr, d]) => {
        row[pr] = d.coll;
        row[pr + ' %'] = d.rev > 0 ? +((d.coll / d.rev) * 100).toFixed(1) : null;
      });
      return row;
    };

    let data;
    if (!timeRange.isMonthly) {
      data = timeRange.periods.map(w => buildRow(filtered.filter(m => m.w === w), formatWeek(w)));
    } else {
      const today = new Date();
      const curMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      data = timeRange.periods.map(mk => buildRow(filtered.filter(m => m.w.startsWith(mk)), formatMonth(mk, mk === curMonth)));
    }

    const activeProv = selectedProvs.filter(p => provSet.has(p));
    return {
      revCollProvChartData: data,
      revCollProvBarSeries: activeProv,
      revCollProvLineSeries: activeProv.map(p => p + ' %'),
    };
  }, [revCollProvData, revCollProvEffectiveLocs, revCollProvAppendixProviders, availableRevCollProviders, injRevProviderData, globalTimeMode, globalPeriodCount, chartTimeOverrides]);

  // ══════════════════════════════════════════════════════════
  //  Loading State
  // ══════════════════════════════════════════════════════════
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: V.cream, fontFamily: FONT.body,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, border: `3px solid ${V.taupe}`,
          borderTopColor: V.gold, borderRadius: '50%',
          animation: 'spin 1s linear infinite',
        }} />
        <div style={{ color: V.navy, fontFamily: FONT.heading, fontSize: 18 }}>
          Loading Performance Data...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: V.cream, fontFamily: FONT.body, color: V.dark }}>

      {/* ── Sticky Nav Bar ─────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: V.navy, padding: '0 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 52, borderBottom: `1px solid rgba(255,255,255,0.08)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontFamily: FONT.heading, fontSize: 18, color: V.gold,
            letterSpacing: 6,
          }}>A M P</span>
          <span style={{
            color: 'rgba(255,255,255,0.25)', fontSize: 20, fontWeight: 200,
          }}>|</span>
          <span style={{
            fontFamily: FONT.body, fontSize: 10, fontWeight: 600,
            color: V.white, letterSpacing: 2.5, textTransform: 'uppercase',
          }}>Advanced MedAesthetic Partners</span>
        </div>
        <div style={{
          fontFamily: FONT.body, fontSize: 11, color: V.blush,
          letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600,
        }}>
          Performance Tracker
        </div>
      </div>

      {/* ── Page Content ───────────────────────────────────── */}
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 40px 80px' }}>

        {/* Page Header */}
        <SectionLabel>{filterLabel} · {dateRangeLabel}</SectionLabel>
        <h1 style={{
          fontFamily: FONT.heading, fontSize: 36, fontWeight: 400,
          color: V.navy, margin: '0 0 4px',
        }}>Performance Tracker</h1>
        <p style={{ fontSize: 13, color: V.mauve, margin: '0 0 6px' }}>
          Weekly performance metrics across {filteredLocations.length} location{filteredLocations.length !== 1 ? 's' : ''}.
          {selectedLocTypes.length > 0 && ` Filtered to ${selectedLocTypes.join(', ')}.`}
          {selectedPractices.length > 0 && ` Practice: ${selectedPractices.join(', ')}.`}
        </p>
        <div style={{ width: 40, height: 3, background: V.gold, borderRadius: 2, marginBottom: 28 }} />

        {/* ── Filter Bar ──────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16,
          padding: '16px 20px', background: V.white,
          borderRadius: 10, border: `1px solid ${V.taupe}`,
          marginBottom: 32, flexWrap: 'wrap',
        }}>
          {/* Location Type dropdown: hidden when pre-filtered by practice or location */}
          {!initialPractices?.length && !initialLocations?.length && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{
                fontSize: 10, fontWeight: 700, color: V.navy,
                letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: FONT.body,
              }}>Location Type</label>
              <MultiSelectDropdown
                label="Location Type"
                options={initialLocTypes?.length ? initialLocTypes : locationTypes}
                selected={selectedLocTypes}
                onChange={setSelectedLocTypes}
                minWidth={200}
              />
            </div>
          )}

          {/* Practice dropdown: show only relevant practice(s) when pre-filtered */}
          {!initialLocations?.length && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{
                fontSize: 10, fontWeight: 700, color: V.navy,
                letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: FONT.body,
              }}>Practice</label>
              <MultiSelectDropdown
                label="Practice"
                options={initialPractices?.length ? initialPractices : practices}
                selected={selectedPractices}
                onChange={setSelectedPractices}
                minWidth={220}
              />
            </div>
          )}

          {/* Location dropdown: show only relevant locations */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{
              fontSize: 10, fontWeight: 700, color: V.navy,
              letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: FONT.body,
            }}>Location</label>
            <MultiSelectDropdown
              label="Location"
              options={initialLocations?.length ? initialLocations : locationNames}
              selected={globalSelectedLocs}
              onChange={setGlobalSelectedLocs}
              minWidth={220}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: V.navy, letterSpacing: 1.5, textTransform: 'uppercase', fontFamily: FONT.body }}>
              VIEW
            </label>
            <select value={globalTimeMode} onChange={e => setGlobalTimeMode(e.target.value)} style={{
              padding: '7px 10px', border: `1.5px solid ${V.taupe}`, borderRadius: 6,
              fontSize: 12, fontFamily: FONT.body, color: V.navy, background: V.cream, cursor: 'pointer',
            }}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            <select value={globalPeriodCount} onChange={e => setGlobalPeriodCount(Number(e.target.value))} style={{
              padding: '7px 10px', border: `1.5px solid ${V.taupe}`, borderRadius: 6,
              fontSize: 12, fontFamily: FONT.body, color: V.navy, background: V.cream, cursor: 'pointer', minWidth: 50,
            }}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => { setSelectedLocTypes([]); setSelectedPractices([]); setGlobalSelectedLocs([]); const T = ['Total']; allChartSetters.forEach(s => s([...T])); setInjRevProviders(null); setBtxProviders(null); setGlobalTimeMode('weekly'); setGlobalPeriodCount(12); setChartTimeOverrides({}); }}
            style={{
              marginLeft: 'auto', padding: '7px 16px',
              background: 'transparent', color: V.navy,
              border: `1.5px solid ${V.taupe}`, borderRadius: 5,
              fontFamily: FONT.body, fontSize: 11, fontWeight: 600,
              cursor: 'pointer', letterSpacing: 0.3,
            }}
          >Clear Filters</button>

          <div style={{
            padding: '7px 13px', background: V.gold, color: V.navy,
            fontFamily: FONT.body, fontSize: 10, fontWeight: 700,
            letterSpacing: 0.3, borderRadius: 5,
          }}>
            {filteredLocations.length} of {locations.length} Locations
          </div>
        </div>


        {/* ── Location Performance Report (single location) ── */}
        {globalSelectedLocs.length === 1 && (
          <LocationReport
            location={globalSelectedLocs[0]}
            locations={locations}
            metrics={metrics}
            opsData={opsData}
            btxData={btxData}
            syringeLocData={syringeLocData}
            utilizationData={utilizationData}
            providerHoursData={providerHoursData}
            injRevProviderData={injRevProviderData}
            btxProviderData={btxProviderData}
            syringeProvData={syringeProvData}
            revCollProvData={revCollProvData}
          />
        )}

        {/* ══════════════════════════════════════════════════
           SECTION 1: Top Line Performance Deep Dive
           ══════════════════════════════════════════════════ */}
        <div onClick={() => toggleSection('section1')} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <SectionSeparator number="1" title={`Top Line Performance Deep Dive ${sectionsMinimized.section1 ? '▸' : ''}`} />
        </div>
        <div style={{ display: sectionsMinimized.section1 ? 'none' : 'block' }}>

        {/* MTD Summary + Service Mix (left 25%) | Weekly Charts (right 75%) */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: 24, marginBottom: 24 }}>
          {/* Left column: MTD table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ChartCard title="MTD Revenue & Collections vs Budget">
              <MTDSummaryTable data={mtdSummary} />
            </ChartCard>
          </div>
          {/* Right column: two weekly charts stacked with location dropdowns */}
          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 16 }}>
            <ChartCard
              title="Revenue vs Budget"
              headerRight={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <ChartTimeControl chartId="revChart" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                  <MultiSelectDropdown
                    label="Location"
                    options={['Total', ...locationNames]}
                    selected={revChartLocs}
                    onChange={setRevChartLocs}
                    minWidth={170}
                  />
                </div>
              }
            >
              <MultiLineChart
                data={revChartData}
                series={revChartSeries}
                height={200}
                formatter={fmtK}
                colorMap={{ 'All Locations': V.gold, Budget: V.navy, ...locationColorMap }}
                rightAxisSeries={revChartLocs.filter(n => n !== 'Total')}
              />
            </ChartCard>
            <ChartCard
              title="Collections vs Budget"
              headerRight={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <ChartTimeControl chartId="collChart" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                  <MultiSelectDropdown
                    label="Location"
                    options={['Total', ...locationNames]}
                    selected={collChartLocs}
                    onChange={setCollChartLocs}
                    minWidth={170}
                  />
                </div>
              }
            >
              <MultiLineChart
                data={collChartData}
                series={collChartSeries}
                height={200}
                formatter={fmtK}
                colorMap={{ 'All Locations': V.gold, Budget: V.navy, ...locationColorMap }}
                rightAxisSeries={collChartLocs.filter(n => n !== 'Total')}
              />
            </ChartCard>
          </div>
        </div>

        {/* Revenue vs Collections with Coll % of Rev */}
        <div style={{ marginBottom: 24 }}>
          <ChartCard
            title="Revenue vs Collections (with Collections % of Revenue)"
            tooltip="Revenue and Collections on the left axis; Collections as a percentage of Revenue shown as a dotted line on the right axis"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="revCollAppendix" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                <MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={revCollAppendixLocs}
                  onChange={setRevCollAppendixLocs}
                  minWidth={170}
                />
              </div>
            }
          >
            <MultiLineChart
              data={revCollAppendixData}
              series={revCollAppendixSeries}
              height={380}
              formatter={fmtK}
              rightAxisFormatter={fmtPct}
              colorMap={{
                'Revenue': V.gold,
                'Collections': V.navy,
                'Coll % of Rev': V.red,
                ...locationColorMap,
              }}
              rightAxisSeries={revCollAppendixRightAxis || []}
            />
          </ChartCard>
        </div>

        </div>{/* end section 1 collapsible */}

        {/* ══════════════════════════════════════════════════
           SECTION 2: Core KPIs
           ══════════════════════════════════════════════════ */}
        <div onClick={() => toggleSection('section2')} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <SectionSeparator number="2" title={`Core KPIs ${sectionsMinimized.section2 ? '▸' : ''}`} />
        </div>
        <div style={{ display: sectionsMinimized.section2 ? 'none' : 'block' }}>

        {/* Unique Patients + Avg Rev Per Patient */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <ChartCard
            title="Collections-Generating Unique Patients"
            tooltip="Count of unique patients who generated collections each week"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="uniquePt" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={uniquePtLocs}
                  onChange={setUniquePtLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={uniquePtData}
              series={uniquePtSeries}
              height={300}
              formatter={(v) => v?.toLocaleString()}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={uniquePtLocs.filter(n => n !== 'Total')}
            />
          </ChartCard>
          <ChartCard
            title="Avg Revenue Per Patient"
            tooltip="Average revenue per unique patient visit by location"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="avgRev" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={avgRevLocs}
                  onChange={setAvgRevLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={avgRevData}
              series={avgRevSeries}
              height={300}
              formatter={fmtDollar}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={avgRevLocs.filter(n => n !== 'Total')}
            />
          </ChartCard>
        </div>

        {/* Retail Sales + Retail % */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <ChartCard
            title="Retail Sales"
            tooltip="Total retail product sales by location per week"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="retail" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={retailLocs}
                  onChange={setRetailLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={retailData}
              series={retailSeries}
              height={300}
              formatter={fmtK}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={retailLocs.filter(n => n !== 'Total')}
            />
          </ChartCard>
          <ChartCard
            title="Retail Sales as % of Total Sales"
            tooltip="Retail revenue as a percentage of total location revenue. Goal: >7.5%"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="retailPct" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={retailPctLocs}
                  onChange={setRetailPctLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={retailPctData}
              series={retailPctSeries}
              height={300}
              formatter={fmtPct}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={retailPctLocs.filter(n => n !== 'Total')}
            />
          </ChartCard>
        </div>

        {/* Cancellation + No-Show */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <ChartCard
            title="Patient Cancellation Rate"
            tooltip="Percentage of appointments cancelled per week by location. Goal: <5%"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="cancel" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={cancelLocs}
                  onChange={setCancelLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={cancelData}
              series={cancelSeries}
              height={320}
              formatter={fmtPct}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={cancelLocs.filter(n => n !== 'Total')}
            />
          </ChartCard>
          <ChartCard
            title="Patient No-Show Rate"
            tooltip="Percentage of appointments that were no-shows per week. Goal: <5%"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="noshow" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={noshowLocs}
                  onChange={setNoshowLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={noshowData}
              series={noshowSeries}
              height={320}
              formatter={fmtPct}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={noshowLocs.filter(n => n !== 'Total')}
            />
          </ChartCard>
        </div>

        {/* Utilization + Net Provider Hours */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <ChartCard
            title="Utilization Rate"
            tooltip="Average provider utilization rate (booked hours / scheduled hours). Goal: >70%"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="utilization" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={utilizationLocs}
                  onChange={setUtilizationLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={utilizationChartData}
              series={utilizationSeries}
              height={320}
              formatter={fmtPct}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={utilizationLocs.filter(n => n !== TOTAL)}
            />
          </ChartCard>
          <ChartCard
            title="Net Provider Hours"
            tooltip="Total net scheduled provider hours (scheduled hours minus blockout hours) by location per week"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="netHours" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={netHoursLocs}
                  onChange={setNetHoursLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={netHoursChartData}
              series={netHoursSeries}
              height={320}
              formatter={(v) => v != null ? `${v.toLocaleString()} hrs` : ''}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={netHoursLocs.filter(n => n !== TOTAL)}
            />
          </ChartCard>
        </div>


        </div>{/* end section 2 collapsible */}

        {/* ══════════════════════════════════════════════════
           SECTION 3: Service Mix Shift
           ══════════════════════════════════════════════════ */}
        <div onClick={() => toggleSection('section3')} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <SectionSeparator number="3" title={`Service Mix Shift ${sectionsMinimized.section3 ? '▸' : ''}`} />
        </div>
        <div style={{ display: sectionsMinimized.section3 ? 'none' : 'block' }}>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <ChartCard
            title="Total Inject. Sales"
            tooltip="All injectable revenue (neuromodulators + fillers) by location"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="injSales" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={injSalesLocs}
                  onChange={setInjSalesLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={injSalesData}
              series={injSalesSeries}
              height={320}
              formatter={fmtK}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={injSalesLocs.filter(n => n !== 'Total')}
            />
          </ChartCard>
          <ChartCard
            title="Inject. Sales as % of Total Sales"
            tooltip="Injectable revenue share of total sales by location"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="injPct" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={injPctLocs}
                  onChange={setInjPctLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={injPctData}
              series={injPctSeries}
              height={320}
              formatter={fmtPct}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={injPctLocs.filter(n => n !== 'Total')}
            />
          </ChartCard>
        </div>


        </div>{/* end section 3 collapsible */}

        {/* ══════════════════════════════════════════════════
           SECTION 4: Provider Productivity
           ══════════════════════════════════════════════════ */}
        <div onClick={() => toggleSection('section4')} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <SectionSeparator number="4" title={`Provider Productivity ${sectionsMinimized.section4 ? '▸' : ''}`} />
        </div>
        <div style={{ display: sectionsMinimized.section4 ? 'none' : 'block' }}>

        {/* Revenue vs Collections with Net Scheduled Provider Hours */}
        <div style={{ marginBottom: 24 }}>
          <ChartCard
            title="Revenue vs Collections (with Net Scheduled Provider Hours)"
            tooltip="Revenue and Collections on the left axis; Net Scheduled Provider Hours as dotted line on the right axis"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <ChartTimeControl chartId="revCollHours" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={revCollHoursLocs}
                  onChange={setRevCollHoursLocs}
                  minWidth={85}
                />)}
                <MultiSelectDropdown
                  label="Provider"
                  options={availableRevCollHoursProviders}
                  selected={revCollHoursProviders || availableRevCollHoursProviders}
                  onChange={setRevCollHoursProviders}
                  minWidth={70}
                />
              </div>
            }
          >
            <MultiLineChart
              data={revCollHoursData}
              series={revCollHoursSeries}
              height={380}
              formatter={fmtK}
              rightAxisFormatter={(v) => v != null ? `${v.toLocaleString()} hrs` : ''}
              colorMap={{
                'Revenue': V.gold,
                'Collections': V.navy,
                'Net Sched Hours': '#4A7C6F',
                ...locationColorMap,
              }}
              rightAxisSeries={revCollHoursRightAxis || []}
            />
          </ChartCard>
        </div>

        {/* Revenue & Collections per Provider Hour with Utilization Rate */}
        <div style={{ marginBottom: 24 }}>
          <ChartCard
            title="Revenue & Collections per Provider Hour (with Utilization Rate)"
            tooltip="Revenue and Collections per net scheduled provider hour on primary axis; Utilization rate as dotted line on secondary axis"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <ChartTimeControl chartId="revPerHour" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={revPerHourLocs}
                  onChange={setRevPerHourLocs}
                  minWidth={85}
                />)}
                <MultiSelectDropdown
                  label="Provider"
                  options={availableRevCollHoursProviders}
                  selected={revPerHourProviders || availableRevCollHoursProviders}
                  onChange={setRevPerHourProviders}
                  minWidth={70}
                />
              </div>
            }
          >
            <MultiLineChart
              data={revPerHourChartData}
              series={revPerHourSeries}
              height={380}
              formatter={fmtDollar}
              rightAxisFormatter={fmtPct}
              colorMap={{
                'Rev / Hour': V.gold,
                'Coll / Hour': V.navy,
                'Utilization %': V.green,
                ...locationColorMap,
              }}
              rightAxisSeries={revPerHourRightAxis || []}
            />
          </ChartCard>
        </div>

        {/* NTX vs Filler placeholder + Injectables Rev by Provider */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <ChartCard
            title="Neurotoxin vs Dermal Filler Sales"
            tooltip="Neurotoxin and filler revenue split by location"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="ntxFiller" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={ntxFillerLocs}
                  onChange={setNtxFillerLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={ntxFillerChartData}
              series={ntxFillerSeries}
              height={320}
              formatter={fmtK}
              colorMap={{ 'Neurotoxin (Total)': V.gold, 'Filler (Total)': V.navy, ...locationColorMap }}
              rightAxisSeries={ntxFillerLocs.filter(n => n !== TOTAL).flatMap(l => [l + ' NTX', l + ' Filler'])}
            />
          </ChartCard>
          <ChartCard
            title="Inject. Revenue by Provider"
            tooltip="Weekly injectable revenue by provider for filtered locations"
            headerRight={hasActiveFilter ?
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="injRevProv" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                <MultiSelectDropdown
                  label="Provider"
                  options={availableInjProviders}
                  selected={injRevProviders || availableInjProviders}
                  onChange={setInjRevProviders}
                  minWidth={70}
                />
              </div> : null
            }
          >
            {hasActiveFilter ? (
              <MultiLineChart
                data={injRevProvData}
                series={injRevProvSeries}
                height={320}
                formatter={fmtK}
                colorMap={providerColorMap}
              />
            ) : (
              <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: V.gray, fontFamily: FONT.body, fontSize: 13 }}>
                Select a Location Type, Practice, or Location filter to view provider data
              </div>
            )}
          </ChartCard>
        </div>

        {/* Botox units by location + by provider */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          {btxChartData ? (
            <ChartCard
              title="Avg Botox Units per Botox Appt"
              tooltip="Average units per unique botox appointment by location"
              headerRight={
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <ChartTimeControl chartId="btxLoc" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                  {!isSingleLocation && (<MultiSelectDropdown
                    label="Location"
                    options={['Total', ...locationNames]}
                    selected={btxLocs}
                    onChange={setBtxLocs}
                    minWidth={85}
                  />)}
                </div>
              }
            >
              <MultiLineChart
                data={btxChartData}
                series={btxSeries}
                height={320}
                formatter={(v) => `${v} units`}
                colorMap={{ Total: V.gold, ...locationColorMap }}
                rightAxisSeries={btxLocs.filter(n => n !== 'Total')}
              />
            </ChartCard>
          ) : (
            <PlaceholderCard
              title="Avg Botox Units per Botox Appt"
              message="Botox unit data will be populated in the next iteration"
            />
          )}
          <ChartCard
            title="Avg Botox Units per Botox Appt by Provider"
            tooltip="Average botox units per appointment by provider for filtered locations"
            headerRight={hasActiveFilter ?
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="btxProv" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                <MultiSelectDropdown
                  label="Provider"
                  options={availableBtxProviders}
                  selected={btxProviders || availableBtxProviders}
                  onChange={setBtxProviders}
                  minWidth={70}
                />
              </div> : null
            }
          >
            {hasActiveFilter ? (
              <MultiLineChart
                data={btxProvData}
                series={btxProvSeries}
                height={300}
                formatter={(v) => `${v} units`}
                colorMap={providerColorMap}
              />
            ) : (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: V.gray, fontFamily: FONT.body, fontSize: 13 }}>
                Select a Location Type, Practice, or Location filter to view provider data
              </div>
            )}
          </ChartCard>
        </div>

        {/* Filler syringes per injectables appointment — placeholders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <ChartCard
            title="Avg Filler Syringes Per Inject. Appt"
            tooltip="Average filler syringes dispensed per unique injectable appointment (includes non-filler inj appointments)"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="syrInjLoc" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={syrInjLocs}
                  onChange={setSyrInjLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={syrInjData}
              series={syrInjSeries}
              height={300}
              formatter={(v) => v != null ? `${v} syr` : ''}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={syrInjLocs.filter(n => n !== TOTAL)}
            />
          </ChartCard>
          <ChartCard
            title="Avg Filler Syringes Per Inject. Appt by Provider"
            tooltip="Average filler syringes per injectable appointment broken down by provider"
            headerRight={hasActiveFilter ?
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="syrInjProv" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                <MultiSelectDropdown
                  label="Provider"
                  options={availableSyrProviders}
                  selected={syrInjProviders || availableSyrProviders}
                  onChange={setSyrInjProviders}
                  minWidth={70}
                />
              </div> : null
            }
          >
            {hasActiveFilter ? (
              <MultiLineChart
                data={syrInjProvData}
                series={syrInjProvSeries}
                height={300}
                formatter={(v) => v != null ? `${v} syr` : ''}
                colorMap={providerColorMap}
              />
            ) : (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: V.gray, fontFamily: FONT.body, fontSize: 13 }}>
                Select a Location Type, Practice, or Location filter to view provider data
              </div>
            )}
          </ChartCard>
        </div>

        {/* Filler syringes per filler appointment — placeholders */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
          <ChartCard
            title="Avg Filler Syringes Per Filler Appt"
            tooltip="Average filler syringes dispensed per filler-only appointment (excludes neurotoxin-only visits)"
            headerRight={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="syrFillerLoc" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={['Total', ...locationNames]}
                  selected={syrFillerLocs}
                  onChange={setSyrFillerLocs}
                  minWidth={85}
                />)}
              </div>
            }
          >
            <MultiLineChart
              data={syrFillerData}
              series={syrFillerSeries}
              height={300}
              formatter={(v) => v != null ? `${v} syr` : ''}
              colorMap={{ Total: V.gold, ...locationColorMap }}
              rightAxisSeries={syrFillerLocs.filter(n => n !== TOTAL)}
            />
          </ChartCard>
          <ChartCard
            title="Avg Filler Syringes Per Filler Appt by Provider"
            tooltip="Average filler syringes per filler appointment broken down by provider"
            headerRight={hasActiveFilter ?
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="syrFillerProv" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                <MultiSelectDropdown
                  label="Provider"
                  options={availableSyrProviders}
                  selected={syrFillerProviders || availableSyrProviders}
                  onChange={setSyrFillerProviders}
                  minWidth={70}
                />
              </div> : null
            }
          >
            {hasActiveFilter ? (
              <MultiLineChart
                data={syrFillerProvData}
                series={syrFillerProvSeries}
                height={300}
                formatter={(v) => v != null ? `${v} syr` : ''}
                colorMap={providerColorMap}
              />
            ) : (
              <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: V.gray, fontFamily: FONT.body, fontSize: 13 }}>
                Select a Location Type, Practice, or Location filter to view provider data
              </div>
            )}
          </ChartCard>
        </div>


        </div>{/* end section 4 collapsible */}

        {/* ══════════════════════════════════════════════════
           APPENDIX: Service Mix
           ══════════════════════════════════════════════════ */}
        <div onClick={() => toggleSection('appendix')} style={{ cursor: 'pointer', userSelect: 'none' }}>
          <SectionSeparator number="A" title={`Appendix ${sectionsMinimized.appendix ? '▸' : ''}`} />
        </div>
        <div style={{ display: sectionsMinimized.appendix ? 'none' : 'block' }}>

        {/* Revenue vs Collections by Provider */}
        <div style={{ marginBottom: 24 }}>
          <ChartCard
            title="Revenue vs Collections by Provider (with Coll % of Rev)"
            tooltip="Revenue and Collections per provider on the left axis; Collections as a percentage of Revenue shown as dotted lines on the right axis"
            headerRight={hasActiveFilter ?
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <ChartTimeControl chartId="revCollProv" globalMode={globalTimeMode} globalCount={globalPeriodCount} overrides={chartTimeOverrides} setOverrides={setChartTimeOverrides} />
                {!isSingleLocation && (<MultiSelectDropdown
                  label="Location"
                  options={locationNames}
                  selected={revCollProvAppendixLocs}
                  onChange={setRevCollProvAppendixLocs}
                  minWidth={85}
                />)}
                <MultiSelectDropdown
                  label="Provider"
                  options={availableRevCollProviders}
                  selected={revCollProvAppendixProviders || availableRevCollProviders}
                  onChange={setRevCollProvAppendixProviders}
                  minWidth={70}
                />
              </div> : null
            }
          >
            {hasActiveFilter ? (
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={revCollProvChartData} margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={V.taupe} />
                  <XAxis dataKey="week" tick={{ fontSize: 11, fontFamily: FONT.body, fill: V.gray }} />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 11, fontFamily: FONT.body, fill: V.gray }}
                    tickFormatter={fmtK}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10, fontFamily: FONT.body, fill: V.goldMuted }}
                    tickFormatter={fmtPct}
                    stroke={V.goldLight}
                  />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload) return null;
                    return (
                      <div style={{ background: V.navy, border: 'none', borderRadius: 6, padding: '8px 12px', fontFamily: FONT.body, fontSize: 12 }}>
                        <div style={{ color: V.gold, fontWeight: 600, marginBottom: 4 }}>{label}</div>
                        {payload.map((entry, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '1px 0' }}>
                            <span style={{ color: readableOnNavy(entry.color || entry.fill || entry.stroke) }}>{entry.name}</span>
                            <span style={{ color: V.cream, fontWeight: 600 }}>{entry.name.endsWith('%') ? fmtPct(entry.value) : fmtK(entry.value)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontFamily: FONT.body, fontSize: 10 }} iconType="rect" />
                  {revCollProvBarSeries.map((pr, i) => (
                    <Bar
                      key={pr}
                      yAxisId="left"
                      dataKey={pr}
                      fill={providerColorMap[pr] || CHART_COLORS[i % CHART_COLORS.length]}
                      fillOpacity={0.85}
                      name={pr}
                      barSize={revCollProvBarSeries.length > 6 ? 8 : 14}
                    />
                  ))}
                  {revCollProvLineSeries.map((s, i) => (
                    <Line
                      key={s}
                      yAxisId="right"
                      type="monotone"
                      dataKey={s}
                      stroke={providerColorMap[s.replace(' %', '')] || CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                      name={s}
                    />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', color: V.gray, fontFamily: FONT.body, fontSize: 13 }}>
                Select a Location Type, Practice, or Location filter to view provider data
              </div>
            )}
          </ChartCard>
        </div>

        {/* Service Mix Table */}
        <div style={{ marginBottom: 24 }}>
          <ChartCard title="Service Mix by Location" tooltip="Revenue breakdown by service category per location for the selected period">
            <ServiceMixTable data={serviceMixData} />
          </ChartCard>
        </div>

        </div>{/* end appendix collapsible */}

        {/* ── Footer ──────────────────────────────────────── */}
        <div style={{
          marginTop: 48, paddingTop: 24,
          borderTop: `1px solid ${V.taupe}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 11, color: V.gray }}>
            AMP Intelligence · Performance Tracker · {filterLabel}
          </div>
          <div style={{ fontSize: 11, color: V.gray }}>
            Data sourced from CorralData · {dateRangeLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
