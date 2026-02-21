/**
 * FileTypeIcon Component
 * Maps a filename/extension to the appropriate file type icon from the Icon library.
 */

import type { FC } from 'react';
import type { IconProps } from './Icon/IconBase';
import {
    AngularIcon,
    BatIcon,
    CFileIcon,
    CmakeIcon,
    CppIcon,
    CssIcon,
    CsvIcon,
    CudaIcon,
    DatabaseIcon,
    DockerIcon,
    EslintIcon,
    ExeIcon,
    FortranIcon,
    GitIcon,
    GoIcon,
    HtmlIcon,
    ImageIcon,
    JarIcon,
    JavaIcon,
    JenkinsIcon,
    JsonIcon,
    JsIcon,
    KotlinIcon,
    LessIcon,
    LockIcon,
    LogIcon,
    LuaIcon,
    MakefileIcon,
    NpmIcon,
    PythonIcon,
    ReactIcon,
    ReadmeIcon,
    RubyIcon,
    SassIcon,
    SvgIcon,
    SwiftIcon,
    TypeScriptIcon,
    ViteIcon,
    VueIcon,
    WebpackIcon,
    XmlIcon,
    YamlIcon,
    YarnIcon,
    ZipIcon,
} from './Icon/icons/files';
import { default as DefaultFileIcon } from './Icon/icons/files/DefaultFileIcon';

type IconComponent = FC<IconProps>;

/** Extension → Icon mapping */
const EXTENSION_MAP: Record<string, IconComponent> = {
    // JavaScript / TypeScript
    '.js': JsIcon,
    '.mjs': JsIcon,
    '.cjs': JsIcon,
    '.jsx': ReactIcon,
    '.ts': TypeScriptIcon,
    '.tsx': ReactIcon,
    '.vue': VueIcon,

    // Styles
    '.css': CssIcon,
    '.scss': SassIcon,
    '.sass': SassIcon,
    '.less': LessIcon,

    // Markup
    '.html': HtmlIcon,
    '.htm': HtmlIcon,
    '.xml': XmlIcon,
    '.svg': SvgIcon,

    // Data
    '.json': JsonIcon,
    '.yaml': YamlIcon,
    '.yml': YamlIcon,
    '.csv': CsvIcon,
    '.toml': JsonIcon,

    // Programming
    '.py': PythonIcon,
    '.go': GoIcon,
    '.java': JavaIcon,
    '.kt': KotlinIcon,
    '.kts': KotlinIcon,
    '.rb': RubyIcon,
    '.c': CFileIcon,
    '.h': CFileIcon,
    '.cpp': CppIcon,
    '.cc': CppIcon,
    '.cxx': CppIcon,
    '.hpp': CppIcon,
    '.hxx': CppIcon,
    '.swift': SwiftIcon,
    '.lua': LuaIcon,
    '.cu': CudaIcon,
    '.f90': FortranIcon,
    '.f': FortranIcon,

    // Shell / Scripts
    '.sh': BatIcon,
    '.bash': BatIcon,
    '.zsh': BatIcon,
    '.bat': BatIcon,
    '.cmd': BatIcon,
    '.ps1': BatIcon,

    // Config
    '.eslintrc': EslintIcon,
    '.gitignore': GitIcon,
    '.gitattributes': GitIcon,
    '.npmrc': NpmIcon,
    '.yarnrc': YarnIcon,

    // Build tools
    '.cmake': CmakeIcon,

    // Archives
    '.zip': ZipIcon,
    '.tar': ZipIcon,
    '.gz': ZipIcon,
    '.rar': ZipIcon,
    '.7z': ZipIcon,

    // Images
    '.png': ImageIcon,
    '.jpg': ImageIcon,
    '.jpeg': ImageIcon,
    '.gif': ImageIcon,
    '.webp': ImageIcon,
    '.ico': ImageIcon,
    '.bmp': ImageIcon,

    // Database
    '.sql': DatabaseIcon,
    '.db': DatabaseIcon,
    '.sqlite': DatabaseIcon,

    // Java ecosystem
    '.jar': JarIcon,

    // Executables
    '.exe': ExeIcon,
    '.dll': ExeIcon,
    '.so': ExeIcon,

    // Logs
    '.log': LogIcon,

    // Lock files
    '.lock': LockIcon,

    // Markdown / Docs
    '.md': ReadmeIcon,
    '.mdx': ReadmeIcon,
    '.rst': ReadmeIcon,
};

/** Exact filename → Icon mapping */
const FILENAME_MAP: Record<string, IconComponent> = {
    'dockerfile': DockerIcon,
    '.dockerfile': DockerIcon,
    'docker-compose.yml': DockerIcon,
    'docker-compose.yaml': DockerIcon,
    '.dockerignore': DockerIcon,
    'makefile': MakefileIcon,
    'gnumakefile': MakefileIcon,
    'cmakelists.txt': CmakeIcon,
    'jenkinsfile': JenkinsIcon,
    'readme.md': ReadmeIcon,
    'readme': ReadmeIcon,
    'package.json': NpmIcon,
    'package-lock.json': NpmIcon,
    'yarn.lock': YarnIcon,
    'pnpm-lock.yaml': LockIcon,
    '.eslintrc.js': EslintIcon,
    '.eslintrc.json': EslintIcon,
    '.eslintrc.yaml': EslintIcon,
    'eslint.config.js': EslintIcon,
    'eslint.config.mjs': EslintIcon,
    'vite.config.ts': ViteIcon,
    'vite.config.js': ViteIcon,
    'webpack.config.js': WebpackIcon,
    'webpack.config.ts': WebpackIcon,
    '.gitignore': GitIcon,
    '.gitattributes': GitIcon,
    '.gitmodules': GitIcon,
    'angular.json': AngularIcon,
};

/**
 * Get the icon component for a given filename.
 */
function getFileTypeIconComponent(filename: string): IconComponent {
    const lower = filename.toLowerCase();
    const basename = lower.split(/[\\/]/).pop() || lower;

    // Check exact filename match first
    if (FILENAME_MAP[basename]) return FILENAME_MAP[basename];

    // Check extension
    const dotIndex = basename.lastIndexOf('.');
    if (dotIndex >= 0) {
        const ext = basename.slice(dotIndex);
        if (EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
    }

    return DefaultFileIcon;
}

interface FileTypeIconProps {
    filename: string;
    className?: string;
    size?: number;
}

export function FileTypeIcon({ filename, className, size = 16 }: FileTypeIconProps) {
    const Icon = getFileTypeIconComponent(filename);
    return (
        <span className={`file-type-icon ${className || ''}`} style={{ display: 'inline-flex', width: size, height: size, fontSize: size }}>
            <Icon />
        </span>
    );
}
