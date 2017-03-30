'use strict';

import * as vscode from 'vscode';
import * as vscls from 'vscode-languageserver';
import * as utils from './tsUtils';
import * as glob from 'glob';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import uri from 'vscode-uri';

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
            },
            definitionProvider: true
        }
    }
});

// Try detect new components
let disposable = documents.onDidSave((e: vscls.TextDocumentChangeEvent) => {
    if (e.document.languageId == 'typescript') {
        sweepTsFiles();
    }
});

connection.onExit(() => {
    disposable.dispose();
});

connection.listen();

// Code Completion

const XmlNameParts = /^(?:\w|\d|[-._:])+/;
const XmlNameExact = /^(?:\w|[_:])(?:\w|\d|[-._:])*$/;

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
connection.onCompletion(async (params: vscls.TextDocumentPositionParams) => {
    let inRange = await connection.sendRequest("template/inRange", params.position);
    if (!inRange) {
        return null;
    }

    if (!completion.candidates) {
        return vscls.CompletionList.create();
    }
    let extra = "";
    let [h, c, n] = getTriggerCharacter(params);
    switch (h) {
        case '<': {
            let format = (c: CompletionCandidate) => {
                if (c.inputs.length > 0 || c.outputs.length > 0) {
                    return c.selector;
                } else {
                    return `${c.selector}></${c.selector}>`;
                }
            };

            return completion.candidates.map<vscls.CompletionItem>(c => ({
                label: c.selector,
                kind: vscls.CompletionItemKind.Text,
                detail: `class ${c.class}`,
                insertText: format(c),
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

// Go to Definition
connection.onDefinition(async (params: vscls.TextDocumentPositionParams) => {
    let inRange = await connection.sendRequest("template/inRange", params.position);
    if (!inRange) {
        return null;
    }

    if (completion.candidates) {
        let doc = documents.get(params.textDocument.uri);
        let text = doc.getText();
        let pos = doc.offsetAt(params.position);
        let head = text.substring(0, pos);
        let tail = text.substring(pos).match(XmlNameParts) || [""];
        let start = head.lastIndexOf("<");
        let selector = (head.substring(start + 1)
            .split("").reverse().join("")
            .match(XmlNameParts) || [""])[0]
            .split("").reverse().join("") + tail;

        let cand = completion.candidates.find(c => c.selector === selector);
        if (cand) {
            return vscls.Location.create(
                uri.file(cand.src).toString(),
                vscls.Range.create(0, 0, 0, 0)
            );
        }
    }
    return [];
});

// Internal
function sweepTsFiles() {
    glob(`${workspaceRoot}/**/*.ts`, (err, match) => {
        if (err) {
            return;
        }
        let oldCount = (completion.candidates && completion.candidates.length) || 0;

        completion.candidates = match.map(m => {
            let src = utils.createSourceFile(m);
            let comps = utils.findComponents(utils.getClasses(src.statements));
            if (!comps) {
                return null;
            }
            return comps.map(c => createCandidate(c[0], c[1], src));
        }).reduce((p, c) => p.concat(c)).filter(x => x);

        if (completion.candidates.length !== oldCount) {
            connection.window.showInformationMessage(
                `Found ${completion.candidates.length} Components`
            );
        }
    });
}

function createCandidate(decl: ts.ClassDeclaration, dec: ts.Decorator, src: ts.SourceFile): CompletionCandidate {
    let cand = {
        class: (<ts.Identifier>decl.name).text,
        selector: utils.getComponentDecoratorSelectorName(dec),
        inputs: utils.getInputBinding(decl),
        outputs: utils.getOutputBinding(decl),
        src: src.fileName
    };

    if (cand.selector && cand.selector.match(XmlNameExact)) {
        return cand;
    }
    return null;
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