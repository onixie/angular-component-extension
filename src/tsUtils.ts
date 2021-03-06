'use strict';

import * as ts from 'typescript';

export function createSourceFile(fileName: string, newText?: string): ts.SourceFile {
    let options = ts.getDefaultCompilerOptions();
    let host = ts.createCompilerHost(options);
    let src = host.getSourceFile(fileName, options.target);
    if (newText) {
        let allRange: ts.TextChangeRange = {
            span: {
                start: 0,
                length: src.endOfFileToken.end
            },
            newLength: newText.length
        };
        src = src.update(newText, allRange);
    }
    return src;
}

export function getClasses(nodes: ts.NodeArray<ts.Statement>): ts.ClassDeclaration[] {
    return nodes ? <ts.ClassDeclaration[]>nodes.filter(s =>
        s.kind === ts.SyntaxKind.ClassDeclaration
    ) : null;
}

export function findComponents(decls: ts.ClassDeclaration[]): [ts.ClassDeclaration, ts.Decorator][] {
    return decls ? decls
        .map<[ts.ClassDeclaration, ts.Decorator]>(d => [d, getDecorator(d, 'Component')])
        .filter(n => !!n[1]) : null;
}

export function findPipes(decls: ts.ClassDeclaration[]): [ts.ClassDeclaration, ts.Decorator][] {
    return decls ? decls
        .map<[ts.ClassDeclaration, ts.Decorator]>(d => [d, getDecorator(d, 'Pipe')])
        .filter(n => !!n[1]) : null;
}

export function findComponentsAndPipes(decls: ts.ClassDeclaration[]): [ts.ClassDeclaration, ts.Decorator][] {
    return decls ? decls
        .map<[ts.ClassDeclaration, ts.Decorator]>(d => [d, getDecorator(d, 'Component', 'Pipe')])
        .filter(n => !!n[1]) : null;
}

export function getDecorator(decl: ts.ClassDeclaration | ts.ClassElement, ...crit: string[]): ts.Decorator {
    if (!decl.decorators)
        return null;

    return decl.decorators.find(d => {
        let name = getDecoratorName(<ts.Decorator>d);
        if (!crit || crit.some(c => name === c)) {
            return true;
        }
        return false;
    });
}

export function getDecoratorName(dec: ts.Decorator): string {
    const callExp = <ts.CallExpression>dec.expression;
    const caller = <ts.Identifier>callExp.expression;

    const name = caller.text || caller.escapedText;
    return name as string;
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

export function getInputBinding(decl: ts.ClassDeclaration): ts.ClassElement[] {
    return decl.members.filter(m => getDecorator(m, "Input"));
}

export function getOutputBinding(decl: ts.ClassDeclaration): ts.ClassElement[] {
    return decl.members.filter(m => getDecorator(m, "Output"));
}

export function getBindingName(prop: ts.ClassElement): string {
    const dec = getDecorator(prop, "Input", "Output");
    if (!dec) {
        return null;
    }

    const propName = (<ts.Identifier>prop.name).text || (<ts.Identifier>prop.name).escapedText;
    const callExp = <ts.CallExpression>dec.expression;
    const callee = <ts.StringLiteral>callExp.arguments[0];
    if (callee) {
        return callee.text;
    }

    return propName as string;
}

export function getPipeName(dec: ts.Decorator): string {
    let callExp = <ts.CallExpression>dec.expression;
    let callee = <ts.ObjectLiteralExpression>callExp.arguments[0];
    if (callee) {
        let name = <ts.PropertyAssignment>callee.properties.find(p =>
            (<ts.Identifier>p.name).text === 'name'
        );
        if (name) {
            return (<ts.LiteralExpression>name.initializer).text;
        }
    }
    return null;
}

export function getPipePureness(dec: ts.Decorator): string {
    let callExp = <ts.CallExpression>dec.expression;
    let callee = <ts.ObjectLiteralExpression>callExp.arguments[0];
    if (callee) {
        let name = <ts.PropertyAssignment>callee.properties.find(p =>
            (<ts.Identifier>p.name).text === 'name'
        );
        if (name) {
            return (<ts.LiteralExpression>name.initializer).text;
        }
    }
    return null;
}