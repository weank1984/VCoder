import { useEffect } from 'react';
import { HelpIcon, HistoryIcon } from '../Icon';
import { Logo } from '../Logo';
import { postMessage } from '../../utils/vscode';
import { useI18n } from '../../i18n/I18nProvider';
import { useStore } from '../../store/useStore';
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
  const { sessions, historySessions, currentSessionId } = useStore();

  useEffect(() => {
    postMessage({ type: 'listHistory' });
  }, []);

  const merged = [
    ...sessions.map((s) => ({ ...s, kind: 'live' as const })),
    ...historySessions.map((s) => ({ ...s, kind: 'history' as const })),
  ];

  const uniqueById = new Map<string, (typeof merged)[number]>();
  for (const item of merged) {
    if (!uniqueById.has(item.id) || item.kind === 'live') uniqueById.set(item.id, item);
  }

  const sorted = [...uniqueById.values()].sort((a, b) => {
    const at = new Date(a.updatedAt).getTime();
    const bt = new Date(b.updatedAt).getTime();
    if (Number.isNaN(at) && Number.isNaN(bt)) return 0;
    if (Number.isNaN(at)) return 1;
    if (Number.isNaN(bt)) return -1;
    return bt - at;
  });

  const withoutCurrent = sorted.filter((s) => s.id !== currentSessionId);
  const items = (withoutCurrent.length > 0 ? withoutCurrent : sorted).slice(0, 3);

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
                onClick={() =>
                  postMessage(
                    s.kind === 'history' ? { type: 'loadHistory', sessionId: s.id } : { type: 'switchSession', sessionId: s.id }
                  )
                }
                title={s.title || t('Common.UntitledSession')}
              >
                <span className={`${prefixClass}-recents-item-title`}>{s.title || t('Common.UntitledSession')}</span>
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
