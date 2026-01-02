import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const AttachmentIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-attachment', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="11062" width="1em" height="1em" fill='currentColor'>
                <path d="M902.5 175.3c-72.3-72.3-189.6-72.3-262 0L300 515.8c-43.4 43.4-43.4 113.8 0 157.2 43.4 43.4 113.8 43.4 157.2 0l262-262c14.5-14.5 14.5-37.9 0-52.4s-37.9-14.5-52.4 0l-262 262c-14.5 14.5-37.9 14.5-52.4 0s-14.5-37.9 0-52.4L693 227.6c43.4-43.4 113.8-43.4 157.2 0 43.4 43.4 43.4 113.8 0 157.2l-393 393c-72.3 72.3-189.6 72.3-262 0-72.3-72.3-72.3-189.6 0-262l314.4-314.4c14.5-14.5 14.5-37.9 0-52.4s-37.9-14.5-52.4 0L142.8 463.4c-101.3 101.3-101.3 265.5 0 366.8 101.3 101.3 265.5 101.3 366.8 0l393-393c72.3-72.3 72.3-189.6-0.1-261.9z m0 0" p-id="11063"></path>
            </svg>
        </IconBase>
    );
};

export default AttachmentIcon;