import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Settings, Plus, AlertCircle, Edit2, Trash2, X } from 'lucide-react';
import { toast } from '../utils/toast';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';
import LoadingOverlay from '../components/LoadingOverlay';

export default function Parameters() {
    const [parameters, setParameters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Form State
    const [formName, setFormName] = useState("");
    const [formTag, setFormTag] = useState("");
    const [formLabel, setFormLabel] = useState("");
    const [formColor, setFormColor] = useState("#38bdf8");
    const [formUnit, setFormUnit] = useState("");
    const [formConversion, setFormConversion] = useState("NA");
    const [formValueFactor, setFormValueFactor] = useState("Avg");
    const [formInputValue, setFormInputValue] = useState("");
    const [formStatus, setFormStatus] = useState(true); // 1 for true, 0 for false
    const [formDataType, setFormDataType] = useState("Decimal");
    const [formDecimalPlaces, setFormDecimalPlaces] = useState<number>(2);

    // Dynamic Condition Builder state
    const [formHasConditions, setFormHasConditions] = useState(false);
    const [formConditions, setFormConditions] = useState<any[]>([]);

    const fetchParameters = () => {
        setLoading(true);
        axios.get(`http://${window.location.hostname}:8381/admin/parameters`)
            .then(res => {
                if (res.data?.status === 'success') {
                    setParameters(res.data.data || []);
                } else {
                    toast.error("DB Error: " + (res.data?.message || 'Unknown'));
                }
            })
            .catch(() => toast.error("Network Error: Backend Offline"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchParameters();
    }, []);

    const handleSave = () => {
        if (!formName.trim() || !formTag.trim() || !formLabel.trim()) {
            toast.error("Name, Tag, and Label are required!");
            return;
        }

        if (formTag.length > 20) {
            toast.error("Tag must be max 20 characters!");
            return;
        }

        if (formLabel.length > 20) {
            toast.error("Label must be max 20 characters!");
            return;
        }

        if (formHasConditions) {
            if (formConditions.length === 0) {
                toast.error("Please add at least one condition or disable the Status Conditions toggle.");
                return;
            }
            
            // Check for empty labels
            if (formConditions.some(c => !c.label.trim())) {
                toast.error("Condition status labels cannot be empty.");
                return;
            }

            // Uniqueness logic validation
            const names = formConditions.map(c => c.label.toLowerCase().trim());
            if (new Set(names).size !== names.length) {
                toast.error("Status names must be physically unique!");
                return;
            }

            // Mathematical Range Overlap Collision Detection
            const ranges = formConditions.map(c => {
                let v1 = parseFloat(c.val1);
                let v2 = parseFloat(c.val2);
                let min = -Infinity;
                let max = Infinity;
                if(c.operator === '<') { max = v1 - 0.000001; }
                if(c.operator === '<=') { max = v1; }
                if(c.operator === '>') { min = v1 + 0.000001; }
                if(c.operator === '>=') { min = v1; }
                if(c.operator === '=') { min = v1; max = v1; }
                if(c.operator === 'BETWEEN') { min = Math.min(v1, v2); max = Math.max(v1, v2); }
                return { label: c.label, min, max };
            });

            for(let i=0; i<ranges.length; i++) {
                for(let j=i+1; j<ranges.length; j++) {
                    const r1 = ranges[i];
                    const r2 = ranges[j];
                    if (Math.max(r1.min, r2.min) <= Math.min(r1.max, r2.max)) {
                        toast.error(`Error: Mathematical range collision! Condition "${r1.label}" overlaps with "${r2.label}". Please adjust bounds.`);
                        return;
                    }
                }
            }
        }

        setSaving(true);
        const payload = {
            parameterName: formName,
            param_tag: formTag,
            labelName: formLabel,
            color: formColor,
            unit: formUnit,
            conversionFactor: formConversion,
            valueFactor: formValueFactor,
            inputField: formConversion === "NA" ? null : formInputValue,
            status: formStatus ? 1 : 0,
            datatype: formDataType,
            decimalplaces: formDataType === 'Decimal' ? formDecimalPlaces : null,
            status_conditions: formHasConditions ? formConditions : []
        };

        const req = editingId
            ? axios.put(`http://${window.location.hostname}:8381/admin/parameters/${editingId}`, payload)
            : axios.post(`http://${window.location.hostname}:8381/admin/parameters`, payload);

        req.then(res => {
            if (res.data.status === 'success') {
                toast.success(editingId ? "Parameter updated!" : "Parameter added!");
                handleCloseModal();
                fetchParameters();
            } else {
                toast.error(`Failed to ${editingId ? 'update' : 'add'} parameter: ` + res.data.message);
            }
        }).catch(() => toast.error("Network Error"))
            .finally(() => setSaving(false));
    };

    const handleEdit = (row: any) => {
        setFormName(row.parametername || "");
        setFormTag(row.param_tag || "");
        setFormLabel(row.labelname || "");
        setFormColor(row.color || "#38bdf8");
        setFormUnit(row.unit || "");
        setFormConversion(row.conversionfactor || "NA");
        setFormValueFactor(row.valuefactor || "Avg");
        setFormInputValue(row.inputfield || "");
        setFormStatus(row.status === 1);
        setFormDataType(row.datatype || "Decimal");
        setFormDecimalPlaces(row.decimalplaces !== null ? row.decimalplaces : 2);
        
        const conds = typeof row.status_conditions === 'string' ? JSON.parse(row.status_conditions || '[]') : (row.status_conditions || []);
        setFormHasConditions(conds.length > 0);
        setFormConditions(conds);
        
        setEditingId(row.slno);
        setIsAddModalOpen(true);
    };

    const handleDelete = (slno: number) => {
        if (!window.confirm("Are you sure you want to delete this parameter?")) return;
        setLoading(true);
        axios.delete(`http://${window.location.hostname}:8381/admin/parameters/${slno}`)
            .then(res => {
                if (res.data.status === 'success') {
                    toast.success("Parameter removed successfully!");
                    fetchParameters();
                } else {
                    toast.error(res.data.message);
                    setLoading(false);
                }
            })
            .catch(() => { toast.error("Network Error"); setLoading(false); });
    };

    const handleCloseModal = () => {
        setIsAddModalOpen(false);
        setEditingId(null);
        setFormName(""); setFormTag(""); setFormLabel("");
        setFormColor("#38bdf8"); setFormUnit("");
        setFormConversion("NA"); setFormValueFactor("Avg"); setFormInputValue("");
        setFormStatus(true);
        setFormDataType("Decimal"); setFormDecimalPlaces(2);
        setFormHasConditions(false);
        setFormConditions([]);
    };

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            id: 'context',
            accessorFn: row => `${row.parametername} ${row.param_tag}`,
            header: 'Context',
            cell: info => (
                <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: info.row.original.color || '#ddd' }}></div>
                    <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{info.row.original.parametername}</span>
                        <span className="text-xs text-slate-400 font-mono uppercase tracking-wider">{info.row.original.param_tag}</span>
                    </div>
                </div>
            )
        },
        {
            accessorKey: 'labelname',
            header: 'Display Label',
            cell: info => (
                <>
                    <span className="font-medium text-slate-700">{info.getValue()}</span>
                    {info.row.original.unit && <span className="ml-1 text-slate-400 text-xs">({info.row.original.unit})</span>}
                </>
            )
        },
        {
            accessorKey: 'valuefactor',
            header: 'Rule',
            cell: info => {
                const val = info.getValue() || 'Avg';
                let colors = "bg-indigo-50 text-indigo-600 border-indigo-100";
                if (val === "Sum") colors = "bg-sky-50 text-sky-600 border-sky-100";
                if (val === "Max") colors = "bg-rose-50 text-rose-600 border-rose-100";
                if (val === "Min") colors = "bg-amber-50 text-amber-600 border-amber-100";
                if (val === "First") colors = "bg-emerald-50 text-emerald-600 border-emerald-100";
                if (val === "Last") colors = "bg-purple-50 text-purple-600 border-purple-100";
                
                return <span className={`text-xs font-bold px-2 py-0.5 rounded border ${colors}`}>{val}</span>;
            }
        },
        {
            accessorKey: 'datatype',
            header: 'Format & Status Logic',
            cell: info => {
                const type = info.getValue() || 'Decimal';
                const dec = info.row.original.decimalplaces;
                const conds = typeof info.row.original.status_conditions === 'string' 
                                ? JSON.parse(info.row.original.status_conditions || '[]') 
                                : (info.row.original.status_conditions || []);
                                
                return (
                    <div className="flex flex-col gap-1 items-start">
                        <span className="text-[10px] font-bold uppercase text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {type}{type === 'Decimal' && dec !== null && ` (${dec})`}
                        </span>
                        {conds && conds.length > 0 ? (
                            <div className="flex flex-wrap gap-1 mt-1">
                                {conds.map((c: any, i: number) => (
                                    <span key={i} className="text-[9px] font-bold text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-100 uppercase tracking-widest" title={`${c.operator} ${c.operator === 'BETWEEN' ? c.val1 + '-' + c.val2 : c.val1}`}>
                                        {c.label}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <span className="text-[10px] italic text-slate-400 mt-1 uppercase">Native Values (No Ranges)</span>
                        )}
                    </div>
                );
            }
        },
        {
            accessorKey: 'conversionfactor',
            header: 'Conversion',
            cell: info => {
                const val = info.getValue();
                if (val === 'NA' || !val) {
                    return <span className="text-slate-400 text-xs italic">Native Stream</span>;
                }
                return (
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded text-xs border border-emerald-100 font-semibold tracking-wide">
                        {val} {info.row.original.inputfield}
                    </span>
                );
            }
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: info => (
                info.getValue() === 1 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-emerald-50 text-emerald-600 border border-emerald-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></span> Active
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-slate-100 text-slate-500 border border-slate-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shadow-sm shadow-slate-400/50"></span> Inactive
                    </span>
                )
            )
        },
        {
            id: 'actions',
            header: 'Actions',
            enableSorting: false,
            size: 100,
            cell: (info) => (
                <div className="flex items-center gap-2">
                    <button onClick={() => handleEdit(info.row.original)} className="text-slate-400 hover:text-emerald-500 transition-colors p-1.5 bg-white border border-slate-200 rounded-md shadow-sm hover:shadow">
                        <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDelete(info.row.original.slno)} className="text-slate-400 hover:text-rose-500 transition-colors p-1.5 bg-white border border-slate-200 rounded-md shadow-sm hover:shadow">
                        <Trash2 size={14} />
                    </button>
                </div>
            )
        }
    ], []);

    return (
        <div className="flex flex-col h-full max-w-7xl mx-auto">
            {saving && <LoadingOverlay message="Saving Parameter Logic..." />}

            <header className="flex items-center justify-between mb-6 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-teal-50 rounded-xl text-teal-600"><Settings size={20} /></span>
                        Parameter Master
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Define sensor data points, conversions, and visual settings.</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold px-4 py-2 text-sm rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40"
                >
                    <Plus size={16} /> Add Parameter
                </button>
            </header>

            {/* Add Parameter Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <h3 className="text-lg font-bold text-slate-800">{editingId ? 'Edit Parameter' : 'Add New Parameter'}</h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-6">

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Parameter Name *</label>
                                    <input value={formName} onChange={e => setFormName(e.target.value)} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" placeholder="e.g. Temperature, CO2 Level" />
                                </div>
                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Mapping Tag (Max 20) *</label>
                                        <input value={formTag} onChange={e => setFormTag(e.target.value)} maxLength={20} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-mono uppercase" placeholder="TEMP" />
                                    </div>
                                    <div className="w-20">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Color</label>
                                        <div className="relative w-full h-9 rounded-lg border border-slate-200 overflow-hidden cursor-pointer shadow-sm">
                                            <input type="color" value={formColor} onChange={e => setFormColor(e.target.value)} className="absolute -top-4 -left-4 w-20 h-20 cursor-pointer" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Label Name (Max 20) *</label>
                                    <input value={formLabel} onChange={e => setFormLabel(e.target.value)} maxLength={20} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" placeholder="e.g. Ambient Temp" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Unit</label>
                                    <input value={formUnit} onChange={e => setFormUnit(e.target.value)} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" placeholder="e.g. °C, ppm, mg/m3" />
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-4">
                                <h4 className="text-sm font-bold text-slate-700">Calculations & Status</h4>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Value Factor</label>
                                        <select value={formValueFactor} onChange={e => setFormValueFactor(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm bg-white">
                                            <option value="Sum">Sum</option>
                                            <option value="Max">Max</option>
                                            <option value="Min">Min</option>
                                            <option value="Avg">Avg</option>
                                            <option value="First">First</option>
                                            <option value="Last">Last</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Conversion Factor</label>
                                        <select value={formConversion} onChange={e => setFormConversion(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm bg-white">
                                            <option value="NA">NA</option>
                                            <option value="Multiply by">Multiply by</option>
                                            <option value="Divide by">Divide by</option>
                                            <option value="Add by">Add by</option>
                                            <option value="Subtract By">Subtract By</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={`block text-sm font-medium text-slate-700 mb-1 transition-opacity ${formConversion === 'NA' ? 'opacity-40' : 'opacity-100'}`}>Input Value</label>
                                        <input
                                            value={formInputValue}
                                            onChange={e => setFormInputValue(e.target.value)}
                                            disabled={formConversion === "NA"}
                                            type="number"
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm disabled:bg-slate-100 disabled:text-slate-400"
                                            placeholder={formConversion === "NA" ? "Not applicable" : "Enter factor..."}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 mt-2">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Data Type</label>
                                        <select value={formDataType} onChange={e => setFormDataType(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm bg-white">
                                            <option value="Number">Number</option>
                                            <option value="Decimal">Decimal</option>
                                            <option value="Text">Text</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={`block text-sm font-medium text-slate-700 mb-1 transition-opacity ${formDataType === 'Decimal' ? 'opacity-100' : 'opacity-40'}`}>Decimal Places</label>
                                        <select disabled={formDataType !== 'Decimal'} value={formDecimalPlaces} onChange={e => setFormDecimalPlaces(Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm bg-white disabled:bg-slate-100 disabled:text-slate-400">
                                            {[0, 1, 2, 3, 4].map(n => (
                                                <option key={n} value={n}>{n}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 mt-2">
                                    <span className="text-sm font-medium text-slate-700">Active Status</span>
                                    <button
                                        onClick={() => setFormStatus(!formStatus)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${formStatus ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formStatus ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-100/50 border border-slate-200 rounded-xl space-y-4 shadow-inner relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl"></div>
                                <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 relative z-10">
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 tracking-tight">
                                            Status Conditions Matrix
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-0.5 font-medium">Dynamically map physical threshold boundaries.</p>
                                    </div>
                                    <button
                                        onClick={() => setFormHasConditions(!formHasConditions)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 shadow-sm ${formHasConditions ? 'bg-sky-500' : 'bg-slate-300'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formHasConditions ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                {formHasConditions ? (
                                    <div className="space-y-3 relative z-10">
                                        <div className="bg-white border text-left border-sky-100 rounded-lg shadow-sm p-4 space-y-3 flex flex-col items-center">
                                            {formConditions.length === 0 && (
                                                <div className="text-sm font-semibold text-slate-400 my-4 uppercase tracking-widest text-center">No logic paths defined.</div>
                                            )}
                                            {formConditions.map((cond, idx) => (
                                                <div key={idx} className="flex items-center gap-2 w-full p-2 bg-slate-50 border border-slate-100 rounded-lg hover:shadow-md transition-shadow">
                                                    <input 
                                                        type="text" 
                                                        value={cond.label} 
                                                        onChange={e => {
                                                            const arr = [...formConditions];
                                                            arr[idx].label = e.target.value;
                                                            setFormConditions(arr);
                                                        }} 
                                                        placeholder="Label (GOOD)" 
                                                        className="w-1/4 px-2 py-1.5 text-xs font-bold border rounded outline-none focus:ring-2 focus:ring-sky-500 uppercase tracking-widest bg-white"
                                                    />
                                                    <select 
                                                        value={cond.operator}
                                                        onChange={e => {
                                                            const arr = [...formConditions];
                                                            arr[idx].operator = e.target.value;
                                                            setFormConditions(arr);
                                                        }}
                                                        className="w-1/4 px-2 py-1.5 text-xs font-bold font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 rounded outline-none focus:ring-2 focus:ring-indigo-500"
                                                    >
                                                        <option value="<">&lt; Less Than</option>
                                                        <option value="<=">&lt;= Less/Eq</option>
                                                        <option value="=">= Equal</option>
                                                        <option value=">">&gt; Greater</option>
                                                        <option value=">=">&gt;= Great/Eq</option>
                                                        <option value="BETWEEN">BETWEEN</option>
                                                    </select>
                                                    <input 
                                                        type="number" 
                                                        value={cond.val1 ?? ''}
                                                        onChange={e => {
                                                            const arr = [...formConditions];
                                                            arr[idx].val1 = e.target.value;
                                                            setFormConditions(arr);
                                                        }}
                                                        placeholder="Val 1" 
                                                        className="w-1/5 px-2 py-1.5 text-xs font-mono font-bold border border-slate-200 rounded outline-none focus:ring-2 focus:ring-sky-500"
                                                    />
                                                    <input 
                                                        type="number" 
                                                        value={cond.val2 ?? ''}
                                                        disabled={cond.operator !== 'BETWEEN'}
                                                        onChange={e => {
                                                            const arr = [...formConditions];
                                                            arr[idx].val2 = e.target.value;
                                                            setFormConditions(arr);
                                                        }}
                                                        placeholder="Val 2" 
                                                        className={`w-1/5 px-2 py-1.5 text-xs font-mono font-bold border border-slate-200 rounded outline-none transition-opacity focus:ring-2 focus:ring-sky-500 ${cond.operator !== 'BETWEEN' ? 'opacity-30 bg-slate-100' : 'bg-white'}`}
                                                    />
                                                    <button 
                                                        onClick={() => {
                                                            const arr = formConditions.filter((_, i) => i !== idx);
                                                            setFormConditions(arr);
                                                        }}
                                                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded"
                                                        title="Remove Condition"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                            <button 
                                                onClick={() => setFormConditions([...formConditions, { label: '', operator: 'BETWEEN', val1: 0, val2: 100 }])}
                                                className="mt-2 text-xs font-bold text-sky-600 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 border border-sky-200 shadow-sm"
                                            >
                                                <Plus size={14} /> Matrix Logic Row
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="bg-white/50 border border-slate-200/50 border-dashed rounded-lg p-3 text-center relative z-10">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Logic Generation Subsystem Offline (NA)</p>
                                    </div>
                                )}
                            </div>

                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                            <button onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg hover:from-emerald-400 hover:to-teal-500 transition-colors shadow-sm shadow-emerald-500/30">
                                {editingId ? 'Update Parameter' : 'Save Parameter'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 min-h-[400px]">
                {loading ? (
                    <div className="h-full bg-white rounded-3xl border border-slate-100 shadow-xl flex items-center justify-center text-slate-400">
                        <AlertCircle className="w-8 h-8 animate-pulse text-teal-300" />
                    </div>
                ) : (
                    <DataTable
                        columns={columns}
                        data={parameters}
                        exportFilename="Parameters_Dictionary"
                        searchPlaceholder="Search active parameters..."
                    />
                )}
            </div>
        </div>
    );
}
