
import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const CheckIcon: React.FC<IconProps> = (props) => {
    const {className, style} = props;
    const mergedCls = classNames('vc-icon-check', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="999" width="1em" height="1em" fill='currentColor'>
                <path d="M394.792 797.429c-9.71 0-19.443-3.513-27.137-10.622L87.488 527.917c-16.225-14.993-17.224-40.3-2.231-56.525 14.993-16.226 40.3-17.225 56.524-2.231l280.167 258.89c16.225 14.993 17.224 40.3 2.231 56.524-7.883 8.532-18.62 12.854-29.387 12.854z" p-id="1000" ></path><path d="M394.808 797.429c-10.555 0-21.088-4.15-28.949-12.391-15.249-15.984-14.652-41.304 1.333-56.553l514.564-490.858c15.983-15.249 41.303-14.652 56.553 1.333 15.248 15.985 14.651 41.305-1.334 56.553l-514.563 490.86c-7.745 7.387-17.684 11.056-27.604 11.056z" p-id="1001"></path>
            </svg>
        </IconBase>
    );
};

export default CheckIcon;