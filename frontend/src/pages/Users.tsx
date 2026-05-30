import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { 
    UserCog, Plus, AlertCircle, Edit2, Trash2, X, KeySquare, 
    Shield, Laptop, Smartphone
} from 'lucide-react';
import { toast } from '../utils/toast';
import type { ColumnDef } from '@tanstack/react-table';
import DataTable from '../components/DataTable';
import LoadingOverlay from '../components/LoadingOverlay';

export default function Users() {
    const [users, setUsers] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [roles, setRoles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Tab Navigation
    const [activeTab, setActiveTab] = useState<'users' | 'roles'>('users');

    // Add/Edit User Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [fName, setFName] = useState("");
    const [lName, setLName] = useState("");
    const [loginId, setLoginId] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("Guest Operator");
    const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);

    // Add/Edit Role Modal State
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [editingRoleId, setEditingRoleId] = useState<number | null>(null);
    const [roleName, setRoleName] = useState("");
    const [roleWebPerm, setRoleWebPerm] = useState<any>({
        "Home": ["Main", "Dynamic"],
        "Config": [],
        "Logs": []
    });
    const [roleMobPerm, setRoleMobPerm] = useState<string[]>([]);

    const categoriesConfig = {
        "Home": ["Main", "Dynamic"],
        "Config": ["Customers", "Parameters", "Devices", "Param Mapping", "JSON Formatter", "JSON Mapping", "Scheduler", "Users"],
        "Logs": ["Alert Monitor", "PCH Logs", "API Post Monitor", "JSON Monitor", "API Access Logs", "Error", "Events"]
    };

    const mobilePages = ["Main", "Analytics", "Enterprise"];

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, custRes, rolesRes] = await Promise.all([
                axios.get(`http://${window.location.hostname}:8381/admin/users`),
                axios.get(`http://${window.location.hostname}:8381/admin/customers`),
                axios.get(`http://${window.location.hostname}:8381/admin/roles`)
            ]);

            if (usersRes.data?.status === 'success') setUsers(usersRes.data.data || []);
            if (custRes.data?.status === 'success') setCustomers(custRes.data.data || []);
            if (rolesRes.data?.status === 'success') {
                const fetchedRoles = rolesRes.data.data || [];
                setRoles(fetchedRoles);
                // Set default dropdown role if available
                if (fetchedRoles.length > 0 && !editingId) {
                    setRole(fetchedRoles[0].role_name);
                }
            }
        } catch (err) {
            toast.error("Network Error: Backend Offline");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // USER ACTIONS
    const toggleCompany = (code: string) => {
        if (selectedCompanies.includes(code)) {
            setSelectedCompanies(selectedCompanies.filter(c => c !== code));
        } else {
            setSelectedCompanies([...selectedCompanies, code]);
        }
    };

    const handleSaveUser = () => {
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
            ? axios.put(`http://${window.location.hostname}:8381/admin/users/${editingId}`, payload)
            : axios.post(`http://${window.location.hostname}:8381/admin/users`, payload);

        req.then(res => {
            if (res.data.status === 'success') {
                toast.success(editingId ? "User updated successfully!" : "User provisioned successfully!");
                handleCloseModal();
                fetchData();
            } else {
                toast.error(`Provisioning failed: ` + res.data.message);
            }
        }).catch(() => toast.error("Network Error"))
            .finally(() => setSaving(false));
    };

    const handleEditUser = (row: any) => {
        setFName(row.firstname || "");
        setLName(row.lastname || "");
        setLoginId(row.loginid || "");
        setPassword(""); 
        setRole(row.userrole || "");

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

    const handleDeleteUser = (slno: number) => {
        if (!window.confirm("Are you sure you want to deactivate this identity profile?")) return;
        setLoading(true);
        axios.delete(`http://${window.location.hostname}:8381/admin/users/${slno}`)
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
        setRole(roles.length > 0 ? roles[0].role_name : "Guest Operator"); 
        setSelectedCompanies([]);
    };

    // ROLE ACTIONS
    const toggleWebPermission = (category: string, page: string) => {
        setRoleWebPerm((prev: any) => {
            const current = prev[category] || [];
            const next = current.includes(page) 
                ? current.filter((p: string) => p !== page) 
                : [...current, page];
            return { ...prev, [category]: next };
        });
    };

    const toggleMobPermission = (page: string) => {
        setRoleMobPerm((prev: string[]) => 
            prev.includes(page) ? prev.filter(p => p !== page) : [...prev, page]
        );
    };

    const handleSelectAllCategory = (category: string, allPages: string[]) => {
        setRoleWebPerm((prev: any) => ({
            ...prev,
            [category]: allPages
        }));
    };

    const handleClearCategory = (category: string) => {
        setRoleWebPerm((prev: any) => ({
            ...prev,
            [category]: []
        }));
    };

    const handleSaveRole = () => {
        if (!roleName.trim()) {
            toast.error("Role Name is required");
            return;
        }

        setSaving(true);
        const payload = {
            role_name: roleName.trim(),
            web_permissions: roleWebPerm,
            mobile_permissions: roleMobPerm
        };

        const req = editingRoleId
            ? axios.put(`http://${window.location.hostname}:8381/admin/roles/${editingRoleId}`, payload)
            : axios.post(`http://${window.location.hostname}:8381/admin/roles`, payload);

        req.then(res => {
            if (res.data.status === 'success') {
                toast.success(editingRoleId ? "Role updated successfully!" : "Role defined successfully!");
                handleCloseRoleModal();
                fetchData();
            } else {
                toast.error(`Operation failed: ` + res.data.message);
            }
        }).catch(() => toast.error("Network Error"))
            .finally(() => setSaving(false));
    };

    const handleEditRole = (row: any) => {
        setRoleName(row.role_name || "");
        
        let web = row.web_permissions || {};
        if (typeof web === 'string') {
            try { web = JSON.parse(web); } catch (e) {}
        }
        setRoleWebPerm({
            "Home": web.Home || [],
            "Config": web.Config || [],
            "Logs": web.Logs || []
        });

        let mob = row.mobile_permissions || [];
        if (typeof mob === 'string') {
            try { mob = JSON.parse(mob); } catch (e) {}
        }
        setRoleMobPerm(mob);
        
        setEditingRoleId(row.slno);
        setIsRoleModalOpen(true);
    };

    const handleDeleteRole = (slno: number) => {
        if (!window.confirm("Are you sure you want to delete this Role profile? Users mapped to this role may lose page authorization.")) return;
        setLoading(true);
        axios.delete(`http://${window.location.hostname}:8381/admin/roles/${slno}`)
            .then(res => {
                if (res.data.status === 'success') {
                    toast.success("Role successfully deleted.");
                    fetchData();
                } else {
                    toast.error(res.data.message);
                    setLoading(false);
                }
            })
            .catch(() => { toast.error("Network Error"); setLoading(false); });
    };

    const handleCloseRoleModal = () => {
        setIsRoleModalOpen(false);
        setEditingRoleId(null);
        setRoleName("");
        setRoleWebPerm({
            "Home": ["Main", "Dynamic"],
            "Config": [],
            "Logs": []
        });
        setRoleMobPerm([]);
    };

    // React Table Columns for Users list
    const columns = useMemo<ColumnDef<any, any>[]>(() => [
        {
            accessorKey: 'userrole',
            header: 'Security Role',
            cell: info => {
                const r = info.getValue() || 'Guest Operator';
                const isAdmin = r.toLowerCase().includes('admin');
                return isAdmin ? (
                    <span className="px-3 py-1 bg-rose-50 text-rose-700 rounded-md text-[10px] font-black tracking-widest uppercase border border-rose-100 flex items-center gap-1.5 w-fit">
                        <Shield size={10} className="fill-rose-700/10" />
                        {r}
                    </span>
                ) : (
                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-black tracking-widest uppercase border border-emerald-100 flex items-center gap-1.5 w-fit">
                        <UserCog size={10} />
                        {r}
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
                        <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold flex items-center justify-center border border-slate-200 capitalize">
                            {u.firstname?.[0]}{u.lastname?.[0] || ''}
                        </div>
                        <div className="flex flex-col">
                            <span className="font-bold text-slate-800 text-xs capitalize">{u.firstname} {u.lastname}</span>
                            <span className="text-[10px] text-teal-600 font-mono font-medium">{u.loginid}</span>
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
                    <div className="flex flex-wrap gap-1">
                        {compArr.length > 0 ? compArr.map(cod => (
                            <span key={cod} title={cod} className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-[9px] uppercase font-bold border border-slate-100 max-w-[90px] truncate">
                                {cod}
                            </span>
                        )) : <span className="text-slate-400 text-[10px] italic">Global Access Pending</span>}
                    </div>
                );
            }
        },
        {
            id: 'actions',
            header: 'Actions',
            enableSorting: false,
            size: 130,
            cell: (info) => (
                <div className="flex items-center gap-2">
                    <button title="Reset Password" onClick={() => handleEditUser(info.row.original)} className="text-slate-400 hover:text-amber-500 transition-all p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow hover:scale-105 active:scale-95">
                        <KeySquare size={13} />
                    </button>
                    <button title="Edit Identity" onClick={() => handleEditUser(info.row.original)} className="text-slate-400 hover:text-emerald-500 transition-all p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow hover:scale-105 active:scale-95">
                        <Edit2 size={13} />
                    </button>
                    <button title="Revoke Access" onClick={() => handleDeleteUser(info.row.original.slno)} className="text-slate-400 hover:text-rose-500 transition-all p-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow hover:scale-105 active:scale-95">
                        <Trash2 size={13} />
                    </button>
                </div>
            )
        }
    ], [roles, editingId]);

    // Permissions Count Helpers
    const getWebPermissionsCount = (webPerms: any) => {
        let web = webPerms || {};
        if (typeof web === 'string') {
            try { web = JSON.parse(web); } catch (e) {}
        }
        const homeCount = (web.Home || []).length;
        const configCount = (web.Config || []).length;
        const logsCount = (web.Logs || []).length;
        return homeCount + configCount + logsCount;
    };

    const getMobPermissionsCount = (mobPerms: any) => {
        let mob = mobPerms || [];
        if (typeof mob === 'string') {
            try { mob = JSON.parse(mob); } catch (e) {}
        }
        return mob.length;
    };

    return (
        <div className="flex flex-col h-full max-w-7xl mx-auto space-y-6 animate-fade-in">
            {saving && <LoadingOverlay message="Committing security parameters..." />}

            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
                <div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                        <span className="p-3 bg-gradient-to-tr from-emerald-500 to-teal-600 rounded-2xl text-white shadow-lg shadow-emerald-500/20"><UserCog size={22} /></span>
                        Access & Role Control
                    </h2>
                    <p className="text-slate-500 mt-1.5 text-xs font-semibold uppercase tracking-wider">Configure corporate security tiers, operator scopes, and mobile parameters.</p>
                </div>
                
                {/* Tab selector */}
                <div className="flex bg-white p-1 rounded-xl border border-slate-100 shadow-sm w-fit self-start md:self-auto select-none">
                    <button 
                        onClick={() => setActiveTab('users')}
                        className={`px-5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${activeTab === 'users' ? 'bg-slate-900 text-white shadow' : 'text-slate-400 hover:text-slate-700'}`}
                    >
                        User Accounts
                    </button>
                    <button 
                        onClick={() => setActiveTab('roles')}
                        className={`px-5 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${activeTab === 'roles' ? 'bg-slate-900 text-white shadow' : 'text-slate-400 hover:text-slate-700'}`}
                    >
                        Role Definitions
                    </button>
                </div>
            </header>

            {activeTab === 'users' ? (
                // USER ACCOUNTS TAB
                <div className="space-y-6 flex-1 flex flex-col">
                    <div className="flex items-center justify-between shrink-0">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Active System Logins</span>
                        <button
                            onClick={() => setIsAddModalOpen(true)}
                            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                        >
                            <Plus size={14} /> Provision User
                        </button>
                    </div>

                    <div className="flex-1 min-h-[400px]">
                        {loading ? (
                            <div className="flex items-center justify-center h-64 text-slate-400 bg-white rounded-[2rem] border border-slate-100 shadow-xl">
                                <AlertCircle size={32} className="animate-pulse text-teal-400" />
                            </div>
                        ) : (
                            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
                                <DataTable
                                    columns={columns}
                                    data={users}
                                    exportFilename="IAM_Identity_Roster"
                                    searchPlaceholder="Search operator identities..."
                                />
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                // ROLE DEFINITIONS TAB
                <div className="space-y-6 flex-1 flex flex-col">
                    <div className="flex items-center justify-between shrink-0">
                        <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">Authorization Scope Profiles</span>
                        <button
                            onClick={() => setIsRoleModalOpen(true)}
                            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-slate-900/20 active:scale-95"
                        >
                            <Plus size={14} /> Define Role
                        </button>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center h-64 text-slate-400 bg-white rounded-[2rem] border border-slate-100 shadow-xl">
                            <AlertCircle size={32} className="animate-pulse text-teal-400" />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1">
                            {roles.map(r => {
                                const wCount = getWebPermissionsCount(r.web_permissions);
                                const mCount = getMobPermissionsCount(r.mobile_permissions);
                                const isSysAdmin = r.role_name.toLowerCase().includes('admin');
                                return (
                                    <div key={r.slno} className="bg-white rounded-[2rem] border border-slate-100 shadow-lg hover:shadow-xl hover:border-slate-200 transition-all p-6 flex flex-col justify-between group">
                                        <div>
                                            <div className="flex items-center justify-between mb-4">
                                                <div className={`p-2.5 rounded-xl ${isSysAdmin ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                    <Shield size={20} className={isSysAdmin ? 'fill-rose-500/10' : ''} />
                                                </div>
                                                <span className="text-[10px] font-black uppercase text-slate-400 font-mono tracking-wider">Tier #{r.slno}</span>
                                            </div>
                                            <h4 className="text-base font-black text-slate-800 tracking-tight capitalize mb-1">{r.role_name}</h4>
                                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest leading-none mb-4">Custom RBAC Profile</p>
                                            
                                            <div className="space-y-2 mt-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-50 shadow-inner">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                                        <Laptop size={12} className="text-slate-400" /> Web Authorization
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[9px] font-bold font-mono">
                                                        {wCount} / 17 Pages
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                                        <Smartphone size={12} className="text-slate-400" /> Mobile Authorization
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[9px] font-bold font-mono">
                                                        {mCount} / 3 Views
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 mt-6">
                                            <button 
                                                title="Edit Role Scope" 
                                                onClick={() => handleEditRole(r)}
                                                className="p-2 text-slate-400 hover:text-emerald-500 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 transition-colors shadow-sm active:scale-95"
                                            >
                                                <Edit2 size={13} />
                                            </button>
                                            <button 
                                                title="Delete Role" 
                                                onClick={() => handleDeleteRole(r.slno)}
                                                className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-100 transition-colors shadow-sm active:scale-95"
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Add User Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col border border-slate-100">
                        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">{editingId ? 'Modify Identity Parameters' : 'Provision Identity Credentials'}</h3>
                                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5 leading-none">Access Matrix Provisioning</p>
                            </div>
                            <button onClick={handleCloseModal} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors rounded-full bg-white border border-slate-100 shadow-sm active:scale-95">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto flex-1 space-y-6 bg-slate-50/30">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">First Name *</label>
                                    <input value={fName} onChange={e => setFName(e.target.value)} maxLength={20} type="text" className="w-full px-4 py-2.5 border border-slate-200 hover:border-slate-300 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none bg-white transition-all text-xs font-semibold text-slate-700" placeholder="John" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">Last Name</label>
                                    <input value={lName} onChange={e => setLName(e.target.value)} maxLength={20} type="text" className="w-full px-4 py-2.5 border border-slate-200 hover:border-slate-300 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none bg-white transition-all text-xs font-semibold text-slate-700" placeholder="Doe" />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">Login ID *</label>
                                    <input value={loginId} onChange={e => setLoginId(e.target.value)} type="text" className="w-full px-4 py-2.5 border border-slate-200 hover:border-slate-300 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none bg-white transition-all text-xs font-mono font-bold tracking-tight text-slate-700" placeholder="user_admin" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">Security Role</label>
                                    <select value={role} onChange={e => setRole(e.target.value)} className="w-full px-4 py-2.5 border border-slate-200 hover:border-slate-300 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none bg-white transition-all text-xs font-black text-slate-700">
                                        {roles.map(r => (
                                            <option key={r.slno} value={r.role_name}>{r.role_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="relative">
                                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">{editingId ? 'New Password (Leave blank to keep current)' : 'Raw Password *'}</label>
                                <input value={password} onChange={e => setPassword(e.target.value)} type="text" className="w-full px-4 py-2.5 pl-10 border border-slate-200 hover:border-slate-300 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none bg-amber-50/40 focus:bg-white transition-all text-xs font-mono font-bold text-slate-700" placeholder={editingId ? "••••••••" : "Secret123!"} />
                                <KeySquare size={14} className="absolute left-3.5 top-[33px] text-amber-500" />
                                <p className="text-[10px] text-slate-400 font-medium mt-1.5">Provide secure credentials. Enforce alphanumeric character mappings.</p>
                            </div>

                            <div className="border border-slate-100 rounded-[1.5rem] overflow-hidden bg-white shadow-sm border border-slate-100 mt-4">
                                <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100">
                                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">Company Boundary Mapping</h4>
                                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">Filter which corporate instances this login profile has authorization to view.</p>
                                </div>
                                <div className="p-6 grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                                    {customers.length === 0 ? <span className="text-xs text-slate-400 italic">No corporate profiles configured in database.</span> : null}
                                    {customers.map(c => (
                                        <label key={c.slno} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-all group">
                                            <input
                                                type="checkbox"
                                                checked={selectedCompanies.includes(c.customer_code)}
                                                onChange={() => toggleCompany(c.customer_code)}
                                                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 focus:ring-offset-0 transition-all cursor-pointer"
                                            />
                                            <div className="flex flex-col select-none">
                                                <span className="text-xs font-black text-slate-700 group-hover:text-slate-900 transition-colors capitalize">{c.customername}</span>
                                                <span className="text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider mt-0.5">{c.customer_code}</span>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                            <button onClick={handleCloseModal} className="px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors active:scale-95">
                                Cancel
                            </button>
                            <button onClick={handleSaveUser} className="px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl hover:from-emerald-400 hover:to-teal-500 transition-colors shadow-lg shadow-emerald-500/20 active:scale-95">
                                {editingId ? 'Commit Modification' : 'Commit Credentials'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Role Modal */}
            {isRoleModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col border border-slate-100">
                        <div className="px-8 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">{editingRoleId ? 'Modify Role Scope & Authentications' : 'Define Role Authentication Matrix'}</h3>
                                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mt-0.5 leading-none">Security Scope Configuration</p>
                            </div>
                            <button onClick={handleCloseRoleModal} className="w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors rounded-full bg-white border border-slate-100 shadow-sm active:scale-95">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-8 overflow-y-auto flex-1 space-y-6 bg-slate-50/30">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1.5">Uniquely Identifiable Role Name *</label>
                                <input value={roleName} onChange={e => setRoleName(e.target.value)} type="text" className="w-full px-4 py-2.5 border border-slate-200 hover:border-slate-300 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none bg-white transition-all text-xs font-black text-slate-700" placeholder="e.g. Regional Manager, General Operator" />
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Web Pages Authentication Card */}
                                <div className="border border-slate-100 rounded-[1.5rem] bg-white p-6 shadow-sm flex flex-col">
                                    <h4 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 mb-1">
                                        <Laptop size={16} className="text-emerald-500" /> Web Platform Access
                                    </h4>
                                    <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-4">Toggle allocated browser layout screens</p>
                                    
                                    <div className="space-y-4 flex-1">
                                        {Object.entries(categoriesConfig).map(([cat, pages]) => {
                                            const activePages = roleWebPerm[cat] || [];
                                            return (
                                                <div key={cat} className="border border-slate-100 rounded-2xl p-4 space-y-3">
                                                    <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                                        <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">{cat}</span>
                                                        <div className="flex items-center gap-2 text-[9px] font-bold">
                                                            <button 
                                                                type="button"
                                                                onClick={() => handleSelectAllCategory(cat, pages)}
                                                                className="text-emerald-600 hover:underline"
                                                            >
                                                                Select All
                                                            </button>
                                                            <span className="text-slate-300">|</span>
                                                            <button 
                                                                type="button"
                                                                onClick={() => handleClearCategory(cat)}
                                                                className="text-slate-400 hover:underline"
                                                            >
                                                                Clear
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {pages.map(page => {
                                                            const isChecked = activePages.includes(page);
                                                            return (
                                                                <label key={page} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-slate-50 cursor-pointer text-xs font-semibold text-slate-600 select-none transition-colors group">
                                                                    <input 
                                                                        type="checkbox"
                                                                        checked={isChecked}
                                                                        onChange={() => toggleWebPermission(cat, page)}
                                                                        className="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer"
                                                                    />
                                                                    <span className="group-hover:text-slate-900 transition-colors">{page}</span>
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Mobile App Authentication Card */}
                                <div className="border border-slate-100 rounded-[1.5rem] bg-white p-6 shadow-sm flex flex-col self-start w-full">
                                    <h4 className="text-sm font-black text-slate-800 tracking-tight flex items-center gap-2 mb-1">
                                        <Smartphone size={16} className="text-indigo-500" /> Mobile Platform Access
                                    </h4>
                                    <p className="text-slate-400 text-[9px] font-black uppercase tracking-widest mb-4">Toggle allocated mobile application scopes</p>
                                    
                                    <div className="border border-slate-100 rounded-2xl p-4 space-y-3">
                                        <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                                            <span className="text-[10px] font-black uppercase text-indigo-500 tracking-wider">Mobile Views</span>
                                            <div className="flex items-center gap-2 text-[9px] font-bold">
                                                <button 
                                                    type="button"
                                                    onClick={() => setRoleMobPerm(mobilePages)}
                                                    className="text-indigo-600 hover:underline"
                                                >
                                                    Select All
                                                </button>
                                                <span className="text-slate-300">|</span>
                                                <button 
                                                    type="button"
                                                    onClick={() => setRoleMobPerm([])}
                                                    className="text-slate-400 hover:underline"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-2.5">
                                            {mobilePages.map(page => {
                                                const isChecked = roleMobPerm.includes(page);
                                                return (
                                                    <label key={page} className="flex items-center gap-3 p-3 rounded-xl border border-slate-50 hover:bg-slate-50/50 cursor-pointer text-xs font-semibold text-slate-600 select-none transition-colors group">
                                                        <input 
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => toggleMobPermission(page)}
                                                            className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 focus:ring-offset-0 cursor-pointer"
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className="text-xs font-black text-slate-700 group-hover:text-slate-900 transition-colors uppercase tracking-wider">{page} View</span>
                                                            <span className="text-[9px] text-slate-400 leading-none mt-1">Allows authorization mapping for mobile integration</span>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                            <button onClick={handleCloseRoleModal} className="px-6 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors active:scale-95">
                                Cancel
                            </button>
                            <button onClick={handleSaveRole} className="px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors shadow-lg active:scale-95">
                                {editingRoleId ? 'Commit Scope Modification' : 'Commit Scope Configuration'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
