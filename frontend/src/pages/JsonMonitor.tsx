import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { FileJson, Calendar, Activity, Code, Eye, Clock, Database } from 'lucide-react';
import { toast } from '../utils/toast';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';

export default function JsonMonitor() {
    const [data, setData] = useState<any[]>([]);
    const todayStr = new Date().toISOString().split('T')[0];
    const [fromDate, setFromDate] = useState(todayStr);
    const [toDate, setToDate] = useState(todayStr);
    const [countdown, setCountdown] = useState(60);
    const [isPaused, setIsPaused] = useState(false);
    const [selectedPayload, setSelectedPayload] = useState<any>(null);

    const fetchLogs = useCallback(() => {
        setCountdown(60);
        axios.get(`http://${window.location.hostname}:8381/admin/json-monitor`, {
            params: { from_date: fromDate, to_date: toDate }
        })
            .then(res => {
                if (res.data?.status === 'success') {
                    setData(res.data.data || []);
                } else {
                    toast.error("Error: " + (res.data?.message || 'Unknown'));
                }
            })
            .catch(() => toast.error("Backend Offline"));
    }, [fromDate, toDate]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        if (isPaused) return;
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    fetchLogs();
                    return 60;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [fetchLogs, isPaused]);

    const formatTime = (ts: string) => {
        if (!ts) return '—';
        try {
            const date = new Date(ts);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        } catch { return '—'; }
    };

    const renderDiagnosticCell = (value: any, min: any, max: any, start: string, end: string, count: any, colorClass: string) => {
        return (
            <div className="flex flex-col gap-1 py-1 min-w-[140px]">
                {/* Window & Count */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                        <Clock size={10} />
                        {formatTime(start)} - {formatTime(end)}
                    </div>
                    <div className="flex items-center gap-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter">
                        <Database size={9} />
                        {count || 0} pts
                    </div>
                </div>

                {/* Math */}
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-500 bg-white/50 p-1 rounded">
                    <span className="text-slate-400">Max:</span> <span className="font-bold text-slate-700">{max ?? '0'}</span>
                    <span className="text-slate-300">—</span>
                    <span className="text-slate-400">Min:</span> <span className="font-bold text-slate-700">{min ?? '0'}</span>
                </div>

                {/* Result */}
                <div className={`flex items-center justify-between px-2 py-1 rounded-lg border ${colorClass} shadow-sm`}>
                    <span className="text-[10px] font-bold uppercase opacity-70">Result</span>
                    <span className="text-sm font-black">{value ?? 0}</span>
                </div>
            </div>
        );
    };

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'createdon',
            header: 'Posted On',
            cell: info => {
                const rawVal = info.getValue() || '';
                const parts = rawVal.split(' ');
                const datePart = parts[0] || '';
                const timePart = parts[1] || '';
                
                const dateParts = datePart.split('-');
                const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : datePart;
                
                return (
                    <div className="flex flex-col items-center justify-center font-mono text-[10px] whitespace-nowrap gap-0.5">
                        <span className="text-slate-500 font-bold text-[9px]">{formattedDate}</span>
                        <span className="text-slate-400">{timePart}</span>
                    </div>
                );
            },
            size: 90
        },
        {
            id: 'device',
            header: 'Device Target',
            accessorFn: row => row.device_alias || row.deviceid,
            cell: info => (
                <div className="flex flex-col">
                    <span className="font-bold text-slate-800 text-xs">{info.getValue()}</span>
                    <span className="text-[9px] text-slate-400 font-mono uppercase tracking-widest">{info.row.original.deviceid}</span>
                </div>
            ),
            size: 150
        },
        {
            id: 'pcd_max',
            header: 'PCD (Daily Delta)',
            cell: info => {
                const row = info.row.original;
                const diag = typeof row.diagnostics === 'string' ? JSON.parse(row.diagnostics) : row.diagnostics;
                const pay = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                return renderDiagnosticCell(
                    pay.pcd_max || pay.pcd, 
                    diag?.diag_pcd_min, 
                    diag?.diag_pcd_max,
                    diag?.diag_pcd_start,
                    diag?.diag_pcd_end,
                    diag?.diag_pcd_count,
                    'bg-emerald-50 text-emerald-700 border-emerald-100'
                );
            }
        },
        {
            id: 'pch_value',
            header: 'PCH (Cycle)',
            cell: info => {
                const row = info.row.original;
                const diag = typeof row.diagnostics === 'string' ? JSON.parse(row.diagnostics) : row.diagnostics;
                const pay = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                const val = pay.pch?.value ?? pay.pch_value;
                return renderDiagnosticCell(
                    val, 
                    diag?.diag_pch_cycle_min, 
                    diag?.diag_pch_cycle_max,
                    diag?.diag_pch_cycle_start,
                    diag?.diag_pch_cycle_end,
                    diag?.diag_pch_cycle_count,
                    'bg-blue-50 text-blue-700 border-blue-100'
                );
            }
        },
        {
            id: 'pch_max',
            header: 'PCH Max (Hour)',
            cell: info => {
                const row = info.row.original;
                const diag = typeof row.diagnostics === 'string' ? JSON.parse(row.diagnostics) : row.diagnostics;
                const pay = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                const val = pay.pch?.pch_max ?? pay.pch_max;
                return renderDiagnosticCell(
                    val, 
                    diag?.diag_pch_max_min, 
                    diag?.diag_pch_max_max,
                    diag?.diag_pch_max_start,
                    diag?.diag_pch_max_end,
                    diag?.diag_pch_max_count,
                    'bg-amber-50 text-amber-700 border-amber-100'
                );
            }
        },
        {
            id: 'pch_breach',
            header: 'PCH Breach (Rolling)',
            cell: info => {
                const row = info.row.original;
                const diag = typeof row.diagnostics === 'string' ? JSON.parse(row.diagnostics) : row.diagnostics;
                const pay = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                const val = pay.pch?.pch_breach_count ?? pay.pch_breach_count;
                const isBad = pay.pch?.condition === 'bad' || pay.pch?.condition === 'BAD';
                return renderDiagnosticCell(
                    val, 
                    diag?.diag_pch_breach_min, 
                    diag?.diag_pch_breach_max,
                    diag?.diag_pch_breach_start,
                    diag?.diag_pch_breach_end,
                    diag?.diag_pch_breach_count_rows,
                    isBad 
                        ? 'bg-red-100 text-red-950 border-red-300 font-semibold shadow-sm animate-pulse'
                        : 'bg-rose-50 text-rose-700 border-rose-100'
                );
            }
        },
        {
            id: 'tvoc_sh2s',
            header: 'TVOC',
            cell: info => {
                const row = info.row.original;
                const pay = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
                const tvoc_val = pay.tvoc?.value ?? pay.tvoc_max ?? 0;
                
                const voc_val = pay.tvoc?.voc ?? pay.voc_max ?? 0;
                const sh2s_val = pay.tvoc?.sh2s ?? pay.sh2s_max ?? 0;
                
                const isBad = pay.tvoc?.condition === 'bad' || pay.tvoc?.condition === 'BAD' || tvoc_val > 12.0;
                
                return (
                    <div 
                        className={`relative group flex flex-col items-center justify-center p-3 rounded-2xl border transition-all duration-300 min-h-[60px] cursor-help shadow-sm hover:z-50 ${
                            isBad 
                                ? 'bg-red-100 text-red-950 border-red-300 shadow-md animate-pulse font-semibold' 
                                : 'bg-purple-50/30 text-purple-700 border-purple-100 hover:bg-purple-50/50 hover:shadow-md'
                        }`}
                    >
                         {/* TVOC Value */}
                         <div className={`text-base font-black tracking-tight ${isBad ? 'text-red-900' : 'text-purple-700'}`}>
                            {tvoc_val} <span className="text-[10px] font-bold opacity-60 ml-0.5">ppm</span>
                         </div>
                         
                         {/* Custom Designed Tooltip */}
                         <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover:flex flex-col bg-slate-950/95 backdrop-blur-md text-white text-[10px] px-3.5 py-2.5 rounded-2xl shadow-2xl border border-white/10 z-50 w-48 text-left gap-1 animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
                             <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-1.5">
                                 <span className="font-bold uppercase tracking-wider text-[9px] text-slate-400">TVOC Status</span>
                                 <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                     isBad ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                 }`}>
                                     {isBad ? 'Bad' : 'Good'}
                                 </span>
                             </div>
                             <div className="flex items-center justify-between font-medium text-slate-300">
                                 <span>VOC Reading:</span>
                                 <span className="font-bold text-white font-mono">{voc_val} ppm</span>
                             </div>
                             <div className="flex items-center justify-between font-medium text-slate-300">
                                 <span>SH2S Reading:</span>
                                 <span className="font-bold text-white font-mono">{sh2s_val} ppm</span>
                             </div>
                             <div className="h-px bg-white/10 my-1"></div>
                             <p className="text-[9px] text-slate-400 leading-normal">
                                 Limit: TVOC &gt; 12.0 ppm is Bad, &le; 12.0 ppm is Good.
                             </p>
                             {/* Tooltip Arrow */}
                             <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-950/95 rotate-45 border-r border-b border-white/10 -mt-1"></div>
                         </div>
                    </div>
                );
            }
        },
        {
            id: 'actions',
            header: 'Raw',
            cell: info => (
                <button 
                    onClick={() => setSelectedPayload(info.row.original.payload)}
                    className="p-2 bg-white border border-slate-200 hover:border-indigo-500 text-slate-400 hover:text-indigo-600 rounded-xl transition-all shadow-sm"
                >
                    <Eye size={16} />
                </button>
            ),
            size: 60
        }
    ], []);

    return (
        <div className="animate-fade-in space-y-6">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-200 text-white">
                        <FileJson size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">JSON Parameter Monitor</h1>
                        <p className="text-slate-500 text-xs font-medium mt-0.5 flex items-center gap-1.5 uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Live Calculation Audit & Window Verification
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-3 px-3">
                        <Calendar size={14} className="text-slate-400" />
                        <div className="flex items-center gap-1.5">
                            <input 
                                type="date" 
                                value={fromDate}
                                onChange={e => setFromDate(e.target.value)}
                                className="text-[11px] font-black bg-slate-50 border-none rounded-lg py-1 px-2 focus:ring-2 ring-indigo-500/20 text-slate-600"
                            />
                            <span className="text-slate-300">to</span>
                            <input 
                                type="date" 
                                value={toDate}
                                onChange={e => setToDate(e.target.value)}
                                className="text-[11px] font-black bg-slate-50 border-none rounded-lg py-1 px-2 focus:ring-2 ring-indigo-500/20 text-slate-600"
                            />
                        </div>
                    </div>
                    <button 
                        onClick={fetchLogs}
                        className="bg-indigo-600 text-white px-5 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
                    >
                        FILTER
                    </button>
                    <div className="h-8 w-px bg-slate-100"></div>
                    <button 
                        onClick={() => setIsPaused(!isPaused)}
                        className={`flex flex-col items-center px-4 py-1.5 rounded-xl border transition-all duration-200 select-none cursor-pointer outline-none ${
                            isPaused 
                                ? 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-500' 
                                : 'bg-indigo-50/20 border-indigo-100/30 text-indigo-600 hover:bg-indigo-50/50'
                        }`}
                        title={isPaused ? "Click to resume auto-refresh" : "Click to pause auto-refresh"}
                    >
                        <span className="text-[9px] font-black uppercase leading-none mb-1">
                            {isPaused ? 'Paused' : 'Auto Refresh'}
                        </span>
                        <div className="flex items-center gap-1.5 font-black">
                            {isPaused ? (
                                <>
                                    <Clock size={12} />
                                    <span className="text-xs tabular-nums">{countdown}s</span>
                                </>
                            ) : (
                                <>
                                    <Activity size={12} className="animate-pulse" />
                                    <span className="text-xs tabular-nums">{countdown}s</span>
                                </>
                            )}
                        </div>
                    </button>
                </div>
            </header>

            <div className="bg-white rounded-[2rem] shadow-2xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
                <DataTable 
                    data={data} 
                    columns={columns} 
                    searchPlaceholder="Filter by Device or MAC..."
                />
            </div>

            {/* Payload Modal */}
            {selectedPayload && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-6" onClick={() => setSelectedPayload(null)}>
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden border border-slate-100" onClick={e => e.stopPropagation()}>
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 text-indigo-500">
                                    <Code size={20} />
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-slate-800">Raw JSON Payload</h3>
                                    <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Network Outbound Data</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedPayload(null)} className="w-10 h-10 flex items-center justify-center bg-white rounded-full border border-slate-100 text-slate-400 hover:text-rose-500 hover:border-rose-100 transition-all shadow-sm">×</button>
                        </div>
                        <div className="flex-1 overflow-auto p-8 bg-slate-50">
                            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-inner">
                                <pre className="text-xs font-mono text-slate-700 whitespace-pre-wrap leading-relaxed">
                                    {typeof selectedPayload === 'string' ? JSON.stringify(JSON.parse(selectedPayload), null, 4) : JSON.stringify(selectedPayload, null, 4)}
                                </pre>
                            </div>
                        </div>
                        <div className="p-6 bg-white border-t border-slate-100 text-center">
                            <button onClick={() => setSelectedPayload(null)} className="px-8 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all">Close Viewer</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
