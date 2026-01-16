/**
 * Model Selector Component
 * Allows users to select AI models with advanced options
 * Refactored to use the unified Dropdown component
 */

import { useMemo } from 'react';
import type { ModelId } from '@vcoder/shared';
import { Dropdown } from './Dropdown';
import type { DropdownItem } from './Dropdown';
import { ThinkIcon } from './Icon';
import './ModelSelector.scss';

const MODELS: { id: ModelId; name: string }[] = [
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
    { id: 'glm-4.6', name: 'GLM 4.6' },
];

interface ModelSelectorProps {
    selectedModel: ModelId;
    onSelectModel: (modelId: ModelId) => void;
    disabled?: boolean;
}

export function ModelSelector({ selectedModel, onSelectModel, disabled = false }: ModelSelectorProps) {
    const currentModel = MODELS.find(m => m.id === selectedModel);

    // Convert models to dropdown items
    const dropdownItems = useMemo<DropdownItem[]>(() => {
        return MODELS.map((model) => ({
            id: model.id,
            label: (
                <div className="model-item-content">
                    <span className="model-name">{model.name}</span>
                    <span className="model-brain-icon">
                        <ThinkIcon />
                    </span>
                </div>
            ),
            data: model,
        }));
    }, []);

    const handleSelectModel = (item: DropdownItem) => {
        onSelectModel(item.id as ModelId);
    };

    // Header content with toggles
    const headerContent = (
        <div className="model-options">
            <div className="model-toggle-item">
                <span>Auto</span>
                <div className="toggle-switch" />
            </div>
            <div className="model-toggle-item">
                <span>MAX Mode</span>
                <div className="toggle-switch" />
            </div>
            <div className="model-toggle-item">
                <span>Use Multiple Models</span>
                <div className="toggle-switch" />
            </div>
        </div>
    );

    // Footer content
    const footerContent = (
        <button className="model-add-button">
            Add Models {'>'}
        </button>
    );

    // Trigger button
    const trigger = (
        <div className="model-selector-trigger">
            <span className="model-label">{currentModel?.name || 'Model'}</span>
            <span className="model-arrow">▾</span>
        </div>
    );

    return (
        <Dropdown
            trigger={trigger}
            items={dropdownItems}
            selectedId={selectedModel}
            onSelect={handleSelectModel}
            placement="bottom"
            searchable={true}
            searchPlaceholder="Search models"
            headerContent={headerContent}
            footerContent={footerContent}
            className="model-selector"
            popoverClassName="model-selector-popover"
            disabled={disabled}
            minWidth={280}
            maxHeight={400}
            showCheckmark={true}
        />
    );
}
