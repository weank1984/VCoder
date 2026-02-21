import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const MoreIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-more', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill='currentColor'>
                <path d="M192 512a64 64 0 1 0 128 0 64 64 0 1 0-128 0z m256 0a64 64 0 1 0 128 0 64 64 0 1 0-128 0z m256 0a64 64 0 1 0 128 0 64 64 0 1 0-128 0z"></path>
            </svg>
        </IconBase>
    );
};

export default MoreIcon;
