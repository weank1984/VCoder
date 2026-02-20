import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n/I18nProvider';
import { postMessage } from '../utils/vscode';
import { FileTypeIcon } from './FileTypeIcon';
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

export function PendingChangesBar() {
  const { t } = useI18n();
  const { pendingFileChanges } = useStore();
  const [expanded, setExpanded] = useState(false);

  const changes = useMemo(() => {
    return [...pendingFileChanges].sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0));
  }, [pendingFileChanges]);

  if (changes.length === 0) return null;

  return (
    <div className={`vc-pending-changes ${expanded ? 'is-expanded' : ''}`}>
      <div className="vc-pending-changes__header" onClick={() => setExpanded((v) => !v)}>
        <div className="vc-pending-changes__left">
          <span className="vc-pending-changes__chevron">{expanded ? '▾' : '▸'}</span>
          <span className="vc-pending-changes__count">
            {changes.length} {changes.length === 1 ? t('Agent.File') : t('Agent.FilesCount')}
          </span>
        </div>

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

      {expanded && (
        <div className="vc-pending-changes__body">
          {changes.map((c) => {
            const basename = c.path.split(/[\\/]/).pop() || c.path;
            const { additions, deletions } = parseDiffStats(c.diff);
            return (
              <div
                key={`${c.sessionId}:${c.path}`}
                className="vc-pending-changes__file"
                title={c.path}
                onClick={() => postMessage({ type: 'openFile', path: c.path })}
              >
                <FileTypeIcon filename={basename} size={16} />
                <span className="vc-pending-changes__filename">{basename}</span>
                <span className="vc-pending-changes__file-stats">
                  {additions > 0 && <span className="vc-pending-changes__additions">+{additions}</span>}
                  {deletions > 0 && <span className="vc-pending-changes__deletions">-{deletions}</span>}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
