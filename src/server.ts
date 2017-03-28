'use strict';

import * as vscode from 'vscode';
import * as vscls from 'vscode-languageserver';
import * as utils from './tsUtils';
import * as glob from 'glob';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

let connection: vscls.IConnection = vscls.createConnection(new vscls.IPCMessageReader(process), new vscls.IPCMessageWriter(process));

let documents: vscls.TextDocuments = new vscls.TextDocuments();
documents.listen(connection);

let workspaceRoot: string;
connection.onInitialize((params): vscls.InitializeResult => {
    workspaceRoot = params.rootPath;
    sweepTsFiles();
    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['<', '[', '(', '/', '>']
            }
        }
    }
});

connection.listen();

interface CompletionCandidate {
    class: string;
    selector: string;
    inputs: ts.ClassElement[];
    outputs: ts.ClassElement[];
    src: string;
}

interface Completion {
    candidates: CompletionCandidate[];
    current?: CompletionCandidate
}

let completion: Completion = { candidates: null };
connection.onCompletion((params: vscls.TextDocumentPositionParams): vscls.CompletionItem[] | vscls.CompletionList => {
    if (!completion.candidates) {
        return vscls.CompletionList.create();
    }
    let extra = "";
    let [h, c, n] = getTriggerCharacter(params);
    switch (h) {
        case '<': {
            return completion.candidates.map<vscls.CompletionItem>(c => ({
                label: c.selector,
                kind: vscls.CompletionItemKind.Text,
                detail: `class ${c.class}`,
                insertText: `${c.selector}`,
                documentation: path.relative(workspaceRoot, c.src),
                data: { selector: c }
            }));
        }
        case '>':
            extra = "</";
        case '/': {
            let c = findClosestCandidate(params);
            if (c) {
                completion.current = null;
                return [
                    {
                        label: c.selector,
                        kind: vscls.CompletionItemKind.Text,
                        detail: `class ${c.class}`,
                        documentation: path.relative(workspaceRoot, c.src),
                        insertText: `${extra}${c.selector}>`,
                        data: {}
                    }
                ];
            }
        }
        case '[': {
            let cand = findClosestCandidate(params);
            if (!cand) {
                return [];
            }
            let text = fs.readFileSync(cand.src, "utf-8");

            return cand.inputs.map<vscls.CompletionItem>(i => ({
                label: utils.getBindingName(i),
                kind: vscls.CompletionItemKind.Text,
                textEdit: {
                    newText: `${utils.getBindingName(i)}]=""`,
                    range: vscls.Range.create(
                        params.position.line,
                        params.position.character,
                        params.position.line,
                        params.position.character + (c == "]" ? 1 : 0)
                    )
                },
                detail: `[]=${cand.class}`,
                documentation: text.substring(i.pos, i.end),
                command: {
                    command: "cursorLeft",
                    title: "cursorLeft"
                },
                data: { input: i, src: cand.src }
            }));
        }
        case '(': {
            let cand = findClosestCandidate(params);
            if (!cand) {
                return null;
            }
            let text = fs.readFileSync(cand.src, "utf-8");

            return cand.outputs.map<vscls.CompletionItem>(o => ({
                label: utils.getBindingName(o),
                kind: vscls.CompletionItemKind.Text,
                textEdit: {
                    newText: `${utils.getBindingName(o)})=""`,
                    range: vscls.Range.create(
                        params.position.line,
                        params.position.character,
                        params.position.line,
                        params.position.character + (c == ")" ? 1 : 0)
                    )
                },
                detail: `()=${cand.class}`,
                documentation: text.substring(o.pos, o.end),
                command: {
                    command: "cursorLeft",
                    title: "cursorLeft"
                },
                data: { output: o, src: cand.src }
            }));
        }
    }
    return [];
});

connection.onCompletionResolve((item: vscls.CompletionItem): vscls.CompletionItem => {
    if (item.data.selector) {
        completion.current = item.data.selector;
    }

    return item;
})

function sweepTsFiles() {
    glob(`${workspaceRoot}/**/*.ts`, (err, match) => {
        if (err) {
            return;
        }
        completion.candidates = match.map(m => {
            let src = utils.createSourceFile(m);
            let comps = utils.findComponents(utils.getClasses(src.statements));
            if (!comps) {
                return null;
            }
            return comps.map(c => createCandidate(c[0], c[1], src));
        }).filter(x => x).reduce((p, c) => p.concat(c));
        connection.window.showInformationMessage(`Found ${completion.candidates.length} Components`);
    });
}

function createCandidate(decl: ts.ClassDeclaration, dec: ts.Decorator, src: ts.SourceFile): CompletionCandidate {
    return {
        class: (<ts.Identifier>decl.name).text,
        selector: utils.getComponentDecoratorSelectorName(dec),
        inputs: utils.getInputBinding(decl),
        outputs: utils.getOutputBinding(decl),
        src: src.fileName
    };
}

function getTriggerCharacter(pos: vscls.TextDocumentPositionParams): string[] {
    let doc = documents.get(pos.textDocument.uri);
    let text = doc.getText();
    return [
        text.charAt(doc.offsetAt(pos.position) - 1),
        text.charAt(doc.offsetAt(pos.position)),
        text.charAt(doc.offsetAt(pos.position) + 1),
    ];
}

function findClosestCandidate(pos: vscls.TextDocumentPositionParams): CompletionCandidate {
    if (completion.candidates && completion.candidates.length == 1) {
        return completion.candidates[0];
    }

    let doc = documents.get(pos.textDocument.uri);
    let text = doc.getText().substring(0, doc.offsetAt(pos.position) - 1);
    if (completion.candidates && completion.candidates.length > 1) {
        let closest = completion.candidates
            .map((c, i) => ({ dist: calculateDistance(text, c), cand: c }))
            .filter(d => d.dist >= 0)
            .sort((r, l) => l.dist - r.dist)[0];
        if (closest) {
            if (completion.current && completion.current.selector == closest.cand.selector) {
                return completion.current;
            }
            return closest.cand;
        }
    }

    return null;
}

function calculateDistance(text: string, cand: CompletionCandidate) {
    let pos = text.lastIndexOf(`<${cand.selector}`);
    if (pos > 0) {
        let isMatch = text.substring(pos).match(/^<(?:[^'"<>=]|=\s*"[^"]*"|=\s*'[^']*')+(>.*<)?$/);
        if (!isMatch)
            return -1;
        return pos + cand.selector.length;
    }
    return pos;
}