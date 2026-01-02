import React from 'react';
import { type IconProps } from '../IconBase';
import * as FileIcons from './files';
import DefaultFileIcon from './files/DefaultFileIcon';

export const fileExtensionIconMap: Record<string, React.FC<IconProps>> = {
    // Programming Languages
    'ts': FileIcons.TypeScriptIcon,
    'tsx': FileIcons.ReactIcon,
    'js': FileIcons.JsIcon,
    'jsx': FileIcons.ReactIcon,
    'cpp': FileIcons.CppIcon,
    'c': FileIcons.CFileIcon,
    'go': FileIcons.GoIcon,
    'java': FileIcons.JavaIcon,
    'kt': FileIcons.KotlinIcon,
    'swift': FileIcons.SwiftIcon,
    'rb': FileIcons.RubyIcon,
    'lua': FileIcons.LuaIcon,
    'py': FileIcons.PythonIcon,
    'pl': FileIcons.PrologIcon,
    'f': FileIcons.FortranIcon,
    'f90': FileIcons.FortranIcon,
    'manifest': FileIcons.ManifestIcon,

    // Web Technologies
    'html': FileIcons.HtmlIcon,
    'css': FileIcons.CssIcon,
    'less': FileIcons.LessIcon,
    'scss': FileIcons.SassIcon,
    'sass': FileIcons.SassIcon,
    'vue': FileIcons.VueIcon,
    'svg': FileIcons.SvgIcon,
    
    // Configuration Files
    'json': FileIcons.JsonIcon,
    'yml': FileIcons.YamlIcon,
    'yaml': FileIcons.YamlIcon,
    'xml': FileIcons.XmlIcon,
    'lock': FileIcons.LockIcon,
    'eslintrc': FileIcons.EslintIcon,
    'proto': FileIcons.ProtoIcon,
    
    // Build & Package
    'dockerfile': FileIcons.DockerIcon,
    'jenkinsfile': FileIcons.JenkinsIcon,
    'makefile': FileIcons.MakefileIcon,
    'cmake': FileIcons.CmakeIcon,
    'bat': FileIcons.BatIcon,
    
    // Package Managers
    'npmrc': FileIcons.NpmIcon,
    'yarnrc': FileIcons.YarnIcon,
    'pnpm-lock': FileIcons.PnpmIcon,
    
    // Bundlers & Tools
    'webpack': FileIcons.WebpackIcon,
    'rollup': FileIcons.RollupIcon,
    'vite': FileIcons.ViteIcon,
    'swc': FileIcons.SwcIcon,
    
    // Documents & Media
    'md': FileIcons.ReadmeIcon,
    'csv': FileIcons.CsvIcon,
    'log': FileIcons.LogIcon,
    'mp4': FileIcons.VideoIcon,
    'jpg': FileIcons.ImageIcon,
    'png': FileIcons.ImageIcon,
    'gif': FileIcons.ImageIcon,
    'zip': FileIcons.ZipIcon,
    'jar': FileIcons.JarIcon,
    'exe': FileIcons.ExeIcon,
    
    // Frameworks
    'angular': FileIcons.AngularIcon,
    'next': FileIcons.NextIcon,
    'nuxt': FileIcons.NuxtIcon,
    'nest': FileIcons.NestjsIcon,

    // Others
    'cuda': FileIcons.CudaIcon,
    'wasm': FileIcons.WebassemblyIcon,
    'git': FileIcons.GitIcon,
    'db': FileIcons.DatabaseIcon,
    'robots.txt': FileIcons.RobotsIcon,
    'favicon': FileIcons.FaviconIcon,
    'http': FileIcons.HttpIcon,
};

const FileIcon: React.FC<IconProps & {ext?: string}> = (props) => {
    const {className, style, ext = ''} = props;
    const FileTypeIcon = fileExtensionIconMap[ext] || DefaultFileIcon;

    return (
        <FileTypeIcon className={className} style={style} />
    );
};

export default FileIcon;
