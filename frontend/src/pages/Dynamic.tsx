import React, { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import html2canvas from 'html2canvas';
import { Filter, Download, Building2, Cpu, Activity, BarChart3, PieChart as PieIcon, DivideCircle, Edit3, Type, Calculator, ShieldAlert } from 'lucide-react';
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
    const [selectedParam, setSelectedParam] = useState<string>('');

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
            setSelectedParam('');
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
            if (!unionArr.includes(selectedParam) && unionArr.length > 0) {
                setSelectedParam(unionArr[0]);
            } else if (unionArr.length === 0) {
                setSelectedParam('');
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
        if (selectedDevices.length === 0 || !selectedParam) {
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

            responses.forEach(result => {
                if (result.status === 'fulfilled' && result.value.payload?.status === 'success') {
                    const devConfig = result.value.deviceConf;
                    const rawRecords = result.value.payload.data || [];
                    const seeds = result.value.payload.day_seeds || {};
                    const myParams = deviceParamsCache[devConfig.value] || [];

                    // Find the exact parameter mapping metadata for this device (Decimal bounds, Sum factors)
                    const mapping = myParams.find(p => p.parametername === selectedParam);
                    if (!mapping) return; // This device doesn't have this param mapped, ignore it.

                    const upperTag = (mapping.api_rev_tag || '').toUpperCase();
                    const isSumMetric = mapping.valuefactor === 'Sum' || mapping.ValueFactor === 'Sum' || upperTag === 'IN' || upperTag === 'OUT';

                    const dtype = mapping.datatype || mapping.DataType;
                    const decimalPlaces = mapping.decimalplaces !== undefined ? mapping.decimalplaces : (mapping.DecimalPlaces !== undefined ? mapping.DecimalPlaces : 2);

                    rawRecords.reverse().forEach((row: any) => {
                        const rText = row.revText || row.revtext || '';
                        const parsed = parseRevText(rText);

                        const dObj = new Date(row.receivedOn || row.receivedon);
                        const pad = (n: number) => String(n).padStart(2, '0');
                        // Grouping key: DD-MM-YYYY HH:mm
                        const timeKey = `${pad(dObj.getDate())}/${pad(dObj.getMonth() + 1)} ${pad(dObj.getHours())}:${pad(dObj.getMinutes())}`;

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

                            if (!timelineMap[timeKey]) {
                                timelineMap[timeKey] = { TimeStr: timeKey };
                            }
                            // Insert parsed value locked to the device's exact label for Recharts `<Line dataKey="LABEL">` logic
                            timelineMap[timeKey][devConfig.label] = val;
                        }
                    });
                }
            });

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
                    selectedDevices.forEach(dConf => {
                        const lbl = dConf.label;
                        if (smoothed[i - 1][lbl] !== undefined && smoothed[i][lbl] !== undefined && smoothed[i + 1][lbl] !== undefined) {
                            const avgTrio = (Number(smoothed[i - 1][lbl]) + Number(smoothed[i][lbl]) + Number(smoothed[i + 1][lbl])) / 3;
                            smoothed[i][lbl] = Number(avgTrio.toFixed(2));
                        }
                    });
                }
                merged = smoothed;
            }

            setMergedData(merged);

            // 5. Compute Global Global Statistical Overview Engine
            let gMax = -Infinity;
            let gMin = Infinity;
            let gSum = 0;
            let gCount = 0;
            let gPeakStr = '-';

            merged.forEach(row => {
                selectedDevices.forEach(dConf => {
                    const vl = row[dConf.label];
                    if (typeof vl === 'number') {
                        if (vl > gMax) { gMax = vl; gPeakStr = dConf.label; }
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
        selectedDevices.forEach(dConf => {
            const lbl = dConf.label;
            let sum = 0;
            let count = 0;
            mergedData.forEach(row => {
                if (typeof row[lbl] === 'number') { sum += row[lbl]; count++; }
            });
            if (count > 0) {
                result.push({ name: lbl, value: Number((sum / count).toFixed(2)) });
            }
        });
        return result;
    }, [mergedData, selectedDevices]);

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

    const selectStyles = {
        control: (base: any) => ({ ...base, borderColor: '#e2e8f0', borderRadius: '0.5rem', minHeight: '38px', boxShadow: 'none', backgroundColor: '#f8fafc', '&:hover': { borderColor: '#cbd5e1' } }),
        menu: (base: any, state: any) => ({ ...base, zIndex: 9999 }),
        multiValue: (base: any) => ({ ...base, backgroundColor: '#e0e7ff', borderRadius: '4px' }),
        multiValueLabel: (base: any) => ({ ...base, color: '#3730a3', fontWeight: 'bold' }),
    };

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] overflow-y-auto px-2 md:px-6 pb-20 w-full animation-fade-in bg-slate-50/50">

            {/* HEADER BUILDER PANEL */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6 flex flex-col pt-4 px-6 pb-6">
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

                    <div className="flex flex-col gap-1.5 w-full">
                        <label className="text-xs font-bold tracking-wide text-slate-500 uppercase flex items-center gap-1.5"><Activity size={12} /> Analysis Parameter</label>
                        <select
                            value={selectedParam}
                            onChange={e => setSelectedParam(e.target.value)}
                            disabled={availableParams.length === 0}
                            className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-slate-50 outline-none focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-100 font-semibold h-[38px] cursor-pointer"
                        >
                            <option value="">{availableParams.length > 0 ? "Select Parameter..." : "Awaiting Devices..."}</option>
                            {availableParams.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
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
                            disabled={loading || selectedDevices.length === 0 || !selectedParam}
                            className="w-full bg-gradient-to-r from-indigo-600 to-indigo-800 hover:from-indigo-500 hover:to-indigo-700 text-white font-bold px-6 py-2 rounded-lg flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50 disabled:cursor-not-allowed h-[38px]"
                        >
                            <Calculator size={16} className={loading ? 'animate-spin' : ''} /> {loading ? 'Compiling Matrices...' : 'Compile Analytics'}
                        </button>
                    </div>
                </div>
            </div>

            {/* DYNAMIC RENDERING PANEL */}
            {mergedData.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col mb-6" ref={chartRef}>
                    
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
                                    {selectedDevices.map((d, i) => (
                                        <Line key={d.value} type="monotone" dataKey={d.label} stroke={COLORS[i % COLORS.length]} strokeWidth={3} dot={false} activeDot={{ r: 6, strokeWidth: 0 }} />
                                    ))}
                                </LineChart>
                            ) : chartType === 'bar' ? (
                                <BarChart data={mergedData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="TimeStr" minTickGap={30} tick={{ fontSize: 11, fill: '#64748b' }} angle={-15} textAnchor={"end"} dy={10} />
                                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} />
                                    <Legend verticalAlign="top" height={40} />
                                    {selectedDevices.map((d, i) => {
                                        const tFloat = parseFloat(heatmapThreshold);
                                        const useHeat = !isNaN(tFloat);
                                        return (
                                            <Bar key={d.value} dataKey={d.label} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={60}>
                                                {mergedData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={useHeat && entry[d.label] >= tFloat ? '#ef4444' : COLORS[i % COLORS.length]} />
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
                                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                                        labelLine={true}
                                        paddingAngle={chartType === 'donut' ? 4 : 0}
                                    >
                                        {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(255,255,255,0.5)" strokeWidth={2} />
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
            )}
        </div>
    );
}
