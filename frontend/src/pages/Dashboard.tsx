import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { Filter, Download, ArrowLeft, ArrowRight, Building2, Cpu, Maximize, Minimize2, ChevronUp, ChevronDown } from 'lucide-react';
import Select from 'react-select';
import { toast } from '../utils/toast';

export default function Dashboard({ latestData }: { latestData: string }) {
    const [allDevices, setAllDevices] = useState<any[]>([]);

    // Filters & Relationships
    const [selectedCompany, setSelectedCompany] = useState<any>(null);
    const [selectedDevice, setSelectedDevice] = useState<any>(null);

    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [limit, setLimit] = useState<number>(1000);
    const [autoRefresh, setAutoRefresh] = useState(false);

    // Dynamic Mapping State
    const [deviceParams, setDeviceParams] = useState<any[]>([]);
    // Track which mapped parameters are checked/visible in charts
    const [visibleParams, setVisibleParams] = useState<Record<string, boolean>>({});

    // Data state
    const [dataList, setDataList] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<string>('');

    // Pagination state for tables
    const [pageMinute, setPageMinute] = useState(0);
    const [rowsMinute, setRowsMinute] = useState(10);

    const [pageRaw, setPageRaw] = useState(0);
    const [rowsRaw, setRowsRaw] = useState(10);

    // New UI states
    const [isFilterOpen, setIsFilterOpen] = useState(true);
    const [isChartFullscreen, setIsChartFullscreen] = useState(false);

    const aqiRef = useRef<any>(null);

    // Initial Load Devices
    useEffect(() => {
        axios.get('http://97.74.92.23:8381/api/dashboard/devices')
            .then(res => {
                if (res.data?.data) {
                    setAllDevices(res.data.data);
                }
            }).catch(console.error);

        // Initial Date bounds (Today)
        const today = new Date();
        const y_start = new Date(today.setHours(0, 0, 0, 0));
        const y_end = new Date(today.setHours(23, 59, 59, 999));

        const pad = (n: number) => n.toString().padStart(2, '0');
        const formatLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

        setFromDate(formatLocal(y_start));
        setToDate(formatLocal(y_end));
    }, []);

    // When Device Changes -> Fetch its mapped parameters
    useEffect(() => {
        setDeviceParams([]);
        setVisibleParams({});
        setDataList([]);
        if (selectedDevice?.value) {
            axios.get(`http://97.74.92.23:8381/api/dashboard/devices/${selectedDevice.value}/params`)
                .then(res => {
                    if (res.data?.status === 'success') {
                        const params = res.data.data || [];
                        setDeviceParams(params);

                        // Default all mappings to visible
                        const initialVisibility: Record<string, boolean> = {};
                        params.forEach((p: any) => {
                            initialVisibility[p.parametername] = true;
                        });
                        setVisibleParams(initialVisibility);
                    }
                }).catch(console.error);
        }
    }, [selectedDevice]);

    // Unique Companies mapping for React-Select
    const uniqueCompanies = Array.from(new Set(allDevices.map(d => d.customer_code).filter(Boolean)));
    const companyOptions = uniqueCompanies.map(c => ({ value: c, label: c }));

    // Filter Devices based on Selected Company
    const filteredDeviceOptions = allDevices
        .filter(d => !selectedCompany || d.customer_code === selectedCompany.value)
        .map(d => ({ value: d.deviceid, label: `${d.deviceid} - ${d.alias || 'Unknown'}` }));

    const parseRevText = (text: string) => {
        if (!text) return {};
        const parts = text.split(',');
        let obj: any = {};
        parts.forEach(p => {
            const splitIdx = p.indexOf(':');
            if (splitIdx > -1) {
                const k = p.substring(0, splitIdx).trim();
                const v = p.substring(splitIdx + 1).trim();

                if (k === 'DT') {
                    obj[k] = v;
                } else {
                    obj[k] = isNaN(Number(v)) ? v : Number(v);
                }
            }
        });
        return obj;
    };

    const fetchTelemetry = () => {
        if (!selectedDevice?.value) return;
        setLoading(true);

        let url = `http://97.74.92.23:8381/api/dashboard/telemetry?limit=${limit}&device_id=${encodeURIComponent(selectedDevice.value)}`;
        if (fromDate) url += `&from_date=${encodeURIComponent(fromDate.replace('T', ' ') + ':00')}`;
        if (toDate) url += `&to_date=${encodeURIComponent(toDate.replace('T', ' ') + ':59')}`;

        axios.get(url)
            .then(res => {
                if (res.data?.status === 'success') {
                    const raw = res.data.data || [];
                    const processed = raw.map((row: any, idx: number) => {
                        const revTextStr = row.revText || row.revtext || '';
                        const p = parseRevText(revTextStr);
                        const dObj = new Date(row.receivedOn || row.receivedon);

                        const baseObj: any = {
                            slno_ui: idx + 1,
                            receivedOn: row.receivedOn || row.receivedon,
                            DateStr: dObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                            TimeStr: dObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
                            DateTimeStr: `${dObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${dObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`,
                            DeviceId: row.deviceid || row.deviceId,
                            DeviceName: row.alias || row.deviceid,
                            Location: row.location || '-',
                            RawData: revTextStr,
                            Status: p.STATUS || p.status || 'UNKNOWN'
                        };

                        // Dynamically map values based on Device Parameters!
                        deviceParams.forEach(dp => {
                            // Extract numeric values from payload tag dynamically
                            baseObj[dp.parametername] = p[dp.api_rev_tag] || 0;
                        });

                        return baseObj;
                    });

                    setDataList(processed.reverse());
                    setLastUpdated(new Date().toLocaleTimeString());
                } else {
                    toast.error("Telemetry Query Failed");
                }
            })
            .catch(() => toast.error("Backend Disconnected"))
            .finally(() => setLoading(false));
    };

    // Auto Refresh Hook
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (autoRefresh) {
            fetchTelemetry();
            interval = setInterval(fetchTelemetry, 120000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRefresh]);

    useEffect(() => {
        if (!autoRefresh && selectedDevice?.value && latestData && latestData.includes(selectedDevice.value)) {
            fetchTelemetry();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [latestData]);

    const handleDownloadChart = async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
        if (ref.current) {
            const canvas = await html2canvas(ref.current, { scale: 2 });
            const link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }
    };

    const handleDownloadExcel = (tableType: 'minute' | 'raw') => {
        let headers: string[] = [];
        let exportData: any[] = [];
        const sortedDesc = [...dataList].reverse();

        if (tableType === 'minute') {
            headers = ["Sl No", "Date", "Time", "Device Name", ...deviceParams.map(dp => dp.parametername)];
            exportData = sortedDesc.map(d => [
                d.slno_ui, d.DateStr, d.TimeStr, d.DeviceName,
                ...deviceParams.map(dp => d[dp.parametername])
            ]);
        } else {
            headers = ["Sl No", "DateTime", "Device Id", "Location", "Raw Data (revText)"];
            exportData = sortedDesc.map(d => [
                d.slno_ui, d.DateTimeStr, d.DeviceId, d.Location, d.RawData
            ]);
        }

        const ws = XLSX.utils.aoa_to_sheet([headers, ...exportData]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Telemetry");
        XLSX.writeFile(wb, `${tableType}_telemetry_${new Date().getTime()}.xlsx`);
    };

    const sortedTableData = [...dataList].reverse();
    const pageMinuteData = sortedTableData.slice(pageMinute * rowsMinute, (pageMinute + 1) * rowsMinute);
    const pageRawData = sortedTableData.slice(pageRaw * rowsRaw, (pageRaw + 1) * rowsRaw);

    const toggleVisibility = (paramName: string) => {
        setVisibleParams(prev => ({
            ...prev,
            [paramName]: !prev[paramName]
        }));
    };

    const selectStyles = {
        control: (base: any) => ({
            ...base,
            borderColor: '#e2e8f0',
            borderRadius: '0.5rem',
            padding: '2px',
            minHeight: '38px',
            boxShadow: 'none',
            backgroundColor: '#f8fafc',
            '&:hover': { borderColor: '#cbd5e1' }
        }),
        menu: (base: any) => ({ ...base, zIndex: 9999 })
    };

    return (
        <div className={`flex flex-col h-[calc(100vh-64px)] overflow-y-auto px-2 md:px-6 pb-20 w-full animation-fade-in bg-slate-50/50 ${isChartFullscreen ? 'overflow-hidden' : ''}`}>
            {/* FILTER HEADER */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6 flex flex-col sticky top-0 z-30 transition-all">
                {/* Header Toggle Bar */}
                <div
                    className={`px-6 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors ${isFilterOpen ? 'border-b border-slate-100 rounded-t-2xl' : 'rounded-2xl'}`}
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                >
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700 uppercase tracking-wide">
                        <Filter size={14} className="text-emerald-500" />
                        Telemetry Controls
                        {!isFilterOpen && selectedDevice && (
                            <span className="ml-4 text-xs normal-case text-slate-500 font-normal">
                                {selectedDevice.label} • {dataList.length} rows loaded
                            </span>
                        )}
                    </div>
                    <div className="bg-slate-100 p-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors">
                        {isFilterOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                </div>

                {/* Collapsible Content */}
                {isFilterOpen && (
                    <div className="p-4 md:p-6 pt-4 flex flex-col gap-4">
                        <div className="flex flex-wrap items-end gap-3 md:gap-4">

                            {/* Dynamic Dropdowns */}
                            <div className="flex flex-col gap-1.5 w-full md:w-56">
                                <label className="text-xs font-bold tracking-wide text-slate-500 uppercase flex items-center gap-1.5"><Building2 size={12} /> Company</label>
                                <Select
                                    options={companyOptions}
                                    value={selectedCompany}
                                    onChange={(val) => {
                                        setSelectedCompany(val);
                                        setSelectedDevice(null); // Reset device mapping
                                    }}
                                    placeholder="All Companies"
                                    isClearable
                                    styles={selectStyles}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5 w-full md:w-64">
                                <label className="text-xs font-bold tracking-wide text-slate-500 uppercase flex items-center gap-1.5"><Cpu size={12} /> Device ID</label>
                                <Select
                                    options={filteredDeviceOptions}
                                    value={selectedDevice}
                                    onChange={(val) => setSelectedDevice(val)}
                                    placeholder="Search Device..."
                                    isClearable
                                    styles={selectStyles}
                                />
                            </div>

                            {/* Date Limiters */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold tracking-wide text-slate-500 uppercase">From Date</label>
                                <input type="datetime-local" value={fromDate} onChange={e => setFromDate(e.target.value)}
                                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 outline-none focus:border-indigo-500 h-[38px]" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold tracking-wide text-slate-500 uppercase">To Date</label>
                                <input type="datetime-local" value={toDate} onChange={e => setToDate(e.target.value)}
                                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 outline-none focus:border-indigo-500 h-[38px]" />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-bold tracking-wide text-slate-500 uppercase">Data Limit</label>
                                <select value={limit} onChange={e => setLimit(Number(e.target.value))}
                                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 outline-none focus:border-indigo-500 cursor-pointer h-[38px]">
                                    <option value={100}>100 rows</option>
                                    <option value={500}>500 rows</option>
                                    <option value={1000}>1000 rows</option>
                                    <option value={5000}>5000 rows</option>
                                </select>
                            </div>

                            <button
                                onClick={fetchTelemetry}
                                disabled={loading || !selectedDevice?.value}
                                className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-semibold px-6 py-2 rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 disabled:opacity-50 disabled:cursor-not-allowed text-sm h-[38px]"
                            >
                                <Filter size={16} className={loading ? 'animate-pulse' : ''} /> Show
                            </button>

                            <div className="flex items-center gap-4 ml-auto lg:ml-4 border border-slate-200 px-4 py-2 rounded-lg bg-slate-50/50 h-[38px]">
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer select-none">
                                    <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="rounded text-indigo-500 focus:ring-indigo-500 w-4 h-4 cursor-pointer" />
                                    Auto Refresh (2m)
                                </label>
                            </div>
                        </div>

                        {/* Sub-Checkboxes (Dynamically injected from parameter mapping) */}
                        {deviceParams.length > 0 && (
                            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 mt-1">
                                {deviceParams.map(dp => (
                                    <label key={dp.parametername} className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer bg-slate-50 px-3 py-1.5 rounded-md border border-slate-200/60 hover:border-slate-300 transition-colors select-none">
                                        <input
                                            type="checkbox"
                                            checked={!!visibleParams[dp.parametername]}
                                            onChange={() => toggleVisibility(dp.parametername)}
                                            className="rounded text-indigo-500 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                            style={{ accentColor: dp.color || '#6366f1' }}
                                        />
                                        Show {dp.labelname || dp.parametername}
                                    </label>
                                ))}
                            </div>
                        )}

                        {/* Meta Bar */}
                        {selectedDevice?.value && (
                            <div className="flex items-center justify-between text-xs font-semibold text-slate-500 bg-indigo-50/50 py-2 px-3 rounded-lg border border-indigo-100/50 mt-1">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Showing mapped parameters for <span className="text-slate-800 tracking-wide">{selectedDevice.label}</span>
                                </div>
                                <div className="text-indigo-400">
                                    Data is fetched... Last updated: {lastUpdated}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* DYNAMIC DASHBOARD CHART (Render mapped lines dynamically using Recharts) */}
            <div className={isChartFullscreen ? "fixed inset-0 z-[100] bg-white p-6 flex flex-col overflow-hidden" : "bg-white rounded-2xl border border-slate-100 p-6 shadow-sm mb-6 flex flex-col"} ref={aqiRef}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-indigo-600 flex items-center gap-2">
                        <span className="w-1.5 h-6 bg-indigo-500 rounded-full"></span>
                        Device Telemetry Canvas
                    </h3>
                    <div className="flex items-center gap-3">
                        <button onClick={() => handleDownloadChart(aqiRef, 'Telemetry_Dashboard.png')} className="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-semibold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors">
                            <Download size={14} /> Download PNG
                        </button>
                        <button onClick={() => setIsChartFullscreen(!isChartFullscreen)} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold p-2 rounded-lg flex items-center gap-2 transition-colors" title={isChartFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                            {isChartFullscreen ? <Minimize2 size={16} /> : <Maximize size={16} />}
                        </button>
                    </div>
                </div>

                <div className={`w-full ${isChartFullscreen ? 'flex-1 min-h-0' : 'h-[450px]'}`}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dataList} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="TimeStr" minTickGap={50} tick={{ fontSize: 11, fill: '#94a3b8' }} angle={-15} textAnchor={"end"} dy={15} />

                            <YAxis orientation="left" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />

                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                            <Legend verticalAlign="top" height={40} iconType="plainline" />

                            {/* Dynamically push ALL mapped parameters onto the active line chart if toggled visible */}
                            {deviceParams.map(dp => {
                                if (visibleParams[dp.parametername]) {
                                    return (
                                        <Line
                                            key={dp.parametername}
                                            type="monotone"
                                            dataKey={dp.parametername}
                                            name={`${dp.labelname || dp.parametername} ${dp.unit ? `(${dp.unit})` : ''}`}
                                            stroke={dp.color || '#6366f1'}
                                            strokeWidth={2}
                                            dot={false}
                                            activeDot={{ r: 6, strokeWidth: 0 }}
                                        />
                                    );
                                }
                                return null;
                            })}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* MINUTE DATA TABLE */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm mb-6 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-slate-800">Minute Data ({dataList.length} rows)</h3>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" placeholder="Search minute data..." className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none focus:border-indigo-500" />
                        </div>
                        <button onClick={() => handleDownloadExcel('minute')} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-semibold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors border border-emerald-100">
                            <Download size={14} /> Download Excel
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto w-full border border-slate-100 rounded-xl mb-4">
                    <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-4 py-4">Sl No</th>
                                <th className="px-4 py-4">Date</th>
                                <th className="px-4 py-4">Time</th>
                                <th className="px-4 py-4 text-sky-500">Device Name</th>
                                {/* Dynamic Table Columns */}
                                {deviceParams.map(dp => (
                                    <th key={dp.parametername} className="px-4 py-4" style={{ color: dp.color || '#475569' }}>
                                        {dp.parametername}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                            {pageMinuteData.map((d, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3">{d.slno_ui}</td>
                                    <td className="px-4 py-3 text-slate-700">{d.DateStr}</td>
                                    <td className="px-4 py-3 font-mono text-slate-500">{d.TimeStr}</td>
                                    <td className="px-4 py-3 text-sky-600">{d.DeviceName}</td>

                                    {/* Dynamic Table Row Data */}
                                    {deviceParams.map(dp => (
                                        <td key={dp.parametername} className="px-4 py-3 min-w-[100px]" style={{ color: dp.color || 'inherit' }}>
                                            {dp.parametername.toUpperCase() === 'STATUS' ? (
                                                <span className={`px-2 py-1 flex w-fit rounded text-[10px] font-bold uppercase tracking-widest ${['BAD', 'OFFLINE', 'ERROR'].includes(String(d[dp.parametername]).toUpperCase()) ? 'bg-slate-800 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                                                    {d[dp.parametername]}
                                                </span>
                                            ) : (
                                                d[dp.parametername] !== undefined ? d[dp.parametername] : '-'
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            {pageMinuteData.length === 0 && (
                                <tr>
                                    <td colSpan={5 + deviceParams.length} className="px-4 py-8 text-center text-slate-400">No telemetry parsed for this window. Make sure parameters are mapped!</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between text-sm text-slate-500">
                    <div className="flex items-center gap-2">
                        Show
                        <select className="border border-slate-200 rounded px-2 py-1 outline-none" value={rowsMinute} onChange={e => { setRowsMinute(Number(e.target.value)); setPageMinute(0) }}>
                            <option value={10}>10</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                        entries
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => setPageMinute(p => Math.max(0, p - 1))} disabled={pageMinute === 0} className="hover:text-indigo-600 disabled:opacity-30"><ArrowLeft size={16} /></button>
                        <span className="font-semibold text-slate-700">Page {pageMinute + 1} of {Math.ceil(sortedTableData.length / rowsMinute) || 1}</span>
                        <button onClick={() => setPageMinute(p => Math.min(Math.ceil(sortedTableData.length / rowsMinute) - 1, p + 1))} disabled={pageMinute >= Math.ceil(sortedTableData.length / rowsMinute) - 1} className="hover:text-indigo-600 disabled:opacity-30"><ArrowRight size={16} /></button>
                    </div>
                </div>
            </div>

            {/* DB DATA (RAW STRING) TABLE */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-bold text-slate-800">DB Data (Raw String) ({dataList.length} rows)</h3>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" placeholder="Search raw data..." className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none focus:border-indigo-500" />
                        </div>
                        <button onClick={() => handleDownloadExcel('raw')} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-semibold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors border border-emerald-100">
                            <Download size={14} /> Download Excel
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto w-full border border-slate-100 rounded-xl mb-4">
                    <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-100">
                            <tr>
                                <th className="px-5 py-4 w-20">Sl No</th>
                                <th className="px-5 py-4 w-48">DateTime</th>
                                <th className="px-5 py-4 w-48">Device Id</th>
                                <th className="px-5 py-4 w-48">Location</th>
                                <th className="px-5 py-4">Raw Data (revText)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-medium">
                            {pageRawData.map((d, i) => (
                                <tr key={i} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-5 py-4">{d.slno_ui}</td>
                                    <td className="px-5 py-4 text-slate-700">{d.DateStr}, {d.TimeStr}</td>
                                    <td className="px-5 py-4 font-mono text-slate-600 font-bold">{d.DeviceId}</td>
                                    <td className="px-5 py-4 text-slate-500">{d.Location}</td>
                                    <td className="px-5 py-4 font-mono text-xs text-indigo-500 whitespace-normal min-w-[300px] leading-relaxed tracking-tight">{d.RawData}</td>
                                </tr>
                            ))}
                            {pageRawData.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400">No database strings found for this window.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex items-center justify-between text-sm text-slate-500">
                    <div className="flex items-center gap-2">
                        Show
                        <select className="border border-slate-200 rounded px-2 py-1 outline-none" value={rowsRaw} onChange={e => { setRowsRaw(Number(e.target.value)); setPageRaw(0) }}>
                            <option value={10}>10</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                        entries
                    </div>
                    <div className="flex items-center gap-4">
                        <button onClick={() => setPageRaw(p => Math.max(0, p - 1))} disabled={pageRaw === 0} className="hover:text-indigo-600 disabled:opacity-30"><ArrowLeft size={16} /></button>
                        <span className="font-semibold text-slate-700">Page {pageRaw + 1} of {Math.ceil(sortedTableData.length / rowsRaw) || 1}</span>
                        <button onClick={() => setPageRaw(p => Math.min(Math.ceil(sortedTableData.length / rowsRaw) - 1, p + 1))} disabled={pageRaw >= Math.ceil(sortedTableData.length / rowsRaw) - 1} className="hover:text-indigo-600 disabled:opacity-30"><ArrowRight size={16} /></button>
                    </div>
                </div>
            </div>

        </div>
    );
}
