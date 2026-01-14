import { useMemo, useState } from 'react';
import type { FileChangeUpdate } from '@vcoder/shared';
import { useStore } from '../store/useStore';
import { useI18n } from '../i18n/I18nProvider';
import { postMessage } from '../utils/vscode';
import { CloseIcon } from './Icon';
import { DiffViewer } from './StepProgress/DiffViewer';
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

function formatFileLabel(change: FileChangeUpdate) {
  const base = change.path.split(/[\\/]/).pop() || change.path;
  const { additions, deletions } = parseDiffStats(change.diff);
  const parts: string[] = [base];
  if (additions > 0) parts.push(`+${additions}`);
  if (deletions > 0) parts.push(`-${deletions}`);
  return parts.join(' ');
}

export function PendingChangesBar() {
  const { t } = useI18n();
  const { pendingFileChanges, clearPendingFileChanges } = useStore();
  const [expanded, setExpanded] = useState(false);

  const changes = useMemo(() => {
    // Most-recent first.
    return [...pendingFileChanges].sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0));
  }, [pendingFileChanges]);

  if (changes.length === 0) return null;

  const previewLabels = changes.slice(0, 2).map((c) => formatFileLabel(c));
  const overflow = changes.length - previewLabels.length;

  return (
    <div className={`vc-pending-changes ${expanded ? 'is-expanded' : ''}`}>
      <div className="vc-pending-changes__header">
        <div className="vc-pending-changes__left">
          <span className="vc-pending-changes__count">{changes.length} Files</span>
          <span className="vc-pending-changes__summary" title={changes.map((c) => c.path).join('\n')}>
            {previewLabels.join(' · ')}
            {overflow > 0 ? ` · +${overflow}` : ''}
          </span>
        </div>

        <div className="vc-pending-changes__right">
          <button
            type="button"
            className="vc-pending-changes__review"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? t('Common.Close') : 'Review'}
          </button>

          <button
            type="button"
            className="vc-pending-changes__dismiss"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={() => {
              clearPendingFileChanges();
              setExpanded(false);
            }}
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="vc-pending-changes__body">
          {changes.map((c) => (
            <DiffViewer
              key={`${c.sessionId}:${c.path}`}
              filePath={c.path}
              diff={c.diff ?? ''}
              defaultCollapsed={true}
              onViewFile={(path) => postMessage({ type: 'openFile', path })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
