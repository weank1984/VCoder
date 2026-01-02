import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const AzureIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-azure', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
                <path d="M13.098 3.885 6.311 18.327l-4.769-.052 5.323-9.161 6.233-5.23m.732 1.14 8.627 15.09H6.5l9.726-1.735-5.093-6.055z" fill='#1e88e5' strokeWidth={1.0458}/>
            </svg>
        </IconBase>
    );
};

export default AzureIcon;
