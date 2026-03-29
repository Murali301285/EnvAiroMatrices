import { useState, useEffect } from 'react';
import axios from 'axios';
import { FileJson, Plus, AlertCircle, Edit2, Trash2, X, Braces } from 'lucide-react';
import { toast } from 'react-toastify';

export default function Formatters() {
    const [formatters, setFormatters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Form State
    const [formName, setFormName] = useState("");
    const [formSpName, setFormSpName] = useState("");
    const [formType, setFormType] = useState("Scheduled");
    const [formJson, setFormJson] = useState('{\n  "name": "#Project",\n  "Tag": "$NH3"\n}');
    const [jsonError, setJsonError] = useState<string | null>(null);

    useEffect(() => {
        if (!formJson.trim()) {
            setJsonError(null);
            return;
        }
        try {
            JSON.parse(formJson);
            setJsonError(null);
        } catch (e: any) {
            setJsonError(e.message);
        }
    }, [formJson]);

    const fetchFormatters = () => {
        setLoading(true);
        axios.get('http://localhost:8000/admin/formatters')
            .then(res => {
                if (res.data?.status === 'success') {
                    setFormatters(res.data.data || []);
                } else {
                    toast.error("DB Error: " + (res.data?.message || 'Unknown'));
                }
            })
            .catch(() => toast.error("Network Error: Backend Offline"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchFormatters();
    }, []);

    const handlePrettify = () => {
        try {
            const parsed = JSON.parse(formJson);
            setFormJson(JSON.stringify(parsed, null, 4));
            toast.success("JSON formatted successfully.");
        } catch (e) {
            toast.error("Invalid JSON format! Cannot prettify.");
        }
    };

    const handleSave = () => {
        if (!formName.trim()) {
            toast.error("Template Name is required!");
            return;
        }

        if (jsonError) {
            toast.error("Please correct JSON syntax errors before saving.");
            return;
        }

        const payload = {
            name: formName,
            jsonTemplate: formJson,
            storedProcedureName: formSpName,
            type: formType
        };

        const req = editingId
            ? axios.put(`http://localhost:8000/admin/formatters/${editingId}`, payload)
            : axios.post('http://localhost:8000/admin/formatters', payload);

        req.then(res => {
            if (res.data.status === 'success') {
                toast.success(editingId ? "Payload Template updated successfully!" : "Payload Template saved successfully!");
                handleCloseModal();
                fetchFormatters();
            } else {
                toast.error("Failed to save template: " + res.data.message);
            }
        }).catch(() => toast.error("Network Error"));
    };

    const handleEdit = (row: any) => {
        setFormName(row.name || "");
        setFormSpName(row.storedprocedurename || "");
        setFormType(row.type || "Scheduled");
        setFormJson(row.jsontemplate || '{\n  "name": "#Project",\n  "Tag": "$NH3"\n}');
        setEditingId(row.slno);
        setIsAddModalOpen(true);
    };

    const handleDelete = (slno: number) => {
        if (!window.confirm("Are you sure you want to delete this payload template?")) return;
        setLoading(true);
        axios.delete(`http://localhost:8000/admin/formatters/${slno}`)
            .then(res => {
                if (res.data.status === 'success') {
                    toast.success("Payload template deleted successfully.");
                    fetchFormatters();
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
        setFormName("");
        setFormSpName("");
        setFormType("Scheduled");
        setFormJson('{\n  "name": "#Project",\n  "Tag": "$NH3"\n}');
    };

    return (
        <div className="flex flex-col h-full max-w-7xl mx-auto">
            <header className="flex items-center justify-between mb-6 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-teal-50 rounded-xl text-teal-600"><FileJson size={20} /></span>
                        JSON Template Formatter
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Design payload schemas, define SP mappings, and manage variable syntax.</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold px-4 py-2 text-sm rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40"
                >
                    <Plus size={16} /> New Template
                </button>
            </header>

            {/* Add Formatter Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <h3 className="text-lg font-bold text-slate-800">{editingId ? 'Edit Payload Template' : 'Design Payload Template'}</h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Template Name (Unique) *</label>
                                    <input value={formName} onChange={e => setFormName(e.target.value)} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" placeholder="e.g. Standard Hourly Post" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Payload Classification</label>
                                    <select value={formType} onChange={e => setFormType(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm bg-white font-semibold text-slate-700">
                                        <option value="Scheduled">Scheduled Post</option>
                                        <option value="Alert">Alert Generation</option>
                                        <option value="Resolved">Resolution Notification</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Database Provider (SP Name)</label>
                                <input value={formSpName} onChange={e => setFormSpName(e.target.value)} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-mono text-teal-600 bg-teal-50/50" placeholder="e.g. sp_get_hourly_metrics" />
                            </div>

                            <div className={`border rounded-xl overflow-hidden shadow-sm flex flex-col transition-all duration-300 ${jsonError ? 'border-rose-400 ring-4 ring-rose-500/20' : 'border-slate-200'}`}>
                                <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Braces size={16} className={jsonError ? "text-rose-400" : "text-sky-400"} />
                                        <h4 className={`text-sm font-mono font-bold ${jsonError ? "text-rose-200" : "text-slate-200"}`}>Template JSON Body</h4>
                                    </div>
                                    <button onClick={handlePrettify} className="text-xs font-semibold px-2 py-1 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors">
                                        Format JSON
                                    </button>
                                </div>
                                <textarea
                                    value={formJson}
                                    onChange={e => setFormJson(e.target.value)}
                                    rows={12}
                                    className={`w-full p-4 bg-[#1E1E1E] font-mono text-sm leading-relaxed outline-none resize-none transition-colors ${jsonError ? 'text-rose-300' : 'text-sky-300'}`}
                                    spellCheck="false"
                                />
                                {jsonError ? (
                                    <div className="bg-rose-50 px-4 py-3 border-t border-rose-200 text-xs text-rose-600 leading-relaxed font-mono flex items-start gap-2">
                                        <AlertCircle size={15} className="shrink-0 mt-0.5" />
                                        <span><strong>Syntax Error:</strong> {jsonError}</span>
                                    </div>
                                ) : (
                                    <div className="bg-slate-50 px-4 py-3 border-t border-slate-200 text-xs text-slate-500 leading-relaxed">
                                        <strong>Syntax Guide:</strong> Use <code className="text-amber-600 bg-amber-50 px-1 rounded">#Label</code> for static text rendering. Use <code className="text-emerald-600 bg-emerald-50 px-1 rounded">$Label</code> to map to values returned dynamically from the Stored Procedure execution.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                            <button onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg hover:from-emerald-400 hover:to-teal-500 transition-colors shadow-sm shadow-emerald-500/30">
                                {editingId ? 'Update Template' : 'Save Template'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden flex-1 flex flex-col relative transition-all">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center text-slate-400 font-medium animate-pulse text-lg">Loading Formats...</div>
                ) : formatters.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-12 text-center bg-slate-50/50">
                        <div className="bg-white p-6 rounded-full shadow-sm border border-slate-100 mb-6">
                            <AlertCircle size={56} className="text-slate-300" />
                        </div>
                        <p className="text-xl text-slate-600 font-bold mb-2">No Templates Configured</p>
                        <p className="text-base text-slate-500 max-w-md leading-relaxed">Construct a JSON schema template to standardize API transmissions.</p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto">
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {formatters.map((f) => (
                                <div key={f.slno} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all bg-white group flex flex-col h-[380px]">
                                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-start justify-between">
                                        <div>
                                            <h4 className="font-bold text-slate-800 text-lg">{f.name}</h4>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${f.type === 'Scheduled' ? 'bg-emerald-100 text-emerald-700' :
                                                    f.type === 'Alert' ? 'bg-amber-100 text-amber-700' :
                                                        'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                    {f.type}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleEdit(f)} className="p-1.5 text-slate-400 hover:text-emerald-500 rounded hover:bg-emerald-50"><Edit2 size={16} /></button>
                                            <button onClick={() => handleDelete(f.slno)} className="p-1.5 text-slate-400 hover:text-rose-500 rounded hover:bg-rose-50"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                    <div className="px-5 py-3 border-b border-slate-100 bg-teal-50/30">
                                        <span className="text-xs text-slate-500 block mb-1">Stored Procedure Engine</span>
                                        <span className="font-mono text-sm text-indigo-700 font-semibold">{f.storedprocedurename || 'N/A'}</span>
                                    </div>
                                    <div className="flex-1 bg-[#1E1E1E] p-4 overflow-auto">
                                        <pre className="text-sky-300 font-mono text-xs leading-relaxed">
                                            {f.jsontemplate}
                                        </pre>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
