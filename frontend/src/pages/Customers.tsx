import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Users, Plus, AlertCircle, Edit2, Trash2, X } from 'lucide-react';
import { toast } from '../utils/toast';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';
import LoadingOverlay from '../components/LoadingOverlay';

export default function Customers() {
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Form State
    const [formName, setFormName] = useState("");
    const [formCode, setFormCode] = useState("");
    const [formDetails, setFormDetails] = useState<{ key: string, value: string }[]>([]);

    // Temp Row State
    const [tempKey, setTempKey] = useState("");
    const [tempValue, setTempValue] = useState("");

    const fetchCustomers = () => {
        setLoading(true);
        axios.get(`http://${window.location.hostname}:8381/admin/customers`)
            .then(res => {
                if (res.data?.status === 'success') {
                    setCustomers(res.data.data || []);
                } else {
                    toast.error("DB Error: " + (res.data?.message || 'Unknown'));
                }
            })
            .catch(() => toast.error("Network Error: Backend Offline"))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    const handleAddDetail = () => {
        if (!tempKey.trim() || !tempValue.trim()) return;
        setFormDetails([...formDetails, { key: tempKey.trim(), value: tempValue.trim() }]);
        setTempKey("");
        setTempValue("");
    };

    const handleRemoveDetail = (index: number) => {
        setFormDetails(formDetails.filter((_, i) => i !== index));
    };

    const handleDetailChange = (index: number, field: 'key' | 'value', val: string) => {
        const newDetails = [...formDetails];
        newDetails[index][field] = val;
        setFormDetails(newDetails);
    };

    const handleSave = () => {
        if (!formName.trim() || !formCode.trim()) {
            toast.error("Name and Code are required!");
            return;
        }

        setSaving(true);
        const detailsObj = formDetails.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});

        const payload = {
            customerName: formName,
            customer_code: formCode,
            details: detailsObj,
            createdBy: 'Admin'
        };

        const req = editingId
            ? axios.put(`http://${window.location.hostname}:8381/admin/customers/${editingId}`, payload)
            : axios.post(`http://${window.location.hostname}:8381/admin/customers`, payload);

        req.then(res => {
            if (res.data.status === 'success') {
                toast.success(editingId ? "Customer updated!" : "Customer added!");
                handleCloseModal();
                fetchCustomers();
            } else {
                toast.error(`Failed to ${editingId ? 'update' : 'add'} customer: ` + res.data.message);
            }
        }).catch((err) => toast.error("Network Error", err))
            .finally(() => setSaving(false));
    };

    const handleEdit = (row: any) => {
        setFormName(row.customername || "");
        setFormCode(row.customer_code || "");
        let detArr: { key: string, value: string }[] = [];
        if (row.details && typeof row.details === 'object') {
            detArr = Object.entries(row.details).map(([k, v]) => ({ key: k, value: String(v) }));
        }
        setFormDetails(detArr);
        setEditingId(row.slno);
        setIsAddModalOpen(true);
    };

    const handleDelete = (slno: number) => {
        if (!window.confirm("Are you sure you want to delete this customer?")) return;
        setLoading(true);
        axios.delete(`http://${window.location.hostname}:8381/admin/customers/${slno}`)
            .then(res => {
                if (res.data.status === 'success') {
                    toast.success("Customer removed successfully!");
                    fetchCustomers();
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
        setFormCode("");
        setFormDetails([]);
    };

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'customername',
            header: 'Customer Name',
            cell: info => <span className="font-bold text-slate-800">{info.getValue()}</span>
        },
        {
            accessorKey: 'customer_code',
            header: 'Code',
            cell: info => (
                <span className="px-2.5 py-1 bg-teal-50 text-indigo-700 rounded text-xs font-mono font-bold tracking-wide border border-indigo-100">
                    {info.getValue()}
                </span>
            )
        },
        {
            accessorKey: 'details',
            header: 'Details',
            cell: info => {
                const details = info.getValue();
                if (details && typeof details === 'object' && Object.keys(details).length > 0) {
                    return (
                        <div className="flex flex-wrap gap-1.5 max-w-sm">
                            {Object.entries(details).map(([k, v]) => (
                                <span key={k} title={`${v}`} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] uppercase font-bold border border-slate-200 max-w-[120px] truncate">
                                    <span className="text-slate-400 mr-1">{k}:</span> {v as string}
                                </span>
                            ))}
                        </div>
                    );
                }
                return <span className="text-slate-400 text-xs italic">N/A</span>;
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
            {saving && <LoadingOverlay message="Committing Customer to Registry..." />}

            <header className="flex items-center justify-between mb-6 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-teal-50 rounded-xl text-teal-600"><Users size={20} /></span>
                        Customer Master
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Manage corporate configurations dynamically.</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold px-4 py-2 text-sm rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40"
                >
                    <Plus size={16} /> Add Customer
                </button>
            </header>

            {/* Add Customer Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <h3 className="text-lg font-bold text-slate-800">{editingId ? 'Edit Customer' : 'Add New Customer'}</h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Customer Name *</label>
                                    <input value={formName} onChange={e => setFormName(e.target.value)} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" placeholder="e.g. Acme Corp" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Customer Code *</label>
                                    <input value={formCode} onChange={e => setFormCode(e.target.value)} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-mono" placeholder="ACME01" />
                                </div>
                            </div>

                            <div className="space-y-3 mt-2">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Additional Information</label>
                                {formDetails.map((detail, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-2 bg-slate-50/50 rounded-lg border border-slate-200">
                                        <input value={detail.key} onChange={e => handleDetailChange(idx, 'key', e.target.value)} type="text" placeholder="Key" className="flex-1 px-3 py-1.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded bg-transparent focus:bg-white text-sm font-medium text-slate-700 outline-none transition-all" />
                                        <input value={detail.value} onChange={e => handleDetailChange(idx, 'value', e.target.value)} type="text" placeholder="Value" className="flex-1 px-3 py-1.5 border border-transparent hover:border-slate-300 focus:border-emerald-500 rounded bg-transparent focus:bg-white text-sm text-slate-600 outline-none transition-all" />
                                        <button onClick={() => handleRemoveDetail(idx)} className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}

                                <div className="flex items-center gap-3 pt-2">
                                    <input value={tempKey} onChange={e => setTempKey(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddDetail()} type="text" placeholder="Param Name (e.g. Address)" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" />
                                    <input value={tempValue} onChange={e => setTempValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddDetail()} type="text" placeholder="Detail Value" className="flex-1 px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" />
                                    <button onClick={handleAddDetail} className="p-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-100">
                                        <Plus size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                            <button onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg hover:from-emerald-400 hover:to-teal-500 transition-colors shadow-sm shadow-emerald-500/30">
                                {editingId ? 'Update Customer' : 'Save Customer'}
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
                        data={customers}
                        exportFilename="Customers_MasterData"
                        searchPlaceholder="Search customer entities..."
                    />
                )}
            </div>

        </div>
    );
}
