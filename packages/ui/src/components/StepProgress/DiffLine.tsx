import type { EnhancedDiffLine, DiffSpan } from './diffUtils';
import type { ThemedToken } from 'shiki';

export interface DiffLineProps {
    line: EnhancedDiffLine;
    showLineNumbers?: boolean;
    showWordDiff?: boolean;
    syntaxTokens?: ThemedToken[];
}

/**
 * Merge syntax tokens with word-diff spans.
 * Syntax tokens provide `color`; word spans provide highlight `background`.
 * We walk both arrays simultaneously, splitting at every boundary.
 */
function mergeTokensAndSpans(
    syntaxTokens: ThemedToken[],
    wordSpans: DiffSpan[],
    lineType: 'add' | 'remove' | 'context',
): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    let tokenIdx = 0;
    let tokenOffset = 0; // offset within current syntax token
    let spanIdx = 0;
    let spanOffset = 0; // offset within current word span
    let key = 0;

    while (tokenIdx < syntaxTokens.length && spanIdx < wordSpans.length) {
        const token = syntaxTokens[tokenIdx];
        const span = wordSpans[spanIdx];
        const tokenRemaining = token.content.length - tokenOffset;
        const spanRemaining = span.text.length - spanOffset;
        const take = Math.min(tokenRemaining, spanRemaining);

        if (take <= 0) {
            // Safety: skip empty segments
            if (tokenRemaining <= 0) { tokenIdx++; tokenOffset = 0; }
            if (spanRemaining <= 0) { spanIdx++; spanOffset = 0; }
            continue;
        }

        const text = token.content.slice(tokenOffset, tokenOffset + take);

        const isHighlight =
            (lineType === 'add' && span.type === 'insert') ||
            (lineType === 'remove' && span.type === 'delete');

        nodes.push(
            <span
                key={key++}
                style={{ color: token.color }}
                className={isHighlight ? `diff-word-${lineType === 'add' ? 'insert' : 'delete'}` : undefined}
            >
                {text}
            </span>
        );

        tokenOffset += take;
        spanOffset += take;

        if (tokenOffset >= token.content.length) {
            tokenIdx++;
            tokenOffset = 0;
        }
        if (spanOffset >= span.text.length) {
            spanIdx++;
            spanOffset = 0;
        }
    }

    // Remaining syntax tokens (no word spans left)
    while (tokenIdx < syntaxTokens.length) {
        const token = syntaxTokens[tokenIdx];
        const text = token.content.slice(tokenOffset);
        if (text) {
            nodes.push(<span key={key++} style={{ color: token.color }}>{text}</span>);
        }
        tokenIdx++;
        tokenOffset = 0;
    }

    return nodes;
}

/**
 * Render word-diff spans only (no syntax tokens).
 */
function renderWordSpans(
    wordSpans: DiffSpan[],
    lineType: 'add' | 'remove' | 'context',
): React.ReactNode[] {
    return wordSpans.map((span, i) => {
        const isHighlight =
            (lineType === 'add' && span.type === 'insert') ||
            (lineType === 'remove' && span.type === 'delete');

        if (isHighlight) {
            return (
                <span key={i} className={`diff-word-${lineType === 'add' ? 'insert' : 'delete'}`}>
                    {span.text}
                </span>
            );
        }
        return <span key={i}>{span.text}</span>;
    });
}

export function DiffLine({
    line,
    showLineNumbers = true,
    showWordDiff = true,
    syntaxTokens,
}: DiffLineProps) {
    const { content, prefix, type, oldLineNum, newLineNum, wordSpans } = line;

    // Determine content rendering
    let contentNode: React.ReactNode;
    if (syntaxTokens && wordSpans && showWordDiff) {
        contentNode = mergeTokensAndSpans(syntaxTokens, wordSpans, type);
    } else if (syntaxTokens) {
        contentNode = syntaxTokens.map((token, i) => (
            <span key={i} style={{ color: token.color }}>{token.content}</span>
        ));
    } else if (wordSpans && showWordDiff && type !== 'context') {
        contentNode = renderWordSpans(wordSpans, type);
    } else {
        contentNode = content || ' ';
    }

    // Single line number: show the relevant number for the line type
    // remove → old line number, add/context → new line number
    const displayLineNum = type === 'remove' ? oldLineNum : newLineNum;

    const lineClass = `diff-line-enhanced diff-line-enhanced--${type}`;
    const gridClass = showLineNumbers ? 'diff-line-enhanced--with-nums' : 'diff-line-enhanced--no-nums';

    return (
        <div className={`${lineClass} ${gridClass}`}>
            {showLineNumbers && (
                <span className="diff-linenum">
                    {displayLineNum ?? ''}
                </span>
            )}
            <span className="diff-prefix">{prefix}</span>
            <span className="diff-content-cell">{contentNode}</span>
        </div>
    );
}
