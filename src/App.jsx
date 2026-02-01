import { useState, useEffect } from 'react';
import { Ruler, FileText, FileImage, User, CheckCircle, AlertCircle, Search, ChevronRight, X, Activity, Send, ArrowLeft, Trash2, UserCheck, Plus } from 'lucide-react';
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

    // Operator Logic (Mobile)
    const [isSigningModalOpen, setIsSigningModalOpen] = useState(false);
    const [operatorList, setOperatorList] = useState(() => {
        const saved = localStorage.getItem('simAkers_operators_mobile');
        return saved ? JSON.parse(saved) : ['Niklas Jalvemyr', 'Olle Ljungberg'];
    });
    const [newOperatorInput, setNewOperatorInput] = useState('');

    // Add Operator
    const handleAddOperator = () => {
        if (!newOperatorInput.trim()) return;
        if (operatorList.includes(newOperatorInput.trim())) {
            alert("Operatör finns redan!");
            return;
        }
        const newList = [...operatorList, newOperatorInput.trim()].sort();
        setOperatorList(newList);
        localStorage.setItem('simAkers_operators_mobile', JSON.stringify(newList));
        setNewOperatorInput('');
        setSignature(newOperatorInput.trim());
    };

    // Remove Operator
    const handleRemoveOperator = (opName) => {
        if (confirm(`Ta bort ${opName}?`)) {
            const newList = operatorList.filter(o => o !== opName);
            setOperatorList(newList);
            localStorage.setItem('simAkers_operators_mobile', JSON.stringify(newList));
            if (signature === opName) setSignature('');
        }
    };

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
                if (prev.some(r => r.id === newOrder.id)) return prev;
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

        // Helper: Swedish Float Parsing (consistent with Desktop)
        const parseSwedishFloat = (val) => {
            if (!val) return NaN;
            const clean = String(val).replace(/\s/g, '').replace(/,/g, '.');
            return parseFloat(clean);
        };

        const val = parseSwedishFloat(value);
        const nom = parseSwedishFloat(def.nominal);
        const upper = parseSwedishFloat(def.upperTol) || 0; // e.g. 0.1
        const lower = parseSwedishFloat(def.lowerTol) || 0; // e.g. -0.1

        // Calculate Limits (Nominal +/- Deviation Magnitude)
        // Screenshot confirms UI inputs are magnitudes (+ [0,2] - [0,2]).
        // Min Limit = Nominal - Lower.
        const minLimit = nom - Math.abs(lower);
        const maxLimit = nom + Math.abs(upper);

        let status = 'NEUTRAL';

        if (!isNaN(val) && !isNaN(minLimit) && !isNaN(maxLimit)) {
            // Use epsilon for float precision safety
            if (val >= minLimit - 0.000001 && val <= maxLimit + 0.000001) {
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

    const handleDeleteOrder = (orderId) => {
        if (!confirm('Radera denna rapport permanent?')) return;

        // Optimistic UI update
        setHistory(prev => prev.filter(h => h.id !== orderId));
        setRequests(prev => prev.filter(r => r.id !== orderId)); // Just in case

        if (socket) {
            socket.emit('delete_order', orderId);
        }
    };

    const handleOpenSigning = () => {
        setIsSigningModalOpen(true);
    };

    const handleSubmit = async () => {
        if (!selectedItem || !socket || !signature) return;

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
        // UI Reset
        setView('list'); // Back to list within 'measure' tab
        setSelectedItem(null);
        setSignature('');
        setIsSigningModalOpen(false); // Close modal
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

                                    // Helper (Local to render loop)
                                    const parseSwedishFloat = (val) => {
                                        if (!val) return NaN;
                                        const clean = String(val).replace(/\s/g, '').replace(/,/g, '.');
                                        return parseFloat(clean);
                                    };

                                    const nom = parseSwedishFloat(def.nominal);
                                    const lower = parseSwedishFloat(def.lowerTol) || 0;
                                    const upper = parseSwedishFloat(def.upperTol) || 0;
                                    const minLimit = nom - Math.abs(lower);
                                    const maxLimit = nom + Math.abs(upper);

                                    const GDT_INFO = {
                                        'none': { s: '-', t: 'Ingen formtolerans' },
                                        'position': { s: '⌖', t: 'Position' },
                                        'flatness': { s: '⏥', t: 'Planhet' },
                                        'perpendicularity': { s: '⟂', t: 'Vinkelräthet' },
                                        'parallelism': { s: '∥', t: 'Parallellitet' },
                                        'concentricity': { s: '◎', t: 'Koncentricitet' },
                                        'cylindricity': { s: '⌭', t: 'Cylindricitet' },
                                        'roundness': { s: '○', t: 'Rundhet' },
                                        'straightness': { s: '⏤', t: 'Rakhet' },
                                        'profile_surface': { s: '⌓', t: 'Ytprofil' },
                                        'runout': { s: '↗', t: 'Kast' }
                                    };
                                    const gdtInfo = GDT_INFO[def.gdtType] || GDT_INFO['none'];

                                    return (
                                        <div key={def.id} className={`p-4 rounded-xl border transition-all ${state.status === 'OK' ? 'bg-emerald-950/20 border-emerald-500/30' : state.status === 'FAIL' ? 'bg-red-950/20 border-red-500/30' : 'bg-slate-900 border-slate-800'}`}>
                                            <div className="flex justify-between items-start mb-4">
                                                <div className="flex items-start gap-4">
                                                    {/* ID & GDT */}
                                                    <div className="flex flex-col items-center gap-1">
                                                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-mono text-xs font-bold text-slate-400 border border-slate-700">
                                                            {def.id}
                                                        </div>
                                                        <span className="text-2xl font-bold text-slate-200" title={gdtInfo.t}>
                                                            {gdtInfo.s}
                                                        </span>
                                                    </div>

                                                    {/* Details */}
                                                    <div>
                                                        <div className="text-sm font-medium text-slate-300 mb-1">
                                                            {def.description || gdtInfo.t}
                                                        </div>
                                                        <div className="text-sm text-slate-400 font-mono">
                                                            Nom: <span className="text-slate-200 font-bold">{def.nominal}</span>
                                                            <span className="text-slate-500 ml-1">({def.lowerTol} / {def.upperTol})</span>
                                                        </div>
                                                        {/* Calculated Limits */}
                                                        {!isNaN(minLimit) && !isNaN(maxLimit) && (
                                                            <div className="text-xs font-mono text-emerald-400 mt-1 bg-emerald-950/30 px-2 py-0.5 rounded inline-block border border-emerald-500/20">
                                                                Gränser: {minLimit.toFixed(2)} - {maxLimit.toFixed(2)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Status Icon */}
                                                <div>
                                                    {state.status === 'OK' && <CheckCircle size={24} className="text-emerald-500" />}
                                                    {state.status === 'FAIL' && <AlertCircle size={24} className="text-red-500" />}
                                                </div>
                                            </div>

                                            {/* Input Area with Steppers */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    className="w-12 h-14 bg-slate-800 rounded-lg border border-slate-700 text-slate-400 text-xl font-bold active:bg-slate-700 active:scale-95 transition-all"
                                                    onClick={() => {
                                                        const val = parseSwedishFloat(state.measured) || 0;
                                                        handleMeasurementUpdate(def.id, (val - 0.1).toFixed(1).replace('.', ','));
                                                    }}
                                                >
                                                    -
                                                </button>

                                                <div className="relative flex-1">
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={state.measured}
                                                        onChange={(e) => handleMeasurementUpdate(def.id, e.target.value)}
                                                        placeholder="Värde..."
                                                        className={`w-full bg-slate-950 border text-center text-xl font-mono py-3.5 rounded-lg outline-none focus:ring-2 transition-all placeholder:text-slate-800 ${state.status === 'OK' ? 'border-emerald-500/50 text-emerald-400 focus:ring-emerald-500/20' : state.status === 'FAIL' ? 'border-red-500/50 text-red-400 focus:ring-red-500/20' : 'border-slate-700 text-white focus:border-blue-500'}`}
                                                    />
                                                </div>

                                                <button
                                                    className="w-12 h-14 bg-slate-800 rounded-lg border border-slate-700 text-slate-400 text-xl font-bold active:bg-slate-700 active:scale-95 transition-all"
                                                    onClick={() => {
                                                        const val = parseSwedishFloat(state.measured) || 0;
                                                        handleMeasurementUpdate(def.id, (val + 0.1).toFixed(1).replace('.', ','));
                                                    }}
                                                >
                                                    +
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Desktop/Mobile Parity: Signing Modal instead of inline */}
                            {/* Trigger Button */}
                            <div className="fixed bottom-24 left-0 right-0 p-4 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent z-40 animate-in slide-in-from-bottom-5 fade-in duration-300">
                                <button
                                    onClick={handleOpenSigning}
                                    disabled={Object.values(measurements).some(m => m.measured === '')}
                                    className="w-full py-4 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold text-lg rounded-xl shadow-xl shadow-blue-900/20 disabled:opacity-50 disabled:grayscale transition-all flex items-center justify-center gap-2"
                                >
                                    <UserCheck size={20} />
                                    Signera & Skicka
                                </button>
                            </div>

                            {/* Signing Modal */}
                            <AnimatePresence>
                                {isSigningModalOpen && (
                                    <motion.div
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                                    >
                                        <motion.div
                                            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
                                            className="bg-slate-900 w-full max-w-sm rounded-2xl border border-slate-800 p-6 shadow-2xl space-y-6"
                                        >
                                            <div className="flex justify-between items-center">
                                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                                    <UserCheck className="text-emerald-500" /> Signera
                                                </h3>
                                                <button onClick={() => setIsSigningModalOpen(false)} className="text-slate-500 hover:text-white"><X /></button>
                                            </div>

                                            {/* Add New Operator */}
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Nytt namn..."
                                                    value={newOperatorInput}
                                                    onChange={e => setNewOperatorInput(e.target.value)}
                                                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                                                />
                                                <button
                                                    onClick={handleAddOperator}
                                                    disabled={!newOperatorInput.trim()}
                                                    className="bg-slate-800 hover:bg-slate-700 text-emerald-500 p-2 rounded-lg border border-slate-700 disabled:opacity-50"
                                                >
                                                    <Plus size={20} />
                                                </button>
                                            </div>

                                            {/* Operator List */}
                                            <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-800 rounded-lg p-1 bg-slate-950/50">
                                                {operatorList.map((op, idx) => (
                                                    <div
                                                        key={idx}
                                                        onClick={() => setSignature(op)}
                                                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${signature === op ? 'bg-emerald-600 text-white' : 'bg-slate-800/50 text-slate-300 hover:bg-slate-800'}`}
                                                    >
                                                        <span className="font-medium">{op}</span>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleRemoveOperator(op); }}
                                                            className={`p-1.5 rounded-full ${signature === op ? 'text-emerald-200 hover:bg-emerald-700' : 'text-slate-500 hover:bg-slate-700 hover:text-red-400'}`}
                                                        >
                                                            {signature === op ? <CheckCircle size={16} /> : <Trash2 size={16} />}
                                                        </button>
                                                    </div>
                                                ))}
                                                {operatorList.length === 0 && <div className="text-center text-slate-500 py-4 text-sm">Inga operatörer</div>}
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="pt-2">
                                                <button
                                                    onClick={handleSubmit}
                                                    disabled={!signature}
                                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl font-bold font-mono text-lg shadow-lg flex items-center justify-center gap-2 transition-all"
                                                >
                                                    {loading ? <Activity className="animate-spin" /> : <Send size={20} />}
                                                    SKICKA
                                                </button>
                                            </div>
                                        </motion.div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
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

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteOrder(item.id);
                                            }}
                                            className="mt-2 p-2 text-slate-600 hover:text-red-400 active:bg-slate-800 rounded-full"
                                        >
                                            <Trash2 size={16} />
                                        </button>
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
