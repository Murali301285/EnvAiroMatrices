import { toast as toastify } from 'react-toastify';

export const toast = {
    success: (msg: string) => {
        toastify.success(msg, { 
            autoClose: 2000,
            theme: "colored",
            style: { backgroundColor: '#0d9488', color: 'white' },
            // @ts-ignore
            progressStyle: { background: 'rgba(255, 255, 255, 0.4)' }
        });
    },
    error: (msg: string, err?: any) => {
        console.error("[UI Validation Error]: ", msg, err || "");
        toastify.error(msg, { autoClose: 4000 });
    },
    info: (msg: string, opts?: any) => {
        toastify.info(msg, opts);
    }
};
