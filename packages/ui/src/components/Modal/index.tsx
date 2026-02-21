/**
 * Modal Component - 通用模态对话框组件
 * 
 * 支持自定义内容、尺寸、动画等
 */

import React, { useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { CloseIcon } from '../Icon';
import { IconButton } from '../IconButton';
import './index.scss';

export interface ModalProps {
  /** 是否显示 */
  visible: boolean;
  
  /** 关闭回调 */
  onClose: () => void;
  
  /** 标题 */
  title?: ReactNode;
  
  /** 内容 */
  children?: ReactNode;
  
  /** 底部内容 */
  footer?: ReactNode;
  
  /** 尺寸 */
  size?: 'small' | 'medium' | 'large' | 'full';
  
  /** 是否显示关闭按钮 */
  closable?: boolean;
  
  /** 点击遮罩是否关闭 */
  maskClosable?: boolean;
  
  /** 是否显示遮罩 */
  mask?: boolean;
  
  /** 按ESC是否关闭 */
  keyboard?: boolean;
  
  /** 自定义类名 */
  className?: string;
  
  /** 遮罩自定义类名 */
  maskClassName?: string;
  
  /** 是否居中显示 */
  centered?: boolean;
  
  /** 关闭后销毁子元素 */
  destroyOnClose?: boolean;
  
  /** z-index */
  zIndex?: number;
}

export const Modal: React.FC<ModalProps> = ({
  visible,
  onClose,
  title,
  children,
  footer,
  size = 'medium',
  closable = true,
  maskClosable = true,
  mask = true,
  keyboard = true,
  className = '',
  maskClassName = '',
  centered = true,
  destroyOnClose = false,
  zIndex = 1000,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const hasRendered = useRef(false);

  // 标记已经渲染过
  useEffect(() => {
    if (visible) {
      hasRendered.current = true;
    }
  }, [visible]);

  // 处理ESC键关闭
  useEffect(() => {
    if (!visible || !keyboard) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, keyboard, onClose]);

  // 锁定/解锁body滚动
  useEffect(() => {
    if (visible) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [visible]);

  // 点击遮罩关闭
  const handleMaskClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (maskClosable && e.target === e.currentTarget) {
      onClose();
    }
  }, [maskClosable, onClose]);

  // 如果从未显示过且destroyOnClose，则不渲染
  if (!visible && destroyOnClose && !hasRendered.current) {
    return null;
  }

  // 如果不可见且destroyOnClose，清除渲染标记
  if (!visible && destroyOnClose) {
    setTimeout(() => {
      hasRendered.current = false;
    }, 300); // 等待动画结束
  }

  const modalClasses = [
    'vc-modal',
    `vc-modal--${size}`,
    centered && 'vc-modal--centered',
    visible ? 'is-visible' : 'is-hidden',
    className,
  ].filter(Boolean).join(' ');

  const maskClasses = [
    'vc-modal-mask',
    visible ? 'is-visible' : 'is-hidden',
    maskClassName,
  ].filter(Boolean).join(' ');

  return (
    <div className="vc-modal-root" style={{ zIndex }}>
      {/* Mask */}
      {mask && (
        <div 
          className={maskClasses}
          onClick={handleMaskClick}
        />
      )}

      {/* Modal Container */}
      <div 
        className="vc-modal-wrap"
        onClick={handleMaskClick}
      >
        <div 
          ref={modalRef}
          className={modalClasses}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          {(title || closable) && (
            <div className="vc-modal-header">
              {title && (
                <div className="vc-modal-title">{title}</div>
              )}
              {closable && (
                <IconButton
                  icon={<CloseIcon />}
                  label="Close"
                  onClick={onClose}
                  className="vc-modal-close"
                />
              )}
            </div>
          )}

          {/* Body */}
          <div className="vc-modal-body">
            {(!destroyOnClose || visible) && children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="vc-modal-footer">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Dialog - 简化的对话框组件
 * 提供标准的确认/取消按钮
 */
export interface DialogProps extends Omit<ModalProps, 'footer'> {
  /** 确认按钮文本 */
  okText?: string;
  
  /** 取消按钮文本 */
  cancelText?: string;
  
  /** 确认按钮点击 */
  onOk?: () => void | Promise<void>;
  
  /** 取消按钮点击 */
  onCancel?: () => void;
  
  /** 确认按钮加载状态 */
  okLoading?: boolean;
  
  /** 确认按钮禁用 */
  okDisabled?: boolean;
  
  /** 确认按钮类型 */
  okType?: 'primary' | 'danger';
  
  /** 是否显示取消按钮 */
  showCancel?: boolean;
}

export const Dialog: React.FC<DialogProps> = ({
  okText = 'OK',
  cancelText = 'Cancel',
  onOk,
  onCancel,
  okLoading = false,
  okDisabled = false,
  okType = 'primary',
  showCancel = true,
  onClose,
  ...modalProps
}) => {
  const handleOk = async () => {
    if (okLoading || okDisabled) return;
    try {
      await onOk?.();
      onClose();
    } catch (error) {
      console.error('Dialog onOk error:', error);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onClose();
  };

  const footer = (
    <div className="vc-dialog-actions">
      {showCancel && (
        <button 
          className="vc-button vc-button--secondary vc-button--medium"
          onClick={handleCancel}
        >
          {cancelText}
        </button>
      )}
      <button
        className={`vc-button vc-button--${okType} vc-button--medium ${okLoading ? 'is-loading' : ''}`}
        onClick={handleOk}
        disabled={okLoading || okDisabled}
      >
        {okLoading ? 'Loading...' : okText}
      </button>
    </div>
  );

  return (
    <Modal
      {...modalProps}
      onClose={onClose}
      footer={footer}
    />
  );
};
