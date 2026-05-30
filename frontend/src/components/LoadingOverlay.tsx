import { ShieldAlert } from 'lucide-react';

export default function LoadingOverlay({ message = "Processing..." }: { message?: string }) {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white/95 px-10 py-8 rounded-[2rem] shadow-2xl flex flex-col items-center text-center max-w-sm animate-in zoom-in-95 border border-slate-100 relative overflow-hidden">
                {/* Visual Premium Gradient Spinner */}
                <div className="relative w-20 h-20 flex items-center justify-center mb-6">
                    {/* Outer Ring */}
                    <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-500 border-r-teal-600 animate-spin"></div>
                    
                    {/* Inner Counter-spinning Ring */}
                    <div className="absolute inset-2 rounded-full border-4 border-transparent border-b-indigo-500 border-l-purple-600 animate-[spin_1.5s_linear_infinite_reverse]"></div>
                    
                    {/* Center Pulsing Icon */}
                    <div className="absolute w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-emerald-500 animate-pulse shadow-sm">
                        <ShieldAlert size={16} />
                    </div>
                </div>

                {/* Primary Message */}
                <h4 className="font-black text-slate-800 tracking-tight text-base mb-2">{message}</h4>
                
                {/* Wait Indicators */}
                <p className="text-slate-500 text-xs font-semibold leading-relaxed mb-4">
                    Performing secure database operations and updating authority matrices.
                </p>
                
                {/* Bold Server Indicator Alert */}
                <div className="px-4 py-2 bg-amber-50 text-amber-800 rounded-xl text-[10px] font-black uppercase tracking-wider border border-amber-100 animate-pulse flex items-center gap-1.5 select-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Please Wait • Do Not Refresh Page
                </div>
            </div>
        </div>
    );
}
