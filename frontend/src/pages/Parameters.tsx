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
    const [formInputValue, setFormInputValue] = useState("");
    const [formStatus, setFormStatus] = useState(true); // 1 for true, 0 for false

    const fetchParameters = () => {
        setLoading(true);
        axios.get('http://localhost:8000/admin/parameters')
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

        if (formTag.length > 6) {
            toast.error("Tag must be max 6 characters!");
            return;
        }

        if (formLabel.length > 20) {
            toast.error("Label must be max 20 characters!");
            return;
        }

        setSaving(true);
        const payload = {
            parameterName: formName,
            param_tag: formTag,
            labelName: formLabel,
            color: formColor,
            unit: formUnit,
            conversionFactor: formConversion,
            inputField: formConversion === "NA" ? null : formInputValue,
            status: formStatus ? 1 : 0
        };

        const req = editingId
            ? axios.put(`http://localhost:8000/admin/parameters/${editingId}`, payload)
            : axios.post('http://localhost:8000/admin/parameters', payload);

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
        setFormInputValue(row.inputfield || "");
        setFormStatus(row.status === 1);
        setEditingId(row.slno);
        setIsAddModalOpen(true);
    };

    const handleDelete = (slno: number) => {
        if (!window.confirm("Are you sure you want to delete this parameter?")) return;
        setLoading(true);
        axios.delete(`http://localhost:8000/admin/parameters/${slno}`)
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
        setFormConversion("NA"); setFormInputValue("");
        setFormStatus(true);
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
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Tag (Max 6) *</label>
                                        <input value={formTag} onChange={e => setFormTag(e.target.value)} maxLength={6} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-mono uppercase" placeholder="TEMP" />
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
                                <div className="grid grid-cols-2 gap-4">
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
                                <div className="flex items-center justify-between pt-2">
                                    <span className="text-sm font-medium text-slate-700">Active Status</span>
                                    <button
                                        onClick={() => setFormStatus(!formStatus)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${formStatus ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formStatus ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
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
