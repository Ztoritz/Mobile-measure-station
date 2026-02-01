import { useState, useEffect } from 'react';
import { Ruler, FileText, FileImage, User, CheckCircle, AlertCircle, Search, ChevronRight, X, Activity, Send, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import io from 'socket.io-client';

// API Configuration
const SERVER_DOMAIN = 'oso80gcwkkwgogocc8wsowco.109.205.176.58.sslip.io';
const PROTOCOL = window.location.protocol;
const API_URL = import.meta.env.VITE_API_URL || `${PROTOCOL}//${SERVER_DOMAIN}`;

export default function App() {
    const [currentTab, setCurrentTab] = useState('measure'); // 'measure', 'history', 'drawings'
    const [view, setView] = useState('list'); // 'list', 'detail' (within tab)

    // Data State
    const [requests, setRequests] = useState([]);
    const [history, setHistory] = useState([]);
    const [drawings, setDrawings] = useState([]); // Derived from history/requests

    const [loading, setLoading] = useState(false);

    // Selection State
    const [selectedItem, setSelectedItem] = useState(null);
    const [signature, setSignature] = useState('');

    // Socket State
    const [socket, setSocket] = useState(null);

    // Dynamic Measurements State
    const [measurements, setMeasurements] = useState({});

    // Fetch orders via Socket.io
    useEffect(() => {
        const newSocket = io(API_URL);

        newSocket.on('connect', () => {
            console.log("Connected to Server");
        });

        // Initial State Sync
        newSocket.on('init_state', (data) => {
            setRequests(data.activeOrders);
            setHistory(data.archivedOrders);
            updateDrawingsList([...data.activeOrders, ...data.archivedOrders]);
        });

        // Real-time Updates
        newSocket.on('order_created', (newOrder) => {
            setRequests(prev => {
                const updated = [newOrder, ...prev];
                updateDrawingsList([...updated, ...history]);
                return updated;
            });
        });

        newSocket.on('order_completed', (completedOrder) => {
            setRequests(prev => prev.filter(r => r.id !== completedOrder.id));
            setHistory(prev => {
                const updated = [completedOrder, ...prev];
                updateDrawingsList([...requests, ...updated]);
                return updated;
            });
        });

        newSocket.on('active_orders_update', (orders) => {
            setRequests(orders);
            updateDrawingsList([...orders, ...history]);
        });

        setSocket(newSocket);

        return () => newSocket.close();
    }, []);

    // Helper to extract unique drawings for the "Ritningar" tab
    const updateDrawingsList = (allItems) => {
        const unique = new Map();
        allItems.forEach(item => {
            if (item.drawingNumber && item.drawingNumber !== '?.??' && !unique.has(item.drawingNumber)) {
                unique.set(item.drawingNumber, {
                    id: item.drawingNumber,
                    number: item.drawingNumber,
                    article: item.articleNumber,
                    pdfUrl: item.pdfUrl || '' // If we had it
                });
            }
        });
        setDrawings(Array.from(unique.values()));
    };

    const handleSelectRequest = (req) => {
        const definitions = req.definitions || [];
        const initialMeasurements = {};
        definitions.forEach(d => {
            initialMeasurements[d.id] = { measured: '', status: 'NEUTRAL', def: d };
        });

        setSelectedItem(req);
        setMeasurements(initialMeasurements);
        setView('detail');
        setSignature('');
    };

    const handleMeasurementUpdate = (id, value) => {
        const def = measurements[id].def;
        // Sanitize all inputs
        const sanitize = (val) => String(val).replace(',', '.');
        const numVal = parseFloat(sanitize(value));

        let status = 'NEUTRAL';

        if (!isNaN(numVal)) {
            const diff = numVal - parseFloat(sanitize(def.nominal));
            // Robust tolerance check: Upper +Abs, Lower -Abs
            const upperLimit = Math.abs(parseFloat(sanitize(def.upperTol)));
            const lowerLimit = -Math.abs(parseFloat(sanitize(def.lowerTol)));

            if (diff <= upperLimit && diff >= lowerLimit) {
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
        if (!selectedItem || !socket) return;

        setLoading(true);

        const results = Object.entries(measurements).map(([id, data]) => ({
            id: id,
            measured: data.measured,
            status: data.status,
            def: data.def
        }));

        const payload = {
            id: selectedItem.id,
            controller: signature,
            results: results
        };

        socket.emit('submit_measurement', payload);

        // UI Reset
        setView('list'); // Back to list within 'measure' tab
        setSelectedItem(null);
        setSignature('');
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 flex flex-col bg-slate-950 text-slate-200 font-sans">
            {/* Header - Static Top */}
            <div className="shrink-0 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 p-4 z-50 flex justify-between items-center shadow-lg">
                <div>
                    <h1 className="font-bold text-lg tracking-tight text-white">Mätstation</h1>
                    <div className="text-[10px] text-emerald-500 font-mono tracking-wider">SIM ÅKERS MOBILE</div>
                </div>
                <div className="bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                    <div className={`w-2 h-2 rounded-full ${socket ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                </div>
            </div>

            {/* Main Content Area - Scrollable */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 scroll-smooth pb-32">
                <AnimatePresence mode="wait">

                    {/* TAB: MÄTNING (INBOX) */}
                    {currentTab === 'measure' && view === 'list' && (
                        <motion.div
                            key="inbox"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="space-y-3"
                        >
                            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <Activity size={14} /> Väntande Mätningar
                            </h2>
                            {requests.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-600 opacity-50">
                                    <Ruler size={48} className="mb-4 text-slate-700" />
                                    <p>Inga aktiva ordrar</p>
                                </div>
                            )}
                            {requests.map(req => (
                                <div
                                    key={req.id}
                                    onClick={() => handleSelectRequest(req)}
                                    className="bg-slate-900 border border-slate-800 p-4 rounded-xl active:scale-[0.98] transition-all relative overflow-hidden group shadow-md"
                                >
                                    <div className="absolute top-0 right-0 p-2 opacity-50">
                                        <ChevronRight size={20} className="text-slate-600" />
                                    </div>
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 font-bold border border-emerald-500/20">
                                            {req.definitions?.length || '?'}
                                        </div>
                                        <div>
                                            <div className="text-white font-bold text-lg leading-none">{req.articleNumber}</div>
                                            <div className="text-slate-400 text-xs font-mono mt-1">{req.drawingNumber}</div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-end mt-2">
                                        <div className="px-2 py-0.5 bg-slate-800 rounded text-[10px] text-slate-500 font-mono">
                                            {req.id.substring(0, 8)}...
                                        </div>
                                        <div className="text-[10px] text-slate-500">
                                            {new Date(req.receivedAt).toLocaleTimeString().substring(0, 5)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}

                    {/* VIEW: MEASURE DETAIL */}
                    {currentTab === 'measure' && view === 'detail' && selectedItem && (
                        <motion.div
                            key="measure-detail"
                            initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 50, opacity: 0 }}
                            className="pb-64"
                        >
                            <button onClick={() => setView('list')} className="mb-4 flex items-center gap-2 text-slate-400 text-sm active:text-white">
                                <ArrowLeft size={16} /> Tillbaka
                            </button>

                            <div className="bg-slate-900 rounded-xl p-5 border border-slate-800 shadow-xl mb-6 relative overflow-hidden">
                                <div className="relative z-10">
                                    <h2 className="text-2xl font-bold text-white mb-1">{selectedItem.articleNumber}</h2>
                                    <div className="text-emerald-500 font-mono text-sm mb-4">{selectedItem.drawingNumber}</div>
                                    <div className="grid grid-cols-2 gap-4 text-xs text-slate-500">
                                        <div className="bg-slate-950/50 p-2 rounded">
                                            <span className="block mb-1">Datum</span>
                                            <span className="text-slate-300">{new Date(selectedItem.timestamp).toLocaleDateString()}</span>
                                        </div>
                                        <div className="bg-slate-950/50 p-2 rounded">
                                            <span className="block mb-1">ID</span>
                                            <span className="font-mono text-slate-300">{selectedItem.id.slice(-6)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {selectedItem.definitions?.map(def => {
                                    const state = measurements[def.id];
                                    return (
                                        <div key={def.id} className={`p-4 rounded-xl border transition-all ${state.status === 'OK' ? 'bg-emerald-950/20 border-emerald-500/30' : state.status === 'FAIL' ? 'bg-red-950/20 border-red-500/30' : 'bg-slate-900 border-slate-800'}`}>
                                            <div className="flex justify-between items-center mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-mono text-xs font-bold text-slate-400 border border-slate-700">
                                                        {def.id}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium text-slate-300">
                                                            {def.description || (def.gdtType !== 'none' ? def.gdtType : 'Dimension')}
                                                        </div>
                                                        <div className="text-[10px] text-slate-500 font-mono">
                                                            Nom: {def.nominal} <span className="text-slate-600">({def.lowerTol}/{def.upperTol})</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {state.status === 'OK' && <CheckCircle size={20} className="text-emerald-500" />}
                                                {state.status === 'FAIL' && <AlertCircle size={20} className="text-red-500" />}
                                            </div>

                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    inputMode="decimal"
                                                    value={state.measured}
                                                    onChange={(e) => handleMeasurementUpdate(def.id, e.target.value)}
                                                    placeholder="Ange värde..."
                                                    className={`w-full bg-slate-950 border text-center text-xl font-mono py-4 rounded-lg outline-none focus:ring-2 transition-all placeholder:text-slate-800 ${state.status === 'OK' ? 'border-emerald-500/50 text-emerald-400 focus:ring-emerald-500/20' : state.status === 'FAIL' ? 'border-red-500/50 text-red-400 focus:ring-red-500/20' : 'border-slate-700 text-white focus:border-blue-500'}`}
                                                />
                                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 text-xs font-bold">mm</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Signature */}
                            <div className="mt-8 bg-slate-900 p-4 rounded-xl border border-slate-800">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Signera Mätning</label>
                                <div className="relative">
                                    <select
                                        value={signature}
                                        onChange={(e) => setSignature(e.target.value)}
                                        className="w-full p-3 pl-10 rounded-lg border bg-slate-950 border-slate-800 text-slate-200 text-sm font-medium appearance-none outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                                    >
                                        <option value="" disabled>Välj kontrollant...</option>
                                        {['Niklas Jalvemyr', 'Olle Ljungberg'].map(name => {
                                            const initials = name.split(' ').map(n => n[0]).join('');
                                            return (
                                                <option key={initials} value={initials}>
                                                    {name}
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                                    <ChevronRight size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none rotate-90" />
                                </div>
                            </div>

                            {/* Submit Button - Only visible AFTER signature */}
                            {signature && (
                                <div className="fixed bottom-24 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent z-40 animate-in slide-in-from-bottom-5 fade-in duration-300">
                                    <button
                                        onClick={handleSubmit}
                                        disabled={!signature || Object.values(measurements).some(m => m.measured === '')}
                                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-900 font-bold text-lg rounded-xl shadow-xl shadow-emerald-900/20 disabled:opacity-50 disabled:grayscale transition-all flex items-center justify-center gap-2"
                                    >
                                        {loading ? <Activity className="animate-spin" /> : <Send size={20} />}
                                        Skicka Rapport
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* TAB: MÄTKORT (HISTORY) */}
                    {currentTab === 'history' && view === 'list' && (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="space-y-3"
                        >
                            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <FileText size={14} /> Arkiverade Mätkort
                            </h2>
                            {history.length === 0 && <div className="text-center text-slate-600 py-10">Tomt arkiv</div>}
                            {history.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => { setSelectedItem(item); setView('history-detail'); }}
                                    className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex justify-between items-center active:bg-slate-800 transition-all"
                                >
                                    <div>
                                        <div className="font-bold text-white text-sm">{item.articleNumber}</div>
                                        <div className="text-xs text-emerald-500 font-mono">{item.serialNumber || 'M-SERIES'}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className={`text-xs font-bold px-2 py-1 rounded inline-block ${item.status === 'OK' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                                            {item.status || 'OK'}
                                        </div>
                                        <div className="text-[10px] text-slate-500 mt-1">{new Date(item.completedAt).toLocaleDateString()}</div>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}

                    {/* HISTORY DETAIL MODAL (CONTROL CARD) */}
                    {currentTab === 'history' && view === 'history-detail' && selectedItem && (
                        <div className="fixed inset-0 z-[60] bg-slate-950 p-4 overflow-auto">
                            <button onClick={() => setView('list')} className="absolute top-4 right-4 p-2 bg-slate-800 rounded-full text-slate-400 hover:text-white">
                                <X size={24} />
                            </button>

                            <div className="mt-10 mb-8 text-center">
                                <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-800">
                                    <FileText size={32} className="text-emerald-500" />
                                </div>
                                <h2 className="text-2xl font-bold text-white">Kontrollkort</h2>
                                <div className="text-emerald-500 font-mono">{selectedItem.serialNumber}</div>
                            </div>

                            <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 space-y-6">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Artikel</label>
                                        <div className="font-mono text-white">{selectedItem.articleNumber}</div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Ritning</label>
                                        <div className="font-mono text-white">{selectedItem.drawingNumber}</div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Datum</label>
                                        <div className="text-slate-300 text-sm">{new Date(selectedItem.completedAt).toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 uppercase tracking-wider block mb-1">Kontrollant</label>
                                        <div className="text-slate-300 text-sm">{selectedItem.controller}</div>
                                    </div>
                                </div>

                                <div className="h-px bg-slate-800 my-4"></div>

                                <div className="space-y-2">
                                    {selectedItem.results?.map((res, i) => (
                                        <div key={i} className="flex justify-between items-center py-2 border-b border-slate-800/50 last:border-0">
                                            <div className="flex items-center gap-3">
                                                <span className={`w-2 h-2 rounded-full ${res.status === 'OK' ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
                                                <span className="font-mono text-xs text-slate-400">{res.id}</span>
                                            </div>
                                            <div className="text-right">
                                                <div className={`font-mono font-bold ${res.status === 'OK' ? 'text-white' : 'text-red-400'}`}>{res.measured}</div>
                                                <div className="text-[10px] text-slate-600">Nom: {res.def?.nominal}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB: RITNINGAR (DRAWINGS) */}
                    {currentTab === 'drawings' && (
                        <motion.div
                            key="drawings"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="space-y-4"
                        >
                            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <FileImage size={14} /> Ritningsarkiv
                            </h2>
                            <div className="bg-slate-900 border border-slate-800 rounded-lg p-2 flex items-center gap-2 text-slate-400 transition-all focus-within:border-emerald-500/50 focus-within:text-emerald-500">
                                <Search size={18} />
                                <input type="text" placeholder="Sök ritning..." className="bg-transparent border-none outline-none w-full text-white placeholder:text-slate-600" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {drawings.map(d => (
                                    <div key={d.id} className="bg-slate-900 border border-slate-800 p-3 rounded-xl aspect-square flex flex-col items-center justify-center text-center hover:bg-slate-800 active:scale-95 transition-all">
                                        <FileText size={32} className="text-slate-600 mb-2" />
                                        <div className="font-mono text-emerald-400 font-bold text-sm">{d.number}</div>
                                        <div className="text-[10px] text-slate-500">{d.article}</div>
                                    </div>
                                ))}
                                {drawings.length === 0 && <div className="col-span-2 text-center text-slate-600 py-10">Inga ritningar indexerade</div>}
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>

            {/* Bottom Navigation Bar - Static Bottom */}
            <div className="shrink-0 bg-slate-900 border-t border-slate-800 px-6 py-2 pb-6 z-50 flex justify-between items-center shadow-2xl safe-area-bottom">
                <button
                    onClick={() => { setCurrentTab('measure'); setView('list'); }}
                    className={`flex flex-col items-center gap-1 transition-all ${currentTab === 'measure' ? 'text-emerald-500 scale-110' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Ruler size={24} strokeWidth={currentTab === 'measure' ? 2.5 : 2} />
                    <span className="text-[10px] font-medium">Mätning</span>
                </button>

                <button
                    onClick={() => { setCurrentTab('history'); setView('list'); }}
                    className={`flex flex-col items-center gap-1 transition-all ${currentTab === 'history' ? 'text-emerald-500 scale-110' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <CheckCircle size={24} strokeWidth={currentTab === 'history' ? 2.5 : 2} />
                    <span className="text-[10px] font-medium">Mätkort</span>
                </button>

                <button
                    onClick={() => { setCurrentTab('drawings'); setView('list'); }}
                    className={`flex flex-col items-center gap-1 transition-all ${currentTab === 'drawings' ? 'text-emerald-500 scale-110' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <FileImage size={24} strokeWidth={currentTab === 'drawings' ? 2.5 : 2} />
                    <span className="text-[10px] font-medium">Ritningar</span>
                </button>
            </div>
        </div>
    );
}
