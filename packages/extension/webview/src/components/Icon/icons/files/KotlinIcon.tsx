import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const KotlinIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-kotlin', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em"><defs><linearGradient id="a" x1="1.725" x2="22.185" y1="22.67" y2="1.982" gradientTransform="translate(1.306 1.129) scale(.89324)" gradientUnits="userSpaceOnUse"><stop stop-color="#0296d8" offset="0"/><stop stop-color="#8371d9" offset="1"/></linearGradient><linearGradient id="b" x1="1.869" x2="22.798" y1="22.382" y2="3.377" gradientTransform="translate(1.323 1.129) scale(.89324)" gradientUnits="userSpaceOnUse"><stop stop-color="#cb55c0" offset="0"/><stop stop-color="#f28e0e" offset="1"/></linearGradient></defs>
                <path d="M2.975 2.976v18.048h18.05v-.03l-4.478-4.511-4.48-4.515 4.48-4.515 4.443-4.477z" fill="url(#a)"/>
            
                <path d="m12.223 2.976-9.23 9.23v8.818h.083l9.032-9.032-.024-.024 4.48-4.515 4.443-4.477h-8.784z" fill="url(#b)"/>
            </svg>
        </IconBase>
    );
};

export default KotlinIcon;
