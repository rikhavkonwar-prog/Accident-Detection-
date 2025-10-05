
import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';

// Leaflet marker icon fix for many bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// === CONFIG - Update these ===
const WS_URL = null; // e.g. 'wss://your-server.example.com/accidents'
const HISTORY_API_URL = null; // e.g. 'https://your-server.example.com/api/accidents/history'
// ==============================
const MOCK_ACCIDENTS = [
  { id: 'm1', lat: 12.9716, lng: 77.5946, timestamp: new Date().toISOString(), severity: 'High', description: 'Collision detected near ring road' },
  { id: 'm2', lat: 12.9750, lng: 77.5900, timestamp: new Date(Date.now()-1000*60*30).toISOString(), severity: 'Medium', description: 'Skid and fall' },
];

function Recenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) map.setView([lat, lng], 15, { animate: true });
  }, [lat, lng, map]);
  return null;
}

export default function App() {
  const [accidents, setAccidents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const wsRef = useRef(null);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState(null);

  // Load history from REST or fallback to mock
  useEffect(() => {
    let mounted = true;
    async function loadHistory() {
      if (!HISTORY_API_URL) {
        setAccidents(MOCK_ACCIDENTS);
        setLoadingHistory(false);
        return;
      }
      try {
        const res = await fetch(HISTORY_API_URL);
        if (!res.ok) throw new Error('History fetch failed');
        const data = await res.json();
        if (mounted) setAccidents(data.reverse()); // newest first
      } catch (e) {
        console.error(e);
        setError('Failed to load history, using mock data');
        setAccidents(MOCK_ACCIDENTS);
      } finally {
        setLoadingHistory(false);
      }
    }
    loadHistory();
    return () => { mounted = false; };
  }, []);

  // WebSocket for live updates
  useEffect(() => {
    if (!WS_URL) return; // skip if not provided
    let ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => console.log('WS connected');
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        const items = Array.isArray(msg) ? msg : [msg];
        setAccidents(prev => [...items.reverse(), ...prev]);
      } catch (e) { console.error('WS parse', e); }
    };
    ws.onerror = (e) => console.error('WS error', e);
    ws.onclose = () => console.log('WS closed');
    return () => ws.close();
  }, []);

  const latest = accidents[0] || null;
  const mapCenter = latest ? [latest.lat, latest.lng] : [12.9716, 77.5946];

  const filtered = accidents.filter(a => filter === 'all' ? true : (a.severity || '').toLowerCase() === filter);

  function handleSimulate() {
    const now = new Date().toISOString();
    const newAcc = { id: 's' + Date.now(), lat: mapCenter[0] + (Math.random()-0.5)/100, lng: mapCenter[1] + (Math.random()-0.5)/100, timestamp: now, severity: Math.random()>0.6 ? 'High' : 'Medium', description: 'Simulated event' };
    setAccidents(prev => [newAcc, ...prev]);
  }

  return (
    <div className="min-h-screen" style={{padding:'1rem', background:'#f3f4f6'}}>
      <div className="max-w-6xl" style={{margin:'0 auto', display:'grid', gridTemplateColumns:'1fr', gap:'1rem'}}>
        <div style={{background:'#fff', borderRadius:'1rem', boxShadow:'0 4px 12px rgba(0,0,0,0.08)', padding:'1rem'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem'}}>
            <h2 style={{fontSize:'1.125rem', fontWeight:600}}>Live Map</h2>
            <div style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
              <button onClick={handleSimulate} style={{padding:'0.375rem 0.75rem', borderRadius:8, border:'1px solid #e5e7eb'}}>Simulate</button>
              <select value={filter} onChange={e=>setFilter(e.target.value)} style={{padding:'0.375rem', borderRadius:8, border:'1px solid #e5e7eb'}}>
                <option value="all">All</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>

          <div className="h-60vh" style={{height:'60vh', borderRadius:12, overflow:'hidden'}}>
            <MapContainer center={mapCenter} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {latest && <Recenter lat={latest.lat} lng={latest.lng} />}
              {filtered.map(acc => (
                <Marker key={acc.id} position={[acc.lat, acc.lng]}>
                  <Popup>
                    <div style={{minWidth:220}}>
                      <div style={{fontWeight:600}}>{acc.description || 'Accident'}</div>
                      <div style={{fontSize:12, color:'#6b7280'}}>Severity: {acc.severity}</div>
                      <div style={{fontSize:11, color:'#9ca3af'}}>{new Date(acc.timestamp).toLocaleString()}</div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>

        <div style={{background:'#fff', borderRadius:'1rem', boxShadow:'0 4px 12px rgba(0,0,0,0.08)', padding:'1rem'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem'}}>
            <h3 style={{fontWeight:600}}>Accident History</h3>
            <div style={{fontSize:12, color:'#6b7280'}}>{loadingHistory ? 'Loading...' : `${accidents.length} records`}</div>
          </div>

          {error && <div style={{color:'#b91c1c', marginBottom:8}}>{error}</div>}

          <div style={{maxHeight: '45vh', overflow:'auto'}}>
            <ul style={{listStyle:'none', padding:0, margin:0, borderTop:'1px solid #f3f4f6'}}>
              {filtered.length === 0 && <li style={{padding:'0.75rem', fontSize:13, color:'#6b7280'}}>No records</li>}
              {filtered.map(acc => (
                <li key={acc.id} style={{padding:'0.75rem', borderBottom:'1px solid #f3f4f6', cursor:'pointer'}} onClick={() => setSelected(acc)}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                    <div>
                      <div style={{fontWeight:500}}>{acc.description || 'Accident'}</div>
                      <div style={{fontSize:12, color:'#6b7280'}}>{formatDistanceToNowStrict(parseISO(acc.timestamp || acc.timestamp), { addSuffix: true })}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{color:'#dc2626', fontWeight:600}}>{acc.severity}</div>
                      <div style={{fontSize:11, color:'#9ca3af'}}>ID: {acc.id}</div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div style={{marginTop:12}}>
            <div style={{fontSize:13, color:'#6b7280'}}>Selected:</div>
            {selected ? (
              <div style={{marginTop:8, fontSize:13}}>
                <div style={{fontWeight:600}}>{selected.description}</div>
                <div style={{fontSize:12, color:'#6b7280'}}>{new Date(selected.timestamp).toLocaleString()}</div>
                <div style={{fontSize:12}}>Coordinates: {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}</div>
              </div>
            ) : (
              <div style={{marginTop:8, fontSize:13, color:'#6b7280'}}>Click an entry to show details.</div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
