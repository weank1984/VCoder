import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../../IconBase';

const SketchIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    
    const mergedCls = classNames('vc-icon-sketch', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em">
                <path d="M15.705 9.221h2.779l-4.632 6.484m-3.705-6.484h3.705L12 16.631m-6.484-7.41h2.779l1.852 6.484M14.78 4.59h1.852l1.853 2.779h-2.78m-4.63-2.779h1.852l.926 2.779h-3.705M7.368 4.59h1.853L8.295 7.37h-2.78m.927-4.631L2.737 8.294 12 21.263l9.262-12.968-3.705-5.557z" fill="#ffc107" strokeWidth={.92627}/>
            </svg>
        </IconBase>
    );
};

export default SketchIcon;
