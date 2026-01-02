import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';
import logoRaw from '../../../assets/images/VoyahLogo.svg?raw';

const VoyahIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;

    const mergedCls = classNames('vc-icon-voyah', className);

    // Clean up raw SVG: remove XML declaration and width/height attributes to allow CSS scaling
    const svgContent = logoRaw
        .replace(/<\?xml.*?\?>/, '')
        .replace(/(width|height)="[^"]*"/g, '');

    return (
        <IconBase 
            className={mergedCls} 
            style={style}
            {...props}
        >
            <span 
                className="vc-icon-svg-wrapper"
                style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 0 }}
                dangerouslySetInnerHTML={{ __html: svgContent }} 
            />
        </IconBase>
    );
};

export default VoyahIcon;