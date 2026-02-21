/**
 * Permission Rules Management Panel
 * Allows users to view, filter, add, edit, and delete saved permission rules.
 * Backed by Zustand permissionRulesSlice; CRUD goes through postMessage -> ChatViewProvider -> SessionStore.
 */

import { useState, useMemo, useEffect } from 'react';
import type { PermissionRule } from '@vcoder/shared';
import { useStore } from '../store/useStore';
import './PermissionRulesPanel.scss';

interface PermissionRulesPanelProps {
    visible: boolean;
    onClose: () => void;
}

const CATEGORIES = [
    { id: 'all', label: 'All' },
    { id: 'file', label: 'File' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'mcp', label: 'MCP' },
    { id: 'other', label: 'Other' },
];

function getToolCategory(toolName: string): string {
    const lower = toolName.toLowerCase();
    if (lower.includes('file') || lower.includes('write') || lower.includes('read') || lower.includes('edit')) {
        return 'file';
    }
    if (lower.includes('bash') || lower.includes('terminal') || lower.includes('shell')) {
        return 'terminal';
    }
    if (toolName.startsWith('mcp__')) {
        return 'mcp';
    }
    return 'other';
}

function getCategoryIcon(category: string): string {
    switch (category) {
        case 'file': return '\u{1F4C4}';
        case 'terminal': return '\u{2328}\u{FE0F}';
        case 'mcp': return '\u{1F527}';
        default: return '\u{2699}\u{FE0F}';
    }
}

function isExpired(rule: PermissionRule): boolean {
    if (!rule.expiresAt) return false;
    return new Date(rule.expiresAt).getTime() <= Date.now();
}

export function PermissionRulesPanel({ visible, onClose }: PermissionRulesPanelProps) {
    const {
        permissionRules,
        loadPermissionRules,
        addPermissionRule,
        updatePermissionRule,
        deletePermissionRule,
        clearPermissionRules,
    } = useStore();

    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingRule, setEditingRule] = useState<PermissionRule | null>(null);
    const [isCreatingNew, setIsCreatingNew] = useState(false);

    // Load rules when panel becomes visible
    useEffect(() => {
        if (visible) {
            loadPermissionRules();
        }
    }, [visible, loadPermissionRules]);

    const handleDeleteRule = (ruleId: string) => {
        deletePermissionRule(ruleId);
    };

    const handleEditRule = (rule: PermissionRule) => {
        setEditingRule({ ...rule });
        setIsCreatingNew(false);
    };

    const handleCreateNew = () => {
        setEditingRule({
            id: '',
            toolName: '',
            pattern: '',
            action: 'allow',
            description: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        setIsCreatingNew(true);
    };

    const handleSaveRule = () => {
        if (!editingRule) return;

        if (isCreatingNew) {
            const newRule: PermissionRule = {
                ...editingRule,
                id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            addPermissionRule(newRule);
        } else {
            updatePermissionRule(editingRule.id, {
                toolName: editingRule.toolName,
                pattern: editingRule.pattern,
                action: editingRule.action,
                description: editingRule.description,
                expiresAt: editingRule.expiresAt,
            });
        }

        setEditingRule(null);
        setIsCreatingNew(false);
    };

    const handleCancelEdit = () => {
        setEditingRule(null);
        setIsCreatingNew(false);
    };

    const handleClearAll = () => {
        const confirmed = confirm('Are you sure you want to clear all permission rules? This cannot be undone.');
        if (confirmed) {
            clearPermissionRules();
        }
    };

    const filteredRules = useMemo(() => {
        return permissionRules.filter((rule) => {
            if (selectedCategory !== 'all') {
                const category = getToolCategory(rule.toolName || '');
                if (category !== selectedCategory) {
                    return false;
                }
            }
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                return (
                    (rule.toolName?.toLowerCase().includes(query) || false) ||
                    (rule.pattern?.toLowerCase().includes(query) || false) ||
                    (rule.description?.toLowerCase().includes(query) || false)
                );
            }
            return true;
        });
    }, [permissionRules, selectedCategory, searchQuery]);

    if (!visible) {
        return null;
    }

    return (
        <div className="permission-rules-panel">
            <div className="panel-overlay" onClick={onClose} />

            <div className="panel-content">
                <div className="panel-header">
                    <h2 className="panel-title">Permission Rules</h2>
                    <button className="panel-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>

                <div className="panel-toolbar">
                    <div className="toolbar-left">
                        <div className="category-filter">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat.id}
                                    className={`category-btn ${selectedCategory === cat.id ? 'active' : ''}`}
                                    onClick={() => setSelectedCategory(cat.id)}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="toolbar-right">
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Search rules..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {permissionRules.length > 0 && (
                            <button className="clear-all-btn" onClick={handleClearAll}>
                                Clear All
                            </button>
                        )}
                        <button className="create-rule-btn" onClick={handleCreateNew}>
                            + New Rule
                        </button>
                    </div>
                </div>

                <div className="rules-list">
                    {filteredRules.length === 0 ? (
                        <div className="rules-empty">
                            {permissionRules.length === 0 ? (
                                <>
                                    <div className="empty-icon">{'\u{1F512}'}</div>
                                    <p className="empty-text">No permission rules saved</p>
                                    <p className="empty-hint">
                                        Select "Always Allow" during permission approval to create rules
                                    </p>
                                </>
                            ) : (
                                <>
                                    <div className="empty-icon">{'\u{1F50D}'}</div>
                                    <p className="empty-text">No matching rules found</p>
                                </>
                            )}
                        </div>
                    ) : (
                        filteredRules.map((rule) => {
                            const expired = isExpired(rule);
                            const category = getToolCategory(rule.toolName || '');
                            return (
                                <div key={rule.id} className={`rule-item${expired ? ' rule-item--expired' : ''}`}>
                                    <div className="rule-icon">
                                        {getCategoryIcon(category)}
                                    </div>
                                    <div className="rule-info">
                                        <div className="rule-tool-name">
                                            {rule.toolName || '* (wildcard)'}
                                            <span className={`rule-action ${rule.action}`}>
                                                {rule.action === 'allow' ? '\u{2705}' : '\u{1F6AB}'}
                                            </span>
                                            {expired && (
                                                <span className="rule-expired-badge">Expired</span>
                                            )}
                                        </div>
                                        {rule.pattern && (
                                            <div className="rule-pattern">{rule.pattern}</div>
                                        )}
                                        {rule.description && (
                                            <div className="rule-description">{rule.description}</div>
                                        )}
                                        <div className="rule-meta">
                                            Created {new Date(rule.createdAt).toLocaleString()}
                                            {rule.expiresAt && (
                                                <span className={`rule-expiry${expired ? ' rule-expiry--past' : ''}`}>
                                                    {' '}&middot; Expires {new Date(rule.expiresAt).toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="rule-actions">
                                        <button
                                            className="rule-edit"
                                            onClick={() => handleEditRule(rule)}
                                            aria-label="Edit rule"
                                            title="Edit rule"
                                        >
                                            {'\u{270F}\u{FE0F}'}
                                        </button>
                                        <button
                                            className="rule-delete"
                                            onClick={() => handleDeleteRule(rule.id)}
                                            aria-label="Delete rule"
                                            title="Delete rule"
                                        >
                                            {'\u{1F5D1}\u{FE0F}'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="panel-footer">
                    <div className="footer-stats">
                        {permissionRules.length} rule{permissionRules.length !== 1 ? 's' : ''} total
                        {selectedCategory !== 'all' && ` \u00b7 ${filteredRules.length} matching`}
                    </div>
                </div>
            </div>

            {editingRule && (
                <div className="rule-edit-modal">
                    <div className="modal-overlay" onClick={handleCancelEdit} />
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>{isCreatingNew ? 'New Permission Rule' : 'Edit Permission Rule'}</h3>
                            <button className="modal-close" onClick={handleCancelEdit}>
                                ×
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="form-group">
                                <label>Tool Name</label>
                                <input
                                    type="text"
                                    value={editingRule.toolName || ''}
                                    onChange={(e) => setEditingRule({ ...editingRule, toolName: e.target.value })}
                                    placeholder="e.g., Bash, Read, Write, mcp__github"
                                />
                            </div>

                            <div className="form-group">
                                <label>Pattern (regex)</label>
                                <input
                                    type="text"
                                    value={editingRule.pattern || ''}
                                    onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                                    placeholder="e.g., ^echo\\s+, /safe/path/.*, *.txt"
                                />
                            </div>

                            <div className="form-group">
                                <label>Action</label>
                                <select
                                    value={editingRule.action}
                                    onChange={(e) => setEditingRule({ ...editingRule, action: e.target.value as 'allow' | 'deny' })}
                                >
                                    <option value="allow">Allow</option>
                                    <option value="deny">Deny</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Description (optional)</label>
                                <textarea
                                    value={editingRule.description || ''}
                                    onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                                    placeholder="Describe what this rule does..."
                                    rows={2}
                                />
                            </div>

                            <div className="form-group">
                                <label>Expires At (optional)</label>
                                <input
                                    type="datetime-local"
                                    value={editingRule.expiresAt ? new Date(editingRule.expiresAt).toISOString().slice(0, 16) : ''}
                                    onChange={(e) => setEditingRule({
                                        ...editingRule,
                                        expiresAt: e.target.value ? new Date(e.target.value).toISOString() : undefined
                                    })}
                                />
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button className="modal-btn modal-btn--cancel" onClick={handleCancelEdit}>
                                Cancel
                            </button>
                            <button className="modal-btn modal-btn--save" onClick={handleSaveRule}>
                                {isCreatingNew ? 'Create' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
