import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';
import { Filter, Download, ArrowLeft, ArrowRight, ChevronsLeft, ChevronsRight, Building2, Cpu, Maximize, Minimize2, ChevronUp, ChevronDown, FileJson } from 'lucide-react';
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
    const [sortMinute, setSortMinute] = useState<{ key: string, dir: 'asc' | 'desc' } | null>(null);

    const [pageRaw, setPageRaw] = useState(0);
    const [rowsRaw, setRowsRaw] = useState(10);
    const [sortRaw, setSortRaw] = useState<{ key: string, dir: 'asc' | 'desc' } | null>(null);

    // JSON Dynamic Engine States
    const [jsonHistoryLogs, setJsonHistoryLogs] = useState<any[]>([]);
    const [jsonColumns, setJsonColumns] = useState<ColumnDef<any, any>[]>([]);
    const [jsonLoading, setJsonLoading] = useState(false);

    // New UI states
    const [isFilterOpen, setIsFilterOpen] = useState(true);
    const [isMinuteDataOpen, setIsMinuteDataOpen] = useState(true);
    const [isRawDataOpen, setIsRawDataOpen] = useState(true);
    const [isJsonDataOpen, setIsJsonDataOpen] = useState(true);
    const [isChartFullscreen, setIsChartFullscreen] = useState(false);

    const aqiRef = useRef<any>(null);

    // Initial Load Devices
    useEffect(() => {
        axios.get(`http://${window.location.hostname}:8381/api/dashboard/devices`)
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
            axios.get(`http://${window.location.hostname}:8381/api/dashboard/devices/${selectedDevice.value}/params`)
                .then(res => {
                    if (res.data?.status === 'success') {
                        const params = res.data.data || [];
                        const sIdx = params.findIndex((p: any) => String(p.parametername).toUpperCase() === 'STATUS');
                        if (sIdx > -1) params.push(params.splice(sIdx, 1)[0]);
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

    // Auto-Select Logic (If only 1 option available, seamlessly mount it automatically)
    useEffect(() => {
        if (companyOptions.length === 1 && !selectedCompany) {
            setSelectedCompany(companyOptions[0]);
        }
    }, [allDevices, selectedCompany]);

    useEffect(() => {
        if (filteredDeviceOptions.length === 1 && !selectedDevice) {
            setSelectedDevice(filteredDeviceOptions[0]);
        }
    }, [allDevices, selectedCompany, selectedDevice]);

    const parseRevText = (text: string) => {
        if (!text) return {};
        // Split smartly using lookahead regex to only split commas followed by Key: structure
        const parts = text.split(/,(?=[a-zA-Z0-9_]+:)/);
        let obj: any = {};
        parts.forEach(p => {
            const splitIdx = p.indexOf(':');
            if (splitIdx > -1) {
                const k = p.substring(0, splitIdx).trim().toUpperCase();
                let v = p.substring(splitIdx + 1).trim();

                // Strip trailing garbage from STATUS and ignore embedded commas 
                if (v.includes('|')) {
                    v = v.split('|')[0].trim();
                }
                
                // Remove trailing stray commas if any payload ended with ,
                if (v.endsWith(',')) {
                    v = v.slice(0, -1).trim();
                }

                if (k === 'DT') { 
                    obj[k] = v; 
                } else { 
                    obj[k] = isNaN(Number(v)) ? v : Number(v); 
                }
            }
        });
        return obj;
    };

    const flattenObject = (obj: any, prefix = ''): any => {
        return Object.keys(obj).reduce((acc: any, k: string) => {
            const pre = prefix.length ? prefix + '_' : '';
            if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
                Object.assign(acc, flattenObject(obj[k], pre + k));
            } else {
                acc[pre + k] = obj[k];
            }
            return acc;
        }, {});
    };

    const fetchJsonHistory = () => {
        if (!selectedDevice?.value) return;
        setJsonLoading(true);

        const params = new URLSearchParams();
        if (selectedCompany?.value) params.append('company', selectedCompany.label);
        if (selectedDevice?.value) params.append('device_id', selectedDevice.value);
        if (fromDate) params.append('from_date', fromDate.replace('T', ' ') + ':00');
        if (toDate) params.append('to_date', toDate.replace('T', ' ') + ':59');
        params.append('limit', '500');

        axios.get(`http://${window.location.hostname}:8381/api/dashboard/json-history?${params.toString()}`)
            .then(res => {
                if (res.data?.status === 'success') {
                    const rawLogs = res.data.data || [];
                    const processedLogs = rawLogs.map((log: any, idx: number) => ({
                        ...log,
                        mapped_slno: idx + 1,
                        ...flattenObject(log.json_payload || {})
                    }));

                    const dynamicKeys = new Set<string>();
                    processedLogs.forEach((log: any) => {
                        Object.keys(log).forEach(k => {
                            if (!['slno', 'mapped_slno', 'deviceid', 'created_at', 'payload_type', 'json_payload', 'customername'].includes(k)) {
                                dynamicKeys.add(k);
                            }
                        });
                    });

                    const dynCols = Array.from(dynamicKeys).map(k => ({
                        accessorKey: k,
                        header: k.toUpperCase().replace(/_/g, ' '),
                        cell: (info: any) => {
                            const val = info.getValue();
                            return <span className="font-mono text-slate-600 font-medium">{val !== undefined ? String(val) : '-'}</span>;
                        }
                    }));

                    const baseCols: ColumnDef<any, any>[] = [
                        { accessorKey: 'mapped_slno', header: 'SLNo', cell: (info: any) => <span className="text-slate-500 font-medium px-2">{info.getValue() as number}</span> },
                        { accessorKey: 'deviceid', header: 'Device ID', cell: (info: any) => <span className="text-sky-600 font-bold tracking-wide">{info.getValue() as string}</span> },
                        { accessorKey: 'created_at', header: 'Datetime', cell: (info: any) => <span className="text-slate-500 font-mono text-[11px] whitespace-nowrap">{new Date(info.getValue() as string).toLocaleString()}</span> },
                        { accessorKey: 'payload_type', header: 'Type', cell: (info: any) => <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${info.getValue() === 'Alert' ? 'bg-rose-100 text-rose-700' : info.getValue() === 'Resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>{info.getValue() as string || 'Scheduled'}</span> }
                    ];

                    setJsonColumns([...baseCols, ...dynCols]);
                    setJsonHistoryLogs(processedLogs);
                }
            })
            .catch(err => console.error("JSON fetch fail", err))
            .finally(() => setJsonLoading(false));
    };

    const fetchTelemetry = () => {
        if (!selectedDevice?.value) return;
        setLoading(true);

        let url = `http://${window.location.hostname}:8381/api/dashboard/telemetry?limit=${limit}&device_id=${encodeURIComponent(selectedDevice.value)}`;
        if (fromDate) url += `&from_date=${encodeURIComponent(fromDate.replace('T', ' ') + ':00')}`;
        if (toDate) url += `&to_date=${encodeURIComponent(toDate.replace('T', ' ') + ':59')}`;

        axios.get(url)
            .then(res => {
                if (res.data?.status === 'success') {
                    const raw = res.data.data || [];
                    const seeds = res.data.day_seeds || {};
                    const processed = raw.map((row: any, idx: number) => {
                        const revTextStr = row.revText || row.revtext || '';
                        const p = parseRevText(revTextStr);
                        const dObj = new Date(row.receivedOn || row.receivedon);

                        const pad = (n: number) => String(n).padStart(2, '0');
                        const dateKey = `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())}`;
                        const seedRevText = seeds[dateKey] || '';
                        const seedP = parseRevText(seedRevText);

                        const baseObj: any = {
                            slno_ui: idx + 1,
                            receivedOn: row.receivedOn || row.receivedon,
                            DateStr: dObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                            TimeStr: dObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
                            DateTimeStr: `${dObj.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${dObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`,
                            DeviceId: row.deviceid || row.deviceId,
                            DeviceName: row.alias || row.deviceid,
                            Location: row.location || '-',
                            RawData: revTextStr,
                            Status: p.STATUS || p.status || 'UNKNOWN'
                        };

                        // Dynamically map values based on Device Parameters!
                        deviceParams.forEach(dp => {
                            // Extract numeric values from payload tag dynamically (case insensitive)
                            const upperTag = (dp.api_rev_tag || '').toUpperCase();
                            let val = p[upperTag] !== undefined ? p[upperTag] : 0;

                            // Apply daily commutative sum offset if 'Sum' or explicitly for People Count ('IN'/'OUT') tags
                            if (dp.valuefactor === 'Sum' || dp.ValueFactor === 'Sum' || upperTag === 'IN' || upperTag === 'OUT') {
                                const seedVal = seedP[upperTag] !== undefined ? seedP[upperTag] : 0;
                                let diff = Number(val) - Number(seedVal);
                                val = Math.max(0, diff); // Prevent negative anomalies
                            }

                            // Dynamic Decimal/Number Parse Formatting logic
                            const dtype = String(dp.datatype || dp.DataType || '').toLowerCase();
                            if (dtype === 'decimal' && typeof val === 'number') {
                                let places = dp.decimalplaces != null ? dp.decimalplaces : dp.DecimalPlaces;
                                places = parseInt(places, 10);
                                places = isNaN(places) ? 2 : places;
                                val = Number(val.toFixed(places));
                            } else if (dtype === 'number' && typeof val === 'number') {
                                val = Math.round(val);
                            }

                            baseObj[dp.parametername] = val;
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
            fetchJsonHistory();
            interval = setInterval(() => { fetchTelemetry(); fetchJsonHistory(); }, 120000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRefresh]);

    useEffect(() => {
        if (!autoRefresh && selectedDevice?.value && latestData && latestData.includes(selectedDevice.value)) {
            fetchTelemetry();
            fetchJsonHistory();
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

    const formatDisplayValue = (val: any, dp: any) => {
        if (val === undefined || val === null || val === '') return '-';
        if (typeof val === 'number') {
            const dtype = String(dp.datatype || dp.DataType || '').toLowerCase();
            if (dtype === 'integer' || dtype === 'number') {
                return Math.round(val);
            } else if (dtype === 'decimal') {
                let places = dp.decimalplaces != null ? dp.decimalplaces : dp.DecimalPlaces;
                places = parseInt(places, 10);
                places = isNaN(places) ? 2 : places;
                return val.toFixed(places);
            }
        }
        return val;
    };

    const handleDownloadExcel = (tableType: 'minute' | 'raw') => {
        let headers: string[] = [];
        let exportData: any[] = [];
        const activeData = tableType === 'minute' ? sortedMinuteData : sortedRawData;

        if (tableType === 'minute') {
            headers = ["Sl No", "Date", "Time", "Device Name", ...deviceParams.map(dp => dp.labelname || dp.parametername)];
            exportData = activeData.map(d => [
                d.slno_ui, d.DateStr, d.TimeStr, d.DeviceName,
                ...deviceParams.map(dp => formatDisplayValue(d[dp.parametername], dp))
            ]);
        } else {
            headers = ["Sl No", "DateTime", "Device Id", "Location", "Raw Data (revText)"];
            exportData = activeData.map(d => [
                d.slno_ui, d.DateTimeStr, d.DeviceId, d.Location, d.RawData
            ]);
        }

        const ws = XLSX.utils.aoa_to_sheet([headers, ...exportData]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Telemetry");
        XLSX.writeFile(wb, `${tableType}_telemetry_${new Date().getTime()}.xlsx`);
    };

    const sortedMinuteData = React.useMemo(() => {
        let items = [...dataList].reverse();
        if (sortMinute) {
            items.sort((a, b) => {
                const aVal = a[sortMinute.key];
                const bVal = b[sortMinute.key];
                if (aVal < bVal) return sortMinute.dir === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortMinute.dir === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [dataList, sortMinute]);

    const sortedRawData = React.useMemo(() => {
        let items = [...dataList].reverse();
        if (sortRaw) {
            items.sort((a, b) => {
                const aVal = a[sortRaw.key];
                const bVal = b[sortRaw.key];
                if (aVal < bVal) return sortRaw.dir === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortRaw.dir === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return items;
    }, [dataList, sortRaw]);

    const pageMinuteData = sortedMinuteData.slice(pageMinute * rowsMinute, (pageMinute + 1) * rowsMinute);
    const pageRawData = sortedRawData.slice(pageRaw * rowsRaw, (pageRaw + 1) * rowsRaw);

    const handleSortToggle = (key: string, type: 'minute' | 'raw') => {
        if (type === 'minute') {
            setSortMinute(prev => prev?.key === key && prev.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: 'asc' });
        } else {
            setSortRaw(prev => prev?.key === key && prev.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: 'asc' });
        }
    };

    const SortIcon = ({ colKey, config }: { colKey: string, config: any }) => {
        if (!config || config.key !== colKey) return <div className="w-3.5 opacity-0 group-hover:opacity-40 transition-opacity"><ChevronDown size={14} /></div>;
        return config.dir === 'asc' ? <ChevronUp size={14} className="text-teal-500" /> : <ChevronDown size={14} className="text-teal-500" />;
    };

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
                        Data Filter
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
                                    <option value={1000000}>No Limit</option>
                                </select>
                            </div>

                            <button
                                onClick={() => { fetchTelemetry(); fetchJsonHistory(); }}
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
                        Dashboard
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
                            <Legend verticalAlign="top" height={40} iconType="plainline" onClick={(e: any) => toggleVisibility(e.dataKey)} wrapperStyle={{ cursor: 'pointer', userSelect: 'none' }} />

                            {/* Dynamically push ALL mapped parameters onto the active line chart */}
                            {deviceParams.map(dp => (
                                <Line
                                    key={dp.parametername}
                                    type="monotone"
                                    dataKey={dp.parametername}
                                    name={`${dp.labelname || dp.parametername} ${dp.unit ? `(${dp.unit})` : ''}`}
                                    stroke={visibleParams[dp.parametername] ? (dp.color || '#6366f1') : '#cbd5e1'}
                                    strokeWidth={visibleParams[dp.parametername] ? 2 : 0}
                                    dot={false}
                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                    hide={!visibleParams[dp.parametername]}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* MINUTE DATA TABLE */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6 flex flex-col pt-4 px-6 pb-6">
                <div 
                    className={`flex items-center justify-between mb-4 cursor-pointer hover:text-indigo-600 transition-colors ${!isMinuteDataOpen ? 'mb-0 pb-0' : ''}`}
                    onClick={() => setIsMinuteDataOpen(!isMinuteDataOpen)}
                >
                    <h3 className="text-xl font-bold text-slate-800">Minute Data ({dataList.length} rows)</h3>
                    <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                        <div className="relative">
                            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" placeholder="Search minute data..." className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none focus:border-indigo-500" />
                        </div>
                        <button onClick={() => handleDownloadExcel('minute')} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-semibold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors border border-emerald-100">
                            <Download size={14} /> Download Excel
                        </button>
                        <div className="bg-slate-100 p-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer ml-2" onClick={() => setIsMinuteDataOpen(!isMinuteDataOpen)}>
                            {isMinuteDataOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                    </div>
                </div>

                {isMinuteDataOpen && (
                    <>
                        <div className="overflow-x-auto w-full border border-slate-100 rounded-xl mb-4">
                    <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                            <tr>
                                <th onClick={() => handleSortToggle('slno_ui', 'minute')} className="px-4 py-4 cursor-pointer select-none group hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">Sl No <SortIcon colKey="slno_ui" config={sortMinute} /></div>
                                </th>
                                <th onClick={() => handleSortToggle('DateStr', 'minute')} className="px-4 py-4 cursor-pointer select-none group hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">Date <SortIcon colKey="DateStr" config={sortMinute} /></div>
                                </th>
                                <th onClick={() => handleSortToggle('TimeStr', 'minute')} className="px-4 py-4 cursor-pointer select-none group hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">Time <SortIcon colKey="TimeStr" config={sortMinute} /></div>
                                </th>
                                <th onClick={() => handleSortToggle('DeviceName', 'minute')} className="px-4 py-4 text-sky-500 cursor-pointer select-none group hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">Device Name <SortIcon colKey="DeviceName" config={sortMinute} /></div>
                                </th>
                                {/* Dynamic Table Columns */}
                                {deviceParams.map(dp => (
                                    <th key={dp.parametername} onClick={() => handleSortToggle(dp.parametername, 'minute')} className="px-4 py-4 cursor-pointer select-none group hover:bg-slate-100 transition-colors" style={{ color: dp.color || '#475569' }}>
                                        <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">{dp.labelname || dp.parametername} <SortIcon colKey={dp.parametername} config={sortMinute} /></div>
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
                                                formatDisplayValue(d[dp.parametername], dp)
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
                    <div className="flex items-center gap-1.5 md:gap-4">
                        <button onClick={() => setPageMinute(0)} disabled={pageMinute === 0} className="hover:text-indigo-600 disabled:opacity-30"><ChevronsLeft size={16} /></button>
                        <button onClick={() => setPageMinute(p => Math.max(0, p - 1))} disabled={pageMinute === 0} className="hover:text-indigo-600 disabled:opacity-30"><ArrowLeft size={16} /></button>
                        <span className="font-semibold text-slate-700">Page {pageMinute + 1} of {Math.ceil(sortedMinuteData.length / rowsMinute) || 1}</span>
                        <button onClick={() => setPageMinute(p => Math.min(Math.ceil(sortedMinuteData.length / rowsMinute) - 1, p + 1))} disabled={pageMinute >= Math.ceil(sortedMinuteData.length / rowsMinute) - 1} className="hover:text-indigo-600 disabled:opacity-30"><ArrowRight size={16} /></button>
                        <button onClick={() => setPageMinute(Math.max(0, Math.ceil(sortedMinuteData.length / rowsMinute) - 1))} disabled={pageMinute >= Math.ceil(sortedMinuteData.length / rowsMinute) - 1} className="hover:text-indigo-600 disabled:opacity-30"><ChevronsRight size={16} /></button>
                    </div>
                </div>
                </>
                )}
            </div>

            {/* DB DATA (RAW STRING) TABLE */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col pt-4 px-6 pb-6 mb-6">
                <div 
                    className={`flex items-center justify-between mb-4 cursor-pointer hover:text-indigo-600 transition-colors ${!isRawDataOpen ? 'mb-0 pb-0' : ''}`}
                    onClick={() => setIsRawDataOpen(!isRawDataOpen)}
                >
                    <h3 className="text-xl font-bold text-slate-800">DB Data (Raw String) ({dataList.length} rows)</h3>
                    <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                        <div className="relative">
                            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" placeholder="Search raw data..." className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none focus:border-indigo-500" />
                        </div>
                        <button onClick={() => handleDownloadExcel('raw')} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-semibold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors border border-emerald-100">
                            <Download size={14} /> Download Excel
                        </button>
                        <div className="bg-slate-100 p-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer ml-2" onClick={() => setIsRawDataOpen(!isRawDataOpen)}>
                            {isRawDataOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                    </div>
                </div>

                {isRawDataOpen && (
                    <>
                    <div className="overflow-x-auto w-full border border-slate-100 rounded-xl mb-4">
                        <table className="w-full text-left text-sm text-slate-600 whitespace-nowrap">
                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs border-b border-slate-100">
                            <tr>
                                <th onClick={() => handleSortToggle('slno_ui', 'raw')} className="px-5 py-4 w-20 cursor-pointer select-none group hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">Sl No <SortIcon colKey="slno_ui" config={sortRaw} /></div>
                                </th>
                                <th onClick={() => handleSortToggle('DateTimeStr', 'raw')} className="px-5 py-4 w-48 cursor-pointer select-none group hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">DateTime <SortIcon colKey="DateTimeStr" config={sortRaw} /></div>
                                </th>
                                <th onClick={() => handleSortToggle('DeviceId', 'raw')} className="px-5 py-4 w-48 cursor-pointer select-none group hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">Device Id <SortIcon colKey="DeviceId" config={sortRaw} /></div>
                                </th>
                                <th onClick={() => handleSortToggle('Location', 'raw')} className="px-5 py-4 w-48 cursor-pointer select-none group hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">Location <SortIcon colKey="Location" config={sortRaw} /></div>
                                </th>
                                <th onClick={() => handleSortToggle('RawData', 'raw')} className="px-5 py-4 cursor-pointer select-none group hover:bg-slate-100 transition-colors">
                                    <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">Raw Data (revText) <SortIcon colKey="RawData" config={sortRaw} /></div>
                                </th>
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
                    <div className="flex items-center gap-1.5 md:gap-4">
                        <button onClick={() => setPageRaw(0)} disabled={pageRaw === 0} className="hover:text-indigo-600 disabled:opacity-30"><ChevronsLeft size={16} /></button>
                        <button onClick={() => setPageRaw(p => Math.max(0, p - 1))} disabled={pageRaw === 0} className="hover:text-indigo-600 disabled:opacity-30"><ArrowLeft size={16} /></button>
                        <span className="font-semibold text-slate-700">Page {pageRaw + 1} of {Math.ceil(sortedRawData.length / rowsRaw) || 1}</span>
                        <button onClick={() => setPageRaw(p => Math.min(Math.ceil(sortedRawData.length / rowsRaw) - 1, p + 1))} disabled={pageRaw >= Math.ceil(sortedRawData.length / rowsRaw) - 1} className="hover:text-indigo-600 disabled:opacity-30"><ArrowRight size={16} /></button>
                        <button onClick={() => setPageRaw(Math.max(0, Math.ceil(sortedRawData.length / rowsRaw) - 1))} disabled={pageRaw >= Math.ceil(sortedRawData.length / rowsRaw) - 1} className="hover:text-indigo-600 disabled:opacity-30"><ChevronsRight size={16} /></button>
                    </div>
                </div>
                </>
                )}
            </div>

            {/* JSON TRANSMISSION HISTORY */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6 flex flex-col pt-4 px-6 pb-6">
                <div 
                    className={`flex items-center justify-between mb-4 cursor-pointer hover:text-indigo-600 transition-colors ${!isJsonDataOpen ? 'mb-0 pb-0' : ''}`}
                    onClick={() => setIsJsonDataOpen(!isJsonDataOpen)}
                >
                    <h3 className="text-xl font-bold flex items-center gap-2 text-indigo-900"><FileJson className="text-indigo-500" size={24} /> Scheduled JSON Output Matrix</h3>
                    <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
                        {jsonLoading && <span className="text-sm font-semibold tracking-wide text-indigo-500 animate-pulse flex items-center pr-4">Decoding Payloads...</span>}
                        <div className="bg-slate-100 p-1 rounded-full text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition-colors cursor-pointer ml-2" onClick={() => setIsJsonDataOpen(!isJsonDataOpen)}>
                            {isJsonDataOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                    </div>
                </div>
                {isJsonDataOpen && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden w-full bg-slate-50 min-h-[400px]">
                    <DataTable 
                         columns={jsonColumns} 
                         data={jsonHistoryLogs} 
                         searchPlaceholder="Search decrypted payload objects..." 
                    />
                </div>
                )}
            </div>

        </div>
    );
}
