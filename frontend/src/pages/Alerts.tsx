import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Activity, RefreshCw, Calendar, Search } from 'lucide-react';
import { toast } from '../utils/toast';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';

export default function Alerts() {
    const [alerts, setAlerts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const todayStr = new Date().toISOString().split('T')[0];
    const [fromDate, setFromDate] = useState(todayStr);
    const [toDate, setToDate] = useState(todayStr);
    const [alertType, setAlertType] = useState("TVOC");

    const fetchAlerts = useCallback(() => {
        setLoading(true);
        let url = `http://${window.location.hostname}:8381/admin/alerts?alert_type=${alertType}`;
        if (fromDate) url += `&from_date=${fromDate}`;
        if (toDate) url += `&to_date=${toDate}`;

        axios.get(url)
            .then(res => {
                if (res.data?.status === 'success') {
                    setAlerts(res.data.data || []);
                } else {
                    toast.error("DB Error: " + (res.data?.message || 'Unknown'));
                }
            })
            .catch(() => toast.error("Network Error: Backend Offline"))
            .finally(() => setLoading(false));
    }, [fromDate, toDate, alertType]);

    // Initial Load & Auto Refresh (60 seconds)
    useEffect(() => {
        fetchAlerts();
        const interval = setInterval(() => fetchAlerts(), 60000);
        return () => clearInterval(interval);
    }, [fetchAlerts]);

    const columns = useMemo<ColumnDef<any, any>[]>(() => {
        const baseCols: ColumnDef<any, any>[] = [
            {
                accessorKey: 'deviceid',
                header: 'Device ID',
                cell: info => <span className="font-bold text-slate-800">{info.getValue()}</span>
            },
            {
                accessorKey: 'param_tag',
                header: 'Incident Tag',
                cell: info => (
                    <span className="px-2.5 py-1 bg-rose-50 text-rose-600 rounded-md text-xs font-mono font-bold tracking-wide border border-rose-200">
                        {info.getValue()}
                    </span>
                )
            },
            {
                accessorKey: 'createdon',
                header: 'Triggered On',
                cell: info => <span className="text-slate-600 font-mono text-xs">{info.getValue() || '—'}</span>
            },
            {
                accessorKey: 'lastrunon',
                header: 'Last Ping On',
                cell: info => <span className="text-slate-500 font-mono text-xs italic">{info.getValue() || '—'}</span>
            },
            {
                accessorKey: 'alertsequence',
                header: 'Sequence Level',
                cell: info => <span className="text-slate-600 font-bold">{info.getValue()}</span>
            },
            {
                accessorKey: 'consucutive_minutes',
                header: 'Mins Active',
                cell: info => <span className="text-sky-600 font-bold">{info.getValue() || 0} m</span>
            }
        ];

        if (alertType === "TVOC" || alertType === "PCH") {
            baseCols.push({
                accessorKey: 'tvoc_value',
                header: alertType === "TVOC" ? 'TVOC Value' : 'PCH Delta',
                cell: info => <span className="text-rose-600 font-bold text-sm tracking-tighter">{info.getValue() ?? '—'}</span>
            });
            baseCols.push({
                accessorKey: 'currentstatus',
                header: 'Status',
                cell: info => {
                    const status = info.getValue()?.toString().toUpperCase();
                    return (
                        <span className={`px-2 py-1 rounded-md text-[9px] font-bold tracking-widest uppercase ${status === 'BAD' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {status || 'UNKNOWN'}
                        </span>
                    );
                }
            });
        }

        baseCols.push(
            {
                accessorKey: 'isresolved',
                header: 'Bucket State',
                cell: info => {
                    const isRes = info.getValue() === 1 || info.getValue() === true;
                    return (
                        <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${isRes ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-200 animate-pulse'}`}>
                            {isRes ? 'Resolved' : 'Active'}
                        </span>
                    );
                }
            },
            {
                accessorKey: 'resolvedon',
                header: 'Resolved On',
                cell: info => <span className="text-emerald-600 font-mono text-xs italic">{info.getValue() || '—'}</span>
            },
            {
                accessorKey: 'remarks',
                header: 'Remarks',
                cell: info => {
                    const row = info.row.original as any;
                    const seq = row.alertsequence || 0;
                    const isRes = row.isresolved === 1 || row.isresolved === true;
                    
                    if (isRes) {
                        return <span className="text-emerald-600 font-medium text-xs bg-emerald-50 px-2 py-1 rounded">Resolved JSON Sent: {row.resolvedon || row.lastrunon || '—'}</span>;
                    }
                    if (seq === 0) {
                        return <span className="text-slate-400 font-medium text-xs italic bg-slate-50 px-2 py-1 rounded">Evaluating Block #1 (No JSON)</span>;
                    }
                    return <span className="text-sky-600 font-medium text-xs bg-sky-50 px-2 py-1 rounded border border-sky-100">Alert JSON #{seq} Sent: {row.lastrunon || '—'}</span>;
                }
            }
        );

        return baseCols;
    }, [alertType]);

    return (
        <div className="flex flex-col h-full max-w-7xl mx-auto">
            <header className="flex items-center justify-between mb-6 shrink-0 z-20 relative">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-rose-50 rounded-xl text-rose-500"><Activity size={20} /></span>
                        Alert Dispatch Monitor
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Tracking holistic threshold breaches and dispatch sequences.</p>
                </div>
                
                <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm shrink-0">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setAlertType("TVOC")}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${alertType === 'TVOC' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            TVOC
                        </button>
                        <button 
                            onClick={() => setAlertType("PCH")}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${alertType === 'PCH' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            PCH
                        </button>
                    </div>
                    <div className="w-px h-6 bg-slate-200 mx-1"></div>
                    <div className="flex items-center space-x-2">
                        <Calendar size={16} className="text-slate-400" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest hidden sm:inline">From</span>
                        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded outline-none px-2 py-1 focus:border-amber-500" />
                    </div>
                    <div className="w-px h-6 bg-slate-200 mx-1"></div>
                    <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest hidden sm:inline">To</span>
                        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded outline-none px-2 py-1 focus:border-amber-500" />
                    </div>
                    
                    <button 
                        onClick={fetchAlerts}
                        className="ml-2 bg-gradient-to-r from-slate-700 to-slate-900 hover:from-slate-600 hover:to-slate-800 text-white font-medium px-4 py-1.5 text-sm rounded-lg flex items-center gap-2 transition-all shadow shadow-slate-900/20"
                    >
                        <Search size={14} /> Filter
                    </button>
                    
                    <button 
                        onClick={fetchAlerts}
                        title="Manual Refresh"
                        className="bg-sky-50 text-sky-600 border border-sky-100 hover:bg-sky-100 font-semibold p-1.5 rounded-lg flex items-center transition-all shadow-sm"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </header>

            <div className="flex-1 min-h-[400px]">
                <DataTable
                    columns={columns}
                    data={alerts}
                    exportFilename="Alerts_Tracker"
                    searchPlaceholder="Search Alert Sequences..."
                />
            </div>
            <div className="mt-2 flex justify-end">
                 <span className="text-xs text-slate-400 font-mono tracking-widest uppercase">Auto-Syncing every 60s natively</span>
            </div>
        </div>
    );
}
