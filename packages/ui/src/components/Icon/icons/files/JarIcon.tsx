import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const JarIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-jar', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em">
                <path d="M4.25 1.52a2.58 2.6 0 0 0-2.58 2.6v15.66a2.58 2.6 0 0 0 2.58 2.61h15.48a2.58 2.6 0 0 0 2.58-2.6V4.12a2.6 2.6 0 0 0-2.58-2.61H4.25zm.24 4.3h13.83c.95 0 1.73.8 1.73 1.78v2.66a1.73 1.77 0 0 1-1.73 1.77H16.6v2.5a3.46 3.48 0 0 1-3.46 3.5h-5.2a3.46 3.48 0 0 1-3.45-3.5v-8.7zm12.1 1.78v2.66h1.73V7.6H16.6z" fill="#f44336"/>
            </svg>
        </IconBase>
    );
};

export default JarIcon;
