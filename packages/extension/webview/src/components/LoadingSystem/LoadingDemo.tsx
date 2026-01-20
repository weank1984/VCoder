import { useState, useEffect } from 'react';
import LoadingSystem from '../LoadingSystem';

const LoadingDemo = () => {
    const [activeType, setActiveType] = useState<'typing' | 'thinking' | 'processing' | 'searching' | 'executing'>('typing');
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    return 0;
                }
                return prev + 10;
            });
        }, 500);

        return () => clearInterval(timer);
    }, []);

    const loadingTypes = [
        { type: 'typing' as const, label: '输入中', description: '聊天输入状态' },
        { type: 'thinking' as const, label: '思考中', description: 'AI思考过程' },
        { type: 'processing' as const, label: '处理中', description: '数据处理状态' },
        { type: 'searching' as const, label: '搜索中', description: '搜索操作状态' },
        { type: 'executing' as const, label: '执行中', description: '命令执行状态' },
    ];

    return (
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h2>加载状态组件演示</h2>
            
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {loadingTypes.map(({ type, label }) => (
                    <button
                        key={type}
                        onClick={() => setActiveType(type)}
                        style={{
                            padding: '8px 16px',
                            borderRadius: '6px',
                            border: `2px solid ${activeType === type ? 'var(--vc-color-primary)' : 'var(--vc-color-border)'}`,
                            background: activeType === type ? 'var(--vc-color-primary-bg-hover)' : 'var(--vc-color-bg-secondary)',
                            cursor: 'pointer'
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h3>尺寸变体</h3>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <span style={{ minWidth: '60px' }}>小号:</span>
                    <LoadingSystem type={activeType} size="sm" />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <span style={{ minWidth: '60px' }}>中号:</span>
                    <LoadingSystem type={activeType} size="md" />
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <span style={{ minWidth: '60px' }}>大号:</span>
                    <LoadingSystem type={activeType} size="lg" />
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h3>进度条示例</h3>
                <LoadingSystem 
                    type="executing" 
                    showProgress={true}
                    progress={progress}
                    message={`执行进行中... ${progress}%`}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h3>自定义消息</h3>
                <LoadingSystem 
                    type={activeType}
                    message="这是一个自定义的加载消息"
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <h3>内联变体</h3>
                <p>
                    这是一个段落中的内联加载示例：
                    <LoadingSystem type="typing" size="sm" inline />
                    继续文本内容...
                </p>
            </div>
        </div>
    );
};

export default LoadingDemo;