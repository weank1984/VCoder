import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const PauseIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-pause', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6124" width="1em" height="1em" fill='currentColor'>
                <path d="M512 0C229.216 0 0 229.216 0 512s229.216 512 512 512 512-229.216 512-512S794.784 0 512 0z m0 928C282.24 928 96 741.76 96 512S282.24 96 512 96s416 186.24 416 416-186.24 416-416 416z m-192-608h128v384h-128z m256 0h128v384h-128z" p-id="6125"></path>
            </svg>
        </IconBase>
    );
};

export default PauseIcon;