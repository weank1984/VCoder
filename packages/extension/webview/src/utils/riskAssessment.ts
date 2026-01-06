/**
 * Risk Assessment Utilities
 * Assess risk levels for various operations
 */

/**
 * Assess the risk level of a bash command
 */
export function assessBashRisk(command: string): 'low' | 'medium' | 'high' {
    const normalized = command.toLowerCase();
    
    // 高风险模式
    const highRiskPatterns = [
        /\bsudo\b/,
        /\brm\s+-rf?\b/,
        /\bchmod\s+777\b/,
        /\bdd\s+if=/,
        />\s*\/dev\//,
        /\bmkfs\b/,
    ];
    
    for (const pattern of highRiskPatterns) {
        if (pattern.test(normalized)) return 'high';
    }
    
    // 中等风险模式
    const mediumRiskPatterns = [
        /\bnpm\s+(publish|unpublish)\b/,
        /\bgit\s+push\b.*--force/,
        /\brm\b/,
        /\|/,  // 管道
        /&&/,  // 命令链
        /\bcurl\b.*\|.*\bsh\b/,
    ];
    
    for (const pattern of mediumRiskPatterns) {
        if (pattern.test(normalized)) return 'medium';
    }
    
    return 'low';
}

/**
 * Get risk reasons for a bash command
 */
export function getBashRiskReasons(command: string): string[] {
    const reasons: string[] = [];
    const normalized = command.toLowerCase();
    
    if (/\bsudo\b/.test(normalized)) {
        reasons.push('RiskSudoCommand');
    }
    if (/\brm\b/.test(normalized)) {
        reasons.push('RiskDeleteFiles');
    }
    if (/\bnpm\s+publish\b/.test(normalized)) {
        reasons.push('RiskPublishPackage');
    }
    if (/node_modules/.test(normalized)) {
        reasons.push('RiskModifyNodeModules');
    }
    if (/\|/.test(normalized)) {
        reasons.push('RiskPipeCommand');
    }
    if (/\bcurl\b|\bwget\b|\bfetch\b/.test(normalized)) {
        reasons.push('RiskNetworkAccess');
    }
    
    return reasons;
}

/**
 * Assess file operation risk
 */
export function assessFileRisk(operation: 'write' | 'delete', filePath: string): 'low' | 'medium' | 'high' {
    const normalized = filePath.toLowerCase();
    
    // Delete operations are always at least medium risk
    if (operation === 'delete') {
        // High risk patterns for deletion
        if (
            normalized.includes('node_modules') ||
            normalized.includes('package.json') ||
            normalized.includes('package-lock.json') ||
            normalized.includes('yarn.lock') ||
            normalized.includes('.git')
        ) {
            return 'high';
        }
        return 'medium';
    }
    
    // Write operations
    if (
        normalized.includes('package.json') ||
        normalized.includes('.env') ||
        normalized.includes('.gitignore')
    ) {
        return 'medium';
    }
    
    return 'low';
}
