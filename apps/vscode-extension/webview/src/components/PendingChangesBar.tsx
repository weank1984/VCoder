import { useMemo, useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n/I18nProvider';
import { postMessage } from '../utils/vscode';
import { FileTypeIcon } from './FileTypeIcon';
import { CheckIcon, CloseIcon } from './Icon';
import './PendingChangesBar.scss';

function parseDiffStats(diff: string | undefined): { additions: number; deletions: number } {
  if (!diff) return { additions: 0, deletions: 0 };
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions += 1;
    if (line.startsWith('-') && !line.startsWith('---')) deletions += 1;
  }
  return { additions, deletions };
}

function changeTypeLabel(type: string): string {
  switch (type) {
    case 'created': return 'A';
    case 'modified': return 'M';
    case 'deleted': return 'D';
    default: return '?';
  }
}

function changeTypeClass(type: string): string {
  switch (type) {
    case 'created': return 'vc-pending-changes__badge--added';
    case 'modified': return 'vc-pending-changes__badge--modified';
    case 'deleted': return 'vc-pending-changes__badge--deleted';
    default: return '';
  }
}

export function PendingChangesBar() {
  const { t } = useI18n();
  const { pendingFileChanges, currentSessionId, sessionStates } = useStore();
  const [expanded, setExpanded] = useState(false);

  const reviewStats = useMemo(() => {
    if (!currentSessionId) return null;
    return sessionStates.get(currentSessionId)?.reviewStats ?? null;
  }, [currentSessionId, sessionStates]);

  const changes = useMemo(() => {
    return [...pendingFileChanges].sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0));
  }, [pendingFileChanges]);

  const handleAccept = useCallback((e: React.MouseEvent, filePath: string, sessionId?: string) => {
    e.stopPropagation();
    postMessage({ type: 'acceptChange', path: filePath, sessionId: sessionId ?? currentSessionId ?? undefined });
  }, [currentSessionId]);

  const handleReject = useCallback((e: React.MouseEvent, filePath: string, sessionId?: string) => {
    e.stopPropagation();
    postMessage({ type: 'rejectChange', path: filePath, sessionId: sessionId ?? currentSessionId ?? undefined });
  }, [currentSessionId]);

  const handleAcceptAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    postMessage({ type: 'acceptAllChanges', sessionId: currentSessionId ?? undefined });
  }, [currentSessionId]);

  const handleRejectAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    postMessage({ type: 'rejectAllChanges', sessionId: currentSessionId ?? undefined });
  }, [currentSessionId]);

  if (changes.length === 0) return null;

  return (
    <div className={`vc-pending-changes ${expanded ? 'is-expanded' : ''}`}>
      <div className="vc-pending-changes__header" onClick={() => setExpanded((v) => !v)}>
        <div className="vc-pending-changes__left">
          <span className="vc-pending-changes__chevron">{expanded ? '▾' : '▸'}</span>
          <span className="vc-pending-changes__count">
            {changes.length} {changes.length === 1 ? t('Agent.File') : t('Agent.FilesCount')}
          </span>
          {reviewStats && reviewStats.total > 0 && (
            <span className="vc-pending-changes__stats">
              {reviewStats.accepted > 0 && <span className="vc-pending-changes__stat--accepted">{reviewStats.accepted} accepted</span>}
              {reviewStats.rejected > 0 && <span className="vc-pending-changes__stat--rejected">{reviewStats.rejected} rejected</span>}
            </span>
          )}
        </div>

        <div className="vc-pending-changes__actions">
          <button
            type="button"
            className="vc-pending-changes__btn vc-pending-changes__btn--accept"
            onClick={handleAcceptAll}
            title="Accept All"
          >
            <CheckIcon /> Accept All
          </button>
          <button
            type="button"
            className="vc-pending-changes__btn vc-pending-changes__btn--reject"
            onClick={handleRejectAll}
            title="Reject All"
          >
            <CloseIcon /> Reject All
          </button>
          <button
            type="button"
            className="vc-pending-changes__review"
            onClick={(e) => {
              e.stopPropagation();
              for (const c of changes) {
                postMessage({ type: 'openFile', path: c.path });
              }
            }}
          >
            Review
          </button>
        </div>
      </div>

      {expanded && (
        <div className="vc-pending-changes__body">
          {changes.map((c) => {
            const basename = c.path.split(/[\\/]/).pop() || c.path;
            const { additions, deletions } = parseDiffStats(c.diff);
            return (
              <div
                key={`${c.sessionId}:${c.path}`}
                className={`vc-pending-changes__file${(c as { conflict?: boolean }).conflict ? ' vc-pending-changes__file--conflict' : ''}`}
                title={`${c.path}${(c as { conflict?: boolean }).conflict ? ' (conflict)' : ''}`}
              >
                <span
                  className="vc-pending-changes__file-info"
                  onClick={() => postMessage({ type: 'openFile', path: c.path })}
                >
                  <span className={`vc-pending-changes__badge ${changeTypeClass(c.type)}`}>
                    {changeTypeLabel(c.type)}
                  </span>
                  <FileTypeIcon filename={basename} size={16} />
                  <span className="vc-pending-changes__filename">{basename}</span>
                  <span className="vc-pending-changes__file-stats">
                    {additions > 0 && <span className="vc-pending-changes__additions">+{additions}</span>}
                    {deletions > 0 && <span className="vc-pending-changes__deletions">-{deletions}</span>}
                  </span>
                </span>
                <span className="vc-pending-changes__file-actions">
                  <button
                    type="button"
                    className="vc-pending-changes__file-btn vc-pending-changes__file-btn--accept"
                    onClick={(e) => handleAccept(e, c.path, c.sessionId)}
                    title="Accept"
                  >
                    <CheckIcon />
                  </button>
                  <button
                    type="button"
                    className="vc-pending-changes__file-btn vc-pending-changes__file-btn--reject"
                    onClick={(e) => handleReject(e, c.path, c.sessionId)}
                    title="Reject"
                  >
                    <CloseIcon />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
