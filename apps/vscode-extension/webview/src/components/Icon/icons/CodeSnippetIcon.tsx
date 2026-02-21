import React from 'react';
import classNames from 'classnames';
import IconBase, { type IconProps } from '../IconBase';

const CodeSnippetIcon: React.FC<IconProps> = (props) => {
    const { className, style } = props;
    const mergedCls = classNames('vc-icon-code-snippet', className);

    return (
        <IconBase className={mergedCls} style={style}>
            <svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="12074" width="1em" height="1em" fill='currentColor'>
                <path d="M344.832 771.84L84.032 511.36 344.32 251.008c6.4-6.4 6.4-16.448 0-22.848l-22.784-22.784c-6.4-6.4-16.384-6.4-22.784 0L27.52 477.44l-22.784 22.784c-6.4 6.4-6.4 16.448 0 22.848l22.784 22.784 271.616 271.616c6.4 6.4 16.384 6.4 22.784 0l22.848-22.848c6.4-6.4 6.4-16.384 0-22.784z m672-272l-22.848-22.848-271.616-271.616a16.32 16.32 0 0 0-22.784 0l-22.784 22.784c-6.4 6.4-6.016 16.448 0 22.848l260.416 260.352-260.416 260.032c-6.4 6.4-6.016 16.384 0 22.784l22.784 22.784c6.4 6.4 16.448 6.016 22.848 0l271.552-271.552 22.784-22.848c6.4-6.4 6.4-16.384 0-22.784z m-391.68-363.264l-30.72-8a16 16 0 0 0-19.648 11.584L386.368 868.16a16 16 0 0 0 11.648 19.648l30.784 8a16 16 0 0 0 19.584-11.648L636.8 156.16a16 16 0 0 0-11.584-19.584z" p-id="12075"></path>
            </svg>
        </IconBase>
    );
};

export default CodeSnippetIcon;