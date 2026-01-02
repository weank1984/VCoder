import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const VueConfigIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-vueconfig', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
                <path d="M13 9h5.5L13 3.5V9M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4c0-1.11.89-2 2-2m9 16v-2H6v2h9m3-4v-2H6v2h12z" fill="#757575" style={{fill:"#757575"}}/>
                <path d="M1.791 3.691 12 21.311 22.209 3.776v-.086H18.24L12.06 14.306 5.906 3.691z" fill="#41b883" transform="translate(11.066 10.911) scale(.57384)"/>
                <path d="m5.907 3.691 6.152 10.617L18.24 3.691h-3.723L12.084 7.87 9.66 3.69z" fill="#35495e" transform="translate(11.066 10.911) scale(.57384)"/>
            </svg>
        </IconBase>
    );
};

export default VueConfigIcon;
