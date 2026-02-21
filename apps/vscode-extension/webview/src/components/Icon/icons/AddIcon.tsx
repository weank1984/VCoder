import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const AddIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-add', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="3455" width="1em" height="1em" fill='currentColor'>
                <path d="M106.7 469.3h810.7c23.6 0 42.7 19.1 42.7 42.7s-19.1 42.7-42.7 42.7H106.7C83.1 554.7 64 535.6 64 512s19.1-42.7 42.7-42.7z" p-id="3456"></path><path d="M512 64c23.6 0 42.7 19.1 42.7 42.7v810.7c0 23.6-19.1 42.7-42.7 42.7s-42.7-19.1-42.7-42.7V106.7c0-23.6 19.1-42.7 42.7-42.7z" fill="#bfbfbf" p-id="3457"></path>
            </svg>
        </IconBase>
    );
};

export default AddIcon;