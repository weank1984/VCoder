/**
 * Permission Rules Management Panel
 * Allows users to view, filter, and delete saved permission rules
 */

import { useState, useMemo } from 'react';
import { postMessage } from '../utils/vscode';
import './PermissionRulesPanel.scss';

export interface PermissionRule {
    id: string;
    toolName: string;
    category: string;
    pattern: string;
    createdAt: number;
    sessionId?: string;
}

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
        // Optimistically remove from UI
        setRules(rules.filter((r) => r.id !== ruleId));
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
                const category = getToolCategory(rule.toolName);
                if (category !== selectedCategory) {
                    return false;
                }
            }

            // Filter by search query
            if (searchQuery) {
                const query = searchQuery.toLowerCase();
                return (
                    rule.toolName.toLowerCase().includes(query) ||
                    rule.pattern.toLowerCase().includes(query)
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
                                    {getToolCategory(rule.toolName) === 'file' && '📄'}
                                    {getToolCategory(rule.toolName) === 'terminal' && '⌨️'}
                                    {getToolCategory(rule.toolName) === 'mcp' && '🔧'}
                                    {getToolCategory(rule.toolName) === 'other' && '⚙️'}
                                </div>
                                <div className="rule-info">
                                    <div className="rule-tool-name">{rule.toolName}</div>
                                    <div className="rule-pattern">{rule.pattern}</div>
                                    <div className="rule-meta">
                                        创建于 {new Date(rule.createdAt).toLocaleString('zh-CN')}
                                    </div>
                                </div>
                                <button
                                    className="rule-delete"
                                    onClick={() => handleDeleteRule(rule.id)}
                                    aria-label="删除规则"
                                    title="删除规则"
                                >
                                    🗑️
                                </button>
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
        </div>
    );
}
