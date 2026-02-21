let worker: Worker | null = null;
let workerPromise: Promise<Worker> | null = null;
let messageId = 0;
const pendingRequests = new Map<number, {
    resolve: (result: string) => void;
    reject: (error: unknown) => void;
}>();

function getWorker(): Promise<Worker> {
    if (worker && worker.terminate) {
        worker.terminate();
        worker = null;
        workerPromise = null;
    }
    
    if (worker && workerPromise) return workerPromise;
    
    worker = new Worker(new URL('./highlightWorker.js', import.meta.url), {
        type: 'module'
    });
    
    workerPromise = new Promise((resolve, reject) => {
        const initMessageId = ++messageId;
        
        const handleMessage = (event: MessageEvent) => {
            const { type, messageId: responseId } = event.data;
            
            if (type === 'init-complete' && responseId === initMessageId) {
                worker?.removeEventListener('message', handleMessage);
                resolve(worker as Worker);
            } else if (type === 'error') {
                worker?.removeEventListener('message', handleMessage);
                reject(new Error(event.data.error));
            }
        };
        
        worker?.addEventListener('message', handleMessage);
        worker?.postMessage({ type: 'init', messageId: initMessageId });
    });
    
    return workerPromise;
}

function normalizeLanguage(lang: string): string {
    const normalized = lang.toLowerCase();
    
    if (normalized === 'js') return 'javascript';
    if (normalized === 'ts') return 'typescript';
    if (normalized === 'jsx') return 'jsx';
    if (normalized === 'tsx') return 'tsx';
    if (normalized === 'py') return 'python';
    if (normalized === 'sh' || normalized === 'shellscript') return 'shell';
    if (normalized === 'dockerfile') return 'dockerfile';
    
    return normalized;
}

export async function highlightCodeAsync(code: string, language: string, theme: 'light' | 'dark'): Promise<string> {
    const workerInstance = await getWorker();
    const messageIdLocal = ++messageId;
    
    return new Promise((resolve, reject) => {
        pendingRequests.set(messageIdLocal, { resolve, reject });
        
        const handleMessage = (event: MessageEvent) => {
            const { type, messageId: responseId, result, error } = event.data;
            
            if ((type === 'highlight-complete' || type === 'error') && responseId === messageIdLocal) {
                workerInstance?.removeEventListener('message', handleMessage);
                pendingRequests.delete(messageIdLocal);
                
                if (type === 'highlight-complete') {
                    resolve(result);
                } else {
                    reject(new Error(error));
                }
            }
        };
        
        workerInstance.addEventListener('message', handleMessage);
        workerInstance.postMessage({ 
            type: 'highlight', 
            messageId: messageIdLocal,
            data: { code, language: normalizeLanguage(language), theme }
        });
    });
}