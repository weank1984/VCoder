/**
 * Dropdown Component - 通用下拉菜单组件
 * 
 * 支持搜索、键盘导航、分组等功能
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import './index.scss';

export interface DropdownItem {
  /** 唯一标识符 */
  id: string;
  /** 显示标签 */
  label: ReactNode;
  /** 左侧图标 */
  icon?: ReactNode;
  /** 右侧图标或快捷键 */
  rightElement?: ReactNode;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否分隔线 */
  divider?: boolean;
  /** 分组标签(可选) */
  group?: string;
  /** 额外数据 */
  data?: any;
}

export interface DropdownProps {
  /** 触发器元素 */
  trigger: ReactNode;
  /** 下拉菜单项 */
  items: DropdownItem[];
  /** 当前选中项的 ID */
  selectedId?: string;
  /** 选择回调 */
  onSelect?: (item: DropdownItem) => void;
  /** 弹出位置 */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** 是否显示搜索框 */
  searchable?: boolean;
  /** 搜索框占位符 */
  searchPlaceholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否显示选中标记 */
  showCheckmark?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 弹窗自定义类名 */
  popoverClassName?: string;
  /** 头部额外内容 */
  headerContent?: ReactNode;
  /** 底部额外内容 */
  footerContent?: ReactNode;
  /** 最大高度 */
  maxHeight?: number;
  /** 最小宽度 */
  minWidth?: number;
}

export const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  items,
  selectedId,
  onSelect,
  placement = 'bottom',
  searchable = false,
  searchPlaceholder = 'Search...',
  disabled = false,
  showCheckmark = true,
  className = '',
  popoverClassName = '',
  headerContent,
  footerContent,
  maxHeight = 300,
  minWidth,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 过滤后的项目列表
  const filteredItems = searchQuery
    ? items.filter(item => 
        !item.divider && 
        (typeof item.label === 'string' 
          ? item.label.toLowerCase().includes(searchQuery.toLowerCase())
          : true)
      )
    : items;

  // 按分组组织项目
  const groupedItems = filteredItems.reduce((acc, item) => {
    const group = item.group || 'default';
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, DropdownItem[]>);

  // 打开/关闭下拉菜单
  const toggleDropdown = useCallback(() => {
    if (disabled) return;
    setIsOpen(prev => !prev);
  }, [disabled]);

  // 选择项目
  const handleSelect = useCallback((item: DropdownItem) => {
    if (item.disabled || item.divider) return;
    onSelect?.(item);
    setIsOpen(false);
    setSearchQuery('');
    setFocusedIndex(-1);
  }, [onSelect]);

  // 处理键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) return;

    const selectableItems = filteredItems.filter(item => !item.disabled && !item.divider);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(prev => (prev + 1) % selectableItems.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(prev => (prev - 1 + selectableItems.length) % selectableItems.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && selectableItems[focusedIndex]) {
          handleSelect(selectableItems[focusedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        setFocusedIndex(-1);
        break;
      case 'Tab':
        setIsOpen(false);
        setSearchQuery('');
        break;
    }
  }, [isOpen, filteredItems, focusedIndex, handleSelect]);

  // 点击外部关闭（需要同时检查 trigger 和 portal 中的 popover）
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideTrigger = containerRef.current?.contains(target);
      const isInsidePopover = popoverRef.current?.contains(target);
      if (!isInsideTrigger && !isInsidePopover) {
        setIsOpen(false);
        setSearchQuery('');
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 自动聚焦搜索框
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen, searchable]);

  // 计算弹窗位置（基于触发器的视口坐标，使用 fixed 定位，自动检测方向）
  const [popoverPosition, setPopoverPosition] = useState<React.CSSProperties>({});
  const [resolvedPlacement, setResolvedPlacement] = useState(placement);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const updatePosition = () => {
      const triggerEl = containerRef.current;
      if (!triggerEl) return;

      const rect = triggerEl.getBoundingClientRect();
      const gap = 4;
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      // 获取 popover 实际尺寸（如果已渲染）
      const popoverEl = popoverRef.current;
      const popoverHeight = popoverEl?.offsetHeight || maxHeight;
      const popoverWidth = popoverEl?.offsetWidth || (minWidth || 200);

      // 自动方向检测：根据视口剩余空间决定最终方向
      let finalPlacement = placement;
      if (placement === 'bottom' || placement === 'top') {
        const spaceBelow = vh - rect.bottom - gap;
        const spaceAbove = rect.top - gap;
        if (placement === 'bottom' && spaceBelow < popoverHeight && spaceAbove > spaceBelow) {
          finalPlacement = 'top';
        } else if (placement === 'top' && spaceAbove < popoverHeight && spaceBelow > spaceAbove) {
          finalPlacement = 'bottom';
        }
      } else {
        const spaceRight = vw - rect.right - gap;
        const spaceLeft = rect.left - gap;
        if (placement === 'right' && spaceRight < popoverWidth && spaceLeft > spaceRight) {
          finalPlacement = 'left';
        } else if (placement === 'left' && spaceLeft < popoverWidth && spaceRight > spaceLeft) {
          finalPlacement = 'right';
        }
      }

      setResolvedPlacement(finalPlacement);

      const style: React.CSSProperties = {
        position: 'fixed',
        maxHeight: `${maxHeight}px`,
      };

      if (minWidth) {
        style.minWidth = `${minWidth}px`;
      }

      switch (finalPlacement) {
        case 'top':
          style.bottom = `${vh - rect.top + gap}px`;
          style.left = `${rect.left}px`;
          break;
        case 'bottom':
          style.top = `${rect.bottom + gap}px`;
          style.left = `${rect.left}px`;
          break;
        case 'left':
          style.right = `${vw - rect.left + gap}px`;
          style.top = `${rect.top}px`;
          break;
        case 'right':
          style.left = `${rect.right + gap}px`;
          style.top = `${rect.top}px`;
          break;
      }

      // 水平边界检测（上/下弹出时防止超出右侧）
      if (finalPlacement === 'top' || finalPlacement === 'bottom') {
        if (rect.left + popoverWidth > vw) {
          style.left = undefined;
          style.right = `${gap}px`;
        }
      }

      // 垂直边界检测（左/右弹出时防止超出底部）
      if (finalPlacement === 'left' || finalPlacement === 'right') {
        if (rect.top + popoverHeight > vh) {
          style.top = undefined;
          style.bottom = `${gap}px`;
        }
      }

      setPopoverPosition(style);
    };

    // 首帧先计算一次，popover 渲染后再根据实际尺寸修正
    updatePosition();
    requestAnimationFrame(updatePosition);

    return undefined;
  }, [isOpen, placement, maxHeight, minWidth]);

  const containerClasses = [
    'vc-dropdown',
    isOpen && 'is-open',
    disabled && 'is-disabled',
    className,
  ].filter(Boolean).join(' ');

  const popoverClasses = [
    'vc-dropdown-popover',
    `vc-dropdown-popover--${resolvedPlacement}`,
    popoverClassName,
  ].filter(Boolean).join(' ');

  return (
    <div 
      ref={containerRef} 
      className={containerClasses}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger */}
      <div 
        className="vc-dropdown-trigger" 
        onClick={toggleDropdown}
      >
        {trigger}
      </div>

      {/* Popover - rendered via Portal to avoid overflow:hidden clipping */}
      {isOpen && createPortal(
        <>
          <div className="vc-dropdown-overlay" onClick={() => setIsOpen(false)} />
          <div
            ref={popoverRef}
            className={popoverClasses}
            style={popoverPosition}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            {(searchable || headerContent) && (
              <div className="vc-dropdown-header">
                {headerContent}
                {searchable && (
                  <div className="vc-dropdown-search">
                    <input
                      ref={searchInputRef}
                      type="text"
                      className="vc-dropdown-search-input"
                      placeholder={searchPlaceholder}
                      value={searchQuery}
                      onChange={e => {
                        setSearchQuery(e.target.value);
                        setFocusedIndex(-1);
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Items */}
            <div className="vc-dropdown-items">
              {Object.keys(groupedItems).length === 0 ? (
                <div className="vc-dropdown-empty">No items found</div>
              ) : (
                Object.entries(groupedItems).map(([groupName, groupItems]) => (
                  <div key={groupName} className="vc-dropdown-group">
                    {groupName !== 'default' && (
                      <div className="vc-dropdown-group-label">{groupName}</div>
                    )}
                    {groupItems.map((item) => {
                      if (item.divider) {
                        return <div key={item.id} className="vc-dropdown-divider" />;
                      }

                      const isSelected = item.id === selectedId;
                      const selectableItems = filteredItems.filter(it => !it.disabled && !it.divider);
                      const isFocused = selectableItems.indexOf(item) === focusedIndex;

                      const itemClasses = [
                        'vc-dropdown-item',
                        isSelected && 'is-selected',
                        isFocused && 'is-focused',
                        item.disabled && 'is-disabled',
                      ].filter(Boolean).join(' ');

                      return (
                        <div
                          key={item.id}
                          className={itemClasses}
                          onClick={() => handleSelect(item)}
                          onMouseEnter={() => {
                            if (!item.disabled) {
                              setFocusedIndex(selectableItems.indexOf(item));
                            }
                          }}
                        >
                          {item.icon && (
                            <span className="vc-dropdown-item-icon">
                              {item.icon}
                            </span>
                          )}
                          <span className="vc-dropdown-item-label">
                            {item.label}
                          </span>
                          {item.rightElement && (
                            <span className="vc-dropdown-item-right">
                              {item.rightElement}
                            </span>
                          )}
                          {showCheckmark && isSelected && !item.rightElement && (
                            <span className="vc-dropdown-item-check">✓</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {footerContent && (
              <div className="vc-dropdown-footer">
                {footerContent}
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
