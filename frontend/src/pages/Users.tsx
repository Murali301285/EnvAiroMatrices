import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { UserCog, Plus, AlertCircle, Edit2, Trash2, X, KeySquare } from 'lucide-react';
import { toast } from '../utils/toast';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';
import LoadingOverlay from '../components/LoadingOverlay';

export default function Users() {
    const [users, setUsers] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Form State
    const [fName, setFName] = useState("");
    const [lName, setLName] = useState("");
    const [loginId, setLoginId] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("User");
    const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, custRes] = await Promise.all([
                axios.get('http://localhost:8381/admin/users'),
                axios.get('http://localhost:8381/admin/customers')
            ]);

            if (usersRes.data?.status === 'success') setUsers(usersRes.data.data || []);
            if (custRes.data?.status === 'success') setCustomers(custRes.data.data || []);
        } catch (err) {
            toast.error("Network Error: Backend Offline", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const toggleCompany = (code: string) => {
        if (selectedCompanies.includes(code)) {
            setSelectedCompanies(selectedCompanies.filter(c => c !== code));
        } else {
            setSelectedCompanies([...selectedCompanies, code]);
        }
    };

    const handleSave = () => {
        if (!fName.trim() || fName.length > 20) {
            toast.error("First Name is required (Max 20 chars)");
            return;
        }
        if (lName.length > 20) {
            toast.error("Last Name max 20 chars");
            return;
        }
        if (loginId.length < 6) {
            toast.error("Login ID minimum 6 chars");
            return;
        }
        if (!editingId && password.length < 6) {
            toast.error("Password minimum 6 chars for new users");
            return;
        }

        setSaving(true);
        const payload = {
            firstname: fName,
            lastname: lName,
            loginid: loginId,
            password: password,
            userrole: role,
            companycodes: selectedCompanies
        };

        const req = editingId
            ? axios.put(`http://localhost:8381/admin/users/${editingId}`, payload)
            : axios.post('http://localhost:8381/admin/users', payload);

        req.then(res => {
            if (res.data.status === 'success') {
                toast.success(editingId ? "User updated successfully!" : "User provisioned successfully!");
                handleCloseModal();
                fetchData();
            } else {
                toast.error(`Provisioning failed: ` + res.data.message);
            }
        }).catch((err) => toast.error("Network Error", err))
            .finally(() => setSaving(false));
    };

    const handleEdit = (row: any) => {
        setFName(row.firstname || "");
        setLName(row.lastname || "");
        setLoginId(row.loginid || "");
        setPassword(""); // Explicitly empty, leave blank to not change hash
        setRole(row.userrole || "User");

        let compArr: string[] = [];
        if (typeof row.companycodes === 'string') {
            try { compArr = JSON.parse(row.companycodes); } catch (e) { }
        } else if (Array.isArray(row.companycodes)) {
            compArr = row.companycodes;
        }
        setSelectedCompanies(compArr);
        setEditingId(row.slno);
        setIsAddModalOpen(true);
    };

    const handleDelete = (slno: number) => {
        if (!window.confirm("Are you sure you want to deactivate this identity profile?")) return;
        setLoading(true);
        axios.delete(`http://localhost:8381/admin/users/${slno}`)
            .then(res => {
                if (res.data.status === 'success') {
                    toast.success("User access revoked.");
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
        setFName(""); setLName(""); setLoginId(""); setPassword("");
        setRole("User"); setSelectedCompanies([]);
    };

    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'userrole',
            header: 'Auth Tier',
            cell: info => {
                const r = info.getValue();
                return r === 'Admin' ? (
                    <span className="px-3 py-1.5 bg-rose-50 text-rose-700 rounded-md text-xs font-bold tracking-widest uppercase border border-rose-100">
                        SYS_ADMIN
                    </span>
                ) : (
                    <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-md text-xs font-bold tracking-widest uppercase border border-emerald-100">
                        OPERATOR
                    </span>
                );
            }
        },
        {
            id: 'identity',
            header: 'Identity Profile',
            accessorFn: row => `${row.firstname || ''} ${row.lastname || ''} ${row.loginid || ''}`,
            cell: info => {
                const u = info.row.original;
                return (
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-200 font-bold flex flex-col items-center justify-center text-slate-600 border border-slate-300">
                            {u.firstname?.[0]}{u.lastname?.[0]}
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-slate-800">{u.firstname} {u.lastname}</span>
                            <span className="text-xs text-teal-500 font-mono">{u.loginid}</span>
                        </div>
                    </div>
                );
            }
        },
        {
            id: 'companycodes',
            header: 'Assigned Boundaries',
            accessorFn: row => {
                let compArr: string[] = [];
                if (typeof row.companycodes === 'string') {
                    try { compArr = JSON.parse(row.companycodes); } catch (e) { }
                } else if (Array.isArray(row.companycodes)) {
                    compArr = row.companycodes;
                }
                return compArr.join(', ');
            },
            cell: info => {
                let compArr: string[] = [];
                const cVal = info.row.original.companycodes;
                if (typeof cVal === 'string') {
                    try { compArr = JSON.parse(cVal); } catch (e) { }
                } else if (Array.isArray(cVal)) {
                    compArr = cVal;
                }

                return (
                    <div className="flex flex-wrap gap-1.5 max-w-sm truncate">
                        {compArr.length > 0 ? compArr.map(cod => (
                            <span key={cod} title={cod} className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] uppercase font-bold border border-slate-200 max-w-[100px] truncate">
                                {cod}
                            </span>
                        )) : <span className="text-slate-400 text-xs italic">Global Access Pending</span>}
                    </div>
                );
            }
        },
        {
            id: 'actions',
            header: 'Actions',
            enableSorting: false,
            size: 150,
            cell: (info) => (
                <div className="flex items-center gap-2">
                    <button title="Reset Password" onClick={() => handleEdit(info.row.original)} className="text-slate-400 hover:text-amber-500 transition-colors p-1.5 bg-white border border-slate-200 rounded-md shadow-sm hover:shadow">
                        <KeySquare size={14} />
                    </button>
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
            {saving && <LoadingOverlay message="Provisioning Identity Record..." />}

            <header className="flex items-center justify-between mb-6 shrink-0">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-2 bg-teal-50 rounded-xl text-teal-600"><UserCog size={20} /></span>
                        Access Management
                    </h2>
                    <p className="text-slate-500 mt-1 text-sm font-medium">Provision admin users, operators, and assign corporate boundaries.</p>
                </div>
                <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold px-4 py-2 text-sm rounded-lg flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/40"
                >
                    <Plus size={16} /> Provision User
                </button>
            </header>

            {/* Add User Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <h3 className="text-lg font-bold text-slate-800">{editingId ? 'Modify Authority Profile' : 'Provision Authorization'}</h3>
                            <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-6">

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">First Name (Max 20) *</label>
                                    <input value={fName} onChange={e => setFName(e.target.value)} maxLength={20} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" placeholder="John" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Last Name (Max 20)</label>
                                    <input value={lName} onChange={e => setLName(e.target.value)} maxLength={20} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm" placeholder="Doe" />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Login ID (Min 6) *</label>
                                    <input value={loginId} onChange={e => setLoginId(e.target.value)} type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-mono tracking-tight" placeholder="user_admin" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Authorization Tier</label>
                                    <select value={role} onChange={e => setRole(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm bg-white font-semibold">
                                        <option value="User">Guest Operator</option>
                                        <option value="Admin">System Admin</option>
                                    </select>
                                </div>
                            </div>

                            <div className="relative">
                                <label className="block text-sm font-medium text-slate-700 mb-1">{editingId ? 'New Password (Leave blank to keep current)' : 'Raw Password (Min 6) *'}</label>
                                <input value={password} onChange={e => setPassword(e.target.value)} type="text" className="w-full px-3 py-2 pl-9 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all text-sm font-mono bg-amber-50" placeholder={editingId ? "********" : "Secret123!"} />
                                <KeySquare size={16} className="absolute left-3 top-[30px] text-amber-500" />
                                <p className="text-xs text-slate-400 mt-1">Admin reset capable. For new accounts, hand off securely to user.</p>
                            </div>

                            <div className="border border-slate-200 rounded-xl overflow-hidden mt-4">
                                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                                    <h4 className="text-sm font-bold text-slate-700">Company Boundary Assignment</h4>
                                    <p className="text-xs text-slate-500">Select which corporate instances this user has permission to access.</p>
                                </div>
                                <div className="p-4 bg-white grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                                    {customers.length === 0 ? <span className="text-sm text-slate-400 italic">No customers registered yet.</span> : null}
                                    {customers.map(c => (
                                        <label key={c.slno} className="flex items-center gap-3 p-2 rounded-lg border border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors group">
                                            <div className="relative flex items-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedCompanies.includes(c.customer_code)}
                                                    onChange={() => toggleCompany(c.customer_code)}
                                                    className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 focus:ring-offset-0 transition-all"
                                                />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">{c.customername}</span>
                                                <span className="text-xs text-slate-400 font-mono">{c.customer_code}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                            <button onClick={handleCloseModal} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                                Cancel
                            </button>
                            <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-lg hover:from-emerald-400 hover:to-teal-500 transition-colors shadow-sm shadow-emerald-500/30">
                                {editingId ? 'Commit Modification' : 'Commit Registration'}
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
                        data={users}
                        exportFilename="IAM_Identity_Roster"
                        searchPlaceholder="Search operator identities..."
                    />
                )}
            </div>
        </div>
    );
}
