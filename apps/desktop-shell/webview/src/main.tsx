import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ErrorBoundary } from '@vcoder/ui/components/ErrorBoundary';
import { I18nProvider } from '@vcoder/ui/i18n/I18nProvider';
import { ToastProvider } from '@vcoder/ui/utils/Toast';
import I18n, { resolveLanguage } from '@vcoder/ui/i18n';
import App from './App.tsx';
import '@vcoder/ui/index.scss';

// Performance: mark UI start
performance.mark('ui:start');

// Initialize i18n before first render.
// Desktop shell uses system locale or user preference.
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

// Performance: measure TTI
requestAnimationFrame(() => {
    performance.mark('ui:rendered');
    performance.measure('ui:tti', 'ui:start', 'ui:rendered');

    const ttiEntry = performance.getEntriesByName('ui:tti')[0];
    const tti = ttiEntry ? ttiEntry.duration : 0;

    console.log(`[VCoder Desktop] UI ready, TTI: ${tti.toFixed(2)}ms`);
});
