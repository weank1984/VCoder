import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from './components/ErrorBoundary';
import { I18nProvider } from './i18n/I18nProvider';
import { ToastProvider } from './utils/Toast';
import I18n, { resolveLanguage } from './i18n';
import App from './App.tsx';
import './index.scss';

// Performance: mark UI start
performance.mark('ui:start');

// Initialize i18n before first render (best-effort, provider will keep it in sync).
const vscodeDisplayLanguage = (globalThis as unknown as { __vscodeLanguage?: string }).__vscodeLanguage;
const uiLanguage = (globalThis as unknown as { __vcoderUiLanguage?: string }).__vcoderUiLanguage;
if (uiLanguage === 'en-US' || uiLanguage === 'zh-CN' || uiLanguage === 'auto') {
    I18n.init(resolveLanguage(vscodeDisplayLanguage, uiLanguage));
} else {
    I18n.init(resolveLanguage(vscodeDisplayLanguage, 'auto'));
}

const root = createRoot(document.getElementById('root')!);

root.render(
    <StrictMode>
        <I18nProvider>
            <ToastProvider>
                <ErrorBoundary>
                    <App />
                </ErrorBoundary>
            </ToastProvider>
        </I18nProvider>
    </StrictMode>,
);

// Performance: measure TTI and send uiReady event
requestAnimationFrame(() => {
    performance.mark('ui:rendered');
    performance.measure('ui:tti', 'ui:start', 'ui:rendered');

    const ttiEntry = performance.getEntriesByName('ui:tti')[0];
    const tti = ttiEntry ? ttiEntry.duration : 0;

    // Send uiReady message to extension
    const vscode = (window as unknown as { vscodeApi?: { postMessage: (msg: unknown) => void } }).vscodeApi;
    if (vscode) {
        vscode.postMessage({ type: 'uiReady', metrics: { tti } });
    }

    console.log(`[VCoder] UI ready, TTI: ${tti.toFixed(2)}ms`);
});
