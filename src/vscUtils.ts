'use strict';

import * as vsc from 'vscode';
import * as ts from 'typescript';
import * as tsUtils from './tsUtils';
export * from './tsUtils';

export function getDecoratorNameAndRange(dec: ts.Decorator, doc?: vsc.TextDocument): [string, vsc.Range] {
    let callExp = <ts.CallExpression>dec.expression;
    let caller = <ts.Identifier>callExp.expression;

    let name = caller.text;
    let range = doc ? new vsc.Range(doc.positionAt(caller.pos), doc.positionAt(caller.end)) : null;
    return [name, range];
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


export function getTemplateRanges(document: vsc.TextDocument, selectedRange?: vsc.Range): vsc.Range[] {
    let source = tsUtils.createSourceFile(document.fileName, document.getText());
    let classes = tsUtils.getClasses(source.statements);
    let components = tsUtils.findComponents(classes);

    if (!components)
        return null;

    return components.map(c => {
        let dec = tsUtils.getDecorator(c[0], 'Component');
        let range = getComponentDecoratorTemplateRange(dec, document);
        return range && selectedRange ? range.intersection(selectedRange) : range;
    }).filter(range => range);
}


export function getStylesRanges(document: vsc.TextDocument, selectedRange?: vsc.Range): vsc.Range[][] {
    let source = tsUtils.createSourceFile(document.fileName, document.getText());
    let classes = tsUtils.getClasses(source.statements);
    let components = tsUtils.findComponents(classes);

    if (!components)
        return null;

    return components.map(c => {
        let dec = tsUtils.getDecorator(c[0], 'Component');
        let ranges = getComponentDecoratorStylesRanges(dec, document);
        return ranges ?
            ranges.map(r =>
                selectedRange ? r.intersection(selectedRange) : r
            ).filter(r => r) : null;
    }).filter(rr => rr);
}