'use strict';

import * as vsc from 'vscode';
import * as ts from 'typescript';

export function createSourceFile(doc: vsc.TextDocument): ts.SourceFile {
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

export function getClasses(nodes: ts.Node[]): ts.ClassDeclaration[] {
    return nodes ? <ts.ClassDeclaration[]>nodes.filter(s =>
        s.kind === ts.SyntaxKind.ClassDeclaration
    ) : null;
}

export function findComponents(decls: ts.ClassDeclaration[]): [ts.ClassDeclaration, ts.Decorator][] {
    return decls ? decls
        .map<[ts.ClassDeclaration, ts.Decorator]>(d => [d, getComponentDecorator(d)])
        .filter(n => !!n[1]) : null;
}

export function getComponentDecorator(decl: ts.ClassDeclaration): ts.Decorator {
    return decl.decorators.find(d => {
        let [name, _] = getDecoratorNameAndRange(<ts.Decorator>d);
        if (name === 'Component') {
            return true;
        }
        return false;
    });
}

export function getDecoratorNameAndRange(dec: ts.Decorator, doc?: vsc.TextDocument): [string, vsc.Range] {
    let callExp = <ts.CallExpression>dec.expression;
    let caller = <ts.Identifier>callExp.expression;

    let name = caller.text;
    let range = doc ? new vsc.Range(doc.positionAt(caller.pos), doc.positionAt(caller.end)) : null;
    return [name, range];
}

export function getComponentDecoratorSelectorName(dec: ts.Decorator): string {
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

export function getComponentDecoratorTemplateRange(dec: ts.Decorator, doc: vsc.TextDocument): vsc.Range {
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

export function getComponentDecoratorStylesRanges(dec: ts.Decorator, doc: vsc.TextDocument): vsc.Range[] {
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