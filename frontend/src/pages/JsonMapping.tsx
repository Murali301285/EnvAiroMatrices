import { useState, useEffect } from 'react';
import axios from 'axios';
import { Route, Save } from 'lucide-react';
import { toast } from '../utils/toast';
import LoadingOverlay from '../components/LoadingOverlay';
import Select from 'react-select';

export default function JsonMapping() {
    const [customers, setCustomers] = useState<any[]>([]);
    const [formatters, setFormatters] = useState<any[]>([]);
    const [mappings, setMappings] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [selectedCompany, setSelectedCompany] = useState("");
    const [scheduledId, setScheduledId] = useState("");
    const [alertId, setAlertId] = useState("");
    const [resolvedId, setResolvedId] = useState("");
    const [folderName, setFolderName] = useState("");

    const fetchData = async () => {
        setLoading(true);
        try {
            const [custRes, fmtRes, mapRes] = await Promise.all([
                axios.get(`http://${window.location.hostname}:8381/admin/customers`),
                axios.get(`http://${window.location.hostname}:8381/admin/formatters`),
                axios.get(`http://${window.location.hostname}:8381/admin/json-mapping`)
            ]);

            if (custRes.data?.status === 'success') setCustomers(custRes.data.data || []);
            if (fmtRes.data?.status === 'success') setFormatters(fmtRes.data.data || []);
            if (mapRes.data?.status === 'success') setMappings(mapRes.data.data || []);
        } catch (err) {
            toast.error("Network Error: Backend Offline", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (!selectedCompany) {
            setScheduledId(""); setAlertId(""); setResolvedId(""); setFolderName("");
            return;
        }

        const exactMap = mappings.find(m => m.customer_code === selectedCompany);
        if (exactMap) {
            setScheduledId(exactMap.scheduled_json_id?.toString() || "");
            setAlertId(exactMap.alert_json_id?.toString() || "");
            setResolvedId(exactMap.resolved_json_id?.toString() || "");
            setFolderName(exactMap.folder_name || "");
        } else {
            setScheduledId(""); setAlertId(""); setResolvedId(""); setFolderName("");
        }
    }, [selectedCompany, mappings]);

    const handleSave = () => {
        if (!selectedCompany) {
            toast.error("Company Selection is mandatory.");
            return;
        }

        setSaving(true);
        axios.post(`http://${window.location.hostname}:8381/admin/json-mapping`, {
            customer_code: selectedCompany,
            scheduled_json_id: scheduledId ? parseInt(scheduledId) : null,
            alert_json_id: alertId ? parseInt(alertId) : null,
            resolved_json_id: resolvedId ? parseInt(resolvedId) : null,
            folder_name: folderName
        }).then(res => {
            if (res.data.status === 'success') {
                toast.success("Payload mapping saved successfully.");
                fetchData();
            } else {
                toast.error("Failed to map JSON: " + res.data.message);
            }
        }).catch((err) => toast.error("Network Error", err))
            .finally(() => setSaving(false));
    };

    const scheduledFormatters = formatters.filter(f => f.type === 'Scheduled');
    const alertFormatters = formatters.filter(f => f.type === 'Alert');
    const resolvedFormatters = formatters.filter(f => f.type === 'Resolved');

    const companyOptions = customers.map(c => ({
        value: c.customer_code,
        label: `${c.customername} (${c.customer_code})`
    }));

    return (
        <div className="flex flex-col h-full max-w-5xl mx-auto">
            {saving && <LoadingOverlay message="Committing Payload Route Configurations..." />}

            <header className="flex items-center justify-between mb-6 shrink-0 relative z-20">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-teal-50 rounded-xl text-teal-600"><Route size={20} /></span>
                        Company API Mapping
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Link specific data templates directly to Company asset logic wrappers.</p>
                </div>
                <div className="flex items-center gap-4 bg-white p-2.5 rounded-xl border border-slate-200 shadow-sm relative z-30">
                    <div className="w-72">
                        <Select
                            options={companyOptions}
                            value={companyOptions.find(opt => opt.value === selectedCompany) || null}
                            onChange={(selected: any) => setSelectedCompany(selected ? selected.value : '')}
                            placeholder="Select Customer Company..."
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
                        disabled={!selectedCompany}
                        className="disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-indigo-500 to-sky-500 hover:from-indigo-400 hover:to-sky-400 text-white font-semibold px-5 py-[9px] text-sm rounded-lg flex items-center gap-2 transition-all shadow-md shadow-teal-500/20 hover:shadow-teal-500/40"
                    >
                        <Save size={16} /> Link Route
                    </button>
                </div>
            </header>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden flex-1 relative transition-all flex flex-col items-center justify-center z-10">
                {loading ? (
                    <div className="text-slate-400 font-medium animate-pulse text-lg">Fetching Hierarchy...</div>
                ) : !selectedCompany ? (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-12 text-center bg-transparent">
                        <div className="bg-slate-50 p-6 rounded-full shadow-inner border border-slate-200 mb-6 group hover:scale-105 transition-transform">
                            <Route size={56} className="text-slate-300 group-hover:text-indigo-400 transition-colors" />
                        </div>
                        <p className="text-xl text-slate-600 font-bold mb-2">Awaiting Context</p>
                        <p className="text-base text-slate-500 max-w-md leading-relaxed">Select a company from the dropdown registry above to view or modify its outbound traffic template mappings.</p>
                    </div>
                ) : (
                    <div className="w-full h-full p-8 flex flex-col bg-slate-50/50 overflow-y-auto">
                        <div className="max-w-3xl w-full mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-300">

                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative z-0">
                                <div className="flex items-start gap-4 mb-6 pb-6 border-b border-slate-100">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500 border border-emerald-100 shrink-0">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-slate-800">Scheduled Data Transmission</h3>
                                        <p className="text-sm text-slate-500 mt-1">The primary JSON payload structure broadcasted during periodic routine operational cycles.</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Assigned Template Component (Required)</label>
                                        <select
                                            value={scheduledId}
                                            onChange={e => setScheduledId(e.target.value)}
                                            className="w-full px-4 py-3 border border-sky-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-semibold text-sky-900 bg-emerald-50/30"
                                        >
                                            <option value="">-- Unassigned --</option>
                                            {scheduledFormatters.map(f => (
                                                <option key={f.slno} value={f.slno}>{f.name} (ID: {f.slno})</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Local Output Configuration (Folder Name)</label>
                                        <input
                                            type="text"
                                            value={folderName}
                                            onChange={e => setFolderName(e.target.value)}
                                            placeholder="ex: schJsons or jsons/Sch"
                                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-mono text-slate-700 hover:bg-slate-50"
                                        />
                                        <p className="text-xs text-slate-400 mt-2 px-1">Note: This creates nested directories automatically if not found (e.g. `jsons/Sch`) and stores files formatting as <code className="bg-slate-100 text-slate-600 px-1 py-0.5 rounded">deviceid_datetime_sch.json</code></p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative z-0">
                                <div className="flex items-start gap-4 mb-6 pb-6 border-b border-slate-100">
                                    <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 border border-amber-100 shrink-0">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-slate-800">Event Alarm Transmission</h3>
                                        <p className="text-sm text-slate-500 mt-1">The critical payload format broadcasted instantly when anomalous environmental breaches occur.</p>
                                    </div>
                                </div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Assigned Template Component (Optional)</label>
                                <select
                                    value={alertId}
                                    onChange={e => setAlertId(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 outline-none transition-all text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    <option value="">-- Not Configured --</option>
                                    {alertFormatters.map(f => (
                                        <option key={f.slno} value={f.slno}>{f.name} (ID: {f.slno})</option>
                                    ))}
                                </select>
                            </div>

                            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative z-0">
                                <div className="flex items-start gap-4 mb-6 pb-6 border-b border-slate-100">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500 border border-emerald-100 shrink-0">
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-bold text-slate-800">Resolution Status Notification</h3>
                                        <p className="text-sm text-slate-500 mt-1">Format triggered when previously breached parameters have returned to nominal stability parameters.</p>
                                    </div>
                                </div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Assigned Template Component (Optional)</label>
                                <select
                                    value={resolvedId}
                                    onChange={e => setResolvedId(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 outline-none transition-all text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    <option value="">-- Not Configured --</option>
                                    {resolvedFormatters.map(f => (
                                        <option key={f.slno} value={f.slno}>{f.name} (ID: {f.slno})</option>
                                    ))}
                                </select>
                            </div>

                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
