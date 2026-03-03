import { describe, it, expect } from 'vitest';
import { computeWordDiff, type DiffSpan } from '../../packages/ui/src/components/StepProgress/wordDiff';

describe('computeWordDiff', () => {
    it('should return equal for identical lines', () => {
        const result = computeWordDiff('hello world', 'hello world');
        expect(result).toEqual([{ text: 'hello world', type: 'equal' }]);
    });

    it('should detect a single word insertion', () => {
        const result = computeWordDiff('hello world', 'hello beautiful world');
        // "hello " is equal, "beautiful " is inserted, "world" is equal
        expect(result.some(s => s.type === 'insert' && s.text.includes('beautiful'))).toBe(true);
        expect(result.filter(s => s.type === 'equal').map(s => s.text).join('')).toContain('hello');
        expect(result.filter(s => s.type === 'equal').map(s => s.text).join('')).toContain('world');
    });

    it('should detect a single word deletion', () => {
        const result = computeWordDiff('hello beautiful world', 'hello world');
        expect(result.some(s => s.type === 'delete' && s.text.includes('beautiful'))).toBe(true);
    });

    it('should detect a word replacement', () => {
        const result = computeWordDiff('const foo = 1;', 'const bar = 1;');
        expect(result.some(s => s.type === 'delete' && s.text === 'foo')).toBe(true);
        expect(result.some(s => s.type === 'insert' && s.text === 'bar')).toBe(true);
    });

    it('should handle empty strings', () => {
        const result = computeWordDiff('', '');
        expect(result).toEqual([{ text: '', type: 'equal' }]);
    });

    it('should handle old line empty, new line with content', () => {
        const result = computeWordDiff('', 'hello');
        expect(result).toEqual([{ text: 'hello', type: 'insert' }]);
    });

    it('should handle new line empty, old line with content', () => {
        const result = computeWordDiff('hello', '');
        expect(result).toEqual([{ text: 'hello', type: 'delete' }]);
    });

    it('should handle whitespace-only changes', () => {
        const result = computeWordDiff('a  b', 'a b');
        // Tokens: ['a', '  ', 'b'] vs ['a', ' ', 'b']
        // 'a' equal, whitespace differs, 'b' equal
        const nonEqual = result.filter(s => s.type !== 'equal');
        expect(nonEqual.length).toBeGreaterThan(0);
    });

    it('should handle complex code lines', () => {
        const result = computeWordDiff(
            '    return calculateSum(a, b);',
            '    return calculateTotal(a, b, c);'
        );
        // Should find the function name change and the extra parameter
        const inserts = result.filter(s => s.type === 'insert');
        const deletes = result.filter(s => s.type === 'delete');
        expect(inserts.length).toBeGreaterThan(0);
        expect(deletes.length).toBeGreaterThan(0);
    });

    it('should preserve order of spans matching original/new text', () => {
        const result = computeWordDiff('a b c', 'a x c');
        const texts = result.map(s => s.text);
        // Reconstructing: equal parts + insert/delete should form coherent text
        const equalAndDelete = result.filter(s => s.type === 'equal' || s.type === 'delete').map(s => s.text).join('');
        const equalAndInsert = result.filter(s => s.type === 'equal' || s.type === 'insert').map(s => s.text).join('');
        expect(equalAndDelete).toBe('a b c');
        expect(equalAndInsert).toBe('a x c');
    });
});
