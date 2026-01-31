import { useState, useEffect } from 'react';
import { Ruler, FileText, CheckCircle, User, ArrowLeft, Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Mock-data tills API är kopplat
const DEMO_REQUESTS = [
    { id: '1', article: '20-100', drawing: 'R-1001', status: 'WAITING' },
    { id: '2', article: '45-200', drawing: 'R-2055', status: 'WAITING' },
    { id: '3', article: '10-500', drawing: 'R-5001', status: 'IN_PROGRESS' },
];

export default function App() {
    const [view, setView] = useState('list'); // 'list', 'measure', 'success'
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [signature, setSignature] = useState('');

    const handleSelect = (req) => {
        setSelectedRequest(req);
        setView('measure');
    };

    const handleSubmit = () => {
        // Här skickar vi till XML-servern
        setView('success');
        setTimeout(() => {
            setView('list');
            setSelectedRequest(null);
            setSignature('');
        }, 2000);
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
                            {DEMO_REQUESTS.map(req => (
                                <div
                                    key={req.id}
                                    onClick={() => handleSelect(req)}
                                    className="bg-slate-900 p-5 rounded-2xl border border-slate-800 active:bg-slate-800 active:scale-[0.98] transition-all shadow-sm"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="bg-blue-500/10 text-blue-400 text-xs font-bold px-2 py-1 rounded">
                                            {req.article}
                                        </span>
                                        <span className="text-slate-500 text-xs">#{req.id}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-slate-300">
                                        <FileText size={16} />
                                        <span className="font-mono text-sm">{req.drawing}</span>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}

                    {/* Mätvy */}
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

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-400 mb-2">Mätvärde A (mm)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-xl font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                                            placeholder="0.00"
                                        />
                                        <Ruler className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600" />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-8">
                                <label className="block text-sm font-medium text-slate-400 mb-2">Signatur</label>
                                <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                                    {['NJA', 'DN', 'AS', 'Kalle'].map(sig => (
                                        <button
                                            key={sig}
                                            onClick={() => setSignature(sig)}
                                            className={`px-6 py-3 rounded-full font-bold text-sm whitespace-nowrap transition-all ${signature === sig
                                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                                }`}
                                        >
                                            {sig}
                                        </button>
                                    ))}
                                </div>
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
                            <p className="text-slate-400">Mätresultat sparat.</p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Bottom Action Bar */}
            {view === 'measure' && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-slate-900/90 backdrop-blur border-t border-slate-800 pb-8">
                    <button
                        onClick={handleSubmit}
                        disabled={!signature}
                        className="w-full bg-blue-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                    >
                        <Send size={20} />
                        Skicka Resultat
                    </button>
                </div>
            )}
        </div>
    );
}
