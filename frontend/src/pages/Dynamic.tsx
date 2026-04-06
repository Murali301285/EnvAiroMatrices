import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import html2canvas from 'html2canvas';
import { Filter, Download, Building2, Cpu, Activity, BarChart3, PieChart as PieIcon, DivideCircle, Edit3, Calculator, ShieldAlert, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight, ArrowLeft, ArrowRight, Search } from 'lucide-react';

const SortIcon = ({ colKey, config }: { colKey: string, config: any }) => {
    if (config?.key === colKey) {
        return config.dir === 'asc' ? <ChevronUp size={14} className="text-indigo-600" /> : <ChevronDown size={14} className="text-indigo-600" />;
    }
    return <ChevronDown size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
};
import Select from 'react-select';
import { toast } from '../utils/toast';

const COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#10b981', '#3b82f6'];

export default function Dynamic() {
    // ---------------------------------------------------------
    // 1. FILTER CONTROLS STATE
    // ---------------------------------------------------------
    const [allDevices, setAllDevices] = useState<any[]>([]);
    const [selectedCompany, setSelectedCompany] = useState<any>(null);
    const [selectedDevices, setSelectedDevices] = useState<any[]>([]);

    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [limit, setLimit] = useState<number>(1000);

    // Dynamic Parameter Discovery Cache Map: { device_id: [{ parametername, ValueFactor... }] }
    const [deviceParamsCache, setDeviceParamsCache] = useState<Record<string, any[]>>({});
    // Discovered Unified Parameters list
    const [availableParams, setAvailableParams] = useState<string[]>([]);
    const [selectedParams, setSelectedParams] = useState<any[]>([]);
    const [activeLines, setActiveLines] = useState<{key: string, color: string}[]>([]);

    // ---------------------------------------------------------
    // 2. CHART CONFIGURATION & ANALYTICS STATE
    // ---------------------------------------------------------
    const [chartType, setChartType] = useState<'line' | 'bar' | 'pie' | 'donut'>('line');
    const [chartTitle, setChartTitle] = useState('Dynamic Comparison Analytics');
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    
    // Dynamic Enhancements
    const [enableSmoothing, setEnableSmoothing] = useState(false);
    const [heatmapThreshold, setHeatmapThreshold] = useState<string>('');

    // Native Component Data State
    const [mergedData, setMergedData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const chartRef = useRef<HTMLDivElement>(null);

    // Stats
    const [stats, setStats] = useState<{ min: number, max: number, avg: number, peakDevice: string }>({ min: 0, max: 0, avg: 0, peakDevice: '-' });

    // ---------------------------------------------------------
    // INITIALIZATION hooks
    // ---------------------------------------------------------
    useEffect(() => {
        axios.get(`http://${window.location.hostname}:8381/api/dashboard/devices`)
            .then(res => {
                if (res.data?.data) {
                    setAllDevices(res.data.data);
                }
            }).catch(console.error);

        // Date bounds (Today)
        const today = new Date();
        const y_start = new Date(today.setHours(0, 0, 0, 0));
        const y_end = new Date(today.setHours(23, 59, 59, 999));

        const pad = (n: number) => n.toString().padStart(2, '0');
        const formatLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

        setFromDate(formatLocal(y_start));
        setToDate(formatLocal(y_end));
    }, []);

    // Select Menus Definitions
    const companyOptions = Array.from(new Set(allDevices.map(d => d.customer_code).filter(Boolean))).map(c => ({ value: c, label: c as string }));
    const filteredDeviceOptions = allDevices
        .filter(d => !selectedCompany || d.customer_code === selectedCompany.value)
        .map(d => ({ value: d.deviceid, label: `${d.deviceid} - ${d.alias || 'Unknown'}` }));

    // ---------------------------------------------------------
    // EXTRACT UNIFIED PARAMETERS ON DEVICE SELECTION
    // ---------------------------------------------------------
    useEffect(() => {
        if (selectedDevices.length === 0) {
            setAvailableParams([]);
            setSelectedParams([]);
            return;
        }

        const fetchMissingParams = async () => {
            const cacheUpdates = { ...deviceParamsCache };
            let hasNewFetches = false;

            for (const dev of selectedDevices) {
                if (!cacheUpdates[dev.value]) {
                    try {
                        const res = await axios.get(`http://${window.location.hostname}:8381/api/dashboard/devices/${dev.value}/params`);
                        if (res.data?.status === 'success') {
                            const params = res.data.data || [];
                            const sIdx = params.findIndex((p: any) => String(p.parametername).toUpperCase() === 'STATUS');
                            if (sIdx > -1) params.push(params.splice(sIdx, 1)[0]);
                            cacheUpdates[dev.value] = params;
                            hasNewFetches = true;
                        }
                    } catch (e) { console.error("Param fetch failed", e); }
                }
            }

            if (hasNewFetches) {
                setDeviceParamsCache(cacheUpdates);
            }

            // Mathematically compute the UNION of all mapped param names across selected devices
            const paramUnion = new Set<string>();
            selectedDevices.forEach(d => {
                const pms = cacheUpdates[d.value] || [];
                pms.forEach((p: any) => paramUnion.add(p.parametername));
            });

            const unionArr = Array.from(paramUnion).sort();
            setAvailableParams(unionArr);

            // Auto-select param if previously selected is invalid or empty
            const currentSelectedStr = selectedParams.map((p: any) => p.value);
            const validSelections = currentSelectedStr.filter((s: string) => unionArr.includes(s));
            
            if (validSelections.length === 0 && unionArr.length > 0) {
                setSelectedParams([{ value: unionArr[0], label: unionArr[0] }]);
            } else if (unionArr.length === 0) {
                setSelectedParams([]);
            } else if (validSelections.length !== currentSelectedStr.length) {
                setSelectedParams(validSelections.map((v: string) => ({ value: v, label: v })));
            }
        };

        fetchMissingParams();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedDevices]);

    // ---------------------------------------------------------
    // MULTI-FETCH ANALYTICS CORE ALGORITHM
    // ---------------------------------------------------------
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

    const runAnalytics = async () => {
        if (selectedDevices.length === 0 || selectedParams.length === 0) {
            toast.error("Please select devices and a parameter to compare.");
            return;
        }

        setLoading(true);
        try {
            // 1. Boot Parallel Axial Calls mapped over every Device UUID simultaneously
            const promises = selectedDevices.map(deviceConf => {
                let url = `http://${window.location.hostname}:8381/api/dashboard/telemetry?limit=${limit}&device_id=${encodeURIComponent(deviceConf.value)}`;
                if (fromDate) url += `&from_date=${encodeURIComponent(fromDate.replace('T', ' ') + ':00')}`;
                if (toDate) url += `&to_date=${encodeURIComponent(toDate.replace('T', ' ') + ':59')}`;
                return axios.get(url).then(res => ({ deviceConf, payload: res.data }));
            });

            const responses = await Promise.allSettled(promises);

            // 2. Structuring Algorithm (Grouping points by EXACT normalized minute)
            // { '14:05': { TimeStr: '14:05', 'DevA': 400, 'DevB': 300 } }
            const timelineMap: Record<string, any> = {};
            const paramLabels = selectedParams.map((p: any) => p.value);
            const lineTracker = new Map<string, string>(); // mappedKey -> color string

            responses.forEach(result => {
                if (result.status === 'fulfilled' && result.value.payload?.status === 'success') {
                    const devConfig = result.value.deviceConf;
                    const rawRecords = result.value.payload.data || [];
                    const seeds = result.value.payload.day_seeds || {};
                    const myParams = deviceParamsCache[devConfig.value] || [];

                    const reversedRecords = [...rawRecords].reverse();

                    reversedRecords.forEach((row: any) => {
                        const rText = row.revText || row.revtext || '';
                        const parsed = parseRevText(rText);

                        const dObj = new Date(row.receivedOn || row.receivedon);
                        const pad = (n: number) => String(n).padStart(2, '0');
                        // Grouping key: DD-MM-YYYY HH:mm
                        const timeKey = `${pad(dObj.getDate())}/${pad(dObj.getMonth() + 1)} ${pad(dObj.getHours())}:${pad(dObj.getMinutes())}`;

                        if (!timelineMap[timeKey]) {
                            timelineMap[timeKey] = { TimeStr: timeKey };
                        }

                        paramLabels.forEach(sParam => {
                            const mapping = myParams.find(p => p.parametername === sParam);
                            if (!mapping) return; // This device doesn't have this param mapped, ignore it.

                            const upperTag = (mapping.api_rev_tag || '').toUpperCase();
                            const isSumMetric = mapping.valuefactor === 'Sum' || mapping.ValueFactor === 'Sum' || upperTag === 'IN' || upperTag === 'OUT';

                            const dtype = mapping.datatype || mapping.DataType;
                            const decimalPlaces = mapping.decimalplaces !== undefined ? mapping.decimalplaces : (mapping.DecimalPlaces !== undefined ? mapping.DecimalPlaces : 2);

                            let val = parsed[upperTag] !== undefined ? parsed[upperTag] : null;

                            if (val !== null) {
                                if (isSumMetric) {
                                    const seedDateKey = `${dObj.getFullYear()}-${pad(dObj.getMonth() + 1)}-${pad(dObj.getDate())}`;
                                    const seedRev = seeds[seedDateKey] || '';
                                    const seedParsed = parseRevText(seedRev);
                                    const seedVal = seedParsed[upperTag] !== undefined ? seedParsed[upperTag] : 0;
                                    val = Math.max(0, Number(val) - Number(seedVal));
                                }

                                if (dtype === 'Decimal' && typeof val === 'number') {
                                    val = Number(val.toFixed(decimalPlaces));
                                } else if (dtype === 'Number' && typeof val === 'number') {
                                    val = Math.round(val);
                                }

                                // If both Multi-Device and Multi-Param are active, generate a composite label securely
                                const mappedKey = (selectedDevices.length > 1 && paramLabels.length > 1) 
                                                  ? `${devConfig.label} (${sParam})` 
                                                  : (paramLabels.length > 1 ? sParam : devConfig.label);
                                                  
                                timelineMap[timeKey][mappedKey] = val;
                                
                                if (!lineTracker.has(mappedKey)) {
                                    lineTracker.set(mappedKey, mapping.color || mapping.Color || COLORS[lineTracker.size % COLORS.length]);
                                }
                            }
                        });
                    });
                }
            });

            // Sync Active Lines to State
            const lines = Array.from(lineTracker.entries()).map(([k, c]) => ({ key: k, color: c }));
            setActiveLines(lines);

            // 3. Time Map arrayification and sorting
            let merged = Object.values(timelineMap);
            // Sort chronologically (assuming DD/MM HH:mm structure within same year context)
            merged.sort((a, b) => {
                // Parse "DD/MM HH:mm" back to a uniform timestamp for strict ordering comparison
                const pa = a.TimeStr.split(' ');
                const pb = b.TimeStr.split(' ');
                const dta = pa[0].split('/');
                const dtb = pb[0].split('/');
                const minA = new Date(2024, Number(dta[1]) - 1, Number(dta[0]), Number(pa[1].split(':')[0]), Number(pa[1].split(':')[1])).getTime();
                const minB = new Date(2024, Number(dtb[1]) - 1, Number(dtb[0]), Number(pb[1].split(':')[0]), Number(pb[1].split(':')[1])).getTime();
                return minA - minB;
            });

            // 4. Data Smoothing Implementation (3-Point Rolling Average Curve dynamically)
            if (enableSmoothing && merged.length > 2) {
                const smoothed = [...merged];
                for (let i = 1; i < smoothed.length - 1; i++) {
                    lines.forEach(lDef => {
                        const lbl = lDef.key;
                        if (smoothed[i - 1][lbl] !== undefined && smoothed[i][lbl] !== undefined && smoothed[i + 1][lbl] !== undefined) {
                            const avgTrio = (Number(smoothed[i - 1][lbl]) + Number(smoothed[i][lbl]) + Number(smoothed[i + 1][lbl])) / 3;
                            smoothed[i][lbl] = Number(avgTrio.toFixed(2));
                        }
                    });
                }
                merged = smoothed;
            }

            setMergedData(merged);

            // 5. Compute Global Statistical Overview Engine
            let gMax = -Infinity;
            let gMin = Infinity;
            let gSum = 0;
            let gCount = 0;
            let gPeakStr = '-';

            merged.forEach(row => {
                lines.forEach(lDef => {
                    const vl = row[lDef.key];
                    if (typeof vl === 'number') {
                        if (vl > gMax) { gMax = vl; gPeakStr = lDef.key; }
                        if (vl < gMin) gMin = vl;
                        gSum += vl;
                        gCount++;
                    }
                });
            });

            setStats({
                max: gMax === -Infinity ? 0 : gMax,
                min: gMin === Infinity ? 0 : gMin,
                avg: gCount > 0 ? Number((gSum / gCount).toFixed(2)) : 0,
                peakDevice: gPeakStr
            });

            toast.success("Analytics Computed Dynamically.");

        } catch (e) {
            console.error(e);
            toast.error("Analytics computation failed.");
        } finally {
            setLoading(false);
        }
    };

    // ---------------------------------------------------------
    // PIE/DONUT Data Reducer logic
    // ---------------------------------------------------------
    // For comparing totals/averages via Pie natively
    const pieData = useMemo(() => {
        if (!mergedData.length) return [];
        const result: any[] = [];
        activeLines.forEach(lDef => {
            const lbl = lDef.key;
            let sum = 0;
            let count = 0;
            mergedData.forEach(row => {
                if (typeof row[lbl] === 'number') { sum += row[lbl]; count++; }
            });
            if (count > 0) {
                result.push({ name: lbl, value: Number((sum / count).toFixed(2)), color: lDef.color });
            }
        });
        return result;
    }, [mergedData, activeLines]);

    // Export Helper
    const downloadAnalytics = async () => {
        if (chartRef.current) {
            const canvas = await html2canvas(chartRef.current, { scale: 2 });
            const link = document.createElement('a');
            link.download = `${chartTitle.replace(/[^a-zA-Z0-9]/g, '_')}_Analytics.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }
    };

    // ---------------------------------------------------------
    // DYNAMIC DATA TABLE STATE & SORTING
    // ---------------------------------------------------------
    const [pageTable, setPageTable] = useState(0);
    const [rowsTable, setRowsTable] = useState(10);
    const [sortTable, setSortTable] = useState<{ key: string, dir: 'asc' | 'desc' } | null>(null);
    const [searchTable, setSearchTable] = useState('');

    const handleSortToggle = (key: string) => {
        setSortTable(prev => prev?.key === key && prev.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: 'asc' });
    };

    const sortedMergedData = useMemo(() => {
        let result = [...mergedData];
        if (searchTable.trim()) {
            const q = searchTable.toLowerCase();
            result = result.filter(r => 
                r.TimeStr.toLowerCase().includes(q) || activeLines.some(l => String(r[l.key]).toLowerCase().includes(q))
            );
        }
        if (sortTable) {
            result.sort((a, b) => {
                const aVal = a[sortTable.key] !== undefined ? a[sortTable.key] : '';
                const bVal = b[sortTable.key] !== undefined ? b[sortTable.key] : '';
                if (aVal < bVal) return sortTable.dir === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortTable.dir === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [mergedData, searchTable, sortTable, activeLines]);

    const pageTableData = sortedMergedData.slice(pageTable * rowsTable, (pageTable + 1) * rowsTable);

    const handleDownloadExcel = () => {
        if (!sortedMergedData.length) return;
        const keys = ['TimeStr', ...activeLines.map(l => l.key)];
        let csvContent = "data:text/csv;charset=utf-8,Sl No," + keys.join(",") + "\n";
        sortedMergedData.forEach((row, i) => {
            let rowCols = [i + 1, ...keys.map(k => `"${row[k] !== undefined ? row[k] : ''}"`)];
            csvContent += rowCols.join(",") + "\n";
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${chartTitle.replace(/[^a-zA-Z0-9]/g, '_')}_DataTable.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const selectStyles = {
        control: (base: any) => ({ ...base, borderColor: '#e2e8f0', borderRadius: '0.5rem', minHeight: '38px', boxShadow: 'none', backgroundColor: '#f8fafc', '&:hover': { borderColor: '#cbd5e1' } }),
        menu: (base: any, _state: any) => ({ ...base, zIndex: 9999 }),
        multiValue: (base: any) => ({ ...base, backgroundColor: '#e0e7ff', borderRadius: '4px' }),
        multiValueLabel: (base: any) => ({ ...base, color: '#3730a3', fontWeight: 'bold' }),
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-y-auto px-2 md:px-6 pb-20 w-full animation-fade-in bg-slate-50/50">

            {/* HEADER BUILDER PANEL */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6 flex flex-col pt-4 px-6 pb-6 shrink-0">
                <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                    <Filter className="text-indigo-500" size={18} />
                    <h2 className="text-lg font-bold text-slate-800 tracking-tight">Dynamic Analytics Builder</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                    
                    {/* Filter Segment 1 */}
                    <div className="flex flex-col gap-1.5 w-full">
                        <label className="text-xs font-bold tracking-wide text-slate-500 uppercase flex items-center gap-1.5"><Building2 size={12} /> Limit Company</label>
                        <Select options={companyOptions} value={selectedCompany} onChange={(val) => { setSelectedCompany(val); setSelectedDevices([]); }} placeholder="All Companies" isClearable styles={selectStyles} />
                    </div>

                    {/* Filter Segment 2 - Multi Select */}
                    <div className="flex flex-col gap-1.5 w-full lg:col-span-2 relative z-50">
                        <label className="text-xs font-bold tracking-wide text-slate-500 uppercase flex items-center gap-1.5"><Cpu size={12} /> Target Devices (Multi-Select Comparison)</label>
                        <Select isMulti options={filteredDeviceOptions} value={selectedDevices} onChange={(val: any) => setSelectedDevices(val)} placeholder="Select Multiple Devices to Map..." isClearable styles={selectStyles} />
                    </div>

                    <div className="flex flex-col gap-1.5 w-full relative z-[45]">
                        <label className="text-xs font-bold tracking-wide text-slate-500 uppercase flex items-center gap-1.5"><Activity size={12} /> Analysis Parameter</label>
                        <Select
                            isMulti
                            options={availableParams.map(p => ({ value: p, label: p }))}
                            value={selectedParams}
                            onChange={(val: any) => setSelectedParams(val || [])}
                            isDisabled={availableParams.length === 0}
                            placeholder={availableParams.length > 0 ? "Select Parameters..." : "Awaiting Devices..."}
                            styles={{
                                control: (base: any, state: any) => ({
                                    ...base, minHeight: '38px', borderRadius: '0.5rem', borderColor: state.isFocused ? '#6366f1' : '#e2e8f0', boxShadow: state.isFocused ? '0 0 0 1px #6366f1' : 'none', '&:hover': {borderColor: '#cbd5e1'}
                                }),
                                valueContainer: (base: any) => ({ ...base, padding: '0 8px' }),
                                input: (base: any) => ({ ...base, margin: 0, padding: 0 }),
                            }}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5 w-full">
                        <label className="text-xs font-bold tracking-wide text-slate-500 uppercase">From Date</label>
                        <input type="datetime-local" value={fromDate} onChange={e => setFromDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 outline-none focus:border-indigo-500 h-[38px]" />
                    </div>
                    
                    <div className="flex flex-col gap-1.5 w-full">
                        <label className="text-xs font-bold tracking-wide text-slate-500 uppercase">To Date</label>
                        <input type="datetime-local" value={toDate} onChange={e => setToDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 outline-none focus:border-indigo-500 h-[38px]" />
                    </div>

                    <div className="flex flex-col gap-1.5 w-full">
                        <label className="text-xs font-bold tracking-wide text-slate-500 uppercase">Points Limit Phase</label>
                        <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 outline-none focus:border-indigo-500 cursor-pointer h-[38px]">
                            <option value={100}>100 Points per Trace</option>
                            <option value={500}>500 Points per Trace</option>
                            <option value={1000}>1000 Points per Trace</option>
                            <option value={5000}>5000 Points per Trace</option>
                            <option value={1000000}>No Limit</option>
                        </select>
                    </div>

                    <div className="w-full">
                        <button
                            onClick={runAnalytics}
                            disabled={loading || !selectedDevices || selectedDevices.length === 0 || !selectedParams || selectedParams.length === 0}
                            className="w-full bg-gradient-to-r from-indigo-600 to-indigo-800 hover:from-indigo-500 hover:to-indigo-700 text-white font-bold px-6 py-2 rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed h-[38px]"
                        >
                            <Calculator size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'Compiling Matrices...' : 'Compile Analytics'}
                        </button>
                    </div>
                </div>
            </div>

            {/* DYNAMIC RENDERING PANEL */}
            {mergedData.length > 0 && (
                <>
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col mb-6 shrink-0" ref={chartRef}>
                    
                    {/* Custom Title System */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div className="group relative flex items-center">
                            {isEditingTitle ? (
                                <input
                                    type="text"
                                    autoFocus
                                    onBlur={() => setIsEditingTitle(false)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingTitle(false); }}
                                    value={chartTitle}
                                    onChange={e => setChartTitle(e.target.value)}
                                    className="text-2xl font-black text-indigo-900 bg-indigo-50 border border-indigo-200 outline-none px-3 py-1 rounded w-80"
                                />
                            ) : (
                                <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => setIsEditingTitle(true)}>
                                    {chartTitle}
                                    <Edit3 size={16} className="text-slate-300 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all" />
                                </h1>
                            )}
                        </div>

                        {/* Rendering Controls Ribbon */}
                        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200" data-html2canvas-ignore>
                            <button onClick={() => setChartType('line')} className={`px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${chartType === 'line' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'}`}><Activity size={14}/> Line</button>
                            <button onClick={() => setChartType('bar')} className={`px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${chartType === 'bar' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'}`}><BarChart3 size={14}/> Bar</button>
                            <button onClick={() => setChartType('pie')} className={`px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${chartType === 'pie' ? 'bg-white text-amber-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'}`}><PieIcon size={14}/> Pie</button>
                            <button onClick={() => setChartType('donut')} className={`px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${chartType === 'donut' ? 'bg-white text-rose-500 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'}`}><DivideCircle size={14}/> Donut</button>
                        </div>
                    </div>

                    {/* Statistical Highlights Ribbon */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-html2canvas-ignore>
                        <div className="bg-sky-50 border border-sky-100 rounded-xl p-4 flex flex-col relative overflow-hidden">
                            <span className="text-sky-500 text-[10px] font-bold uppercase tracking-widest mb-1">Global Max Peak</span>
                            <span className="text-2xl font-black text-sky-900">{stats.max}</span>
                            <span className="text-xs text-sky-600/70 font-medium truncate">Caused by: {stats.peakDevice}</span>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex flex-col relative overflow-hidden">
                            <span className="text-amber-500 text-[10px] font-bold uppercase tracking-widest mb-1">Global Floor Min</span>
                            <span className="text-2xl font-black text-amber-900">{stats.min}</span>
                            <span className="text-xs text-amber-600/70 font-medium truncate">Lowest valley reading</span>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex flex-col relative overflow-hidden">
                            <span className="text-emerald-500 text-[10px] font-bold uppercase tracking-widest mb-1">Network Average</span>
                            <span className="text-2xl font-black text-emerald-900">{stats.avg}</span>
                            <span className="text-xs text-emerald-600/70 font-medium truncate">Overall stability mean</span>
                        </div>

                        {/* Additional Dynamic Control Widgets attached securely internally */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-center gap-2 relative">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer w-fit select-none bg-white border border-slate-200 px-2 py-1 rounded shadow-sm hover:border-slate-300">
                                <input type="checkbox" checked={enableSmoothing} onChange={e => { setEnableSmoothing(e.target.checked); if(mergedData.length > 0) runAnalytics(); }} className="rounded focus:ring-slate-500 text-slate-800" />
                                {enableSmoothing ? 'Smoothing Active' : 'Smooth Trace Curve'}
                            </label>
                            
                            {(chartType === 'line' || chartType === 'bar') && (
                                <div className="flex items-center gap-1.5 w-full relative">
                                    <ShieldAlert size={14} className="absolute left-2 text-rose-400" />
                                    <input 
                                        type="number" 
                                        placeholder="Heat Thr..."
                                        value={heatmapThreshold}
                                        onChange={e => setHeatmapThreshold(e.target.value)}
                                        className="pl-7 pr-2 py-1 text-xs w-full rounded border border-slate-200 focus:border-rose-400 focus:outline-none bg-white"
                                        title="Threshold bounds. Any Bar data passing this number natively highlights RED rapidly."
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RECHARTS ENGINE BLOCK */}
                    <div className="w-full h-[500px]">
                        <ResponsiveContainer width="100%" height="100%">
                            {chartType === 'line' ? (
                                <LineChart data={mergedData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="TimeStr" minTickGap={30} tick={{ fontSize: 11, fill: '#64748b' }} angle={-15} textAnchor={"end"} dy={10} />
                                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                                    <Legend verticalAlign="top" height={40} iconType="plainline" />
                                    {activeLines.map((lDef) => (
                                        <Line key={lDef.key} type="monotone" dataKey={lDef.key} stroke={lDef.color} strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                                    ))}
                                </LineChart>
                            ) : chartType === 'bar' ? (
                                <BarChart data={mergedData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="TimeStr" minTickGap={30} tick={{ fontSize: 11, fill: '#64748b' }} angle={-15} textAnchor={"end"} dy={10} />
                                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                                    <Legend verticalAlign="top" height={40} />
                                    {activeLines.map((lDef) => {
                                        const tFloat = parseFloat(heatmapThreshold);
                                        const useHeat = !isNaN(tFloat);
                                        return (
                                            <Bar key={lDef.key} dataKey={lDef.key} fill={lDef.color} radius={[4, 4, 0, 0]} maxBarSize={60}>
                                                {mergedData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={useHeat && entry[lDef.key] >= tFloat ? '#ef4444' : lDef.color} />
                                                ))}
                                            </Bar>
                                        );
                                    })}
                                </BarChart>
                            ) : (
                                // PIE & DONUT LOGIC (AVERAGES OF THE TIME SLICE)
                                <PieChart margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} formatter={(value) => [`${value} (Avg)`, 'Statistic']} />
                                    <Legend verticalAlign="bottom" height={40} />
                                    <Pie
                                        data={pieData}
                                        dataKey="value"
                                        nameKey="name"
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={160}
                                        innerRadius={chartType === 'donut' ? 100 : 0}
                                        label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                                        labelLine={true}
                                        paddingAngle={chartType === 'donut' ? 4 : 0}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} stroke="rgba(255,255,255,0.5)" strokeWidth={2} />
                                        ))}
                                    </Pie>
                                </PieChart>
                            )}
                        </ResponsiveContainer>
                    </div>

                    <div className="flex justify-end mt-4 border-t border-slate-100 pt-4" data-html2canvas-ignore>
                        <button onClick={downloadAnalytics} className="bg-slate-800 hover:bg-slate-700 text-white font-semibold py-2 px-6 rounded-lg text-sm flex items-center gap-2 transition-colors shadow-lg shadow-slate-900/10">
                            <Download size={14} /> Extract Visual (PNG)
                        </button>
                    </div>

                </div>

                {/* DYNAMIC METADATA GRID */}
                <div className="mt-8 bg-white rounded-2xl border border-slate-100 shadow-sm p-6 overflow-hidden flex flex-col shrink-0">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                        <h3 className="text-xl font-bold text-slate-800">Analysis Data Table ({sortedMergedData.length} rows)</h3>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                                <input type="text" placeholder="Search trace data..." value={searchTable} onChange={(e) => { setSearchTable(e.target.value); setPageTable(0); }} className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm w-56 focus:outline-none focus:border-indigo-500" />
                            </div>
                            <button onClick={handleDownloadExcel} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-semibold px-4 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors border border-emerald-100">
                                <Download size={14} /> Export CSV
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                <tr>
                                    <th className="px-4 py-4 font-semibold w-16">Sl No</th>
                                    <th onClick={() => handleSortToggle('TimeStr')} className="px-4 py-4 cursor-pointer select-none group hover:bg-slate-100 transition-colors w-40">
                                        <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">Time Record <SortIcon colKey="TimeStr" config={sortTable} /></div>
                                    </th>
                                    {activeLines.map(lDef => (
                                        <th key={lDef.key} onClick={() => handleSortToggle(lDef.key)} className="px-4 py-4 cursor-pointer select-none group hover:bg-slate-100 transition-colors" style={{ color: lDef.color }}>
                                            <div className="flex items-center gap-1.5 break-normal whitespace-nowrap">{lDef.key} <SortIcon colKey={lDef.key} config={sortTable} /></div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pageTableData.map((d, i) => (
                                    <tr key={i} className="hover:bg-indigo-50/50 transition-colors group">
                                        <td className="px-4 py-3 text-slate-500">{pageTable * rowsTable + i + 1}</td>
                                        <td className="px-4 py-3 text-slate-700 font-medium">{d.TimeStr}</td>
                                        {activeLines.map(lDef => (
                                            <td key={lDef.key} className="px-4 py-3 font-semibold" style={{ color: lDef.color }}>
                                                {d[lDef.key] !== undefined ? d[lDef.key] : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {pageTableData.length === 0 && (
                                    <tr>
                                        <td colSpan={activeLines.length + 2} className="px-4 py-12 text-center text-slate-500 bg-slate-50 border-t border-slate-100">
                                            No tracking records discovered for this boundary.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    <div className="flex items-center justify-between mt-4 text-sm px-2">
                        <select className="border border-slate-200 rounded px-2 py-1 outline-none font-medium text-slate-600 bg-white" value={rowsTable} onChange={e => { setRowsTable(Number(e.target.value)); setPageTable(0) }}>
                            <option value={10}>10 records / page</option>
                            <option value={20}>20 records / page</option>
                            <option value={50}>50 records / page</option>
                            <option value={100}>100 records / page</option>
                            <option value={mergedData.length}>All Traces</option>
                        </select>

                        <div className="flex items-center gap-4">
                            <div className="flex gap-2">
                                <button onClick={() => setPageTable(0)} disabled={pageTable === 0} className="hover:text-indigo-600 disabled:opacity-30 p-1"><ChevronsLeft size={16} /></button>
                                <button onClick={() => setPageTable(p => Math.max(0, p - 1))} disabled={pageTable === 0} className="hover:text-indigo-600 disabled:opacity-30 p-1"><ArrowLeft size={16} /></button>
                            </div>
                            <span className="font-semibold text-slate-700">Page {pageTable + 1} of {Math.ceil(sortedMergedData.length / rowsTable) || 1}</span>
                            <div className="flex gap-2">
                                <button onClick={() => setPageTable(p => Math.min(Math.ceil(sortedMergedData.length / rowsTable) - 1, p + 1))} disabled={pageTable >= Math.ceil(sortedMergedData.length / rowsTable) - 1} className="hover:text-indigo-600 disabled:opacity-30 p-1"><ArrowRight size={16} /></button>
                                <button onClick={() => setPageTable(Math.max(0, Math.ceil(sortedMergedData.length / rowsTable) - 1))} disabled={pageTable >= Math.ceil(sortedMergedData.length / rowsTable) - 1} className="hover:text-indigo-600 disabled:opacity-30 p-1"><ChevronsRight size={16} /></button>
                            </div>
                        </div>
                    </div>
                </div>
                </>
            )}
        </div>
    );
}
