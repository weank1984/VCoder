
import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const RevertedIcon: React.FC<IconProps> = (props) => {
    const {className, style} = props;
    
    const mergedCls = classNames('vc-icon-reverted', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5215" width="1em" height="1em">
                <path d="M512.060235 60.054588a481.882353 481.882353 0 1 1 0 963.764706 481.882353 481.882353 0 0 1 0-963.764706z m0 72.282353a409.6 409.6 0 1 0 0 819.2 409.6 409.6 0 0 0 0-819.2z m204.8 373.458824a36.141176 36.141176 0 0 1 5.842824 71.80047l-5.842824 0.481883h-409.6a36.141176 36.141176 0 0 1-5.842823-71.800471l5.842823-0.481882h409.6z" fill="#d81e06" p-id="5216"></path>
            </svg>
        </IconBase>
    );
};

export default RevertedIcon;