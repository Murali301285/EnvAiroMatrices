import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { RefreshCw, Calendar, Search, Globe } from 'lucide-react';
import { toast } from '../utils/toast';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';

export default function ApiMonitor() {
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const todayStr = new Date().toISOString().split('T')[0];
    const [fromDate, setFromDate] = useState(todayStr);
    const [toDate, setToDate] = useState(todayStr);
    const [countdown, setCountdown] = useState(60);
    const [viewMode, setViewMode] = useState<'Scheduled' | 'Alert'>('Scheduled');

    const fetchPosts = useCallback(() => {
        setLoading(true);
        setCountdown(60);
        let url = `http://${window.location.hostname}:8381/admin/api-dispatch-monitor?`;
        if (fromDate) url += `from_date=${fromDate}&`;
        if (toDate) url += `to_date=${toDate}`;

        axios.get(url)
            .then(res => {
                if (res.data?.status === 'success') {
                    setPosts(res.data.data || []);
                } else {
                    toast.error("DB Error: " + (res.data?.message || 'Unknown'));
                }
            })
            .catch(() => toast.error("Network Error: Backend Offline"))
            .finally(() => setLoading(false));
    }, [fromDate, toDate]);

    // Initial Load & Reference Fetch
    useEffect(() => {
        fetchPosts();
    }, [fetchPosts]);

    // Live 1-second Countdown Timer
    useEffect(() => {
        const timer = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    fetchPosts();
                    return 60;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, [fetchPosts]);

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'deviceid',
            header: 'Device MAC',
            cell: info => <span className="text-slate-600 font-mono text-xs">{info.getValue() || '—'}</span>
        },
        {
            accessorKey: 'device_alias',
            header: 'Alias',
            cell: info => <span className="font-bold text-slate-800">{info.getValue() || '—'}</span>
        },
        {
            accessorKey: 'env_type',
            header: 'Env Type',
            cell: info => {
                const env = info.getValue();
                return (
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold ${env === 'Staging' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                        {env || 'Live'}
                    </span>
                );
            }
        },
        ...(viewMode === 'Alert' ? [{
            accessorKey: 'payload_type',
            header: 'Type',
            cell: (info: any) => (
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold bg-indigo-50 text-indigo-700 border border-indigo-200`}>
                    {info.getValue() || '—'}
                </span>
            )
        }] : []),
        {
            accessorKey: 'postedon',
            header: 'Posted On',
            cell: info => <span className="text-slate-600 font-mono text-xs">{info.getValue() || '—'}</span>
        },
        {
            accessorKey: 'targeturl',
            header: 'Target URL',
            cell: info => (
                <div className="max-w-[200px] truncate text-indigo-600 font-mono text-xs" title={info.getValue()}>
                    {info.getValue() || '—'}
                </div>
            )
        },
        {
            accessorKey: 'responsestatus',
            header: 'ACK Status',
            cell: info => {
                const val = (info.getValue() || '').toString();
                const isSuccess = val.startsWith('2');
                return (
                    <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${isSuccess ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                        {val ? `HTTP ${val}` : '—'}
                    </span>
                );
            }
        },
        {
            accessorKey: 'payload',
            header: 'Payload Preview',
            cell: info => (
                <div className="max-w-[200px] truncate text-slate-500 font-mono text-xs" title={info.getValue()}>
                    {info.getValue() || '—'}
                </div>
            )
        },
        {
            accessorKey: 'remarks',
            header: 'Remarks (Response)',
            cell: info => (
                <div className="max-w-[250px] truncate text-slate-600 text-xs italic" title={info.getValue()}>
                    {info.getValue() || '—'}
                </div>
            )
        }
    ], [viewMode]);

    const filteredPosts = useMemo(() => {
        return posts.filter((p: any) => {
            const type = p.payload_type || 'Scheduled';
            return viewMode === 'Scheduled' ? type === 'Scheduled' : type !== 'Scheduled';
        });
    }, [posts, viewMode]);

    return (
        <div className="animate-fade-in p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-slate-800">API Dispatch Monitor</h1>
                <p className="text-slate-500 text-sm mt-1">Live tracking of IoT JSON payloads pushed to external webhooks.</p>
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6 flex flex-wrap gap-4 items-end">
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold tracking-wide text-slate-500 flex items-center gap-1.5 uppercase">
                        <Calendar size={12} /> From Date
                    </label>
                    <input 
                        type="date" 
                        value={fromDate}
                        onChange={e => setFromDate(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold tracking-wide text-slate-500 flex items-center gap-1.5 uppercase">
                        <Calendar size={12} /> To Date
                    </label>
                    <input 
                        type="date" 
                        value={toDate}
                        onChange={e => setToDate(e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                </div>
                <button 
                    onClick={() => { fetchPosts(); }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-70 h-[38px]"
                    disabled={loading}
                >
                    <Search size={16} /> Filter
                </button>

                <div className="ml-auto flex flex-col items-end gap-1">
                    <div className="flex items-center gap-2">
                        <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                        </span>
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Live Stream Active</span>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 mb-6 flex items-center p-1.5 gap-1.5 w-fit">
                <button 
                    onClick={() => setViewMode('Scheduled')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-colors ${viewMode === 'Scheduled' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    Scheduled Payloads
                </button>
                <button 
                    onClick={() => setViewMode('Alert')}
                    className={`px-6 py-2 rounded-lg text-sm font-bold transition-colors ${viewMode === 'Alert' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    Alert Payloads
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Globe size={18} className="text-indigo-500" />
                        Network Post History
                    </h3>
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={fetchPosts} 
                            disabled={loading}
                            className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors ${loading ? 'opacity-50' : ''}`}
                        >
                            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                            Auto-Refresh in {countdown}s
                        </button>
                    </div>
                </div>

                <div className="h-[600px]">
                    <DataTable 
                        data={filteredPosts} 
                        columns={columns} 
                    />
                </div>
            </div>
            
            <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl text-blue-800 text-sm">
                <strong>Information:</strong> All JSON alert payloads generate real-time <code>HTTP POST</code> events. Configure your destination API URL within the <strong>tblScheduler</strong> table under the <code>post_url_live</code> column. The engine automatically translates that URL to the respective customer.
            </div>
        </div>
    );
}
