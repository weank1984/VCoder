/**
 * File Picker Component
 * Dropdown for selecting workspace files when @ is typed
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import './FilePicker.css';

interface FilePickerProps {
    files: string[];
    searchQuery: string;
    position: { top: number; left: number };
    onSelect: (filePath: string) => void;
    onClose: () => void;
}

export function FilePicker({ files, searchQuery, position, onSelect, onClose }: FilePickerProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter files by search query
    const filteredFiles = files.filter((file) => {
        const fileName = file.split('/').pop()?.toLowerCase() || '';
        const query = searchQuery.toLowerCase();
        return fileName.includes(query) || file.toLowerCase().includes(query);
    }).slice(0, 10); // Limit to 10 results

    // Reset selection when search changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [searchQuery]);

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
                setSelectedIndex((prev) => Math.min(prev + 1, filteredFiles.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filteredFiles[selectedIndex]) {
                    onSelect(filteredFiles[selectedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                onClose();
                break;
        }
    }, [filteredFiles, selectedIndex, onSelect, onClose]);

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

    if (filteredFiles.length === 0) {
        return (
            <div 
                className="file-picker" 
                style={{ top: position.top, left: position.left }}
                ref={containerRef}
            >
                <div className="file-picker-empty">
                    {files.length === 0 ? '加载文件中...' : '未找到匹配文件'}
                </div>
            </div>
        );
    }

    return (
        <div 
            className="file-picker" 
            style={{ top: position.top, left: position.left }}
            ref={containerRef}
        >
            {filteredFiles.map((file, index) => {
                const fileName = file.split('/').pop() || file;
                const dirPath = file.split('/').slice(0, -1).join('/');
                
                return (
                    <div
                        key={file}
                        className={`file-picker-item ${index === selectedIndex ? 'selected' : ''}`}
                        onClick={() => onSelect(file)}
                        onMouseEnter={() => setSelectedIndex(index)}
                    >
                        <span className="file-icon">📄</span>
                        <div className="file-info">
                            <span className="file-name">{fileName}</span>
                            {dirPath && <span className="file-path">{dirPath}</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
