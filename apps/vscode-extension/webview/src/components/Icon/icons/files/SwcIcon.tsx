import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const SwcIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-swc', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em">
                <path d="M5 3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2H5zm12 3v2.4c-1.6 0-2.4.9-3.1 2.4h1.8v2.4h-2.8c-.4 1-.9 2.1-1.6 2.9C10.2 17.4 8.8 18 7 18v-2.4c2.2 0 2.8-1.5 3.8-4 .5-1.3 1.1-2.6 1.9-3.6 1.1-1.3 2.5-2 4.3-2z" fill="#e53935"/>
            </svg>
        </IconBase>
    );
};

export default SwcIcon;
