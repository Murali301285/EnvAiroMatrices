import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Activity, AlertCircle } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';

export default function PchLogs() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        axios.get(`http://${window.location.hostname}:8381/admin/pch-logs`)
            .then(res => {
                if (res.data?.status === 'success') {
                    setLogs(res.data.data || []);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

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
            id: 'pch_stats',
            header: 'PCH Stats',
            cell: info => (
                <div className="flex flex-col text-xs">
                    <span className="text-emerald-600 font-semibold">Max: {info.row.original.max_count}</span>
                    <span className="text-rose-500 font-semibold">Min: {info.row.original.min_count}</span>
                    <span className="text-slate-700 font-bold mt-0.5">Net: {info.row.original.pchcount}</span>
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
                    {info.row.original.isalertrequired && <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded font-bold">Alert Reqd</span>}
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
            <header className="flex items-center justify-between mb-6 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-purple-50 rounded-xl text-purple-600"><Activity size={20} /></span>
                        PCH Logs
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">View people count threshold alert evaluations.</p>
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
                    />
                )}
            </div>
        </div>
    );
}
