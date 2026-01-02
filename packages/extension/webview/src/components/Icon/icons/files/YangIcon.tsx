import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const YangIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-yang', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
                <path d="M12 2a10 10 0 0 1 10 10 10 10 0 0 1-10 10A10 10 0 0 1 2 12 10 10 0 0 1 12 2m0 2a8 8 0 0 0-8 8 8 8 0 0 0 8 8 4 4 0 0 1-4-4 4 4 0 0 1 4-4 4 4 0 0 0 4-4 4 4 0 0 0-4-4m0 2.5A1.5 1.5 0 0 1 13.5 8 1.5 1.5 0 0 1 12 9.5 1.5 1.5 0 0 1 10.5 8 1.5 1.5 0 0 1 12 6.5m0 8a1.5 1.5 0 0 0-1.5 1.5 1.5 1.5 0 0 0 1.5 1.5 1.5 1.5 0 0 0 1.5-1.5 1.5 1.5 0 0 0-1.5-1.5z" fill="#42a5f5"/>
            </svg>
        </IconBase>
    );
};

export default YangIcon;
