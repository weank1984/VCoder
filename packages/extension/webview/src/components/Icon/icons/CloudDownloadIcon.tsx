import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const CloudDownloadIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-cloud-download', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor">
                <path d="M704 288c-123.712 0-224 100.288-224 224v64H288c-70.592 0-128 57.408-128 128s57.408 128 128 128h416c88.224 0 160-71.776 160-160s-71.776-160-160-160c0-123.712-100.288-224-224-224z m0 64c88.224 0 160 71.776 160 160v32h32c52.928 0 96 43.072 96 96s-43.072 96-96 96H288c-35.296 0-64-28.704-64-64s28.704-64 64-64h256v-128c0-88.224 71.776-160 160-160z" />
                <path d="M544 672h-64V544c0-17.664-14.336-32-32-32s-32 14.336-32 32v128h-64c-12.16 0-23.232 6.912-28.544 17.824-5.312 10.88-3.712 23.808 4.128 33.28l96 96c6.24 6.24 14.432 9.376 22.624 9.376s16.384-3.136 22.624-9.376l96-96c7.84-9.472 9.44-22.4 4.128-33.28-5.312-10.912-16.384-17.824-28.544-17.824z" />
            </svg>
        </IconBase>
    );
};

export default CloudDownloadIcon;
