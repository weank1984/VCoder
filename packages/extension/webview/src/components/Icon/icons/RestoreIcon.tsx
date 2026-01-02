import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const RestoreIcon: React.FC<IconProps> = (props) => {
    const {className, ...restProps} = props;
    
    const mergedCls = classNames('vc-icon-restore', className);

    return (
        <IconBase className={mergedCls} {...restProps}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="21314" width="1em" height="1em" fill="currentColor"><path d="M665.726 307.2H307.074c-28.223 0-51.074 22.867-51.074 51.074v358.652C256 745.149 278.867 768 307.074 768h358.652c28.223 0 51.074-22.867 51.074-51.074V358.274c0-28.223-22.867-51.074-51.074-51.074z m-0.126 409.6H307.2V358.4h358.4v358.4z" p-id="21315"></path><path d="M742.25 204.8H435.2c-14.138 0-25.6 11.462-25.6 25.6s11.461 25.6 25.6 25.6h307.05c14.464 0 25.75 11.2 25.75 25.75V588.8c0 14.138 11.462 25.6 25.6 25.6 14.138 0 25.6-11.462 25.6-25.6V281.75c0-42.916-34.297-76.95-76.95-76.95z" p-id="21316"></path></svg>
        </IconBase>
    );
};

export default RestoreIcon;
