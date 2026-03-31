import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Timer, Plus, AlertCircle, Edit2, Trash2, X, Activity, Server, FileOutput } from 'lucide-react';
import { toast } from '../utils/toast';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';
import LoadingOverlay from '../components/LoadingOverlay';
import Select from 'react-select';

export default function Scheduler() {
    const [schedulers, setSchedulers] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Form State
    const [formCompanyCode, setFormCompanyCode] = useState("");
    const [formFrequency, setFormFrequency] = useState("15");
    const [formStartTime, setFormStartTime] = useState("00:00");
    const [formLocalJson, setFormLocalJson] = useState(false);

    const [formAlertReq, setFormAlertReq] = useState(false);
    const [formAlertFreq, setFormAlertFreq] = useState("1");

    const [formStagingUrl, setFormStagingUrl] = useState("");
    const [formIsStaging, setFormIsStaging] = useState(false);
    const [formLiveUrl, setFormLiveUrl] = useState("");

    const fetchData = async () => {
        setLoading(true);
        try {
            const [custRes, schRes] = await Promise.all([
                axios.get(`http://${window.location.hostname}:8381/admin/customers`),
                axios.get(`http://${window.location.hostname}:8381/admin/schedulers`)
            ]);

            if (custRes.data?.status === 'success') setCustomers(custRes.data.data || []);
            if (schRes.data?.status === 'success') setSchedulers(schRes.data.data || []);
        } catch (err) {
            toast.error("Network Error: Backend Offline", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSave = () => {
        if (!formCompanyCode) {
            toast.error("Company selection is required!");
            return;
        }

        if (formIsStaging && !formStagingUrl.trim()) {
            toast.error("Staging URL is required when Staging is Active!");
            return;
        }

        setSaving(true);
        const payload = {
            customer_code: formCompanyCode,
            frequency: parseInt(formFrequency),
            starting_time: formStartTime,
            create_local_json: formLocalJson,
            alert_req: formAlertReq,
            alert_freq: formAlertReq ? parseInt(formAlertFreq) : null,
            post_url_staging: formStagingUrl,
            is_staging: formIsStaging,
            post_url_live: formLiveUrl
        };

        const req = editingId
            ? axios.put(`http://${window.location.hostname}:8381/admin/schedulers/${editingId}`, payload)
            : axios.post(`http://${window.location.hostname}:8381/admin/schedulers`, payload);

        req.then(res => {
            if (res.data.status === 'success') {
                toast.success(editingId ? "Job Scheduler updated successfully!" : "Job Scheduler mapped successfully!");
                handleCloseModal();
                fetchData();
            } else {
                toast.error("Failed to map scheduler: " + res.data.message);
            }
        }).catch((err) => toast.error("Network Error", err))
            .finally(() => setSaving(false));
    };

    const handleEdit = (row: any) => {
        setFormCompanyCode(row.customer_code || "");
        setFormFrequency((row.frequency || 15).toString());
        setFormStartTime(row.starting_time || "00:00");
        setFormLocalJson(row.create_local_json || false);
        setFormAlertReq(row.alert_req || false);
        setFormAlertFreq((row.alert_freq || 1).toString());
        setFormStagingUrl(row.post_url_staging || "");
        setFormIsStaging(row.is_staging || false);
        setFormLiveUrl(row.post_url_live || "");
        setEditingId(row.slno);
        setIsAddModalOpen(true);
    };

    const handleDelete = (slno: number) => {
        if (!window.confirm("Are you sure you want to drop this job scheduler target?")) return;
        setLoading(true);
        axios.delete(`http://${window.location.hostname}:8381/admin/schedulers/${slno}`)
            .then(res => {
                if (res.data.status === 'success') {
                    toast.success("Job Scheduler completely dropped.");
                    fetchData();
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
        setFormCompanyCode(""); setFormFrequency("15"); setFormStartTime("00:00");
        setFormLocalJson(false); setFormAlertReq(false); setFormAlertFreq("1");
        setFormStagingUrl(""); setFormIsStaging(false); setFormLiveUrl("");
    };

    const companyOptions = customers.map(c => ({
        value: c.customer_code,
        label: `${c.customername} (${c.customer_code})`
    }));

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'customer_code',
            header: 'Target Company',
            cell: info => <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">{info.getValue()}</span>
        },
        {
            id: 'cycle',
            header: 'Base Cycle',
            accessorFn: row => `${row.frequency} Minutes, Lock: ${row.starting_time}`,
            cell: info => {
                const s = info.row.original;
                return (
                    <div className="flex flex-col">
                        <span className="font-semibold text-slate-700">{s.frequency} Minutes</span>
                        <span className="text-xs text-slate-400">Lock: {s.starting_time}</span>
                    </div>
                );
            }
        },
        {
            id: 'alert_tier',
            header: 'Alert Tier',
            accessorFn: row => row.alert_req ? `Active Recheck ${row.alert_freq}M` : 'Disabled',
            cell: info => {
                const s = info.row.original;
                return s.alert_req ? (
                    <div className="flex flex-col gap-1">
                        <span className="inline-flex w-fit items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 uppercase tracking-widest">
                            Active
                        </span>
                        <span className="text-xs font-medium text-amber-700/70">Recheck {s.alert_freq}M</span>
                    </div>
                ) : (
                    <span className="text-slate-400 text-xs italic">Disabled</span>
                );
            }
        },
        {
            id: 'triggers',
            header: 'Output Triggers',
            enableSorting: false,
            cell: info => {
                const s = info.row.original;
                return (
                    <div className="flex flex-wrap gap-2 max-w-[200px]">
                        {s.post_url_live && <span title={s.post_url_live} className="w-7 h-7 bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center rounded cursor-help"><Server size={14} /></span>}
                        {s.is_staging && s.post_url_staging && <span title={s.post_url_staging} className="w-7 h-7 bg-emerald-50 border border-sky-200 text-emerald-600 flex items-center justify-center rounded cursor-help"><Server size={14} /></span>}
                        {s.create_local_json && <span title="Local Write" className="w-7 h-7 bg-teal-50 border border-indigo-200 text-teal-600 flex items-center justify-center rounded cursor-help"><FileOutput size={14} /></span>}
                    </div>
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
            {saving && <LoadingOverlay message="Committing Job Engine Parameters..." />}

            <header className="flex items-center justify-between mb-6 shrink-0 relative z-20">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-teal-50 rounded-xl text-teal-600"><Timer size={20} /></span>
                        Job Scheduler Config
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Configure payload transmission frequencies and target endpoints.</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold px-4 py-2 text-sm rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40"
                >
                    <Plus size={16} /> New Job
                </button>
            </header>

            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <h3 className="text-lg font-bold text-slate-800">{editingId ? 'Modify Dispatch Configuration' : 'Dispatch Configuration'}</h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-6">
                            <div className="grid grid-cols-3 gap-6">
                                <div className="col-span-1 border-r border-slate-100 pr-6 space-y-5 relative z-10">
                                    <h4 className="text-sm font-bold tracking-widest text-slate-400 uppercase">Primary Node</h4>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Target Company *</label>
                                        <Select
                                            options={companyOptions}
                                            value={companyOptions.find(opt => opt.value === formCompanyCode) || null}
                                            onChange={(selected: any) => setFormCompanyCode(selected ? selected.value : '')}
                                            placeholder="Assign target company..."
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
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Frequency Band</label>
                                        <select value={formFrequency} onChange={e => setFormFrequency(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm bg-white">
                                            <option value="5">5 Minutes</option>
                                            <option value="10">10 Minutes</option>
                                            <option value="15">15 Minutes</option>
                                            <option value="30">30 Minutes</option>
                                            <option value="60">60 Minutes</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 mb-2">Kickoff Time</label>
                                        <input type="time" value={formStartTime} onChange={e => setFormStartTime(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm bg-white" />
                                    </div>
                                </div>

                                <div className="col-span-2 pl-2 space-y-6 relative z-0">
                                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-sm font-bold tracking-widest text-amber-600 uppercase flex items-center gap-2"><Activity size={16} /> Alert Dispatcher</h4>
                                            <button
                                                onClick={() => setFormAlertReq(!formAlertReq)}
                                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${formAlertReq ? 'bg-amber-500' : 'bg-amber-200'}`}
                                            >
                                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${formAlertReq ? 'translate-x-5' : 'translate-x-1'}`} />
                                            </button>
                                        </div>
                                        {formAlertReq && (
                                            <div className="animate-in slide-in-from-top-2 duration-200">
                                                <label className="block text-sm font-semibold text-amber-800 mb-2">Continuous Recheck Rate (Minutes)</label>
                                                <select value={formAlertFreq} onChange={e => setFormAlertFreq(e.target.value)} className="w-48 px-3 py-2 border border-amber-200 rounded-lg focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all text-sm bg-white">
                                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n} Minute{n > 1 ? 's' : ''}</option>)}
                                                </select>
                                                <p className="text-xs text-amber-700/80 mt-2">If an alert threshold is breached, the engine will aggressively ping the node at this elevated interval.</p>
                                            </div>
                                        )}
                                    </div>

                                    <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                                        <div className="flex items-center justify-between mb-4">
                                            <h4 className="text-sm font-bold tracking-widest text-emerald-600 uppercase flex items-center gap-2"><Server size={16} /> Target Delivery Endpoints</h4>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-sky-800 mb-1">Live Environment POST URL</label>
                                                <input value={formLiveUrl} onChange={e => setFormLiveUrl(e.target.value)} type="text" className="w-full px-3 py-2 border border-sky-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-mono text-slate-600 bg-white" placeholder="https://api.externalcorp.com/v1/telemetry" />
                                            </div>

                                            <div className="pt-2 border-t border-emerald-100">
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="block text-sm font-semibold text-sky-800">Staging Relay</label>
                                                    <button
                                                        onClick={() => setFormIsStaging(!formIsStaging)}
                                                        className={`text-xs px-2 py-1 rounded font-bold transition-colors ${formIsStaging ? 'bg-emerald-500 text-white' : 'bg-sky-200 text-emerald-700'}`}
                                                    >
                                                        {formIsStaging ? 'ACTIVE' : 'DORMANT'}
                                                    </button>
                                                </div>
                                                <input disabled={!formIsStaging} value={formStagingUrl} onChange={e => setFormStagingUrl(e.target.value)} type="text" className="w-full px-3 py-2 border border-sky-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-mono text-slate-600 bg-white disabled:opacity-50 disabled:bg-emerald-50" placeholder="https://staging.externalcorp.com/api" />
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0 relative z-0">
                            <button onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg hover:from-emerald-400 hover:to-teal-500 transition-colors shadow-sm shadow-emerald-500/30">
                                {editingId ? 'Update Strategy' : 'Confirm Strategy'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 min-h-[400px] relative z-0">
                {loading ? (
                    <div className="flex-1 flex items-center justify-center h-full text-slate-400 bg-white rounded-3xl border border-slate-100 shadow-xl">
                        <AlertCircle size={32} className="animate-pulse text-teal-300" />
                    </div>
                ) : (
                    <DataTable
                        columns={columns}
                        data={schedulers}
                        exportFilename="Job_Schedulers_Registry"
                        searchPlaceholder="Search jobs by node target or URL..."
                    />
                )}
            </div>
        </div>
    );
}
