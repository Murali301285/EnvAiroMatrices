import { useState, useEffect } from 'react';
import axios from 'axios';
import { Activity, RefreshCw, Calendar, FileText } from 'lucide-react';
import { toast } from '../utils/toast';

export default function Events() {
    const [events, setEvents] = useState<any[]>([]);
    const [availableDates, setAvailableDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>("");
    const [loading, setLoading] = useState(true);

    const fetchEvents = (dateParam?: string) => {
        setLoading(true);
        const url = `http://localhost:8381/admin/logs/events${dateParam ? `?date=${dateParam}` : ''}`;

        axios.get(url)
            .then(res => {
                if (res.data?.status === 'success') {
                    setEvents(res.data.data || []);
                    setAvailableDates(res.data.available_dates || []);
                    if (res.data.current_date && !selectedDate) {
                        setSelectedDate(res.data.current_date);
                    }
                } else {
                    toast.error("Failed to load event telemetry.");
                }
            })
            .catch(() => toast.error("Network Error: Backend Offline"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchEvents(selectedDate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDate]);

    // Format DDMMYYYY to readable
    const formatDate = (d: string) => {
        if (d.length !== 8) return d;
        return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4, 8)}`;
    };

    return (
        <div className="flex flex-col h-full max-w-5xl mx-auto">
            <header className="flex items-center justify-between mb-6 shrink-0 relative z-20">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-sky-50 rounded-xl text-sky-500"><Activity size={20} /></span>
                        Operational Event Logs
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Daily consolidated transaction sequences and background service logs.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Calendar size={14} className="text-slate-400 group-focus-within:text-sky-500" />
                        </div>
                        <select
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 block w-full pl-9 pr-8 py-2.5 font-medium shadow-sm outline-none transition-all appearance-none cursor-pointer"
                        >
                            {availableDates.length === 0 && <option value="">No Logs Found</option>}
                            {availableDates.map(d => (
                                <option key={d} value={d}>Log: {formatDate(d)}</option>
                            ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                    </div>

                    <button
                        onClick={() => fetchEvents(selectedDate)}
                        className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-semibold px-4 py-2.5 text-sm rounded-lg flex items-center gap-2 transition-all shadow-sm"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-hidden flex flex-col bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 relative">
                <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-slate-400 font-medium animate-pulse text-lg">Parsing Log Matrix...</div>
                    ) : events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center">
                            <div className="bg-white p-6 rounded-full border border-slate-200 mb-4 shadow-sm">
                                <FileText className="w-12 h-12 text-slate-300" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-700">Empty Log Buffer</h3>
                            <p className="text-slate-500 mt-2 max-w-xs">No events were recorded for the selected operational day.</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-w-4xl mx-auto">
                            {events.map((ev, idx) => (
                                <div key={idx} className="flex gap-4 items-center p-3.5 bg-white border border-slate-100 rounded-xl hover:border-sky-200 hover:shadow-md transition-all group">
                                    <div className="bg-sky-50 text-sky-600 px-3 py-1.5 rounded-lg text-xs font-mono font-bold shrink-0 border border-sky-100 group-hover:bg-sky-500 group-hover:text-white transition-colors">
                                        {ev.time}
                                    </div>
                                    <div className="text-slate-600 text-sm font-medium leading-relaxed font-mono">
                                        {ev.message}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
