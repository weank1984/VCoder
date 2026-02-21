import React from 'react';
import classNames from 'classnames';
import './index.scss';

interface SpinningProps {
    className?: string;
    style?: React.CSSProperties;
    /** 加载中 */
    loading?: boolean,
    /** 自定义描述文案 */
    tip?: React.ReactNode;
}

const prefixClass = 'vc-loading';

const Loading: React.FC<SpinningProps> = (props) => {
    const { className, style, loading = true, tip } = props;
    return (
        <div className={classNames(prefixClass, className)} style={style}>
            {tip && <span className={`${prefixClass}-tip`}>{tip}</span>}
            {loading && (
                <div className={`${prefixClass}-dots`}>
                    <div className={`${prefixClass}-dot`}></div>
                    <div className={`${prefixClass}-dot`}></div>
                    <div className={`${prefixClass}-dot`}></div>
                </div>
            )}
        </div>
    );
};

export default Loading;
