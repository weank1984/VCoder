import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const FaviconIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-favicon', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
                <path d="m12 17.77 6.18 3.73-1.64-7.03L22 9.74l-7.19-.62L12 2.5 9.19 9.12 2 9.74l5.45 4.73-1.63 7.03z" fill="#ffd54f"/>
            </svg>
        </IconBase>
    );
};

export default FaviconIcon;
