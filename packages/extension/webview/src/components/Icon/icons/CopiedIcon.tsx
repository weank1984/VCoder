import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const CopiedIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-copy', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="2322" width="1em" height="1em" fill='currentColor'>
                <path d="M512 160a352 352 0 1 0 342.592 270.72 32 32 0 0 1 62.272-14.72A416 416 0 1 1 672 127.872a32 32 0 1 1-24.64 59.072A350.784 350.784 0 0 0 512 160z" p-id="2323"></path>
                <path d="M886.016 179.456a32 32 0 0 1 1.216 45.184l-384 405.376a32 32 0 0 1-45.888 0.64l-128-128a32 32 0 1 1 45.312-45.312L479.36 562.112l361.408-381.44a32 32 0 0 1 45.248-1.28z" p-id="2324"></path>
            </svg>
        </IconBase>
    );
};

export default CopiedIcon;