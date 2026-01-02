import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const JavaIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-java', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
                <path d="M2 21h18v-2H2M20 8h-2V5h2m0-2H4v10a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-3h2a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" fill="#f44336"/>
            </svg>
        </IconBase>
    );
};

export default JavaIcon;
