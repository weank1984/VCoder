import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const LimitIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;

    const mergedCls = classNames('vc-icon-limit', className);

    return (
        <IconBase className={mergedCls} style={style}>
        <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="64361" width="1em" height="1em" fill='currentColor'>
            <path d="M0 0h1023.846423v81.549368H0V0z m0 942.450632h1023.846423v81.549368H0V942.450632zM537.519372 358.346248v307.153927h204.769285l-230.007099 255.961606L281.557766 665.500175h204.769285V358.346248h-204.769285l230.723792-255.961606L742.288657 358.346248h-204.769285z" p-id="64362"></path>
        </svg>
        </IconBase>
    );
};

export default LimitIcon;