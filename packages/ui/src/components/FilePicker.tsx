/**
 * File Picker Component
 * Dropdown for selecting workspace files when @ is typed.
 * Also supports special options like @selection and @terminal.
 */

import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18nProvider';
import { CodeSnippetIcon, TerminalIcon } from './Icon';
import { FileTypeIcon } from './FileTypeIcon';
import './FilePicker.scss';

/** A special (non-file) option shown at the top of the picker. */
export interface SpecialOption {
    /** Identifier used in callbacks, e.g. 'selection', 'terminal'. */
    id: string;
    /** Display label, e.g. "Current Selection". */
    label: string;
    /** Icon component shown before the label. */
    icon: ReactNode;
    /** Short description shown below the label. */
    description?: string;
}

interface FilePickerProps {
    files: string[];
    searchQuery: string;
    onSelect: (filePath: string) => void;
    /** Called when a special option is selected (e.g. "selection", "terminal"). */
    onSpecialSelect?: (optionId: string) => void;
    onClose: () => void;
}

const SPECIAL_OPTIONS: SpecialOption[] = [
    { id: 'selection', label: 'Current Selection', icon: <CodeSnippetIcon />, description: '@selection' },
    { id: 'terminal', label: 'Terminal Output', icon: <TerminalIcon />, description: '@terminal' },
];

export function FilePicker({ files, searchQuery, onSelect, onSpecialSelect, onClose }: FilePickerProps) {
    const { t } = useI18n();
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter special options by search query
    const filteredSpecial = useMemo(() => {
        const query = searchQuery.toLowerCase();
        if (!query) return SPECIAL_OPTIONS;
        return SPECIAL_OPTIONS.filter((opt) =>
            opt.id.includes(query) || opt.label.toLowerCase().includes(query) || opt.description?.toLowerCase().includes(query)
        );
    }, [searchQuery]);

    // Filter files by search query
    const filteredFiles = useMemo(() => {
        const query = searchQuery.toLowerCase();
        return files
            .filter((file) => {
                const fileName = file.split('/').pop()?.toLowerCase() || '';
                return fileName.includes(query) || file.toLowerCase().includes(query);
            })
            .slice(0, 10); // Limit to 10 results
    }, [files, searchQuery]);

    const totalItems = filteredSpecial.length + filteredFiles.length;
    const effectiveSelectedIndex = Math.min(selectedIndex, Math.max(totalItems - 1, 0));

    const handleItemSelect = useCallback((index: number) => {
        if (index < filteredSpecial.length) {
            onSpecialSelect?.(filteredSpecial[index].id);
        } else {
            onSelect(filteredFiles[index - filteredSpecial.length]);
        }
    }, [filteredSpecial, filteredFiles, onSelect, onSpecialSelect]);

    // Handle keyboard navigation
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const isImeComposing =
            (e as unknown as { isComposing?: boolean; keyCode?: number; key?: string }).isComposing === true ||
            (e as unknown as { keyCode?: number }).keyCode === 229 ||
            (e as unknown as { key?: string }).key === 'Process';
        if (isImeComposing) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, totalItems - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (totalItems > 0) {
                    handleItemSelect(effectiveSelectedIndex);
                }
                break;
            case 'Escape':
                e.preventDefault();
                onClose();
                break;
        }
    }, [totalItems, effectiveSelectedIndex, handleItemSelect, onClose]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    if (totalItems === 0) {
        return (
            <div className="file-picker" ref={containerRef}>
                <div className="file-picker-empty">
                    {files.length === 0 ? t('FilePicker.Loading') : t('FilePicker.NoMatch')}
                </div>
            </div>
        );
    }

    let currentIndex = 0;

    return (
        <div className="file-picker" ref={containerRef}>
            {filteredSpecial.map((opt) => {
                const idx = currentIndex++;
                return (
                    <div
                        key={`special-${opt.id}`}
                        className={`file-picker-item file-picker-special ${idx === effectiveSelectedIndex ? 'selected' : ''}`}
                        onClick={() => onSpecialSelect?.(opt.id)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                    >
                        <span className="file-picker-icon file-picker-icon--special">{opt.icon}</span>
                        <div className="file-picker-info">
                            <span className="file-picker-name">{opt.label}</span>
                            {opt.description && <span className="file-picker-desc">{opt.description}</span>}
                        </div>
                    </div>
                );
            })}
            {filteredSpecial.length > 0 && filteredFiles.length > 0 && (
                <div className="file-picker-divider" />
            )}
            {filteredFiles.map((file) => {
                const idx = currentIndex++;
                const fileName = file.split('/').pop() || file;
                const dirPath = file.split('/').slice(0, -1).join('/');

                return (
                    <div
                        key={file}
                        className={`file-picker-item ${idx === effectiveSelectedIndex ? 'selected' : ''}`}
                        onClick={() => onSelect(file)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                    >
                        <span className="file-picker-icon">
                            <FileTypeIcon filename={fileName} size={18} />
                        </span>
                        <div className="file-picker-info">
                            <span className="file-picker-name">{fileName}</span>
                            {dirPath && <span className="file-picker-desc">{dirPath}</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
