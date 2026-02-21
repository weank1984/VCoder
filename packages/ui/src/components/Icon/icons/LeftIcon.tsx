import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const LeftIcon: React.FC<IconProps> = (props) => {
    const {className, style} = props;
    
    const mergedCls = classNames('vc-icon-left', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="14634" width="1em" height="1em" fill='currentColor'>
                <path d="M734.08 188.373333L673.92 128l-384 384 384 384 60.16-60.373333L410.453333 512 734.08 188.373333z" p-id="14635"></path>
            </svg>
        </IconBase>
    );
};

export default LeftIcon;