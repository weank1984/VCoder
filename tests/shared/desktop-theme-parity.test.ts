import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DESKTOP_COMMON_THEME_VARIABLES,
  DESKTOP_DARK_THEME_VARIABLES,
  DESKTOP_LIGHT_THEME_VARIABLES,
} from '@vcoder/shared';

const WEBVIEW_SRC_ROOT = path.resolve(process.cwd(), 'apps/vscode-extension/webview/src');
const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.scss']);

function collectSourceFiles(dir: string, collected: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(filePath, collected);
      continue;
    }
    if (SOURCE_FILE_EXTENSIONS.has(path.extname(filePath))) {
      collected.push(filePath);
    }
  }
  return collected;
}

function collectUsedVsCodeVariables(): string[] {
  const files = collectSourceFiles(WEBVIEW_SRC_ROOT);
  const matches = new Set<string>();
  const variablePattern = /--vscode-[A-Za-z0-9-]+/g;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    for (const match of content.matchAll(variablePattern)) {
      matches.add(match[0]);
    }
  }

  return [...matches].sort();
}

describe('Desktop Theme Parity', () => {
  it('keeps dark and light theme keys in sync', () => {
    const darkKeys = Object.keys(DESKTOP_DARK_THEME_VARIABLES).sort();
    const lightKeys = Object.keys(DESKTOP_LIGHT_THEME_VARIABLES).sort();
    expect(lightKeys).toEqual(darkKeys);
  });

  it('covers every --vscode-* variable used by the shared webview UI', () => {
    const providedKeys = new Set<string>([
      ...Object.keys(DESKTOP_COMMON_THEME_VARIABLES),
      ...Object.keys(DESKTOP_DARK_THEME_VARIABLES),
      ...Object.keys(DESKTOP_LIGHT_THEME_VARIABLES),
    ]);

    const missingKeys = collectUsedVsCodeVariables().filter((key) => !providedKeys.has(key));

    expect(missingKeys).toEqual([]);
  });
});
