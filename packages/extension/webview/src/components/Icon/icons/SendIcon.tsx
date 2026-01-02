import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const SendIcon: React.FC<IconProps> = (props) => {
    const {className, style} = props;
    
    const mergedCls = classNames('vc-icon-send', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="4291" width="1em" height="1em" fill="currentColor">
                <path d="M865.439 115.01a32.02 32.02 0 0 1 16.282-2.894c17.436 1.491 30.406 16.688 29.202 34.07l-0.041 0.528-62.914 735.02a31.975 31.975 0 0 1-4.345 13.563c-8.911 15.052-28.239 20.134-43.385 11.505l-0.458-0.266-225.906-133.603-89.538 98.11a32.007 32.007 0 0 1-13.545 8.797c-16.605 5.52-34.53-3.314-40.3-19.756l-0.17-0.5-68.1-204.63-233.714-140.601a31.993 31.993 0 0 1-12.487-13.859c-7.411-15.843-0.711-34.661 14.96-42.296l0.478-0.228 733.98-342.96z m-23.055 81.392L212.978 490.5l192.385 115.739a31.991 31.991 0 0 1 13.7 16.829l0.164 0.48 54.603 164.077 70.295-77.024c10.116-11.085 26.562-13.64 39.552-6.201l0.392 0.228L788.533 825.55l53.851-629.147z m-93.367 93.044c23.936 24.744 23.27 64.196-1.486 88.12-0.392 0.378-0.79 0.752-1.19 1.12L526.215 580.505v49.68c0 34.979-28.088 63.401-62.951 63.966l-1.059 0.009V567.4a31.98 31.98 0 0 1 10.327-23.532l276.484-254.423z" fillOpacity=".65" p-id="4292"></path>
            </svg>
        </IconBase>
    );
};

export default SendIcon;