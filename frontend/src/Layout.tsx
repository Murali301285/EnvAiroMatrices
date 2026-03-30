import { useState, useRef, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
    Menu, Search, Bell, Mail,
    LayoutDashboard, Users, HardDrive, Settings,
    FileJson, ChevronDown, ChevronRight,
    Zap, Shield, Code, List, Calendar, AlertTriangle, Radio
} from 'lucide-react';
import { toast } from './utils/toast';

export default function Layout({ }: { wsStatus?: string }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [openMenus, setOpenMenus] = useState<string[]>(['Home', 'Config', 'Logs']);
    const [profileOpen, setProfileOpen] = useState(false);
    const profileRef = useRef<HTMLDivElement>(null);

    const [user, setUser] = useState<any>(null);

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

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout>;

        const resetTimer = () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                localStorage.removeItem('env_user');
                toast.error("Session strictly terminated due to 5 minutes of inactivity.");
                navigate('/');
            }, 300000); // 5 minutes strictly
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
                { name: 'Error', path: '/error', icon: <AlertTriangle size={18} /> },
                { name: 'Events', path: '/events', icon: <Radio size={18} /> },
            ]
        }
    ];

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
                    {menuConfig.map((section) => (
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
                                className="w-9 h-9 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm cursor-pointer hover:ring-4 ring-emerald-600/20 transition-all shadow-sm shadow-emerald-600/20 select-none uppercase tracking-wider"
                            >
                                {user ? user.firstname?.[0] || 'U' : 'U'}
                            </div>

                            {profileOpen && (
                                <div className="absolute right-0 top-12 w-56 bg-white rounded-2xl shadow-2xl shadow-slate-300/60 border border-slate-100 overflow-hidden py-2 animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                                    <div className="px-4 py-3 bg-slate-50/50 border-b border-slate-100 mb-2">
                                        <p className="text-sm font-bold text-slate-800 capitalize">{user ? `${user.firstname} ${user.lastname}` : 'Guest User'}</p>
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">{user ? user.userrole : 'Unknown'}</p>
                                    </div>
                                    <div className="flex flex-col">
                                        <button className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors">
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
        </div>
    );
}
