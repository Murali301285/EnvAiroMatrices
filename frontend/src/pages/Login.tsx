import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, User, Eye, EyeOff } from 'lucide-react';
import { toast } from '../utils/toast';
import axios from 'axios';

export default function Login() {
    const navigate = useNavigate();
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginId.trim() || !password.trim()) {
            toast.error("Please enter both Login ID and Password.");
            return;
        }

        setLoading(true);
        axios.post('http://97.74.92.23:8381/admin/login', {
            loginId: loginId,
            password: password
        }).then(res => {
            if (res.data.status === 'success') {
                localStorage.setItem('env_user', JSON.stringify(res.data.data));
                toast.success(`Welcome back, ${res.data.data.firstname}`);
                navigate('/dashboard');
            } else {
                toast.error(res.data.message || "Authentication Failed");
            }
        }).catch(() => toast.error("Network error: Auth server offline"))
            .finally(() => setLoading(false));
    };

    return (
        <div className="min-h-screen flex bg-slate-50 font-sans">
            {/* Left Panel - Hero/Illustration area */}
            <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-50 to-sky-50 items-center justify-center p-12 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.1)_0%,transparent_50%)]"></div>
                <div className="absolute bottom-0 right-0 w-full h-full bg-[radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.1)_0%,transparent_50%)]"></div>

                <div className="relative z-10 w-full max-w-lg bg-white/40 backdrop-blur-3xl rounded-3xl border border-white/60 p-12 shadow-2xl shadow-slate-200/50 flex flex-col items-center justify-center min-h-[500px]">
                    <div className="w-24 h-24 bg-gradient-to-tr from-emerald-400 to-teal-600 rounded-3xl shadow-xl shadow-emerald-500/30 flex items-center justify-center mb-8 rotate-12 transition-transform hover:rotate-0 duration-500">
                        <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-3xl font-extrabold text-slate-800 mb-4 text-center">Welcome to EnvAiroMetrics</h2>
                    <p className="text-slate-500 text-center text-lg leading-relaxed px-4">
                        Your Real-Time Environmental Intelligence Partner.
                    </p>
                </div>
            </div>

            {/* Right Panel - Form Area */}
            <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white z-10 shadow-2xl lg:shadow-none lg:border-l border-slate-100">
                <div className="w-full max-w-md">
                    <div className="flex flex-col items-center justify-center gap-3 mb-10">
                        <img src="/logo.png" alt="Logo" className="w-16 h-16 object-contain" />
                        <span className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-600 to-sky-600 bg-clip-text text-transparent pb-1">EnvAiroMetrics</span>
                    </div>

                    <div className="mb-8 text-center">
                        <h1 className="text-2xl font-extrabold text-slate-800 mb-2 tracking-tight">Sign In to your Account</h1>
                        <p className="text-slate-500">Welcome back! Please enter your details</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-teal-500 transition-colors">
                                <User size={18} />
                            </div>
                            <input
                                type="text"
                                required
                                value={loginId}
                                onChange={e => setLoginId(e.target.value)}
                                className="block w-full pl-11 px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-teal-500 transition-all outline-none"
                                placeholder="Login ID"
                            />
                        </div>

                        <div className="relative group">
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Security Credential</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock size={18} className="text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                                </div>
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 focus:bg-white outline-none transition-all text-slate-700 font-medium"
                                    placeholder="••••••••"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-emerald-500 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between mt-6">
                            <div className="flex items-center">
                                <input
                                    id="remember-me"
                                    name="remember-me"
                                    type="checkbox"
                                    className="h-4 w-4 text-teal-600 focus:ring-emerald-500 border-slate-300 rounded cursor-pointer"
                                />
                                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-600 cursor-pointer">
                                    Remember me
                                </label>
                            </div>

                            <div className="text-sm">
                                <a href="#" className="font-medium text-emerald-500 hover:text-emerald-600 transition-colors">
                                    Forgot Password?
                                </a>
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex justify-center py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all shadow-lg shadow-teal-500/30 hover:shadow-teal-500/50 disabled:opacity-50"
                            >
                                {loading ? 'Authenticating...' : 'Sign In'}
                            </button>
                        </div>
                    </form>


                </div>
            </div>
        </div>
    );
}
