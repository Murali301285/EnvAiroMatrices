import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Layout, Plus, AlertCircle, Edit2, Trash2, X } from 'lucide-react';
import { toast } from '../utils/toast';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';
import LoadingOverlay from '../components/LoadingOverlay';

export default function Pages() {
    const [pages, setPages] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Form State
    const [formName, setFormName] = useState("");
    const [formPath, setFormPath] = useState("");
    const [formDescription, setFormDescription] = useState("");

    const fetchPages = () => {
        setLoading(true);
        axios.get('http://97.74.92.23:8381/admin/pages')
            .then(res => {
                if (res.data?.status === 'success') {
                    setPages(res.data.data || []);
                } else {
                    toast.error("DB Error: " + (res.data?.message || 'Unknown'));
                }
            })
            .catch((err) => toast.error("Network Error: Backend Offline", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchPages();
    }, []);

    const handleSave = () => {
        if (!formName.trim() || !formPath.trim()) {
            toast.error("Page Name and Path are required!");
            return;
        }

        setSaving(true);
        const payload = {
            PageName: formName,
            Path: formPath,
            Description: formDescription
        };

        const req = editingId
            ? axios.put(`http://97.74.92.23:8381/admin/pages/${editingId}`, payload)
            : axios.post('http://97.74.92.23:8381/admin/pages', payload);

        req.then(res => {
            if (res.data.status === 'success') {
                toast.success(editingId ? "Page updated!" : "Page mapped successfully!");
                handleCloseModal();
                fetchPages();
            } else {
                toast.error(`Failed to ${editingId ? 'update' : 'map'} page: ` + res.data.message);
            }
        }).catch((err) => toast.error("Network Error", err))
            .finally(() => setSaving(false));
    };

    const handleEdit = (row: any) => {
        setFormName(row.pagename || "");
        setFormPath(row.path || "");
        setFormDescription(row.description || "");
        setEditingId(row.slno);
        setIsAddModalOpen(true);
    };

    const handleDelete = (slno: number) => {
        if (!window.confirm("Are you sure you want to delete this page route?")) return;
        setLoading(true);
        axios.delete(`http://97.74.92.23:8381/admin/pages/${slno}`)
            .then(res => {
                if (res.data.status === 'success') {
                    toast.success("Page route deleted successfully!");
                    fetchPages();
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
        setFormPath("");
        setFormDescription("");
    };

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'pagename',
            header: 'Page Alias',
            cell: info => <span className="font-bold text-slate-800">{info.getValue()}</span>
        },
        {
            accessorKey: 'path',
            header: 'Linked Path',
            cell: info => (
                <span className="font-mono text-xs bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md text-teal-600 font-semibold tracking-wide">
                    {info.getValue()}
                </span>
            )
        },
        {
            accessorKey: 'description',
            header: 'Context Description',
            cell: info => {
                const desc = info.getValue();
                return desc ? (
                    <span className="text-slate-500 truncate max-w-[300px] block">{desc}</span>
                ) : (
                    <span className="italic opacity-50 text-slate-400">No description via backend</span>
                );
            }
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
            {saving && <LoadingOverlay message="Committing Route Mapping..." />}

            <header className="flex items-center justify-between mb-6 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-teal-50 rounded-xl text-teal-600"><Layout size={20} /></span>
                        Route Mapping
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Configure internal page routes and hierarchy mapping.</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold px-4 py-2 text-sm rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40"
                >
                    <Plus size={16} /> New Route
                </button>
            </header>

            {/* Add Page Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <h3 className="text-lg font-bold text-slate-800">{editingId ? 'Edit Nav Route' : 'Map Nav Route'}</h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Page Name *</label>
                                <input value={formName} onChange={e => setFormName(e.target.value)} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" placeholder="e.g. Analytics Dashboard" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Route Path *</label>
                                <input value={formPath} onChange={e => setFormPath(e.target.value)} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-mono text-emerald-700 bg-emerald-50/50" placeholder="/dashboard/analytics" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                                <textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm resize-none" placeholder="Explain internal module purpose..."></textarea>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                            <button onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg hover:from-emerald-400 hover:to-teal-500 transition-colors shadow-sm shadow-emerald-500/30">
                                {editingId ? 'Update Route' : 'Save Route'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 min-h-[400px]">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center h-full text-slate-400 bg-white rounded-3xl border border-slate-100 shadow-xl">
                        <AlertCircle size={32} className="animate-pulse text-teal-300" />
                    </div>
                ) : (
                    <DataTable
                        columns={columns}
                        data={pages}
                        exportFilename="Frontend_Routing_Table"
                        searchPlaceholder="Search routes by path or alias..."
                    />
                )}
            </div>
        </div>
    );
}
