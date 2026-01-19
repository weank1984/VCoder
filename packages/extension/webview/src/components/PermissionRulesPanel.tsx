/**
 * Permission Rules Management Panel
 * Allows users to view, filter, and delete saved permission rules
 */

import { useState, useMemo } from 'react';
import type { PermissionRule } from '@vcoder/shared';
import { postMessage } from '../utils/vscode';
import './PermissionRulesPanel.scss';



interface PermissionRulesPanelProps {
    visible: boolean;
    onClose: () => void;
}

const CATEGORIES = [
    { id: 'all', label: '全部' },
    { id: 'file', label: '文件操作' },
    { id: 'terminal', label: '终端命令' },
    { id: 'mcp', label: 'MCP 工具' },
    { id: 'other', label: '其他' },
];

/**
 * Determine category from tool name
 */
function getToolCategory(toolName: string): string {
    if (toolName.includes('file') || toolName.includes('write') || toolName.includes('read')) {
        return 'file';
    }
    if (toolName.includes('bash') || toolName.includes('terminal') || toolName.includes('shell')) {
        return 'terminal';
    }
    if (toolName.startsWith('mcp__')) {
        return 'mcp';
    }
    return 'other';
}

export function PermissionRulesPanel({ visible, onClose }: PermissionRulesPanelProps) {
    const [rules, setRules] = useState<PermissionRule[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingRule, setEditingRule] = useState<PermissionRule | null>(null);
    const [isCreatingNew, setIsCreatingNew] = useState(false);

    // Request rules when panel becomes visible
    useState(() => {
        if (visible) {
            postMessage({ type: 'getPermissionRules' });
        }
    });

    // Handle messages from extension
    useState(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.type === 'permissionRules') {
                setRules(message.data || []);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    });

const handleDeleteRule = (ruleId: string) => {
        postMessage({ type: 'deletePermissionRule', ruleId });
        setRules(rules.filter((r) => r.id !== ruleId));
    };

    const handleEditRule = (rule: PermissionRule) => {
        setEditingRule({ ...rule });
        setIsCreatingNew(false);
    };

    const handleCreateNew = () => {
        const newRule = {
            action: 'allow' as const,
            toolName: '',
            pattern: '',
            description: '',
        };
        setEditingRule({
            id: '',
            toolName: newRule.toolName,
            pattern: newRule.pattern,
            action: newRule.action,
            description: newRule.description,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        setIsCreatingNew(true);
    };

    const handleSaveRule = () => {
        if (!editingRule) return;

        const ruleToSave = {
            ...editingRule,
            updatedAt: new Date().toISOString(),
            ...(isCreatingNew && { 
                id: `rule_${Date.now()}`, 
                createdAt: new Date().toISOString() 
            })
        };

        if (isCreatingNew) {
            postMessage({ type: 'addPermissionRule', rule: ruleToSave });
            setRules([...rules, ruleToSave]);
        } else {
            postMessage({ type: 'updatePermissionRule', ruleId: editingRule.id, updates: ruleToSave });
            setRules(rules.map(r => r.id === editingRule.id ? ruleToSave : r));
        }

        setEditingRule(null);
        setIsCreatingNew(false);
    };

    const handleCancelEdit = () => {
        setEditingRule(null);
        setIsCreatingNew(false);
    };

    const handleClearAll = () => {
        const confirmed = confirm('确定要清除所有权限规则吗？此操作不可撤销。');
        if (confirmed) {
            postMessage({ type: 'clearPermissionRules' });
            setRules([]);
        }
    };

    // Filter rules
    const filteredRules = useMemo(() => {
        return rules.filter((rule) => {
            // Filter by category
            if (selectedCategory !== 'all') {
                const category = getToolCategory(rule.toolName || '');
                if (category !== selectedCategory) {
                    return false;
                }
            }

            // Filter by search query
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                return (
                    (rule.toolName?.toLowerCase().includes(query) || false) ||
                    (rule.pattern?.toLowerCase().includes(query) || false)
                );
            }

            return true;
        });
    }, [rules, selectedCategory, searchQuery]);

    if (!visible) {
        return null;
    }

    return (
        <div className="permission-rules-panel">
            <div className="panel-overlay" onClick={onClose} />
            
            <div className="panel-content">
                <div className="panel-header">
                    <h2 className="panel-title">权限规则管理</h2>
                    <button className="panel-close" onClick={onClose} aria-label="关闭">
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
                            placeholder="搜索规则..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {rules.length > 0 && (
                            <button className="clear-all-btn" onClick={handleClearAll}>
                                清除全部
                            </button>
                        )}
                        <button className="create-rule-btn" onClick={handleCreateNew}>
                            + 新建规则
                        </button>
                    </div>
                </div>

                <div className="rules-list">
                    {filteredRules.length === 0 ? (
                        <div className="rules-empty">
                            {rules.length === 0 ? (
                                <>
                                    <div className="empty-icon">🔒</div>
                                    <p className="empty-text">暂无保存的权限规则</p>
                                    <p className="empty-hint">
                                        在权限审批时选择"总是允许"可创建规则
                                    </p>
                                </>
                            ) : (
                                <>
                                    <div className="empty-icon">🔍</div>
                                    <p className="empty-text">未找到匹配的规则</p>
                                </>
                            )}
                        </div>
                    ) : (
                        filteredRules.map((rule) => (
                            <div key={rule.id} className="rule-item">
                                <div className="rule-icon">
                                    {getToolCategory(rule.toolName || '') === 'file' && '📄'}
                                    {getToolCategory(rule.toolName || '') === 'terminal' && '⌨️'}
                                    {getToolCategory(rule.toolName || '') === 'mcp' && '🔧'}
                                    {getToolCategory(rule.toolName || '') === 'other' && '⚙️'}
                                </div>
                                <div className="rule-info">
                                    <div className="rule-tool-name">
                                        {rule.toolName || 'Unknown'}
                                        <span className={`rule-action ${rule.action}`}>
                                            {rule.action === 'allow' ? '✅' : '🚫'}
                                        </span>
                                    </div>
                                    <div className="rule-pattern">{rule.pattern || 'No pattern'}</div>
                                    {rule.description && (
                                        <div className="rule-description">{rule.description}</div>
                                    )}
                                    <div className="rule-meta">
                                        创建于 {new Date(rule.createdAt).toLocaleString('zh-CN')}
                                        {rule.expiresAt && (
                                            <span className="rule-expiry">
                                                · 过期于 {new Date(rule.expiresAt).toLocaleString('zh-CN')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="rule-actions">
                                    <button
                                        className="rule-edit"
                                        onClick={() => handleEditRule(rule)}
                                        aria-label="编辑规则"
                                        title="编辑规则"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        className="rule-delete"
                                        onClick={() => handleDeleteRule(rule.id)}
                                        aria-label="删除规则"
                                        title="删除规则"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="panel-footer">
                    <div className="footer-stats">
                        共 {rules.length} 条规则
                        {selectedCategory !== 'all' && ` · ${filteredRules.length} 条匹配`}
                    </div>
                </div>
            </div>

            {editingRule && (
                <div className="rule-edit-modal">
                    <div className="modal-overlay" onClick={handleCancelEdit} />
                    <div className="modal-content">
                        <div className="modal-header">
                            <h3>{isCreatingNew ? '新建权限规则' : '编辑权限规则'}</h3>
                            <button className="modal-close" onClick={handleCancelEdit}>
                                ×
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="form-group">
                                <label>工具名称</label>
                                <input
                                    type="text"
                                    value={editingRule.toolName || ''}
                                    onChange={(e) => setEditingRule({ ...editingRule, toolName: e.target.value })}
                                    placeholder="例如: bash, fs.writeFile, mcp__github"
                                />
                            </div>

                            <div className="form-group">
                                <label>匹配模式</label>
                                <input
                                    type="text"
                                    value={editingRule.pattern || ''}
                                    onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                                    placeholder="例如: /home/**/*, npm install, *.txt"
                                />
                            </div>

                            <div className="form-group">
                                <label>操作</label>
                                <select
                                    value={editingRule.action}
                                    onChange={(e) => setEditingRule({ ...editingRule, action: e.target.value as 'allow' | 'deny' })}
                                >
                                    <option value="allow">允许</option>
                                    <option value="deny">拒绝</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>描述 (可选)</label>
                                <textarea
                                    value={editingRule.description || ''}
                                    onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                                    placeholder="描述此规则的用途..."
                                    rows={2}
                                />
                            </div>

                            <div className="form-group">
                                <label>过期时间 (可选)</label>
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
                                取消
                            </button>
                            <button className="modal-btn modal-btn--save" onClick={handleSaveRule}>
                                {isCreatingNew ? '创建' : '保存'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
