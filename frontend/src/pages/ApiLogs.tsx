import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Activity, Code2, Key, CheckCircle2, XCircle, ShieldAlert, Download, Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export default function ApiLogs() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchTerm, setSearchTerm] = useState('');
    const [pageSize, setPageSize] = useState<number | 'ALL'>(10);
    const [currentPage, setCurrentPage] = useState(1);

    const fetchLogs = () => {
        setLoading(true);
        axios.get(`http://${window.location.hostname}:8381/api/v1/apilogs?limit=2000`)
            .then(res => {
                if (res.data?.status === 'success') {
                    setLogs(res.data.data || []);
                }
            })
            .catch(err => console.error(err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 10000); // Auto-refresh every 10s
        return () => clearInterval(interval);
    }, []);

    // Derived Logic
    const filteredLogs = useMemo(() => {
        return logs.filter(l => 
            JSON.stringify(l).toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [logs, searchTerm]);

    const totalPages = pageSize === 'ALL' ? 1 : Math.ceil(filteredLogs.length / pageSize) || 1;
    
    const paginatedLogs = useMemo(() => {
        if (pageSize === 'ALL') return filteredLogs;
        const start = (currentPage - 1) * pageSize;
        return filteredLogs.slice(start, start + pageSize);
    }, [filteredLogs, currentPage, pageSize]);

    // Make sure current page is valid when filtering changes
    useEffect(() => {
        if (currentPage > totalPages) setCurrentPage(1);
    }, [totalPages, currentPage]);

    const exportCSV = () => {
        if (filteredLogs.length === 0) return;
        
        const headers = ["SL No", "API Target Route", "Caller Source", "Hit Timestamp", "Ingested Parameters", "Response Status", "Execution Remarks"];
        const csvRows = [headers.join(",")];
        
        filteredLogs.forEach((log, i) => {
            const dateStr = new Date(log.accessedon).toLocaleString('en-GB'); // dd/mm/yyyy format intrinsically
            const paramsStr = JSON.stringify(log.params).replace(/"/g, '""'); // escape quotes inside csv
            const remarksStr = (log.remarks || '').replace(/"/g, '""');
            
            csvRows.push(
                `${i + 1},${log.apiname},${log.source},"${dateStr}","${paramsStr}",${log.status},"${remarksStr}"`
            );
        });

        const blob = new Blob([csvRows.join("\n")], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.setAttribute('hidden', '');
        a.setAttribute('href', url);
        a.setAttribute('download', `API_Logs_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const formatDate = (dateString: string) => {
        const d = new Date(dateString);
        return d.toLocaleString('en-GB'); // Results typically in dd/mm/yyyy, HH:MM:SS
    };

    return (
        <div className="flex flex-col h-full max-w-7xl mx-auto space-y-6">
            <header className="flex items-center justify-between shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-indigo-50 rounded-xl text-indigo-600"><Activity size={20} /></span>
                        API Access Center
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Monitor active webhooks, secure endpoints, and live ingestion footprint trails.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Documentation Card 1 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col pt-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                            <Code2 size={18} className="text-indigo-500" /> /api/v1/setworkinghours
                        </h3>
                        <span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded text-[10px] tracking-widest uppercase">POST</span>
                    </div>
                    <p className="text-sm text-slate-500 mb-4 h-10">Maps live threshold business operating envelopes directly to an edge device.</p>
                    <div className="bg-slate-900 rounded-xl p-4 flex-1 flex flex-col font-mono text-xs">
                        <div className="mb-2 text-indigo-300 font-semibold border-b border-slate-800 pb-2 flex items-center justify-between">
                            <span>Headers</span>
                            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded"><Key size={10} /> X-Api-Key</span>
                        </div>
                        <pre className="text-emerald-400">
{`{
  "deviceid": "MAC:ADDRESS:01",
  "start": "09:00",
  "end": "18:00"
}`}
                        </pre>
                    </div>
                </div>

                {/* Documentation Card 2 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col pt-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
                            <Code2 size={18} className="text-indigo-500" /> /api/v1/setpeoplethreshold
                        </h3>
                        <span className="bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded text-[10px] tracking-widest uppercase">POST</span>
                    </div>
                    <p className="text-sm text-slate-500 mb-4 h-10">Overwrites the master People count limits tied explicitly to a Customer domain.</p>
                    <div className="bg-slate-900 rounded-xl p-4 flex-1 flex flex-col font-mono text-xs">
                        <div className="mb-2 text-indigo-300 font-semibold border-b border-slate-800 pb-2 flex items-center justify-between">
                            <span>Headers</span>
                            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded"><Key size={10} /> X-Api-Key</span>
                        </div>
                        <pre className="text-sky-400">
{`{
  "source": "woloo",
  "limit": 10
}`}
                        </pre>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden flex-1 flex flex-col min-h-[500px]">
                <div className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50 border-b border-slate-100 shrink-0 gap-4">
                    <div className="flex items-center gap-4">
                        <h3 className="font-bold text-slate-800 tracking-tight text-lg">Real-time HTTP Access Audit Trail</h3>
                        {loading && <span className="animate-pulse text-xs font-semibold text-slate-500">Syncing...</span>}
                    </div>

                    <div className="flex items-center flex-wrap gap-3">
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Search logs..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 min-w-[250px] transition-colors"
                            />
                        </div>
                        
                        <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-2 py-1 bg-white">
                            <span className="text-xs text-slate-500 font-medium pl-2">Show:</span>
                            <select 
                                value={pageSize} 
                                onChange={(e) => setPageSize(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                                className="bg-transparent text-sm border-none outline-none font-semibold text-slate-700 py-1 pr-1 cursor-pointer"
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value="ALL">All</option>
                            </select>
                        </div>
                        
                        <button 
                            onClick={exportCSV} 
                            disabled={filteredLogs.length === 0}
                            className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download size={16} /> Export
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-white/50 relative">
                    <table className="w-full text-left whitespace-nowrap text-sm">
                        <thead className="bg-[#f8fafc] sticky top-0 backdrop-blur-md z-10 shadow-sm">
                            <tr className="text-slate-500 font-semibold tracking-wider text-[11px] uppercase">
                                <th className="px-5 py-4 w-12 text-center">SL</th>
                                <th className="px-5 py-4">API Target Route</th>
                                <th className="px-5 py-4">Caller Source</th>
                                <th className="px-5 py-4">Hit Timestamp</th>
                                <th className="px-5 py-4">Ingested Parameters</th>
                                <th className="px-5 py-4">Response Status</th>
                                <th className="px-5 py-4">Execution Remarks</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedLogs.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-20 text-slate-400">
                                        <div className="flex flex-col items-center gap-3">
                                            <ShieldAlert size={40} className="text-slate-300" />
                                            <p className="font-medium text-lg">No traffic found</p>
                                            <p className="text-sm">Audit trail matrix is empty or doesn't match search.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedLogs.map((log, index) => {
                                const serialNo = pageSize === 'ALL' ? index + 1 : (currentPage - 1) * (pageSize as number) + index + 1;
                                return (
                                <tr key={log.slno} className="hover:bg-slate-50 transition-colors group">
                                    <td className="px-5 py-3 text-center text-slate-400 font-medium text-xs border-r border-slate-50">
                                        {(serialNo).toString().padStart(2, '0')}
                                    </td>
                                    <td className="px-5 py-3 font-mono font-bold text-slate-700 text-xs">{log.apiname}</td>
                                    <td className="px-5 py-3 text-slate-600 font-medium">
                                        <span className="bg-slate-100 px-2 py-1 rounded text-xs border border-slate-200">{log.source}</span>
                                    </td>
                                    <td className="px-5 py-3 font-mono text-slate-500 text-xs">
                                        {formatDate(log.accessedon)}
                                    </td>
                                    <td className="px-5 py-3">
                                        <div 
                                            className="max-w-[200px] xl:max-w-[250px] truncate cursor-help font-mono text-[11px] text-sky-600 bg-slate-50 p-1.5 rounded border border-slate-100 shadow-sm"
                                            title={JSON.stringify(log.params, null, 2)}
                                        >
                                            {JSON.stringify(log.params)}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex items-center gap-1.5">
                                            {log.status === 'OK' ? (
                                                <span className="flex items-center gap-1 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                                                    <CheckCircle2 size={14} /> OK
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-xs font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded border border-rose-100">
                                                    <XCircle size={14} /> FAILED
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-5 py-3 text-[12px] text-slate-600">
                                        <div 
                                            className={"max-w-[200px] xl:max-w-[250px] truncate cursor-help inline-block " + (log.status !== 'OK' ? 'text-rose-500 font-semibold' : '')}
                                            title={log.remarks || '-'}
                                        >
                                            {log.remarks || '-'}
                                        </div>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Engine */}
                {pageSize !== 'ALL' && totalPages > 1 && (
                    <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 flex items-center justify-between shrink-0">
                        <span className="text-xs text-slate-500 font-medium">
                            Showing <span className="font-bold text-slate-700">{(currentPage - 1) * (pageSize as number) + 1}</span> to <span className="font-bold text-slate-700">{Math.min(currentPage * (pageSize as number), filteredLogs.length)}</span> of <span className="font-bold text-slate-700">{filteredLogs.length}</span> entries
                        </span>
                        
                        <div className="flex items-center gap-1">
                            <button 
                                onClick={() => setCurrentPage(1)} 
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronsLeft size={16} />
                            </button>
                            <button 
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            
                            <span className="px-4 py-1 text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-lg mx-1">
                                {currentPage} <span className="text-slate-400 font-medium px-1">/</span> {totalPages}
                            </span>

                            <button 
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight size={16} />
                            </button>
                            <button 
                                onClick={() => setCurrentPage(totalPages)} 
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronsRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
