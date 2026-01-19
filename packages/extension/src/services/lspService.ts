import * as vscode from 'vscode';
import * as path from 'path';
import type {
    LspGoToDefinitionParams,
    LspGoToDefinitionResult,
    LspFindReferencesParams,
    LspFindReferencesResult,
    LspHoverParams,
    LspHoverResult,
    LspDiagnosticsParams,
    LspDiagnosticsResult,
    LspDiagnostic
} from '@vcoder/shared';

export class LspService {
    constructor(private context: vscode.ExtensionContext) {}

    async goToDefinition(params: LspGoToDefinitionParams): Promise<LspGoToDefinitionResult> {
        try {
            const uri = vscode.Uri.file(params.filePath);
            const position = new vscode.Position(params.line - 1, params.character);
            
            // Use VS Code's built-in definition provider
            const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                uri,
                position
            );

            if (definitions && definitions.length > 0) {
                const def = definitions[0];
                return {
                    uri: def.uri.toString(),
                    line: def.range.start.line + 1,
                    character: def.range.start.character,
                    range: {
                        start: {
                            line: def.range.start.line + 1,
                            character: def.range.start.character
                        },
                        end: {
                            line: def.range.end.line + 1,
                            character: def.range.end.character
                        }
                    }
                };
            }

            return {};
        } catch (error) {
            console.error('[LspService] Go to definition failed:', error);
            return {};
        }
    }

    async findReferences(params: LspFindReferencesParams): Promise<LspFindReferencesResult> {
        try {
            const uri = vscode.Uri.file(params.filePath);
            const position = new vscode.Position(params.line - 1, params.character);
            
            // Use VS Code's built-in references provider
            const references = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeReferenceProvider',
                uri,
                position
            );

            if (references) {
                return {
                    references: references.map(ref => ({
                        uri: ref.uri.toString(),
                        line: ref.range.start.line + 1,
                        character: ref.range.start.character,
                        range: {
                            start: {
                                line: ref.range.start.line + 1,
                                character: ref.range.start.character
                            },
                            end: {
                                line: ref.range.end.line + 1,
                                character: ref.range.end.character
                            }
                        }
                    }))
                };
            }

            return { references: [] };
        } catch (error) {
            console.error('[LspService] Find references failed:', error);
            return { references: [] };
        }
    }

    async hover(params: LspHoverParams): Promise<LspHoverResult> {
        try {
            const uri = vscode.Uri.file(params.filePath);
            const position = new vscode.Position(params.line - 1, params.character);
            
            // Use VS Code's built-in hover provider
            const hover = await vscode.commands.executeCommand<vscode.Hover>(
                'vscode.executeHoverProvider',
                uri,
                position
            );

            if (hover && hover.contents.length > 0) {
                const content = Array.isArray(hover.contents) 
                    ? hover.contents.join('\n') 
                    : typeof hover.contents === 'string' 
                        ? hover.contents 
                        : String(hover.contents);

                return { content };
            }

            return {};
        } catch (error) {
            console.error('[LspService] Hover failed:', error);
            return {};
        }
    }

    async getDiagnostics(params: LspDiagnosticsParams): Promise<LspDiagnosticsResult> {
        try {
            let uris: vscode.Uri[];
            
            if (params.filePath) {
                uris = [vscode.Uri.file(params.filePath)];
            } else {
                // Get all open text documents
                uris = vscode.workspace.textDocuments.map(doc => doc.uri);
            }

            const allDiagnostics: LspDiagnostic[] = [];

            for (const uri of uris) {
                const diagnostics = vscode.languages.getDiagnostics(uri);
                
                for (const diag of diagnostics) {
                    allDiagnostics.push({
                        severity: this.vscodeSeverityToCustom(diag.severity),
                        message: diag.message,
                        source: diag.source,
                        code: typeof diag.code === 'string' || typeof diag.code === 'number' ? diag.code : undefined,
                        uri: uri.toString(),
                        range: {
                            start: {
                                line: diag.range.start.line + 1,
                                character: diag.range.start.character
                            },
                            end: {
                                line: diag.range.end.line + 1,
                                character: diag.range.end.character
                            }
                        }
                    });
                }
            }

            return { diagnostics: allDiagnostics };
        } catch (error) {
            console.error('[LspService] Get diagnostics failed:', error);
            return { diagnostics: [] };
        }
    }

    private vscodeSeverityToCustom(severity: vscode.DiagnosticSeverity): 1 | 2 | 3 | 4 {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error: return 1;
            case vscode.DiagnosticSeverity.Warning: return 2;
            case vscode.DiagnosticSeverity.Information: return 3;
            case vscode.DiagnosticSeverity.Hint: return 4;
            default: return 4;
        }
    }

    async isLspAvailable(filePath: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
            
            return !!document;
        } catch (error) {
            return false;
        }
    }
}