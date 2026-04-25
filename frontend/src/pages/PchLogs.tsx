import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Activity, AlertCircle, Calendar, Filter, RefreshCw } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';

export default function PchLogs() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [fromDate, setFromDate] = useState(() => {
        const d = new Date();
        return d.toISOString().split('T')[0];
    });
    const [toDate, setToDate] = useState(() => {
        const d = new Date();
        return d.toISOString().split('T')[0];
    });
    
    const [countdown, setCountdown] = useState(60);

    const fetchLogs = useCallback(async (showLoader = true) => {
        if (showLoader) setLoading(true);
        try {
            const res = await axios.get(`http://${window.location.hostname}:8381/admin/pch-logs`, {
                params: { from_date: fromDate, to_date: toDate }
            });
            if (res.data?.status === 'success') {
                setLogs(res.data.data || []);
            }
        } catch (error) {
            console.error(error);
        } finally {
            if (showLoader) setLoading(false);
        }
    }, [fromDate, toDate]);

    useEffect(() => {
        fetchLogs();
    }, []);

    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown((prev) => {
                if (prev <= 1) {
                    fetchLogs(false);
                    return 60;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [fetchLogs]);

    const handleFilter = () => {
        setCountdown(60);
        fetchLogs();
    };

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'slno',
            header: 'ID',
            size: 60,
        },
        {
            accessorKey: 'deviceid',
            header: 'Device ID',
            cell: info => <span className="font-mono font-bold text-teal-600">{info.getValue()}</span>
        },
        {
            accessorKey: 'timeframe',
            header: 'Time Frame',
            cell: info => <span className="text-slate-600 font-medium">{info.getValue()} Mins</span>
        },
        {
            id: 'window',
            header: 'Evaluation Window',
            accessorFn: row => `${row.from_datetime} to ${row.to_datetime}`,
            cell: info => (
                <div className="flex flex-col text-xs text-slate-500">
                    <span>{info.row.original.from_datetime}</span>
                    <span>to {info.row.original.to_datetime}</span>
                </div>
            )
        },
        {
            id: 'out_raw',
            header: 'OUT_RAW',
            cell: info => (
                <div className="flex flex-col text-xs">
                    <span className="text-emerald-600 font-semibold">Max: {info.row.original.max_count}</span>
                    <span className="text-rose-500 font-semibold">Min: {info.row.original.min_count}</span>
                </div>
            )
        },
        {
            id: 'pch_stats',
            header: 'PCH Stats',
            cell: info => (
                <div className="flex flex-col text-xs">
                    <span className="text-slate-700 font-bold">Net PCH: {info.row.original.pchcount}</span>
                </div>
            )
        },
        {
            accessorKey: 'people_count_threshold_limit',
            header: 'Threshold',
            cell: info => <span className="text-slate-700 font-bold">{info.getValue()}</span>
        },
        {
            id: 'flags',
            header: 'Flags',
            cell: info => (
                <div className="flex gap-1 flex-wrap max-w-[120px]">
                    {info.row.original.isalertrequired ? (
                        <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold border border-red-200 shadow-sm animate-pulse">! ALERT REQD</span>
                    ) : (
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded font-bold">No Alert</span>
                    )}
                    {info.row.original.isjsoncreated && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded font-bold">JSON</span>}
                    {info.row.original.isjsonposted && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1 rounded font-bold">Posted</span>}
                </div>
            )
        },
        {
            accessorKey: 'remarks',
            header: 'Remarks',
            cell: info => <span className="text-xs text-slate-500 italic max-w-xs block truncate" title={info.getValue()}>{info.getValue() || '-'}</span>
        },
        {
            accessorKey: 'created_on',
            header: 'Generated At',
            cell: info => <span className="text-xs text-slate-400 whitespace-nowrap">{info.getValue()}</span>
        }
    ], []);

    return (
        <div className="flex flex-col h-full max-w-7xl mx-auto">
            <header className="flex flex-col md:flex-row md:items-center justify-between mb-6 shrink-0 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-purple-50 rounded-xl text-purple-600"><Activity size={20} /></span>
                        PCH Logs
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">View people count threshold alert evaluations.</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                    <div className="flex items-center gap-2 pl-2">
                        <Calendar size={16} className="text-slate-400" />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">From</span>
                        <input 
                            type="date" 
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none text-slate-700 font-medium"
                        />
                    </div>
                    <div className="w-px h-6 bg-slate-200"></div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">To</span>
                        <input 
                            type="date" 
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none text-slate-700 font-medium"
                        />
                    </div>
                    
                    <button 
                        onClick={handleFilter}
                        className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-all shadow-md shadow-slate-800/20 ml-2"
                    >
                        <Filter size={16} /> Filter
                    </button>
                    
                    <div className="flex items-center gap-2 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg border border-blue-100/50">
                        <RefreshCw size={14} className={countdown <= 5 ? "animate-spin" : ""} />
                        <span className="text-sm font-bold w-6 text-center">{countdown}s</span>
                    </div>
                </div>
            </header>

            <div className="flex-1 min-h-[400px]">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center h-full text-slate-400 bg-white rounded-3xl border border-slate-100 shadow-xl">
                        <AlertCircle size={32} className="animate-pulse text-purple-300" />
                    </div>
                ) : (
                    <DataTable
                        columns={columns}
                        data={logs}
                        exportFilename="PCH_Alert_Logs"
                        searchPlaceholder="Search Device ID or Remarks..."
                        rowClassName={(row) => row.isalertrequired ? "bg-red-50/60 border-l-4 border-red-500" : ""}
                    />
                )}
            </div>
        </div>
    );
}

