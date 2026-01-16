/**
 * Button Component - 统一的按钮组件
 * 
 * 支持多种变体、尺寸和状态
 */

import React from 'react';
import './index.scss';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * 按钮变体
   * - primary: 主要操作（蓝色背景）
   * - secondary: 次要操作（灰色背景）
   * - ghost: 透明背景，hover 显示背景
   * - danger: 危险操作（红色）
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  
  /**
   * 按钮尺寸
   * - small: 紧凑尺寸
   * - medium: 标准尺寸（默认）
   * - large: 大尺寸
   */
  size?: 'small' | 'medium' | 'large';
  
  /**
   * 是否为块级按钮（占满父容器宽度）
   */
  fullWidth?: boolean;
  
  /**
   * 是否显示加载状态
   */
  loading?: boolean;
  
  /**
   * 左侧图标
   */
  icon?: React.ReactNode;
  
  /**
   * 右侧图标
   */
  iconRight?: React.ReactNode;
  
  /**
   * 子元素
   */
  children?: React.ReactNode;
  
  /**
   * 自定义类名
   */
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'medium',
  fullWidth = false,
  loading = false,
  icon,
  iconRight,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const classNames = [
    'vc-button',
    `vc-button--${variant}`,
    `vc-button--${size}`,
    fullWidth && 'vc-button--full-width',
    loading && 'is-loading',
    disabled && 'is-disabled',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classNames}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="vc-button__spinner" aria-hidden="true">
          <span className="spinner-dot" />
          <span className="spinner-dot" />
          <span className="spinner-dot" />
        </span>
      )}
      {!loading && icon && (
        <span className="vc-button__icon vc-button__icon--left">
          {icon}
        </span>
      )}
      {children && (
        <span className="vc-button__label">
          {children}
        </span>
      )}
      {!loading && iconRight && (
        <span className="vc-button__icon vc-button__icon--right">
          {iconRight}
        </span>
      )}
    </button>
  );
};
