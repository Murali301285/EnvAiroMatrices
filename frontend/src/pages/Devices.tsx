import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { HardDrive, Plus, AlertCircle, Edit2, Trash2, X, Clock } from 'lucide-react';
import { toast } from '../utils/toast';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';
import LoadingOverlay from '../components/LoadingOverlay';
import Select from 'react-select';

export default function Devices() {
    const [devices, setDevices] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Form State
    const [formCustomerCode, setFormCustomerCode] = useState("");
    const [formDeviceId, setFormDeviceId] = useState("");
    const [formAlias, setFormAlias] = useState("");
    const [formLocation, setFormLocation] = useState("");
    const [formAddress, setFormAddress] = useState("");
    const [formWhStart, setFormWhStart] = useState("09:00");
    const [formWhEnd, setFormWhEnd] = useState("18:00");
    const [formActive, setFormActive] = useState(true);
    const [formCreateJsonFile, setFormCreateJsonFile] = useState(false);
    const [formPostData, setFormPostData] = useState(false);
    const [formRemarks, setFormRemarks] = useState("");

    const fetchData = async () => {
        setLoading(true);
        try {
            const [custRes, devRes] = await Promise.all([
                axios.get(`http://${window.location.hostname}:8381/admin/customers`),
                axios.get(`http://${window.location.hostname}:8381/admin/devices`)
            ]);

            if (custRes.data?.status === 'success') setCustomers(custRes.data.data || []);
            if (devRes.data?.status === 'success') setDevices(devRes.data.data || []);
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
        if (!formCustomerCode) {
            toast.error("Please select a Customer Company!");
            return;
        }

        if (formDeviceId.length < 5 || formDeviceId.length > 20) {
            toast.error("Device ID must be between 5 and 20 characters");
            return;
        }

        if (formAlias.length > 20 || formLocation.length > 20) {
            toast.error("Alias and Location must be max 20 chars!");
            return;
        }

        setSaving(true);
        const payload = {
            customer_code: formCustomerCode,
            deviceid: formDeviceId,
            alias: formAlias,
            location: formLocation,
            address: formAddress,
            working_hours_json: { start: formWhStart, end: formWhEnd },
            active: formActive ? 1 : 0,
            create_json_file: formCreateJsonFile,
            post_data: formPostData,
            remarks: formRemarks
        };

        const req = editingId
            ? axios.put(`http://${window.location.hostname}:8381/admin/devices/${editingId}`, payload)
            : axios.post(`http://${window.location.hostname}:8381/admin/devices`, payload);

        req.then(res => {
            if (res.data.status === 'success') {
                toast.success(editingId ? "Device updated!" : "Device added successfully!");
                handleCloseModal();
                fetchData();
            } else {
                toast.error(`Failed to ${editingId ? 'update' : 'add'} device: ` + res.data.message);
            }
        }).catch((err) => toast.error("Network Error", err))
            .finally(() => setSaving(false));
    };

    const handleEdit = (row: any) => {
        setFormCustomerCode(row.customer_code || "");
        setFormDeviceId(row.deviceid || "");
        setFormAlias(row.alias || "");
        setFormLocation(row.location || "");
        setFormAddress(row.address || "");

        // Handle nested working JSON format safe-guard
        let whStart = "09:00", whEnd = "18:00";
        if (row.working_hours_json && typeof row.working_hours_json === 'object') {
            whStart = row.working_hours_json.start || "09:00";
            whEnd = row.working_hours_json.end || "18:00";
        }
        setFormWhStart(whStart);
        setFormWhEnd(whEnd);

        setFormActive(row.active === 1 || row.active === true);
        setFormCreateJsonFile(row.create_json_file === 1 || row.create_json_file === true);
        setFormPostData(row.post_data === 1 || row.post_data === true);
        setFormRemarks(row.remarks || "");
        setEditingId(row.slno);
        setIsAddModalOpen(true);
    };

    const handleDelete = (slno: number) => {
        if (!window.confirm("Are you sure you want to delete this device endpoint?")) return;
        setLoading(true);
        axios.delete(`http://${window.location.hostname}:8381/admin/devices/${slno}`)
            .then(res => {
                if (res.data.status === 'success') {
                    toast.success("Device removed successfully!");
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
        setFormCustomerCode("");
        setFormDeviceId("");
        setFormAlias("");
        setFormLocation("");
        setFormAddress("");
        setFormWhStart("09:00");
        setFormWhEnd("18:00");
        setFormActive(true);
        setFormCreateJsonFile(false);
        setFormPostData(false);
        setFormRemarks("");
    };

    // Prepare dropdown options
    const customerOptions = customers.map(c => ({
        value: c.customer_code,
        label: `${c.customername} (${c.customer_code})`
    }));

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'customer_code',
            header: 'Company',
            cell: info => <span className="font-bold text-slate-800">{info.getValue()}</span>
        },
        {
            id: 'deviceInfo',
            header: 'Device ID',
            accessorFn: row => `${row.deviceid} ${row.alias || ''}`,
            cell: info => (
                <div className="flex flex-col">
                    <span className="font-mono font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded border border-indigo-100 w-fit">
                        {info.row.original.deviceid}
                    </span>
                    <span className="text-xs text-slate-400 mt-1">{info.row.original.alias}</span>
                </div>
            )
        },
        {
            accessorKey: 'location',
            header: 'Location',
            cell: info => <span className="font-medium text-slate-700">{info.getValue() || 'N/A'}</span>
        },
        {
            id: 'schedule',
            header: 'Schedule',
            accessorFn: row => row.working_hours_json ? `${row.working_hours_json.start} - ${row.working_hours_json.end}` : '',
            cell: info => {
                const wh = info.row.original.working_hours_json;
                if (wh && typeof wh === 'object') {
                    return (
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs border border-slate-200 font-medium whitespace-nowrap">
                            {wh.start} - {wh.end}
                        </span>
                    );
                }
                return <span className="text-slate-400 text-xs italic">24/7 Runtime</span>;
            }
        },
        {
            accessorKey: 'active',
            header: 'Status',
            cell: info => {
                const isActive = info.getValue() === 1 || info.getValue() === true;
                return isActive ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-emerald-50 text-emerald-600 border border-emerald-100">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></span> Active
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-slate-100 text-slate-500 border border-slate-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shadow-sm shadow-slate-400/50"></span> Paused
                    </span>
                );
            }
        },
        {
            id: 'export_config',
            header: 'Export Config',
            cell: info => (
                <div className="flex flex-col gap-1.5 min-w-[90px]">
                    {info.row.original.create_json_file ? <span className="text-[10px] text-white font-bold border border-emerald-600 bg-emerald-500 px-1.5 py-0.5 rounded-sm w-fit uppercase tracking-wider shadow-sm">JSON: ON</span> : <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-sm w-fit uppercase tracking-wider font-semibold">JSON: OFF</span>}
                    {info.row.original.post_data ? <span className="text-[10px] text-white font-bold border border-emerald-600 bg-emerald-500 px-1.5 py-0.5 rounded-sm w-fit uppercase tracking-wider shadow-sm">POST: ON</span> : <span className="text-[10px] text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded-sm w-fit uppercase tracking-wider font-semibold">POST: OFF</span>}
                </div>
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
            {saving && <LoadingOverlay message="Connecting Hardware Endpoint..." />}

            <header className="flex items-center justify-between mb-6 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-teal-50 rounded-xl text-teal-600"><HardDrive size={20} /></span>
                        Hardware Registry
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Link physical IoT endpoints with corporate clients.</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold px-4 py-2 text-sm rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40"
                >
                    <Plus size={16} /> Add Device
                </button>
            </header>

            {/* Add Device Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <h3 className="text-lg font-bold text-slate-800">{editingId ? 'Edit Device Properties' : 'Register New Device'}</h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="z-10 relative">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Company (Customer) *</label>
                                    <Select
                                        options={customerOptions}
                                        value={customerOptions.find(opt => opt.value === formCustomerCode) || null}
                                        onChange={(selected: any) => setFormCustomerCode(selected ? selected.value : '')}
                                        placeholder="Type to search..."
                                        isClearable
                                        styles={{
                                            control: (base) => ({
                                                ...base,
                                                borderColor: '#e2e8f0',
                                                borderRadius: '0.5rem',
                                                padding: '2px',
                                                boxShadow: 'none',
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
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Device ID (5-20 chars) *</label>
                                    <input value={formDeviceId} onChange={e => setFormDeviceId(e.target.value.toUpperCase())} maxLength={20} type="text" className="w-full px-3 py-[9px] border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-mono uppercase tracking-widest" placeholder="HW-0001" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Alias (Max 20)</label>
                                    <input value={formAlias} onChange={e => setFormAlias(e.target.value)} maxLength={20} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" placeholder="Zone A Sensor" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Location (Max 20)</label>
                                    <input value={formLocation} onChange={e => setFormLocation(e.target.value)} maxLength={20} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" placeholder="Rooftop" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Physical Address</label>
                                <textarea value={formAddress} onChange={e => setFormAddress(e.target.value)} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm resize-none" placeholder="Enter full deployment address..."></textarea>
                            </div>

                            <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-4 relative z-0">
                                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <Clock size={16} className="text-teal-500" /> Working Hours
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-600 mb-1">From</label>
                                        <input type="time" value={formWhStart} onChange={e => setFormWhStart(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm bg-white" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-600 mb-1">To</label>
                                        <input type="time" value={formWhEnd} onChange={e => setFormWhEnd(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm bg-white" />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-6 p-4 bg-white border border-slate-100 rounded-xl">
                                <label className="flex items-center gap-2.5 text-sm font-bold text-slate-700 cursor-pointer select-none">
                                    <input type="checkbox" checked={formCreateJsonFile} onChange={e => setFormCreateJsonFile(e.target.checked)} className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 transition-all cursor-pointer accent-emerald-600" />
                                    Create JSON File
                                </label>
                                <label className="flex items-center gap-2.5 text-sm font-bold text-slate-700 cursor-pointer select-none">
                                    <input type="checkbox" checked={formPostData} onChange={e => setFormPostData(e.target.checked)} className="w-5 h-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 transition-all cursor-pointer accent-emerald-600" />
                                    Post The Data
                                </label>
                            </div>

                            <div className="grid grid-cols-[1fr_auto] gap-4 items-start relative z-0">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Remarks</label>
                                    <textarea value={formRemarks} onChange={e => setFormRemarks(e.target.value)} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm resize-none" placeholder="Internal notes..."></textarea>
                                </div>
                                <div className="flex flex-col items-end pt-1">
                                    <span className="text-sm font-medium text-slate-700 mb-2">Active Target</span>
                                    <button
                                        onClick={() => setFormActive(!formActive)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 ${formActive ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formActive ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0 relative z-0">
                            <button onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg hover:from-emerald-400 hover:to-teal-500 transition-colors shadow-sm shadow-emerald-500/30">
                                {editingId ? 'Update Device' : 'Register Device'}
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
                        data={devices}
                        exportFilename="Hardware_Endpoints"
                        searchPlaceholder="Search MACs or Aliases..."
                    />
                )}
            </div>
        </div>
    );
}
