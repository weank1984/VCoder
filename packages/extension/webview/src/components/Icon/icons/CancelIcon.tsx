import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const CancelIcon: React.FC<IconProps> = (props) => {
    const { className, style, ...restProps } = props;
    const mergedCls = classNames('vc-icon-cancel', className);

    return (
        <IconBase className={mergedCls} style={style} {...restProps}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="7560" width="1em" height="1em" fill='currentColor'>
                <path d="M512 1024a512 512 0 1 1 512-512 512 512 0 0 1-512 512z m0-938.666667a426.666667 426.666667 0 1 0 426.666667 426.666667A426.666667 426.666667 0 0 0 512 85.333333z m200.789333 627.456a40.576 40.576 0 0 1-57.386666 0l-144.042667-144.042666-144.042667 144.042666a40.490667 40.490667 0 1 1-57.216-57.258666l144.042667-144.042667-144.042667-144.042667A40.490667 40.490667 0 1 1 367.317333 310.186667l144.042667 144.042666 144.042667-144.042666a40.490667 40.490667 0 1 1 57.258666 57.258666l-144.042666 144.042667 144.042666 144.042667a40.533333 40.533333 0 0 1 0.128 57.258666z" p-id="7561"></path>
            </svg>
        </IconBase>
    );
};

export default CancelIcon;