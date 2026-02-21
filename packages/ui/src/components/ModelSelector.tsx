/**
 * Model Selector Component - Cursor-style model picker
 * Compact trigger + dropdown with toggles, model list, search, and footer
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ModelId } from '@vcoder/shared';
import { ArrowBottomIcon, ArrowRightIcon } from './Icon';
import './ModelSelector.scss';

const MODELS: { id: ModelId; name: string }[] = [
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
    { id: 'glm-4.6', name: 'GLM 4.6' },
];

interface ToggleOption {
    id: string;
    label: string;
    enabled: boolean;
}

interface ModelSelectorProps {
    selectedModel: ModelId;
    onSelectModel: (modelId: ModelId) => void;
    disabled?: boolean;
}

export function ModelSelector({ selectedModel, onSelectModel, disabled = false }: ModelSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [toggles, setToggles] = useState<ToggleOption[]>([
        { id: 'auto', label: 'Auto', enabled: false },
        { id: 'max', label: 'MAX Mode', enabled: false },
        { id: 'multi', label: 'Use Multiple Models', enabled: false },
    ]);
    const triggerRef = useRef<HTMLDivElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const currentModel = MODELS.find(m => m.id === selectedModel);

    const filteredModels = useMemo(() => {
        if (!searchQuery) return MODELS;
        const q = searchQuery.toLowerCase();
        return MODELS.filter(m => m.name.toLowerCase().includes(q));
    }, [searchQuery]);

    const handleToggle = useCallback((id: string) => {
        setToggles(prev => prev.map(t =>
            t.id === id ? { ...t, enabled: !t.enabled } : t
        ));
    }, []);

    const handleSelectModel = useCallback((modelId: ModelId) => {
        onSelectModel(modelId);
        setIsOpen(false);
        setSearchQuery('');
    }, [onSelectModel]);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                popoverRef.current && !popoverRef.current.contains(target)
            ) {
                setIsOpen(false);
                setSearchQuery('');
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    // Auto-focus search input
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);

    // Popover position
    const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

    useEffect(() => {
        if (!isOpen || !triggerRef.current) return;

        const updatePos = () => {
            const rect = triggerRef.current!.getBoundingClientRect();
            const vh = window.innerHeight;
            const gap = 4;
            const popoverHeight = 300;

            const spaceBelow = vh - rect.bottom - gap;
            const spaceAbove = rect.top - gap;
            const openAbove = spaceBelow < popoverHeight && spaceAbove > spaceBelow;

            const style: React.CSSProperties = {
                position: 'fixed',
                left: `${rect.left}px`,
                minWidth: '200px',
            };

            if (openAbove) {
                style.bottom = `${vh - rect.top + gap}px`;
            } else {
                style.top = `${rect.bottom + gap}px`;
            }

            setPopoverStyle(style);
        };

        updatePos();
        requestAnimationFrame(updatePos);
    }, [isOpen]);

    return (
        <>
            {/* Trigger */}
            <div
                ref={triggerRef}
                className={`composer-unified-dropdown-model ${disabled ? 'is-disabled' : ''}`}
                onClick={() => !disabled && setIsOpen(!isOpen)}
            >
                <div className="model-label">
                    <span>{currentModel?.name || 'Model'}</span>
                </div>
                <span className="model-chevron"><ArrowBottomIcon /></span>
            </div>

            {/* Popover via Portal */}
            {isOpen && createPortal(
                <>
                    <div className="model-picker-overlay" onClick={() => { setIsOpen(false); setSearchQuery(''); }} />
                    <div
                        ref={popoverRef}
                        className="model-picker-menu"
                        style={popoverStyle}
                        tabIndex={0}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Search */}
                        <div className="model-picker-search">
                            <input
                                ref={searchInputRef}
                                type="text"
                                className="model-picker-search-input"
                                placeholder="Search models"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Scrollable content */}
                        <div className="model-picker-scroll">
                            {/* Toggle options section */}
                            <div className="model-picker-section">
                                {toggles.map(toggle => (
                                    <div
                                        key={toggle.id}
                                        className="model-picker-item"
                                        onClick={() => handleToggle(toggle.id)}
                                    >
                                        <div className="model-picker-item-left">
                                            <span className="model-picker-item-label">{toggle.label}</span>
                                        </div>
                                        <div className="model-picker-item-right">
                                            <span className={`model-picker-toggle ${toggle.enabled ? 'is-active' : ''}`}>
                                                <span className="model-picker-toggle-track">
                                                    <span className="model-picker-toggle-fill" />
                                                    <span className="model-picker-toggle-thumb" />
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="model-picker-divider" />

                            {/* Model list section */}
                            <div className="model-picker-section">
                                {filteredModels.map(model => {
                                    const isSelected = model.id === selectedModel;
                                    return (
                                        <div
                                            key={model.id}
                                            className={`model-picker-item ${isSelected ? 'is-selected' : ''}`}
                                            onClick={() => handleSelectModel(model.id)}
                                        >
                                            <div className="model-picker-item-left">
                                                <span className="model-picker-item-label">{model.name}</span>
                                            </div>
                                            {isSelected && (
                                                <div className="model-picker-item-right">
                                                    <span className="model-picker-check">✓</span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {filteredModels.length === 0 && (
                                    <div className="model-picker-empty">No models found</div>
                                )}
                            </div>

                            <div className="model-picker-divider" />

                            {/* Footer */}
                            <div className="model-picker-section">
                                <div className="model-picker-item model-picker-footer-item">
                                    <div className="model-picker-item-left">
                                        <span className="model-picker-item-label">Add Models</span>
                                    </div>
                                    <div className="model-picker-item-right">
                                        <span className="model-picker-chevron-right">
                                            <ArrowRightIcon />
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>,
                document.body
            )}
        </>
    );
}
