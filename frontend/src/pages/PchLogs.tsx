import { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Activity, AlertCircle, Calendar, Filter, RefreshCw, BarChart2, Table as TableIcon } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function PchLogs() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'data' | 'chart'>('data');
    
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
                    <span className="text-rose-500 font-semibold">Min: {info.row.original.min_count}</span>
                    <span className="text-emerald-600 font-semibold">Max: {info.row.original.max_count}</span>
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

    const renderChart = () => {
        if (logs.length === 0) return <div className="text-center p-10 text-slate-400 font-medium">No data available for chart</div>;
        
        // Sort chronologically (oldest to newest)
        const chartData = [...logs].reverse().map(log => {
            const timeParts = log.to_datetime.split(' ');
            const timeStr = timeParts.length > 1 ? timeParts[1].substring(0, 5) : log.to_datetime;
            return {
                time: timeStr,
                count: Number(log.pchcount),
                threshold: Number(log.people_count_threshold_limit),
                isAlert: log.isalertrequired,
                fullDate: log.to_datetime
            };
        });
    
        const currentThreshold = chartData[chartData.length - 1]?.threshold || 60;
    
        return (
            <div className="flex-1 w-full bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 p-6 flex flex-col min-h-[500px]">
                <h3 className="text-lg font-bold text-slate-700 mb-6 flex items-center gap-2">
                     People Count Monitoring (PCH) Status over Time
                </h3>
                <div className="flex-1 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                dataKey="time" 
                                axisLine={{ stroke: '#cbd5e1', strokeWidth: 2 }} 
                                tickLine={false} 
                                tick={{fill: '#475569', fontSize: 13, fontWeight: 600}} 
                                dy={15} 
                            />
                            <YAxis 
                                axisLine={{ stroke: '#cbd5e1', strokeWidth: 2 }} 
                                tickLine={false} 
                                tick={{fill: '#475569', fontSize: 13, fontWeight: 600}} 
                                dx={-10} 
                                label={{ value: 'Rolling Count', angle: -90, position: 'insideLeft', fill: '#475569', fontWeight: 'bold', offset: -5 }}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)' }}
                                labelStyle={{ fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}
                                formatter={(value: any, _name: any, props: any) => [
                                    <span key="1" className={props.payload.isAlert ? "text-red-500 font-bold" : "text-emerald-500 font-bold"}>{value}</span>, 
                                    "Count"
                                ]}
                            />
                            <ReferenceLine 
                                y={currentThreshold} 
                                stroke="#94a3b8" 
                                strokeDasharray="5 5" 
                                strokeWidth={2}
                                label={{ position: 'top', value: 'Alert Threshold', fill: '#64748b', fontSize: 12, fontWeight: 'bold' }} 
                            />
                            <Line 
                                type="monotone" 
                                dataKey="count" 
                                stroke="#38bdf8" 
                                strokeWidth={4}
                                dot={(props: any) => {
                                    const { cx, cy, payload } = props;
                                    const isAlert = payload.isAlert;
                                    return (
                                        <circle 
                                            key={`dot-${payload.time}`}
                                            cx={cx} 
                                            cy={cy} 
                                            r={isAlert ? 7 : 5} 
                                            fill={isAlert ? '#ef4444' : '#10b981'} 
                                            stroke="#ffffff" 
                                            strokeWidth={2} 
                                        />
                                    );
                                }}
                                activeDot={{ r: 9, strokeWidth: 2, stroke: '#ffffff' }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex justify-center gap-8 mt-6 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
                        <div className="w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white shadow-sm"></div>
                        <span className="text-xs font-bold text-red-700">Alert Sent (Count &gt; {currentThreshold})</span>
                    </div>
                    <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
                        <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm"></div>
                        <span className="text-xs font-bold text-emerald-700">Status Resolved (Count &le; {currentThreshold})</span>
                    </div>
                </div>
            </div>
        );
    };

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
                
                <div className="flex flex-wrap items-center gap-3">
                    {/* View Toggle */}
                    <div className="flex bg-slate-200/60 p-1 rounded-xl shadow-inner mr-2">
                        <button 
                            onClick={() => setViewMode('data')}
                            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'data' ? 'bg-white text-purple-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <TableIcon size={14} /> Data
                        </button>
                        <button 
                            onClick={() => setViewMode('chart')}
                            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'chart' ? 'bg-white text-purple-700 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <BarChart2 size={14} /> Chart
                        </button>
                    </div>

                    <div className="flex items-center gap-3 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
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
                </div>
            </header>

            <div className="flex-1 min-h-[400px]">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center h-full text-slate-400 bg-white rounded-3xl border border-slate-100 shadow-xl">
                        <AlertCircle size={32} className="animate-pulse text-purple-300" />
                    </div>
                ) : (
                    viewMode === 'data' ? (
                        <DataTable
                            columns={columns}
                            data={logs}
                            exportFilename="PCH_Alert_Logs"
                            searchPlaceholder="Search Device ID or Remarks..."
                            rowClassName={(row) => row.isalertrequired ? "bg-red-50/60 border-l-4 border-red-500" : ""}
                        />
                    ) : (
                        renderChart()
                    )
                )}
            </div>
        </div>
    );
}

