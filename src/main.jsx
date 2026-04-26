import React, { useState, useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useParams, useNavigate } from 'react-router-dom'
import PerformanceTracker from './components/PerformanceTracker'
import PMReport from './components/PMReport'

// ── Design tokens ──
const V = { navy: '#041E42', gold: '#B9975B', cream: '#FAF8F7', taupe: '#E4D5D3', gray: '#948794', white: '#FFFFFF', dark: '#2a1f28' };
const FONT = { heading: "'GFS Didot', Didot, Georgia, serif", body: "'Nunito Sans', 'Avenir Next', Avenir, sans-serif" };

// ── Shared Nav Bar ──
function NavBar({ subtitle }) {
  return (
    <div style={{ background: V.navy, padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: FONT.heading, fontSize: 16, color: V.gold, letterSpacing: 6 }}>A M P</span>
        </a>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 20 }}>|</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: V.white, letterSpacing: 2, textTransform: 'uppercase', fontFamily: FONT.body }}>ADVANCED MEDAESTHETIC PARTNERS</span>
      </div>
      <span style={{ fontSize: 9, fontWeight: 600, color: '#CDB5A7', letterSpacing: 2, textTransform: 'uppercase', fontFamily: FONT.body }}>{subtitle || 'PERFORMANCE TRACKER'}</span>
    </div>
  );
}

// ── Shared Page Wrapper ──
function PageWrapper({ label, title, description, children, backLink, backText }) {
  return (
    <div style={{ minHeight: '100vh', background: V.cream, fontFamily: FONT.body }}>
      <NavBar />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '48px 40px' }}>
        {label && <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: V.gold, marginBottom: 8, fontFamily: FONT.body }}>{label}</div>}
        <h1 style={{ fontFamily: FONT.heading, fontSize: 36, fontWeight: 400, color: V.navy, margin: '0 0 8px' }}>{title}</h1>
        {description && <p style={{ fontSize: 14, color: V.gray, margin: '0 0 6px' }}>{description}</p>}
        <div style={{ width: 40, height: 3, background: V.gold, borderRadius: 2, marginBottom: 40 }} />
        {children}
        <div style={{ marginTop: 32, padding: '16px 20px', background: V.white, borderRadius: 12, border: `1px solid ${V.taupe}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: V.gray }}>← <a href={backLink || '/'} style={{ color: V.navy, textDecoration: 'none', fontWeight: 600 }}>{backText || 'Back to Performance Tracker Hub'}</a></span>
          <span style={{ fontSize: 11, color: V.gray }}>Data sourced from CorralData</span>
        </div>
      </div>
    </div>
  );
}

// ── Card Component ──
function Card({ href, icon, title, description, count }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a href={href} style={{
      background: hovered ? V.navy : V.white, borderRadius: 14, border: `1px solid ${hovered ? V.gold : V.taupe}`,
      padding: '24px 20px', textDecoration: 'none', color: 'inherit', transition: 'all 0.2s',
      boxShadow: hovered ? '0 6px 20px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
      display: 'flex', flexDirection: 'column', cursor: 'pointer',
      transform: hovered ? 'translateY(-2px)' : 'none',
    }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {icon && <div style={{ width: 40, height: 40, borderRadius: 10, background: hovered ? 'rgba(185,151,91,0.2)' : 'rgba(185,151,91,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 14, transition: 'all 0.2s' }}>{icon}</div>}
      <div style={{ fontFamily: FONT.heading, fontSize: 17, fontWeight: 400, color: hovered ? V.white : V.navy, marginBottom: 6, transition: 'color 0.2s' }}>{title}</div>
      {description && <div style={{ fontSize: 12, color: hovered ? '#CDB5A7' : V.gray, lineHeight: 1.6, flex: 1, transition: 'color 0.2s' }}>{description}</div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: V.gold, transition: 'color 0.2s' }}>Open →</span>
        {count != null && <span style={{ fontSize: 10, fontWeight: 700, color: hovered ? V.gold : V.gray, background: hovered ? 'rgba(185,151,91,0.15)' : V.cream, padding: '2px 8px', borderRadius: 4, transition: 'all 0.2s' }}>{count} locations</span>}
      </div>
    </a>
  );
}

// ══════════════════════════════════════════════════════════
//  PAGE: Main Hub
// ══════════════════════════════════════════════════════════
function Hub() {
  return (
    <PageWrapper label="Analytics & Reporting" title="Performance Tracker" description="Detailed weekly and monthly performance metrics across all AMP locations." backLink="https://ampintelligence.ai" backText="Back to AMP Intelligence Hub">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        <Card href="/org" icon="📊" title="Org Performance Tracker" description="All locations with full interactive filters — revenue, collections, provider productivity, service mix, and ops KPIs." count={66} />
        <Card href="/by-type" icon="🏷️" title="By Location Type" description="Performance tracker pre-filtered by location type — includes Pod Leaders, Sparrow, Avelure, and more." count={18} />
        <Card href="/by-practice" icon="🏢" title="By Practice" description="Performance tracker pre-filtered by practice (Avelure, Ever/Body, Destination Aesthetics, etc.)" count={19} />
        <Card href="/by-location" icon="📍" title="By Location" description="Performance tracker pre-filtered to a single location for detailed analysis and provider reports." count={66} />
      </div>
    </PageWrapper>
  );
}

// ══════════════════════════════════════════════════════════
//  PAGE: By Location Type (listing)
// ══════════════════════════════════════════════════════════
function ByTypeListing() {
  const [types, setTypes] = useState([]);
  const [locCounts, setLocCounts] = useState({});

  useEffect(() => {
    fetch('/data/performance/locations.json').then(r => r.json()).then(locs => {
      const typeSet = {};
      locs.forEach(l => (l.types || []).forEach(t => {
        if (!typeSet[t]) typeSet[t] = 0;
        typeSet[t]++;
      }));
      setTypes(Object.keys(typeSet).sort());
      setLocCounts(typeSet);
    });
  }, []);

  return (
    <PageWrapper label="By Location Type" title="Select a Location Type" description="Choose a location type to view its pre-filtered performance tracker.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
        {types.map(t => (
          <Card key={t} href={`/by-type/${encodeURIComponent(t)}`} title={t} count={locCounts[t]} />
        ))}
      </div>
    </PageWrapper>
  );
}

// ══════════════════════════════════════════════════════════
//  PAGE: By Practice (listing)
// ══════════════════════════════════════════════════════════
function ByPracticeListing() {
  const [practices, setPractices] = useState([]);
  const [locCounts, setLocCounts] = useState({});

  useEffect(() => {
    fetch('/data/performance/locations.json').then(r => r.json()).then(locs => {
      const practiceSet = {};
      locs.forEach(l => {
        const p = l.practice || 'Unknown';
        practiceSet[p] = (practiceSet[p] || 0) + 1;
      });
      setPractices(Object.keys(practiceSet).sort());
      setLocCounts(practiceSet);
    });
  }, []);

  return (
    <PageWrapper label="By Practice" title="Select a Practice" description="Choose a practice to view its pre-filtered performance tracker.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
        {practices.map(p => (
          <Card key={p} href={`/by-practice/${encodeURIComponent(p)}`} title={p} count={locCounts[p]} />
        ))}
      </div>
    </PageWrapper>
  );
}

// ══════════════════════════════════════════════════════════
//  PAGE: By Location (listing)
// ══════════════════════════════════════════════════════════
function ByLocationListing() {
  const [locs, setLocs] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/data/performance/locations.json').then(r => r.json()).then(setLocs);
  }, []);

  const filtered = search
    ? locs.filter(l => l.name.toLowerCase().includes(search.toLowerCase()) || (l.practice || '').toLowerCase().includes(search.toLowerCase()))
    : locs;

  // Group by practice
  const grouped = {};
  filtered.forEach(l => {
    const p = l.practice || 'Other';
    if (!grouped[p]) grouped[p] = [];
    grouped[p].push(l);
  });

  return (
    <PageWrapper label="By Location" title="Select a Location" description="Choose a specific location for detailed performance analysis and provider reports.">
      <div style={{ marginBottom: 24 }}>
        <input type="text" placeholder="Search locations or practices..." value={search} onChange={e => setSearch(e.target.value)} style={{
          width: '100%', maxWidth: 400, padding: '10px 16px', border: `1.5px solid ${V.taupe}`, borderRadius: 8,
          fontSize: 13, fontFamily: FONT.body, color: V.navy, background: V.white, outline: 'none',
        }} />
      </div>
      {Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).map(([practice, locations]) => (
        <div key={practice} style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: V.navy, background: 'rgba(185,151,91,0.1)', border: '1px solid rgba(185,151,91,0.25)', borderRadius: 4, padding: '3px 10px', fontFamily: FONT.body }}>{practice}</div>
            <div style={{ fontSize: 12, color: V.gray }}>{locations.length} {locations.length === 1 ? 'location' : 'locations'}</div>
            <div style={{ flex: 1, height: 1, background: V.taupe }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {locations.sort((a, b) => a.name.localeCompare(b.name)).map(l => (
              <Card key={l.name} href={`/by-location/${encodeURIComponent(l.name)}`} title={l.name} />
            ))}
          </div>
        </div>
      ))}
      {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: V.gray }}>No locations match "{search}"</div>}
    </PageWrapper>
  );
}

// ══════════════════════════════════════════════════════════
//  WRAPPER PAGES (pass initial filter to PerformanceTracker)
// ══════════════════════════════════════════════════════════
function TrackerByType() {
  const { type } = useParams();
  return <PerformanceTracker key={type} initialLocTypes={[decodeURIComponent(type)]} />;
}

function TrackerByPractice() {
  const { practice } = useParams();
  return <PerformanceTracker key={practice} initialPractices={[decodeURIComponent(practice)]} />;
}

function TrackerByLocation() {
  const { location } = useParams();
  return <PerformanceTracker key={location} initialLocations={[decodeURIComponent(location)]} />;
}

// ══════════════════════════════════════════════════════════
//  ROUTER
// ══════════════════════════════════════════════════════════
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('React Error:', error, info); }
  render() {
    if (this.state.error) {
      return React.createElement('div', { style: { padding: 40, fontFamily: 'monospace', color: 'red' } },
        React.createElement('h1', null, 'App Crashed'),
        React.createElement('pre', null, this.state.error.message),
        React.createElement('pre', { style: { fontSize: 10, color: '#666' } }, this.state.error.stack)
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        {/* Hub */}
        <Route path="/" element={<Hub />} />

        {/* Full Org Tracker */}
        <Route path="/org" element={<PerformanceTracker />} />

        {/* By Location Type */}
        <Route path="/by-type" element={<ByTypeListing />} />
        <Route path="/by-type/:type" element={<TrackerByType />} />

        {/* By Practice */}
        <Route path="/by-practice" element={<ByPracticeListing />} />
        <Route path="/by-practice/:practice" element={<TrackerByPractice />} />

        {/* By Location */}
        <Route path="/by-location" element={<ByLocationListing />} />
        <Route path="/by-location/:location" element={<TrackerByLocation />} />

        {/* PM Hours-Reduction Report (DRAFT) */}
        <Route path="/pm-report/:location" element={<PMReport />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
