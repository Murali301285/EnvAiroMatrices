import { Loader2 } from 'lucide-react';

export default function LoadingOverlay({ message = "Processing..." }: { message?: string }) {
    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white px-8 py-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95 border border-slate-100">
                <Loader2 className="w-10 h-10 text-teal-500 animate-spin" />
                <p className="font-bold text-slate-700 tracking-tight">{message}</p>
            </div>
        </div>
    );
}
