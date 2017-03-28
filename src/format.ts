'use strict';

import * as vsc from 'vscode';
import * as jsb from 'js-beautify';
import * as ts from 'typescript';
import * as vscodeXmlFormatting from '../vscode-xml/src/providers/Formatting';
import * as utils from './utils';

export function registFormatCommand(context) {
    context.subscriptions.push(
        vsc.commands.registerCommand("format.angular.component",
            async () => {
                await vsc.commands.executeCommand("editor.action.formatDocument");
                await formatInlineTemplate();
                await formatInlineStyles();
            }
        )
    );

    context.subscriptions.push(
        vsc.commands.registerCommand("selection.format.angular.component",
            async () => {
                let selection = vsc.window.activeTextEditor.selection;
                let range = selection ? new vsc.Range(selection.start, selection.end) : null;
                await vsc.commands.executeCommand("editor.action.formatSelection");
                await formatInlineTemplate(range);
                await formatInlineStyles(range);
            }
        )
    );
}

// Template
async function formatInlineTemplate(selectedRange?: vsc.Range) {
    let config = vsc.workspace.getConfiguration("html");
    let format = Object.assign({}, (<any>config).format);
    let editor = vsc.window.activeTextEditor;
    let tabSize = <number>editor.options.tabSize;
    let document = editor.document;

    let targetRanges = getTemplateRanges(document, selectedRange);
    if (!targetRanges || targetRanges.length <= 0)
        return;

    let formatter = new vscodeXmlFormatting.XmlFormattingEditProvider();
    let edits = targetRanges.map(r =>
        formatter.provideDocumentRangeFormattingEdits(document, r, format)[0]
    );

    await editor.edit(editor => {
        edits.forEach(edit => {
            let indent = " ".repeat(tabSize * 2);
            let indented = "\n" + edit.newText
                .split("\n")
                .filter(ln => ln.trim() !== "")
                .map(ln => (indent + ln)
                    .replace(/\s*$/, "")
                    .replace(/(^\s*<(?:[^<>=]|=\s*"[^"]*"|=\s*'[^']*')+>)\s*(.*?)\s*(<\/[^<>=]+>)?$/, "$1$2$3"))
                .join("\n");
            editor.replace(edit.range, indented);
        });
    });
}

function getTemplateRanges(document: vsc.TextDocument, selectedRange?: vsc.Range): vsc.Range[] {
    let source = utils.createSourceFile(document);
    let classes = utils.getClasses(source.statements);
    let components = utils.findComponents(classes);

    if (!components)
        return null;

    return components.map(c => {
        let dec = utils.getComponentDecorator(c[0]);
        let range = utils.getComponentDecoratorTemplateRange(dec, document);
        return range && selectedRange ? range.intersection(selectedRange) : range;
    }).filter(range => range);
}

// Styles
class CssRangeFormattingEditProvider implements vsc.DocumentRangeFormattingEditProvider {
    provideDocumentRangeFormattingEdits(document: vsc.TextDocument, range?: vsc.Range, options?: vsc.FormattingOptions, token?: vsc.CancellationToken): vsc.TextEdit[] {
        let text = document.getText(range);
        let newText = jsb.css_beautify(text);
        return [new vsc.TextEdit(range, newText)];
    }
}

async function formatInlineStyles(selectedRange?: vsc.Range) {
    let editor = vsc.window.activeTextEditor;
    let tabSize = <number>editor.options.tabSize;
    let document = editor.document;
    let targetRanges = getStylesRanges(document, selectedRange);
    if (!targetRanges || targetRanges.length <= 0)
        return;

    let formatter = new CssRangeFormattingEditProvider();
    let ranges = targetRanges.reduce((p, c) => c.concat(p));
    let edits = ranges.map(
        r => formatter.provideDocumentRangeFormattingEdits(document, r)[0]
    );

    await editor.edit(editor => {
        edits.forEach(edit => {
            let indent = " ".repeat(tabSize * 2);
            let indented = "\n" + edit.newText
                .split("\n")
                .filter(ln => ln.trim() !== "")
                .map(ln => (indent + ln).replace(/\s*$/, ""))
                .join("\n");
            editor.replace(edit.range, indented);
        });
    });
}

function getStylesRanges(document: vsc.TextDocument, selectedRange?: vsc.Range): vsc.Range[][] {
    let source = utils.createSourceFile(document);
    let classes = utils.getClasses(source.statements);
    let components = utils.findComponents(classes);

    if (!components)
        return null;

    return components.map(c => {
        let dec = utils.getComponentDecorator(c[0]);
        let ranges = utils.getComponentDecoratorStylesRanges(dec, document);
        return ranges ?
            ranges.map(r =>
                selectedRange ? r.intersection(selectedRange) : r
            ).filter(r => r) : null;
    }).filter(rr => rr);
}
