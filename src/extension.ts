'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as vscodeHtmlLangServ from 'vscode-html-languageservice';
import * as vscodeCssLangServ from 'vscode-css-languageservice';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "angular-component-extension" is now active!');

    defineFormatCommand(context);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function defineFormatCommand(context) {
    context.subscriptions.push(
        vscode.commands.registerCommand("format.angular.component",
            async () => {
                await vscode.commands.executeCommand("editor.action.formatDocument");
                formatIninlineTemplate();
            }
        )
    );
}

function formatIninlineTemplate() {
    let config = vscode.workspace.getConfiguration("html");
    let format = Object.assign({}, config.format);
    let activeEditor = vscode.window.activeTextEditor;
    let tabSize = <number>activeEditor.options.tabSize;
    let document = activeEditor.document;
    let targetRange = getTemplateRange(document);
    
    if (!targetRange || targetRange.isEmpty) {
        return;
    }

    vscodeHtmlLangServ.getLanguageService()
        .format(<any>document, targetRange, format)
        .forEach(async result => {
            // Format
            await activeEditor.edit(editor => {
                editor.replace(<any>result.range, result.newText);
            });
            // Indent 
            await activeEditor.edit(editor => {
                let start = result.range.start.line;
                let end = result.range.end.line;
                while (start++ < end) {
                    editor.insert(new vscode.Position(start, 0), " ".repeat(tabSize * 2));
                }
            });
        });
}

function getTemplateRange(document: vscode.TextDocument, selectedRange?: vscode.Range): vscode.Range {
    let text = document.getText();
    let compRegex = /(@)\s*Component\s*\(\s*\{[\s\S]*\}\s*(\))/igm;
    let tempRegex = /template\s*:\s*(`)(\\\\|\\`|[^`])*(`)/igm;
    let compStart = compRegex.exec(text);
    let tempStart = tempRegex.exec(text);

    if (compStart.index < tempStart.index && compRegex.lastIndex > tempRegex.lastIndex) {
        let templateRange = new vscode.Range(document.positionAt(tempStart.index), document.positionAt(tempRegex.lastIndex));
        if (selectedRange) {
            return selectedRange.intersection(templateRange);
        } else {
            return templateRange;
        }
    } else {
        return selectedRange;
    }
}