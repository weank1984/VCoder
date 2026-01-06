/**
 * Path utility functions
 * Provides path formatting and manipulation utilities
 */

/**
 * Format a file path to be more readable by truncating long paths
 * Keeps the last N segments of the path
 * 
 * @param path - The full file path
 * @param maxLen - Maximum length before truncation
 * @param segments - Number of segments to keep (default: 3)
 * @returns Formatted path
 * 
 * @example
 * formatPath('/very/long/path/to/some/file.ts', 40, 3)
 * // Returns: '…/to/some/file.ts'
 */
export function formatPath(path: string, maxLen = 40, segments = 3): string {
    if (!path) return '';
    if (path.length <= maxLen) return path;
    
    const parts = path.split('/').filter(Boolean);
    if (parts.length <= segments) return path;
    
    return '…/' + parts.slice(-segments).join('/');
}

/**
 * Extract filename from a full path
 * 
 * @param path - The full file path
 * @returns The filename
 */
export function getFileName(path: string): string {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
}

/**
 * Extract directory path from a full path
 * 
 * @param path - The full file path
 * @returns The directory path
 */
export function getDirPath(path: string): string {
    if (!path) return '';
    const parts = path.split('/');
    parts.pop();
    return parts.join('/') || '.';
}

/**
 * Get file extension from a path
 * 
 * @param path - The file path
 * @returns The file extension (without dot)
 */
export function getFileExtension(path: string): string {
    if (!path) return '';
    const fileName = getFileName(path);
    const parts = fileName.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Detect programming language from file extension
 * 
 * @param ext - File extension (without dot)
 * @returns Language identifier for syntax highlighting
 */
export function detectLanguage(ext: string): string {
    const langMap: Record<string, string> = {
        // JavaScript/TypeScript
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'mjs': 'javascript',
        'cjs': 'javascript',
        
        // Web
        'html': 'html',
        'htm': 'html',
        'css': 'css',
        'scss': 'scss',
        'sass': 'sass',
        'less': 'less',
        
        // Python
        'py': 'python',
        'pyw': 'python',
        'pyx': 'python',
        
        // Java/Kotlin
        'java': 'java',
        'kt': 'kotlin',
        'kts': 'kotlin',
        
        // C/C++
        'c': 'c',
        'h': 'c',
        'cpp': 'cpp',
        'cc': 'cpp',
        'cxx': 'cpp',
        'hpp': 'cpp',
        'hh': 'cpp',
        
        // C#
        'cs': 'csharp',
        
        // Go
        'go': 'go',
        
        // Rust
        'rs': 'rust',
        
        // Ruby
        'rb': 'ruby',
        
        // PHP
        'php': 'php',
        
        // Shell
        'sh': 'bash',
        'bash': 'bash',
        'zsh': 'bash',
        
        // Config/Data
        'json': 'json',
        'yaml': 'yaml',
        'yml': 'yaml',
        'toml': 'toml',
        'xml': 'xml',
        'md': 'markdown',
        'markdown': 'markdown',
        'sql': 'sql',
        
        // Other
        'txt': 'text',
        'log': 'text',
    };
    
    return langMap[ext.toLowerCase()] || 'text';
}

/**
 * Get error summary from error message
 * Truncates long error messages and extracts the most important part
 * 
 * @param error - Error message or object
 * @param maxLen - Maximum length
 * @returns Truncated error summary
 */
export function getErrorSummary(error: unknown, maxLen = 50): string {
    if (!error) return 'Unknown error';
    
    let errorStr = typeof error === 'string' ? error : String(error);
    
    // Extract first line if multi-line
    const firstLine = errorStr.split('\n')[0];
    
    // Truncate if too long
    if (firstLine.length > maxLen) {
        return firstLine.slice(0, maxLen - 1) + '…';
    }
    
    return firstLine;
}
