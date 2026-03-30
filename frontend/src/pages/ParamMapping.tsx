import { useState, useEffect } from 'react';
import axios from 'axios';
import { Network, AlertCircle, Save } from 'lucide-react';
import { toast } from '../utils/toast';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';
import LoadingOverlay from '../components/LoadingOverlay';
import Select from 'react-select';

export default function ParamMapping() {
    const [devices, setDevices] = useState<any[]>([]);
    const [parameters, setParameters] = useState<any[]>([]);
    const [globalMappings, setGlobalMappings] = useState<any[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState("");
    const [currentInputs, setCurrentInputs] = useState<Record<number, string>>({});

    const fetchData = async () => {
        setLoading(true);
        try {
            const [devRes, paramRes, mapRes] = await Promise.all([
                axios.get('http://97.74.92.23:8381/admin/devices'),
                axios.get('http://97.74.92.23:8381/admin/parameters'),
                axios.get('http://97.74.92.23:8381/admin/param-mapping')
            ]);

            if (devRes.data?.status === 'success') setDevices(devRes.data.data || []);
            if (paramRes.data?.status === 'success') setParameters(paramRes.data.data || []);
            if (mapRes.data?.status === 'success') setGlobalMappings(mapRes.data.data || []);
        } catch (err) {
            toast.error("Network Error: Backend Offline", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // When selectedDevice changes, populate currentInputs based on globalMappings
    useEffect(() => {
        if (!selectedDevice) {
            setCurrentInputs({});
            return;
        }

        const initialInputs: Record<number, string> = {};
        const deviceMappings = globalMappings.filter(m => m.deviceid === selectedDevice);

        deviceMappings.forEach(m => {
            initialInputs[m.parameter_id] = m.api_rev_tag;
        });

        setCurrentInputs(initialInputs);
    }, [selectedDevice, globalMappings]);

    const handleInputChange = (paramId: number, val: string) => {
        setCurrentInputs(prev => ({
            ...prev,
            [paramId]: val
        }));
    };

    const handleSave = () => {
        if (!selectedDevice) {
            toast.error("Please select a device first!");
            return;
        }

        setSaving(true);
        const mappingsPayload = Object.entries(currentInputs)
            .filter(([_, val]) => val.trim() !== '')
            .map(([paramId, val]) => ({
                parameter_id: parseInt(paramId),
                api_rev_tag: val.trim()
            }));

        axios.post('http://97.74.92.23:8381/admin/param-mapping-bulk', {
            deviceid: selectedDevice,
            mappings: mappingsPayload
        }).then(res => {
            if (res.data.status === 'success') {
                toast.success("Mappings synchronized successfully!");
                fetchData();
            } else {
                toast.error("Failed to map parameters: " + res.data.message);
            }
        }).catch((err) => toast.error("Network Error", err))
            .finally(() => setSaving(false));
    };

    const deviceOptions = devices.map(d => ({
        value: d.deviceid,
        label: `${d.deviceid} (${d.customer_code})`
    }));

    // Generate columns WITHOUT useMemo so it directly captures currentInputs
    const columns: ColumnDef<any, any>[] = [
        {
            id: 'internalParam',
            header: 'Target Internal Parameter',
            accessorFn: row => `${row.parametername} ${row.labelname}`,
            cell: info => {
                const p = info.row.original;
                const hasMapping = !!currentInputs[p.slno]?.trim();
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: p.color || '#ddd' }}></div>
                        <div className="flex flex-col">
                            <span className={`font-bold ${hasMapping ? 'text-sky-800' : 'text-slate-800'}`}>{p.parametername}</span>
                            <span className="text-xs text-slate-400 font-mono uppercase truncate max-w-[200px]">
                                {p.labelname}{p.param_tag && ` (${p.param_tag})`}
                            </span>
                        </div>
                    </div>
                );
            }
        },
        {
            id: 'mappingInput',
            header: 'Physical API Revision Tag Mapping',
            enableSorting: false,
            cell: info => {
                const p = info.row.original;
                const hasMapping = !!currentInputs[p.slno]?.trim();

                return (
                    <div className="flex items-center gap-3 w-full max-w-md pl-2">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={hasMapping}
                                    onChange={(e) => handleInputChange(p.slno, e.target.checked ? (p.param_tag || p.labelname || "MAPPED") : "")}
                                    className="w-5 h-5 text-emerald-600 bg-slate-50 border-slate-300 rounded focus:ring-emerald-500 focus:ring-offset-0 transition-all cursor-pointer shadow-sm"
                                />
                            </div>
                            <span className={`text-sm font-bold transition-colors ${hasMapping ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                {hasMapping ? 'Active Tag Stream' : 'Inactive'}
                            </span>
                        </label>
                    </div>
                );
            }
        }
    ];

    return (
        <div className="flex flex-col h-full max-w-7xl mx-auto">
            {saving && <LoadingOverlay message="Synchronizing Data Matrices..." />}

            <header className="flex items-center justify-between mb-6 shrink-0 relative z-20">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-teal-50 rounded-xl text-teal-600"><Network size={20} /></span>
                        Device Parameter Mapping
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Link physical API payload tags to specific system parameter constants.</p>
                </div>
                <div className="flex items-center gap-4 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="w-72">
                        <Select
                            options={deviceOptions}
                            value={deviceOptions.find(opt => opt.value === selectedDevice) || null}
                            onChange={(selected: any) => setSelectedDevice(selected ? selected.value : '')}
                            placeholder="Type to search Target Device..."
                            isClearable
                            styles={{
                                control: (base) => ({
                                    ...base,
                                    borderColor: '#e2e8f0',
                                    borderRadius: '0.5rem',
                                    padding: '2px',
                                    boxShadow: 'none',
                                    backgroundColor: '#f8fafc',
                                    '&:hover': { borderColor: '#cbd5e1' }
                                }),
                                menu: (base) => ({
                                    ...base,
                                    zIndex: 9999
                                })
                            }}
                        />
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={!selectedDevice}
                        className="disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-semibold px-5 py-[9px] text-sm rounded-lg flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
                    >
                        <Save size={16} /> Sync Tags
                    </button>
                </div>
            </header>

            <div className="flex-1 min-h-[400px] relative z-0">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center h-full text-slate-400 bg-white rounded-3xl border border-slate-100 shadow-xl">
                        <AlertCircle size={32} className="animate-pulse text-teal-300" />
                    </div>
                ) : !selectedDevice ? (
                    <div className="flex-1 flex flex-col items-center justify-center h-full text-slate-400 p-12 text-center bg-slate-50 border border-slate-200 rounded-3xl">
                        <div className="bg-white p-6 rounded-full shadow-sm border border-slate-100 mb-6">
                            <AlertCircle size={56} className="text-slate-300" />
                        </div>
                        <p className="text-xl text-slate-600 font-bold mb-2">Target Selection Required</p>
                        <p className="text-base text-slate-500 max-w-md leading-relaxed">Search and select a device from the top right dropdown to begin tagging.</p>
                    </div>
                ) : (
                    <DataTable
                        columns={columns}
                        data={parameters}
                        exportFilename={`Payload_Tags_${selectedDevice}`}
                        searchPlaceholder="Search parameters to link..."
                    />
                )}
            </div>
        </div>
    );
}
