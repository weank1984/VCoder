/**
 * Card Component - 通用卡片容器组件
 * 
 * 提供统一的卡片样式，支持多种变体
 */

import React from 'react';
import type { ReactNode, CSSProperties } from 'react';
import './index.scss';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * 卡片变体
   * - default: 默认样式（边框+背景）
   * - elevated: 浮起效果（阴影+背景）
   * - outlined: 只有边框，透明背景
   * - flat: 扁平样式，无边框无阴影
   */
  variant?: 'default' | 'elevated' | 'outlined' | 'flat';
  
  /**
   * 内边距大小
   * - none: 无内边距
   * - small: 小内边距（8px）
   * - medium: 标准内边距（12px，默认）
   * - large: 大内边距（16px）
   */
  padding?: 'none' | 'small' | 'medium' | 'large';
  
  /**
   * 是否可交互（hover效果）
   */
  interactive?: boolean;
  
  /**
   * 是否禁用
   */
  disabled?: boolean;
  
  /**
   * 子元素
   */
  children?: ReactNode;
  
  /**
   * 自定义类名
   */
  className?: string;
  
  /**
   * 自定义样式
   */
  style?: CSSProperties;
  
  /**
   * 点击事件
   */
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const Card: React.FC<CardProps> = ({
  variant = 'default',
  padding = 'medium',
  interactive = false,
  disabled = false,
  children,
  className = '',
  style,
  onClick,
  ...props
}) => {
  const classNames = [
    'vc-card',
    `vc-card--${variant}`,
    `vc-card--padding-${padding}`,
    interactive && 'vc-card--interactive',
    disabled && 'is-disabled',
    onClick && 'is-clickable',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      style={style}
      onClick={disabled ? undefined : onClick}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * CardHeader - 卡片头部
 */
export interface CardHeaderProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  title,
  subtitle,
  action,
  children,
  className = '',
}) => {
  return (
    <div className={`vc-card-header ${className}`}>
      {children || (
        <>
          <div className="vc-card-header-content">
            {title && <div className="vc-card-header-title">{title}</div>}
            {subtitle && <div className="vc-card-header-subtitle">{subtitle}</div>}
          </div>
          {action && <div className="vc-card-header-action">{action}</div>}
        </>
      )}
    </div>
  );
};

/**
 * CardBody - 卡片主体
 */
export interface CardBodyProps {
  children?: ReactNode;
  className?: string;
}

export const CardBody: React.FC<CardBodyProps> = ({ children, className = '' }) => {
  return <div className={`vc-card-body ${className}`}>{children}</div>;
};

/**
 * CardFooter - 卡片底部
 */
export interface CardFooterProps {
  children?: ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export const CardFooter: React.FC<CardFooterProps> = ({
  children,
  className = '',
  align = 'right',
}) => {
  return (
    <div className={`vc-card-footer vc-card-footer--${align} ${className}`}>
      {children}
    </div>
  );
};
