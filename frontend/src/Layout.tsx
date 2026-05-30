import { useState, useRef, useEffect, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
    Menu, Search, Bell, Mail,
    LayoutDashboard, Users, HardDrive, Settings,
    FileJson, ChevronDown, ChevronRight,
    Zap, Shield, Code, List, Calendar, AlertTriangle, Radio, Activity, Globe,
    X, Upload
} from 'lucide-react';
import axios from 'axios';
import { toast } from './utils/toast';

const menuConfig = [
    {
        title: 'Home',
        items: [
            { name: 'Main', path: '/dashboard', icon: <LayoutDashboard size={18} /> },
            { name: 'Dynamic', path: '/dynamic', icon: <Zap size={18} /> },
        ]
    },
    {
        title: 'Config',
        items: [
            { name: 'Customers', path: '/customers', icon: <Users size={18} /> },
            { name: 'Parameters', path: '/parameters', icon: <Settings size={18} /> },
            { name: 'Devices', path: '/devices', icon: <HardDrive size={18} /> },
            { name: 'Param Mapping', path: '/param-mapping', icon: <Code size={18} /> },
            { name: 'JSON Formatter', path: '/formatters', icon: <FileJson size={18} /> },
            { name: 'JSON Mapping', path: '/json-mapping', icon: <List size={18} /> },
            { name: 'Scheduler', path: '/scheduler', icon: <Calendar size={18} /> },
            { name: 'Users', path: '/users', icon: <Shield size={18} /> },
        ]
    },
    {
        title: 'Logs',
        items: [
            { name: 'Alert Monitor', path: '/alerts', icon: <Activity size={18} /> },
            { name: 'PCH Logs', path: '/pch-logs', icon: <Activity size={18} /> },
            { name: 'API Post Monitor', path: '/api-monitor', icon: <Globe size={18} /> },
            { name: 'JSON Monitor', path: '/json-monitor', icon: <FileJson size={18} /> },
            { name: 'API Access Logs', path: '/api-logs', icon: <Code size={18} /> },
            { name: 'Error', path: '/error', icon: <AlertTriangle size={18} /> },
            { name: 'Events', path: '/events', icon: <Radio size={18} /> },
        ]
    }
];

export default function Layout({ }: { wsStatus?: string }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [openMenus, setOpenMenus] = useState<string[]>(['Home', 'Config', 'Logs']);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    const [user, setUser] = useState<any>(null);

    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
    const [profileForm, setProfileForm] = useState({
        firstname: '',
        lastname: '',
        email: '',
        remarks: '',
        password: '',
        loginid: '',
        profile_image: ''
    });
    const [profileImgPreview, setProfileImgPreview] = useState<string | null>(null);
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    useEffect(() => {
        if (isProfileModalOpen && user) {
            setProfileForm({
                firstname: user.firstname || '',
                lastname: (user.lastname && user.lastname !== 'None' && user.lastname !== 'null' && user.lastname !== 'Null') ? user.lastname : '',
                email: user.email || '',
                remarks: user.remarks || '',
                password: '',
                loginid: user.loginid || '',
                profile_image: user.profile_image || ''
            });
            setProfileImgPreview(user.profile_image || null);
        }
    }, [isProfileModalOpen, user]);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            toast.error("File size must be strictly under 5MB!");
            return;
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
        if (!allowedTypes.includes(file.type)) {
            toast.error("Only JPEG or PNG images are allowed!");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            setProfileImgPreview(base64String);
            setProfileForm(prev => ({ ...prev, profile_image: base64String }));
        };
        reader.readAsDataURL(file);
    };

    const handleSaveProfile = () => {
        if (!profileForm.firstname.trim()) {
            toast.error("First Name is strictly required.");
            return;
        }

        if (profileForm.password && profileForm.password.length < 6) {
            toast.error("New Password must be at least 6 characters long.");
            return;
        }

        setIsSavingProfile(true);
        axios.put(`http://${window.location.hostname}:8381/admin/profile/${user.slno}`, {
            firstname: profileForm.firstname,
            lastname: profileForm.lastname,
            email: profileForm.email,
            remarks: profileForm.remarks,
            profile_image: profileForm.profile_image,
            password: profileForm.password
        }).then(res => {
            if (res.data.status === 'success') {
                const updatedUser = res.data.data;
                setUser(updatedUser);
                localStorage.setItem('env_user', JSON.stringify(updatedUser));
                toast.success("Profile updated successfully!");
                setIsProfileModalOpen(false);
            } else {
                toast.error(res.data.message || "Failed to update profile.");
            }
        }).catch(err => {
            console.error(err);
            toast.error("Network error: failed to update profile.");
        }).finally(() => {
            setIsSavingProfile(false);
        });
    };

    useEffect(() => {
        const storedUser = localStorage.getItem('env_user');
        if (!storedUser) {
            toast.error("Access Denied: Invalid Session State");
            navigate('/');
            return;
        }
        try {
            setUser(JSON.parse(storedUser));
        } catch (e) {
            localStorage.removeItem('env_user');
            navigate('/');
        }
    }, [navigate]);

    const filteredMenuConfig = useMemo(() => {
        if (!user) return [];
        const isSysAdmin = user.userrole === 'Admin' || user.userrole === 'SYS_ADMIN';
        const perms = user.web_permissions;
        if (!perms && isSysAdmin) return menuConfig;
        if (!perms) return [];
        return menuConfig
            .map(section => {
                const sectionPerms = perms[section.title];
                if (!sectionPerms) return null;
                const items = section.items.filter(item => sectionPerms.includes(item.name));
                if (items.length === 0) return null;
                return { ...section, items };
            })
            .filter(Boolean) as typeof menuConfig;
    }, [user]);

    useEffect(() => {
        if (!user) return;
        if (location.pathname === '/') return;
        const isSysAdmin = user.userrole === 'Admin' || user.userrole === 'SYS_ADMIN';
        const perms = user.web_permissions;
        if (!perms && isSysAdmin) return;
        let matchedItem: any = null;
        let matchedSectionTitle = "";
        for (const section of menuConfig) {
            const found = section.items.find(item => item.path === location.pathname);
            if (found) {
                matchedItem = found;
                matchedSectionTitle = section.title;
                break;
            }
        }
        if (!matchedItem) return;
        const sectionPerms = perms?.[matchedSectionTitle] || [];
        const hasAccess = sectionPerms.includes(matchedItem.name);
        if (!hasAccess) {
            toast.error(`Access Denied: You do not have permission to access the ${matchedItem.name} page.`);
            let fallbackPath = "/";
            outerLoop: for (const sec of menuConfig) {
                const secPerms = perms?.[sec.title] || [];
                for (const item of sec.items) {
                    if (secPerms.includes(item.name)) {
                        fallbackPath = item.path;
                        break outerLoop;
                    }
                }
            }
            if (fallbackPath === "/" && isSysAdmin) {
                fallbackPath = "/dashboard";
            }
            navigate(fallbackPath);
        }
    }, [location.pathname, user, navigate]);

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        const resetTimer = () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                localStorage.removeItem('env_user');
                toast.error("Session time out");
                navigate('/');
            }, 1800000); // 30 minutes strictly
        };

        const events = ['mousemove', 'keydown', 'click', 'scroll'];
        events.forEach(event => window.addEventListener(event, resetTimer));

        resetTimer();

        return () => {
            if (timeoutId) clearTimeout(timeoutId);
            events.forEach(event => window.removeEventListener(event, resetTimer));
        };
    }, [navigate]);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
                setProfileOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggleMenu = (title: string) => {
        setOpenMenus(prev => prev.includes(title) ? prev.filter(m => m !== title) : [...prev, title]);
    };



    return (
        <div className="min-h-screen bg-slate-50 text-slate-800 flex font-sans w-full">
            <aside className={`bg-white border-r border-slate-200 flex flex-col shadow-xl z-20 transition-all duration-300 flex-shrink-0 ${sidebarOpen ? 'w-56' : 'w-0 overflow-hidden border-none opacity-0'}`}>
                {/* LOGO AREA */}
                <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-100 min-w-[224px]">
                    <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
                    <span className="text-xl font-bold tracking-tight text-slate-800">EnvAiroMetrics</span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto w-56 p-3 space-y-1">
                    {filteredMenuConfig.map((section) => (
                        <div key={section.title} className="mb-2">
                            <button
                                onClick={() => toggleMenu(section.title)}
                                className="w-full flex items-center justify-between px-3 py-2 text-slate-500 hover:text-slate-800 rounded-lg transition-colors group"
                            >
                                <span className="text-sm font-bold tracking-wider uppercase">{section.title}</span>
                                <div className="p-1 rounded bg-slate-50 group-hover:bg-slate-100 transition-colors">
                                    {openMenus.includes(section.title) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </div>
                            </button>
                            <div className={`mt-1 space-y-1 overflow-hidden transition-all duration-300 ${openMenus.includes(section.title) ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                                {section.items.map((item) => {
                                    const isActive = location.pathname === item.path;
                                    return (
                                        <Link key={item.path} to={item.path}
                                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm ${isActive ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20 font-medium' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'}`}>
                                            {item.icon}
                                            <span>{item.name}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden relative bg-slate-50/50 min-w-0">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 via-teal-500 to-emerald-700 z-50 pointer-events-none"></div>

                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-50 w-full shrink-0 relative">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors border border-transparent hover:border-slate-200">
                            <Menu size={20} />
                        </button>
                        <div className="relative hidden md:block group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={16} />
                            <input type="text" placeholder="Search..." className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all" />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                        <button className="relative p-2 bg-slate-50 text-slate-500 border border-slate-100 rounded-full hover:bg-slate-100 hover:text-slate-700 transition-colors mr-2">
                            <Bell size={16} />
                            <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
                        </button>

                        {/* Profile Dropdown */}
                        <div className="relative" ref={profileRef}>
                            <div
                                onClick={() => setProfileOpen(!profileOpen)}
                                className="w-9 h-9 rounded-full cursor-pointer hover:ring-4 ring-emerald-600/20 transition-all shadow-sm select-none overflow-hidden"
                            >
                                {user && user.profile_image ? (
                                    <img src={user.profile_image} alt="Avatar" className="w-full h-full object-cover rounded-full" />
                                ) : (
                                    <div className="w-full h-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm uppercase tracking-wider">
                                        {user ? user.firstname?.[0] || 'U' : 'U'}
                                    </div>
                                )}
                            </div>

                            {profileOpen && (
                                <div className="absolute right-0 top-12 w-56 bg-white rounded-2xl shadow-2xl shadow-slate-300/60 border border-slate-100 overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                                    <div className="px-4 py-3 bg-slate-50/50 border-b border-slate-100 mb-2">
                                        <p className="text-sm font-bold text-slate-800 capitalize">
                                            {user ? `${user.firstname || ''} ${user.lastname && user.lastname !== 'None' && user.lastname !== 'null' && user.lastname !== 'Null' ? user.lastname : ''}`.trim() : 'Guest User'}
                                        </p>
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">{user ? user.userrole : 'Unknown'}</p>
                                    </div>
                                    <div className="flex flex-col">
                                        <button 
                                            onClick={() => {
                                                setIsProfileModalOpen(true);
                                                setProfileOpen(false);
                                            }}
                                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors w-full text-left"
                                        >
                                            <Users size={16} className="text-slate-400" /> My Profile
                                        </button>
                                        <button className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-emerald-600 bg-emerald-50 transition-colors w-full text-left">
                                            <Mail size={16} className="text-emerald-500" /> Inbox
                                        </button>
                                        <div className="h-px bg-slate-100 my-1"></div>
                                        <button
                                            onClick={() => {
                                                localStorage.removeItem('env_user');
                                                navigate('/');
                                            }}
                                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors w-full text-left"
                                        >
                                            <svg className="w-4 h-4 text-slate-400 group-hover:text-rose-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                            Logout
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto w-full flex flex-col">
                    <div className="flex-1 p-6 md:p-8">
                        <Outlet />
                    </div>

                    {/* Footer */}
                    <footer className="py-4 px-6 md:px-8 text-sm text-slate-500 border-t border-slate-200 bg-white/50">
                        <div className="max-w-7xl mx-auto flex items-center justify-between w-full">
                            <span className="font-medium">© 2026 Silotech</span>
                            <span className="text-xs">All rights reserved.</span>
                        </div>
                    </footer>
                </div>
            </main>

            {isProfileModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white/95 backdrop-blur-md rounded-3xl border border-slate-100 shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="relative px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                            <div>
                                <h3 className="text-xl font-bold text-slate-800">My Profile</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Manage your personal settings, security credentials, and profile image.</p>
                            </div>
                            <button 
                                onClick={() => setIsProfileModalOpen(false)}
                                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Avatar Column */}
                                <div className="md:col-span-1 flex flex-col items-center">
                                    <div className="relative group w-28 h-28 mb-3">
                                        <div className="w-28 h-28 rounded-full overflow-hidden border-4 border-white shadow-md bg-emerald-50 border-emerald-100 flex items-center justify-center font-bold text-emerald-600 select-none">
                                            {profileImgPreview ? (
                                                <img src={profileImgPreview} alt="Preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="text-4xl uppercase">{profileForm.firstname?.[0] || 'U'}</span>
                                            )}
                                        </div>
                                        <label className="absolute inset-0 bg-slate-900/60 rounded-full opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white text-[11px] font-semibold cursor-pointer transition-all duration-200 gap-1.5 backdrop-blur-[1px]">
                                            <Upload size={16} />
                                            <span>Change Photo</span>
                                            <input 
                                                type="file" 
                                                accept="image/png, image/jpeg" 
                                                onChange={handleImageUpload} 
                                                className="hidden" 
                                            />
                                        </label>
                                    </div>
                                    <div className="text-center space-y-1">
                                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Profile Photo</p>
                                        <p className="text-[10px] text-slate-400">JPEG, PNG only (Max 5MB)</p>
                                    </div>
                                </div>
                                
                                {/* Form Fields Column */}
                                <div className="md:col-span-2 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">First Name</label>
                                            <input 
                                                type="text" 
                                                value={profileForm.firstname}
                                                onChange={e => setProfileForm(prev => ({ ...prev, firstname: e.target.value }))}
                                                className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium text-slate-700" 
                                                placeholder="e.g. John" 
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Last Name</label>
                                            <input 
                                                type="text" 
                                                value={profileForm.lastname}
                                                onChange={e => setProfileForm(prev => ({ ...prev, lastname: e.target.value }))}
                                                className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium text-slate-700" 
                                                placeholder="e.g. Doe" 
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Login ID (Username)</label>
                                        <input 
                                            type="text" 
                                            value={profileForm.loginid}
                                            disabled
                                            className="w-full px-3.5 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm font-semibold text-slate-500 cursor-not-allowed select-none outline-none" 
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1.5">Username/Login ID is read-only.</p>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Email Address</label>
                                        <input 
                                            type="email" 
                                            value={profileForm.email}
                                            onChange={e => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                                            className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium text-slate-700" 
                                            placeholder="e.g. john.doe@company.com" 
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">New Password</label>
                                        <input 
                                            type="password" 
                                            value={profileForm.password}
                                            onChange={e => setProfileForm(prev => ({ ...prev, password: e.target.value }))}
                                            className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium text-slate-700" 
                                            placeholder="•••••••• (leave blank to keep current)" 
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1.5">Must be at least 6 characters if you decide to update it.</p>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Remarks</label>
                                        <textarea 
                                            rows={2}
                                            value={profileForm.remarks}
                                            onChange={e => setProfileForm(prev => ({ ...prev, remarks: e.target.value }))}
                                            className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100/50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-medium text-slate-700 resize-none" 
                                            placeholder="Enter any additional profile remarks..." 
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                            <button 
                                type="button" 
                                onClick={() => setIsProfileModalOpen(false)}
                                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                                disabled={isSavingProfile}
                            >
                                Cancel
                            </button>
                            <button 
                                type="button" 
                                onClick={handleSaveProfile}
                                disabled={isSavingProfile}
                                className="px-5 py-2 text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 rounded-xl shadow-md shadow-emerald-500/15 hover:shadow-emerald-500/35 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {isSavingProfile ? 'Saving Changes...' : 'Save Profile'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
