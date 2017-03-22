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
            }
        )
    );

    context.subscriptions.push(
        vsc.commands.registerCommand("selection.format.angular.component",
            async () => {
                let selection = vsc.window.activeTextEditor.selection;
                await vsc.commands.executeCommand("editor.action.formatSelection");
                await formatIninlineTemplate(selection);
            }
        )
    );
}

async function formatIninlineTemplate(selectedRange?: vsc.Range) {
    let config = vsc.workspace.getConfiguration("html");
    let format = Object.assign({}, config.format);
    let activeEditor = vsc.window.activeTextEditor;
    let tabSize = <number>activeEditor.options.tabSize;
    let document = activeEditor.document;
    let targetRange = getTemplateRange(document);
    let targetRanges = getTemplateRanges(document);
    if (!targetRange || targetRange.isEmpty) {
        return;
    }

    let formatter = new vscodeXmlFormatting.XmlFormattingEditProvider();
    let edit = formatter.provideDocumentRangeFormattingEdits(document, targetRange, format)[0];

    if (edit && edit.newText) {
        await activeEditor.edit(editor => {
            let indent = " ".repeat(tabSize * 2);
            let indented = edit.newText
                .split("\n")
                .map(ln => (indent + ln).replace(/\s*$/, ""))
                .join("\n");
            editor.replace(<any>edit.range, indented);
        });
    }
}

function getTemplateRange(document: vsc.TextDocument, selectedRange?: vsc.Range): vsc.Range {
    let text = document.getText();
    let compRegex = /(@)\s*Component\s*\(\s*\{[\s\S]*\}\s*(\))/igm;
    let tempRegex = /template\s*:\s*(`)(\\\\|\\`|[^`])*(`)/igm;
    let compStart = compRegex.exec(text);
    let tempStart = tempRegex.exec(text);
    let startIndex = tempStart.index + tempStart[0].indexOf("`");

    if (compStart.index < tempStart.index && compRegex.lastIndex > tempRegex.lastIndex) {
        let range = new vsc.Range(document.positionAt(startIndex).translate(0, 1), document.positionAt(tempRegex.lastIndex).translate(0, -1));
        return selectedRange ? range.intersection(selectedRange) : range;
    } else {
        return selectedRange;
    }
}

function getTemplateRanges(document: vsc.TextDocument, selectedRange?: vsc.Range): vsc.Range[] {
    let source = createSourceFile(document);
    let classes = getClasses(source.statements);
    let components = findComponents(classes);

    let ranges = components.map(c => {
        let dec = getComponentDecorator(c[0]);
        let range = getComponentDecoratorTemplateRange(dec, document);
        return selectedRange ? range.intersection(selectedRange) : range;
    });

    return ranges;
}
function createSourceFile(doc: vsc.TextDocument): ts.SourceFile {
    let options = ts.getDefaultCompilerOptions();
    let host = ts.createCompilerHost(options);
    let src = host.getSourceFile(doc.fileName, options.target);
    return src;
}

function getClasses(nodes: ts.Node[]): ts.ClassDeclaration[] {
    return <ts.ClassDeclaration[]>nodes.filter(s =>
        s.kind === ts.SyntaxKind.ClassDeclaration
    );
}

function findComponents(decls: ts.ClassDeclaration[]): [ts.ClassDeclaration, ts.Decorator][] {
    return decls
        .map<[ts.ClassDeclaration, ts.Decorator]>(d => [d, getComponentDecorator(d)])
        .filter(n => !!n[1]);
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

    let isTemplateString = kind =>
        kind == ts.SyntaxKind.TemplateExpression ||
        kind == ts.SyntaxKind.NoSubstitutionTemplateLiteral;

    if (callee) {
        let template = <ts.PropertyAssignment>callee.properties.find(p =>
            (<ts.Identifier>p.name).text === 'template'
        );
        if (template && isTemplateString(template.initializer.kind)) {
            let i = <ts.TemplateExpression>template.initializer;
            return new vsc.Range(doc.positionAt(i.pos).translate(0, 2), doc.positionAt(i.end).translate(0, -1));
        }
    }
    return null;
}