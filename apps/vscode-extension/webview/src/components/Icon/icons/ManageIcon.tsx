import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const ManageIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-manage', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="32618" width="1em" height="1em" fill='currentColor'>
                <path d="M114.4 413.6v-248h248v248h-248z m248-330.4h-248C68.8 83.2 32 120 32 165.6v248C32 459.2 68.8 496 114.4 496h248c45.6 0 82.4-36.8 82.4-82.4v-248c0-45.6-36.8-82.4-82.4-82.4z m-248 826.4v-248h248v248h-248z m248-330.4h-248C68.8 579.2 32 616 32 661.6v248c0 45.6 36.8 82.4 82.4 82.4h248c45.6 0 82.4-36.8 82.4-82.4v-248c0-45.6-36.8-82.4-82.4-82.4z m372-114.4L559.2 289.6l175.2-175.2 175.2 175.2-175.2 175.2zM968 231.2L792.8 56c-32-32-84-32-116.8 0L500.8 231.2c-15.2 15.2-24 36-24 58.4 0 21.6 8.8 43.2 24 58.4l175.2 175.2c32 32 84.8 32 116.8 0L968 348c32-32 32-84 0-116.8z m-357.6 678.4v-248h248v248h-248z m248-330.4h-248C564.8 579.2 528 616 528 661.6v248c0 45.6 36.8 82.4 82.4 82.4h248c45.6 0 82.4-36.8 82.4-82.4v-248c0-45.6-36.8-82.4-82.4-82.4z" p-id="32619"></path>
            </svg>
        </IconBase>
    );
};

export default ManageIcon;