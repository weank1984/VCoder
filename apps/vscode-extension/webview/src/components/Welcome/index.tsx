import { useEffect } from 'react';
import { HelpIcon, HistoryIcon } from '../Icon';
import { Logo } from '../Logo';
import { postMessage } from '../../utils/vscode';
import { useI18n } from '../../i18n/I18nProvider';
import { useStore } from '../../store/useStore';
import { sanitizeSessionTitle } from '../../utils/sanitizeTitle';
import './index.scss';

const prefixClass = 'vc-chat-welcome';

function formatUpdatedAt(updatedAt: string | undefined, locale: string): string {
  if (!updatedAt) return '';
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function Welcome() {
  const { t, language } = useI18n();
  const { historySessions } = useStore();

  useEffect(() => {
    postMessage({ type: 'listHistory' });
  }, []);

  // Only use historySessions (Claude CLI history) - same as history panel
  const sorted = [...historySessions].sort((a, b) => {
    const at = new Date(a.updatedAt).getTime();
    const bt = new Date(b.updatedAt).getTime();
    if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
    if (Number.isNaN(at)) return 1;
    if (Number.isNaN(bt)) return -1;
    return bt - at;
  });

  // Show top 3 recent sessions
  const items = sorted.slice(0, 3);

  return (
    <div className={prefixClass}>
      <div className={`${prefixClass}-hero`}>
        <Logo size={96} aria-hidden="true" />

        <h1 className={`${prefixClass}-title`}>{t('Chat.WelcomeTitle')}</h1>

        <p className={`${prefixClass}-note`}>
          <span>{t('Chat.WelcomeNote')}</span>
          <button
            type="button"
            className={`${prefixClass}-doc-link`}
            title={t('Common.OpenSettings')}
            aria-label={t('Common.OpenSettings')}
            onClick={() => postMessage({ type: 'executeCommand', command: 'vcoder.openSettings' })}
          >
            <HelpIcon />
          </button>
        </p>
      </div>

      <div className={`${prefixClass}-recents`}>
        <div className={`${prefixClass}-recents-header`}>
          <div className={`${prefixClass}-recents-title`}>{t('Chat.RecentConversations')}</div>
          <button
            type="button"
            className={`${prefixClass}-recents-action`}
            title={t('Chat.ViewAllConversations')}
            aria-label={t('Chat.ViewAllConversations')}
            onClick={() => postMessage({ type: 'executeCommand', command: 'vcoder.showHistory' })}
          >
            <HistoryIcon />
          </button>
        </div>

        <div className={`${prefixClass}-recents-list`}>
          {items.length === 0 ? (
            <div className={`${prefixClass}-recents-empty`}>{t('Chat.NoRecentConversations')}</div>
          ) : (
            items.map((s) => (
              <button
                type="button"
                key={s.id}
                className={`${prefixClass}-recents-item`}
                onClick={() => postMessage({ type: 'loadHistory', sessionId: s.id })}
                title={sanitizeSessionTitle(s.title, t('Common.UntitledSession'))}
              >
                <span className={`${prefixClass}-recents-item-title`}>{sanitizeSessionTitle(s.title, t('Common.UntitledSession'))}</span>
                <span className={`${prefixClass}-recents-item-time`}>
                  {formatUpdatedAt(s.updatedAt, language === 'zh-CN' ? 'zh-CN' : 'en-US')}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
