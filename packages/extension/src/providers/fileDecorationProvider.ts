import * as vscode from 'vscode';
import { FileChangeUpdate } from '@vcoder/shared';

export class VCoderFileDecorationProvider implements vscode.FileDecorationProvider {
    private _onDidChangeFileDecorations = new vscode.EventEmitter<vscode.Uri | undefined>();
    readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

    private decorations = new Map<string, vscode.FileDecoration>();

    provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
        return this.decorations.get(uri.toString());
    }

    updateFile(change: FileChangeUpdate) {
        const uri = vscode.Uri.file(change.path);
        
        let decoration: vscode.FileDecoration;
        switch (change.type) {
            case 'created':
                decoration = new vscode.FileDecoration(
                    'A', 
                    'Created by VCoder', 
                    new vscode.ThemeColor('gitDecoration.addedResourceForeground')
                );
                break;
            case 'modified':
                decoration = new vscode.FileDecoration(
                    'M', 
                    'Modified by VCoder', 
                    new vscode.ThemeColor('gitDecoration.modifiedResourceForeground')
                );
                break;
            case 'deleted':
                decoration = new vscode.FileDecoration(
                    'D', 
                    'Deleted by VCoder', 
                    new vscode.ThemeColor('gitDecoration.deletedResourceForeground')
                );
                break;
        }

        this.decorations.set(uri.toString(), decoration);
        this._onDidChangeFileDecorations.fire(uri);
    }
    
    removeFile(filePath: string) {
        const uri = vscode.Uri.file(filePath);
        this.decorations.delete(uri.toString());
        this._onDidChangeFileDecorations.fire(uri);
    }

    clear() {
        this.decorations.clear();
        this._onDidChangeFileDecorations.fire(undefined);
    }
}
