import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import PerformanceTracker from './components/PerformanceTracker'

// Performance Tracker Hub (landing page)
function PerformanceTrackerHub() {
  return (
    <div style={{ minHeight: '100vh', background: '#FAF8F7', fontFamily: "'Nunito Sans', 'Avenir Next', Avenir, sans-serif" }}>
      <div style={{ background: '#041E42', padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: "'GFS Didot', Didot, Georgia, serif", fontSize: 16, color: '#B9975B', letterSpacing: 6 }}>A M P</span>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 20 }}>|</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: 2, textTransform: 'uppercase' }}>ADVANCED MEDAESTHETIC PARTNERS</span>
        </div>
        <span style={{ fontSize: 9, fontWeight: 600, color: '#CDB5A7', letterSpacing: 2, textTransform: 'uppercase' }}>PERFORMANCE TRACKER</span>
      </div>
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 40px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#B9975B', marginBottom: 8 }}>Analytics & Reporting</div>
        <h1 style={{ fontFamily: "'GFS Didot', Didot, Georgia, serif", fontSize: 36, fontWeight: 400, color: '#041E42', margin: '0 0 8px' }}>Performance Tracker</h1>
        <p style={{ fontSize: 14, color: '#948794', margin: '0 0 6px' }}>Detailed weekly and monthly performance metrics across all AMP locations.</p>
        <div style={{ width: 40, height: 3, background: '#B9975B', borderRadius: 2, marginBottom: 40 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          <a href="/org" style={{
            background: '#fff', borderRadius: 14, border: '1px solid #E4D5D3', padding: '28px 24px',
            textDecoration: 'none', color: 'inherit', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            display: 'flex', flexDirection: 'column', cursor: 'pointer',
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(185,151,91,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>📊</div>
            <div style={{ fontFamily: "'GFS Didot', Didot, Georgia, serif", fontSize: 18, fontWeight: 400, color: '#041E42', marginBottom: 8 }}>Org Performance Tracker</div>
            <div style={{ fontSize: 13, color: '#948794', lineHeight: 1.6, flex: 1 }}>Revenue, collections, provider productivity, service mix, and operational KPIs across all 66 locations with interactive filters.</div>
            <div style={{ marginTop: 14, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: '#B9975B' }}>Open Dashboard →</div>
          </a>
        </div>
        <div style={{ marginTop: 32, padding: '16px 20px', background: '#fff', borderRadius: 12, border: '1px solid #E4D5D3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#948794' }}>← <a href="https://ampintelligence.ai" style={{ color: '#041E42', textDecoration: 'none', fontWeight: 600 }}>Back to AMP Intelligence Hub</a></span>
          <span style={{ fontSize: 11, color: '#948794' }}>Data sourced from CorralData · Updated daily</span>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PerformanceTrackerHub />} />
        <Route path="/org" element={<PerformanceTracker />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
