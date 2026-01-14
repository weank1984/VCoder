import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';

function normalizeLabelPath(filePath: string): string {
    // Keep labels stable and git-ish (always forward slashes, no leading slash).
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    return normalized || 'file';
}

function safeReadFileUtf8(filePath: string): string {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch {
        return '';
    }
}

function safeRmRecursive(dirPath: string) {
    try {
        fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
        // ignore
    }
}

function runDiffCommand(command: string, args: string[], cwd?: string): string | null {
    const res = spawnSync(command, args, {
        cwd,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
    });

    if (res.error) return null;
    // git diff returns 1 when differences exist; diff returns 1 when differences exist.
    if (res.status === 0 || res.status === 1) return res.stdout || '';
    return null;
}

export function resolveWorkspacePath(workingDirectory: string, filePath: string): string {
    if (path.isAbsolute(filePath)) return filePath;
    return path.join(workingDirectory, filePath);
}

export function generateUnifiedDiff(params: {
    workingDirectory: string;
    filePath: string;
    proposedContent: string;
}): { diff: string; didExist: boolean } {
    const absPath = resolveWorkspacePath(params.workingDirectory, params.filePath);
    const didExist = fs.existsSync(absPath);
    const originalContent = safeReadFileUtf8(absPath);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcoder-diff-'));
    const originalFile = path.join(tempDir, 'original');
    const proposedFile = path.join(tempDir, 'proposed');

    try {
        fs.writeFileSync(originalFile, originalContent, 'utf8');
        fs.writeFileSync(proposedFile, params.proposedContent, 'utf8');

        const labelPath = normalizeLabelPath(params.filePath);

        // Prefer git diff (best cross-platform output); fall back to POSIX diff.
        const gitOut = runDiffCommand(
            'git',
            ['diff', '--no-index', '--label', `a/${labelPath}`, '--label', `b/${labelPath}`, '--', originalFile, proposedFile],
            params.workingDirectory
        );
        if (gitOut !== null) return { diff: gitOut, didExist };

        const diffOut = runDiffCommand(
            'diff',
            ['-u', '-L', `a/${labelPath}`, '-L', `b/${labelPath}`, originalFile, proposedFile],
            params.workingDirectory
        );
        if (diffOut !== null) return { diff: diffOut, didExist };

        return { diff: '', didExist };
    } finally {
        safeRmRecursive(tempDir);
    }
}

