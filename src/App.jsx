import { useState, useEffect } from 'react';
import { Ruler, FileText, CheckCircle, User, ArrowLeft, Send, Activity, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// API Configuration
const SERVER_DOMAIN = 'oso80gcwkkwgogocc8wsowco.109.205.176.58.sslip.io';
const PROTOCOL = window.location.protocol;
const API_URL = import.meta.env.VITE_API_URL || `${PROTOCOL}//${SERVER_DOMAIN}`;

export default function App() {
    const [view, setView] = useState('list'); // 'list', 'measure', 'success', 'history'
    const [requests, setRequests] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [selectedHistoryItem, setSelectedHistoryItem] = useState(null);
    const [signature, setSignature] = useState('');

    // Dynamic Measurements State
    // keys: paramId, values: { measured: string, status: 'OK'|'FAIL' }
    const [measurements, setMeasurements] = useState({});

    // Fetch orders
    useEffect(() => {
        const fetchOrders = async () => {
            try {
                const response = await fetch(`${API_URL}/api/orders`);
                if (response.ok) {
                    const data = await response.json();

                    const pending = [];
                    const done = [];

                    data.forEach(order => {
                        const xml = order.rawData || '';
                        if (xml.includes('<MeasurementReport')) {
                            done.push(order);
                        } else if (xml.includes('<MeasurementRequest') || xml.includes('<Order>')) {
                            pending.push(order);
                        }
                    });

                    // Sort: Newest first
                    pending.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
                    done.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));

                    setRequests(pending);
                    setHistory(done);
                }
            } catch (err) {
                console.error("Failed to fetch orders:", err);
            }
        };

        fetchOrders();
        // Poll every 5 seconds
        const interval = setInterval(fetchOrders, 3000); // Faster poll
        return () => clearInterval(interval);
    }, []);

    const handleSelect = (req) => {
        // Parse Definitions from XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(req.rawData, "text/xml");

        const params = Array.from(xmlDoc.querySelectorAll('Param')).map(p => ({
            id: p.getAttribute('ID'),
            nominal: parseFloat(p.getAttribute('Nominal')),
            tolUp: parseFloat(p.getAttribute('TolUp')),
            tolLo: parseFloat(p.getAttribute('TolLo')),
            gd: p.getAttribute('GD')
        }));

        // If no params found, create a default one (legacy support)
        const definitions = params.length > 0 ? params : [
            { id: 'M1', nominal: 0, tolUp: 0.1, tolLo: -0.1, gd: 'none' }
        ];

        const initialMeasurements = {};
        definitions.forEach(d => {
            initialMeasurements[d.id] = { measured: '', status: 'NEUTRAL', def: d };
        });

        setSelectedRequest({ ...req, definitions });
        setMeasurements(initialMeasurements);
        setView('measure');
        setSignature('');
    };

    const handleMeasurementUpdate = (id, value) => {
        const def = measurements[id].def;
        const numVal = parseFloat(value);
        let status = 'NEUTRAL';

        if (!isNaN(numVal)) {
            const diff = numVal - def.nominal;
            // Round to sensible precision for check
            // Check if within lower and upper
            if (diff <= def.tolUp && diff >= def.tolLo) {
                status = 'OK';
            } else {
                status = 'FAIL';
            }
        }

        setMeasurements(prev => ({
            ...prev,
            [id]: { ...prev[id], measured: value, status }
        }));
    };

    const handleSubmit = async () => {
        if (!selectedRequest) return;

        setLoading(true);
        try {
            // Construct MeasurementReport XML
            const timestamp = new Date().toISOString();

            // Map measurements to XML nodes
            const resultsXml = Object.entries(measurements).map(([id, data]) => `
    <Parameter id="${id}">
      <Nominal>${data.def.nominal}</Nominal>
      <Measured>${data.measured}</Measured>
      <Status>${data.status}</Status>
      <Tolerance upper="${data.def.tolUp}" lower="${data.def.tolLo}" />
    </Parameter>`).join('');

            const xmlReport = `
<MeasurementReport timestamp="${timestamp}">
  <RequestId>${selectedRequest.id}</RequestId>
  <ArticleNumber>${selectedRequest.article}</ArticleNumber>
  <DrawingNumber>${selectedRequest.drawing}</DrawingNumber>
  <Controller>${signature}</Controller>
  <Results>${resultsXml}
  </Results>
</MeasurementReport>`;

            // Send to Server
            await fetch(`${API_URL}/api/parse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/xml' },
                body: xmlReport
            });

            setView('success');
            setTimeout(() => {
                setView('list');
                setSelectedRequest(null);
                setSignature('');
            }, 2000);
        } catch (err) {
            console.error(err);
            alert("Kunde inte skicka: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-slate-950 min-h-[100dvh] text-slate-100 flex flex-col font-sans">
            {/* Header */}
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center gap-3 sticky top-0 z-10 shadow-lg">
                {view !== 'list' && (
                    <button onClick={() => setView('list')} className="p-2 -ml-2 text-slate-400">
                        <ArrowLeft />
                    </button>
                )}
                <div>
                    <h1 className="font-bold text-lg tracking-tight">Mätstation</h1>
                    <div className="text-xs text-slate-500 font-mono">SIM ÅKERS MOBILE</div>
                </div>
                <div className="ml-auto flex bg-slate-800 rounded-lg p-1">
                    <button
                        onClick={() => setView('list')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all ${view === 'list' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`}
                    >
                        Mät
                    </button>
                    <button
                        onClick={() => setView('history')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all ${view === 'history' || view === 'history-detail' ? 'bg-slate-700 text-white shadow' : 'text-slate-400'}`}
                    >
                        Arkiv
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
                <AnimatePresence mode="wait">
                    {/* Lista över ordrar */}
                    {view === 'list' && (
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="space-y-3"
                        >
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Väntande Mätningar</h2>
                            {requests.length === 0 && (
                                <div className="text-slate-500 text-center py-10 italic flex flex-col items-center gap-4">
                                    <p>Inga väntande ordrar...</p>
                                    <button
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (!confirm("Skapa en testorder?")) return;
                                            // Test Order with Definitions
                                            const xml = `
<MeasurementRequest id="TEST-${Math.floor(Math.random() * 1000)}">
  <ArticleNumber>Test-Axel</ArticleNumber>
  <DrawingNumber>D-999</DrawingNumber>
  <Status>REQUESTED</Status>
  <Definitions>
    <Param ID="M1" Nominal="50.0" TolUp="0.1" TolLo="-0.1" GD="dia" />
    <Param ID="M2" Nominal="120.0" TolUp="0.5" TolLo="-0.5" GD="lin" />
  </Definitions>
</MeasurementRequest>`;
                                            await fetch(`${API_URL}/api/parse`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/xml' },
                                                body: xml
                                            });
                                            // Trigger update
                                            const res = await fetch(`${API_URL}/api/orders`);
                                            if (res.ok) setRequests(await res.json());
                                        }}
                                        className="text-xs bg-slate-800 hover:bg-slate-700 text-blue-400 px-3 py-2 rounded-lg border border-slate-700 transition-colors"
                                    >
                                        + Skapa Testorder (med Parametrar)
                                    </button>
                                </div>
                            )}
                            {requests.map(req => (
                                <div
                                    key={req.id}
                                    onClick={() => handleSelect(req)}
                                    className="bg-slate-900 p-5 rounded-2xl border border-slate-800 active:bg-slate-800 active:scale-[0.98] transition-all shadow-sm"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="bg-blue-500/10 text-blue-400 text-xs font-bold px-2 py-1 rounded">
                                            {req.article}
                                        </span>
                                        <span className="text-slate-500 text-xs text-right">#{req.id?.substr(0, 8)}...</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-300">
                                        <FileText size={16} />
                                        <span className="font-mono text-sm">{req.drawing}</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500 mt-2 font-mono">
                                        {new Date(req.receivedAt).toLocaleTimeString()}
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}

                    {/* Historik Lista */}
                    {view === 'history' && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-3"
                        >
                            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Mätkortshistorik</h2>
                            {history.length === 0 && (
                                <div className="text-slate-500 text-center py-10 italic">Inget arkiverat än...</div>
                            )}
                            {history.map(req => {
                                // Extract basic info from rawData XML since it's a Report now
                                const parser = new DOMParser();
                                const doc = parser.parseFromString(req.rawData, "text/xml");
                                const status = doc.querySelector('Status')?.textContent || 'OK'; // Overall status? Needs logic.
                                const date = doc.documentElement.getAttribute('timestamp') || req.receivedAt;
                                const controller = doc.querySelector('Controller')?.textContent || 'Okänd';

                                return (
                                    <div
                                        key={req.id}
                                        onClick={() => {
                                            // Parse details for View
                                            const results = Array.from(doc.querySelectorAll('Parameter')).map(p => ({
                                                id: p.getAttribute('id'),
                                                nominal: p.querySelector('Nominal')?.textContent,
                                                measured: p.querySelector('Measured')?.textContent,
                                                status: p.querySelector('Status')?.textContent,
                                                tolUp: p.querySelector('Tolerance')?.getAttribute('upper'),
                                                tolLo: p.querySelector('Tolerance')?.getAttribute('lower'),
                                            }));

                                            setSelectedHistoryItem({
                                                ...req,
                                                controller,
                                                timestamp: date,
                                                results
                                            });
                                            setView('history-detail');
                                        }}
                                        className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 active:bg-slate-800 transition-all shadow-sm"
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-mono text-emerald-400 text-xs font-bold">{req.article}</span>
                                            <span className="text-[10px] text-slate-500">{new Date(date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="text-xs text-slate-400 flex justify-between">
                                            <span>{req.drawing}</span>
                                            <span className="text-slate-500">{controller}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </motion.div>
                    )}

                    {/* Historik Detalj (Control Card) */}
                    {view === 'history-detail' && selectedHistoryItem && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="space-y-4"
                        >
                            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 shadow-xl">
                                <div className="flex justify-between items-start border-b border-slate-700 pb-4 mb-4">
                                    <div>
                                        <h3 className="text-white font-bold text-lg flex items-center gap-2">
                                            <FileText className="text-emerald-500" size={20} /> Kontrollkort
                                        </h3>
                                        <div className="text-xs text-slate-400 mt-1">
                                            ID: <span className="font-mono text-emerald-300">{selectedHistoryItem.id}</span>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="px-2 py-1 bg-emerald-900/30 text-emerald-400 rounded text-xs font-bold border border-emerald-500/30">
                                            GODKÄND
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-xs text-slate-400 mb-6 font-mono">
                                    <div>
                                        <span className="block text-slate-500 mb-1">Artikel</span>
                                        <span className="text-slate-200 text-sm">{selectedHistoryItem.article}</span>
                                    </div>
                                    <div>
                                        <span className="block text-slate-500 mb-1">Ritning</span>
                                        <span className="text-slate-200 text-sm">{selectedHistoryItem.drawing}</span>
                                    </div>
                                    <div>
                                        <span className="block text-slate-500 mb-1">Kontrollant</span>
                                        <span className="text-slate-200">{selectedHistoryItem.controller}</span>
                                    </div>
                                    <div>
                                        <span className="block text-slate-500 mb-1">Datum</span>
                                        <span className="text-slate-200">{new Date(selectedHistoryItem.timestamp).toLocaleString()}</span>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    {selectedHistoryItem.results.map(r => (
                                        <div key={r.id} className="bg-slate-900/50 p-3 rounded border border-slate-700/50 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-2 h-2 rounded-full ${r.status === 'OK' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                                <span className="font-mono text-slate-400 text-xs">{r.id}</span>
                                            </div>

                                            <div className="text-right">
                                                <div className={`font-mono font-bold ${r.status === 'OK' ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {r.measured}
                                                </div>
                                                <div className="text-[10px] text-slate-600">
                                                    Nom: {r.nominal} ({r.tolLo}/{String(r.tolUp).startsWith('+') ? '' : '+'}{r.tolUp})
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-6 pt-4 border-t border-slate-700">
                                    <button onClick={() => setView('history')} className="w-full py-3 bg-slate-700 rounded-lg text-slate-200 text-sm font-medium">Stäng</button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {view === 'measure' && selectedRequest && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-6"
                        >
                            <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                                <div className="text-xs text-slate-500 uppercase">Artikel</div>
                                <div className="text-2xl font-bold">{selectedRequest.article}</div>
                                <div className="text-sm text-slate-400 font-mono mt-1">{selectedRequest.drawing}</div>
                            </div>

                            <div className="space-y-6">
                                {Object.entries(measurements).map(([id, data]) => (
                                    <div key={id} className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                                        <div className="flex justify-between items-end mb-2">
                                            <label className="text-sm font-medium text-slate-400 flex items-center gap-2">
                                                <Ruler size={14} /> {id}
                                                <span className="text-xs bg-slate-800 px-1 rounded text-slate-500">
                                                    Nom: {data.def.nominal}
                                                </span>
                                            </label>
                                            <div className="text-[10px] text-slate-500 font-mono">
                                                {data.def.tolLo} / +{data.def.tolUp}
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={data.measured}
                                                onChange={(e) => handleMeasurementUpdate(id, e.target.value)}
                                                className={`w-full border rounded-xl p-4 text-xl font-mono outline-none transition-colors
                                                ${data.status === 'OK' ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-400' : ''}
                                                ${data.status === 'FAIL' ? 'bg-red-900/20 border-red-500/50 text-red-400' : ''}
                                                ${data.status === 'NEUTRAL' ? 'bg-slate-950 border-slate-700' : ''}
                                                `}
                                                placeholder="0.00"
                                            />
                                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                {data.status === 'OK' && <CheckCircle className="text-emerald-500" />}
                                                {data.status === 'FAIL' && <AlertCircle className="text-red-500" />}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-4">
                                <label className="block text-sm font-medium text-slate-400 mb-2">Signatur</label>
                                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                    {['Niklas Jalvemyr', 'Olle Ljungberg'].map(sig => (
                                        <button
                                            key={sig}
                                            onClick={() => setSignature(sig)}
                                            className={`px-4 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all border ${signature === sig
                                                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30'
                                                : 'bg-slate-800 border-slate-700 text-slate-400'
                                                }`}
                                        >
                                            {sig.split(' ')[0]} {/* Show First Name */}
                                        </button>
                                    ))}
                                </div>
                                {signature && <div className="text-xs text-center text-blue-400 mt-1">Vald: {signature}</div>}
                            </div>
                        </motion.div>
                    )}

                    {/* Success View */}
                    {view === 'success' && (
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="flex flex-col items-center justify-center h-[60vh] text-center"
                        >
                            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6 text-emerald-500">
                                <CheckCircle size={40} />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-2">Klart!</h2>
                            <p className="text-slate-400">Rapport skickad till Arkivet.</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Action Bar */}
            {view === 'measure' && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur border-t border-slate-800 pb-8">
                    <button
                        onClick={handleSubmit}
                        disabled={!signature || Object.values(measurements).some(m => !m.measured)}
                        className="w-full bg-blue-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        {loading ? <Activity className="animate-spin" /> : <Send size={20} />}
                        Skicka Rapport
                    </button>
                </div>
            )}
        </div>
    );
}
