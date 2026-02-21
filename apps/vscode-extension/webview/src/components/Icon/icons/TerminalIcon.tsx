import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const TerminalIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;

    const mergedCls = classNames('vc-icon-terminal', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5025" width="1em" height="1em" fill='currentColor'>
                <path d="M170.666667 170.666667h682.666666a85.333333 85.333333 0 0 1 85.333334 85.333333v512a85.333333 85.333333 0 0 1-85.333334 85.333333H170.666667a85.333333 85.333333 0 0 1-85.333334-85.333333V256a85.333333 85.333333 0 0 1 85.333334-85.333333z m0 85.333333v512h682.666666V256H170.666667z m341.333333 341.333333h256v85.333334h-256v-85.333334z m-43.306667-103.637333L317.866667 644.565333l-60.330667-60.373333 90.453333-90.453333-90.453333-90.538667L317.866667 342.869333l150.826666 150.826667z" p-id="5026"></path>
            </svg>
        </IconBase>
    );
};

export default TerminalIcon;