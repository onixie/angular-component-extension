'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vsc from 'vscode';
import * as jsb from 'js-beautify';
import * as ts from 'typescript';
import * as vscodeXmlFormatting from '../vscode-xml/src/providers/Formatting';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vsc.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "angular-component-extension" is now active!');

    registFormatCommand(context);
}

// this method is called when your extension is deactivated
export function deactivate() {
}

function registFormatCommand(context) {
    context.subscriptions.push(
        vsc.commands.registerCommand("format.angular.component",
            async () => {
                await vsc.commands.executeCommand("editor.action.formatDocument");
                await formatIninlineTemplate();
                await formatIninlineStyles();
            }
        )
    );

    context.subscriptions.push(
        vsc.commands.registerCommand("selection.format.angular.component",
            async () => {
                let selection = vsc.window.activeTextEditor.selection;
                let range = selection ? new vsc.Range(selection.start, selection.end) : null;
                await vsc.commands.executeCommand("editor.action.formatSelection");
                await formatIninlineTemplate(range);
                await formatIninlineStyles(range);
            }
        )
    );
}

// Code Formatting

// Template
async function formatIninlineTemplate(selectedRange?: vsc.Range) {
    let config = vsc.workspace.getConfiguration("html");
    let format = Object.assign({}, (<any>config).format);
    let editor = vsc.window.activeTextEditor;
    let tabSize = <number>editor.options.tabSize;
    let document = editor.document;

    let targetRanges = getTemplateRanges(document, selectedRange);
    if (!targetRanges || targetRanges.length <= 0)
        return;

    console.log(targetRanges);
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
                    .replace(/>\s*(\S*)\s*<\//, ">$1</")
                    .replace(/\/>\s*(\S*)/, "/>$1"))
                .join("\n");
            editor.replace(edit.range, indented);
        });
    });
}

function getTemplateRanges(document: vsc.TextDocument, selectedRange?: vsc.Range): vsc.Range[] {
    let source = createSourceFile(document);
    let classes = getClasses(source.statements);
    let components = findComponents(classes);

    if (!components)
        return null;

    return components.map(c => {
        let dec = getComponentDecorator(c[0]);
        let range = getComponentDecoratorTemplateRange(dec, document);
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

async function formatIninlineStyles(selectedRange?: vsc.Range) {
    let editor = vsc.window.activeTextEditor;
    let tabSize = <number>editor.options.tabSize;
    let document = editor.document;
    let targetRanges = getStylesRanges(document, selectedRange);
    if (!targetRanges || targetRanges.length <= 0)
        return;

    let formatter = new CssRangeFormattingEditProvider();
    let ranges = targetRanges.reduce((p, c) => c.concat(p));
    console.log(ranges);
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
    let source = createSourceFile(document);
    let classes = getClasses(source.statements);
    let components = findComponents(classes);

    if (!components)
        return null;

    return components.map(c => {
        let dec = getComponentDecorator(c[0]);
        let ranges = getComponentDecoratorStylesRanges(dec, document);
        return ranges ?
            ranges.map(r =>
                selectedRange ? r.intersection(selectedRange) : r
            ).filter(r => r) : null;
    }).filter(rr => rr);
}

// Internals
function createSourceFile(doc: vsc.TextDocument): ts.SourceFile {
    let options = ts.getDefaultCompilerOptions();
    let host = ts.createCompilerHost(options);
    let src = host.getSourceFile(doc.fileName, options.target);
    let newContent = doc.getText();
    let allRange: ts.TextChangeRange = {
        span: {
            start: 0,
            length: src.endOfFileToken.end
        },
        newLength: newContent.length
    };
    src = src.update(newContent, allRange);
    return src;
}

function getClasses(nodes: ts.Node[]): ts.ClassDeclaration[] {
    return nodes ? <ts.ClassDeclaration[]>nodes.filter(s =>
        s.kind === ts.SyntaxKind.ClassDeclaration
    ) : null;
}

function findComponents(decls: ts.ClassDeclaration[]): [ts.ClassDeclaration, ts.Decorator][] {
    return decls ? decls
        .map<[ts.ClassDeclaration, ts.Decorator]>(d => [d, getComponentDecorator(d)])
        .filter(n => !!n[1]) : null;
}

function getComponentDecorator(decl: ts.ClassDeclaration): ts.Decorator {
    return decl.decorators.find(d => {
        let [name, _] = getDecoratorNameAndRange(<ts.Decorator>d);
        if (name === 'Component') {
            return true;
        }
        return false;
    });
}

function getDecoratorNameAndRange(dec: ts.Decorator, doc?: vsc.TextDocument): [string, vsc.Range] {
    let callExp = <ts.CallExpression>dec.expression;
    let caller = <ts.Identifier>callExp.expression;

    let name = caller.text;
    let range = doc ? new vsc.Range(doc.positionAt(caller.pos), doc.positionAt(caller.end)) : null;
    return [name, range];
}

function getComponentDecoratorSelectorName(dec: ts.Decorator): string {
    let callExp = <ts.CallExpression>dec.expression;
    let callee = <ts.ObjectLiteralExpression>callExp.arguments[0];
    if (callee) {
        let selector = <ts.PropertyAssignment>callee.properties.find(p =>
            (<ts.Identifier>p.name).text === 'selector'
        );
        if (selector) {
            return (<ts.LiteralExpression>selector.initializer).text;
        }
    }
    return null;
}

function getComponentDecoratorTemplateRange(dec: ts.Decorator, doc: vsc.TextDocument): vsc.Range {
    let callExp = <ts.CallExpression>dec.expression;
    let callee = <ts.ObjectLiteralExpression>callExp.arguments[0];

    let isTemplateString = node =>
        node.kind == ts.SyntaxKind.TemplateExpression ||
        node.kind == ts.SyntaxKind.NoSubstitutionTemplateLiteral;

    if (callee) {
        let template = <ts.PropertyAssignment>callee.properties.find(p =>
            (<ts.Identifier>p.name).text === 'template'
        );
        if (template && isTemplateString(template.initializer)) {
            let i = <ts.TemplateExpression>template.initializer;
            return getActualRange(i, doc);
        }
    }
    return null;
}

function getComponentDecoratorStylesRanges(dec: ts.Decorator, doc: vsc.TextDocument): vsc.Range[] {
    let callExp = <ts.CallExpression>dec.expression;
    let callee = <ts.ObjectLiteralExpression>callExp.arguments[0];

    let isTemplateString = node =>
        node.kind == ts.SyntaxKind.TemplateExpression ||
        node.kind == ts.SyntaxKind.NoSubstitutionTemplateLiteral;

    if (callee) {
        let styles = <ts.PropertyAssignment>callee.properties.find(p =>
            (<ts.Identifier>p.name).text === 'styles'
        );
        if (styles && styles.initializer.kind === ts.SyntaxKind.ArrayLiteralExpression) {
            let a = <ts.ArrayLiteralExpression>styles.initializer;
            return a.elements.filter(isTemplateString).map(e => getActualRange(e, doc));
        }
        return null;
    }
    return null;
}

function getActualRange(node: ts.Node, doc: vsc.TextDocument): vsc.Range {
    let text = doc.getText(new vsc.Range(doc.positionAt(node.pos), doc.positionAt(node.end)));
    let s = text.indexOf("`");
    let e = text.lastIndexOf("`");
    return new vsc.Range(doc.positionAt(node.pos + s + 1), doc.positionAt(node.pos + e));
}