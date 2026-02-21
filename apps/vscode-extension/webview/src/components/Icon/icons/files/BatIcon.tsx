import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const BatIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-bat', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M3 2V5L6.5 8L3 11V14L9.5 8L3 2ZM9 12H13C13.5523 12 14 12.4477 14 13C14 13.5523 13.5523 14 13 14H9C8.44772 14 8 13.5523 8 13C8 12.4477 8.44772 12 9 12Z" fill="#2DA3F9"/>
            </svg>
        </IconBase>
    );
};

export default BatIcon;
