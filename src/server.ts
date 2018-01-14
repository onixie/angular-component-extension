'use strict';

import * as vscode from 'vscode';
import * as vscls from 'vscode-languageserver';
import uri from 'vscode-uri';
import * as glob from 'glob';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import * as config from './config';
import * as utils from './tsUtils';

let connection: vscls.IConnection = vscls.createConnection(new vscls.IPCMessageReader(process), new vscls.IPCMessageWriter(process));

let documents: vscls.TextDocuments = new vscls.TextDocuments();
documents.listen(connection);

let workspaceRoot: string;
connection.onInitialize((params): vscls.InitializeResult => {
    workspaceRoot = params.rootPath;
    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['<', '[', '(', '/', '>', '|']
            },
            definitionProvider: true
        }
    }
});

let settings: config.Settings = { "ng-c-ext": {} };
// Try detect new components
let disposable = documents.onDidSave((e: vscls.TextDocumentChangeEvent) => {
    if (e.document.languageId == 'typescript') {
        sweepTsFiles(settings);
    }
});
connection.onDidChangeConfiguration(({settings : newSettings}: vscls.DidChangeConfigurationParams) => {
    if (settings["ng-c-ext"].ngcignore != newSettings["ng-c-ext"].ngcignore) {
        sweepTsFiles(newSettings);
    }
    settings = newSettings;
});

connection.onExit(() => {
    disposable.dispose();
});

connection.listen();

// Code Completion

const XmlNameParts = /^(?:\w|\d|[-._:])+/;
const XmlNameExact = /^(?:\w|[_:])(?:\w|\d|[-._:])*$/;
const PipeNameParts = /^(?:\w|\d)+/;

enum CandidateType {
    Component, Pipe
};

interface CompletionCandidate {
    type: CandidateType;
    class: string;
    src: string;
}

interface ComponentCompletionCandidate extends CompletionCandidate {
    selector: string;
    inputs: ts.ClassElement[];
    outputs: ts.ClassElement[];
}

interface PipeCompletionCandidate extends CompletionCandidate {
    name: string;
    pure: string;
}

interface Completion {
    candidates: {
        components: ComponentCompletionCandidate[],
        pipes: PipeCompletionCandidate[]
    };
    current?: ComponentCompletionCandidate
}

let completion: Completion = { candidates: { components: null, pipes: null } };
connection.onCompletion(async (params: vscls.TextDocumentPositionParams) => {
    let inRange = await connection.sendRequest("template/inRange", params.position);
    if (!inRange) {
        return [];
    }

    let extra = "";
    let [p, h, c, n] = getTriggerCharacter(params);

    if (!completion.candidates.components && ['<', '[', '(', '/', '>'].some(sc => sc == h)) {
        return vscls.CompletionList.create();
    } else if (!completion.candidates.pipes && ['|'].some(sc => sc == h)) {
        return vscls.CompletionList.create();
    }

    switch (h) {
        case '<': {
            let format = (c: ComponentCompletionCandidate) => {
                if (c.inputs.length > 0 || c.outputs.length > 0) {
                    return c.selector;
                } else {
                    return `${c.selector}></${c.selector}>`;
                }
            };

            return completion.candidates.components.map<vscls.CompletionItem>(c => ({
                label: c.selector,
                kind: vscls.CompletionItemKind.Class,
                detail: `class ${c.class}`,
                insertText: format(c),
                documentation: path.relative(workspaceRoot, c.src),
                data: { selector: c },
                sortText: "\u0000",
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
                        kind: vscls.CompletionItemKind.Class,
                        detail: `class ${c.class}`,
                        documentation: path.relative(workspaceRoot, c.src),
                        insertText: `${extra}${c.selector}>`,
                        data: {},
                        sortText: "\u0000"
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
                label: `[${utils.getBindingName(i)}]`,
                kind: vscls.CompletionItemKind.Property,
                textEdit: {
                    newText: `[${utils.getBindingName(i)}]=""`,
                    range: vscls.Range.create(
                        params.position.line,
                        params.position.character - 1,
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
                data: { input: i, src: cand.src },
                sortText: "\u0000"
            }));
        }
        case '(': {
            let cand = findClosestCandidate(params);
            if (!cand) {
                return null;
            }
            let text = fs.readFileSync(cand.src, "utf-8");
            if (p != "[") {
                return cand.outputs.map<vscls.CompletionItem>(o => ({
                    label: `(${utils.getBindingName(o)})`,
                    kind: vscls.CompletionItemKind.Property,
                    textEdit: {
                        newText: `(${utils.getBindingName(o)})=""`,
                        range: vscls.Range.create(
                            params.position.line,
                            params.position.character - 1,
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
                    data: { output: o, src: cand.src },
                    sortText: "\u0000"
                }));
            } else {
                return cand.inputs.filter(
                    i => cand.outputs.find(
                        o => utils.getBindingName(o) == utils.getBindingName(i) + "Change"
                    )
                ).map(i => ({
                    label: `[(${utils.getBindingName(i)})]`,
                    kind: vscls.CompletionItemKind.Property,
                    textEdit: {
                        newText: `[(${utils.getBindingName(i)})]=""`,
                        range: vscls.Range.create(
                            params.position.line,
                            params.position.character - 2,
                            params.position.line,
                            params.position.character + (c == ")" ? 1 : 0) + (n == "]" ? 1 : 0)
                        )
                    },
                    detail: `[()]=${cand.class}`,
                    documentation: text.substring(i.pos, i.end),
                    command: {
                        command: "cursorLeft",
                        title: "cursorLeft"
                    },
                    data: { input: i, src: cand.src },
                    sortText: "\u0000"
                }));
            }
        }
        case '|': {
            return isAtExpression(params) && completion.candidates.pipes.map<vscls.CompletionItem>(p => ({
                label: p.name,
                kind: vscls.CompletionItemKind.Class,
                detail: `class ${p.class}`,
                insertText: ` ${p.name}`,
                documentation: path.relative(workspaceRoot, p.src),
                data: { name: p },
                sortText: "\u0000",
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
    if (settings["ng-c-ext"].disableGotoDefinition) {
        return [];
    }

    let doc = documents.get(params.textDocument.uri);
    let text = doc.getText();
    let pos = doc.offsetAt(params.position);
    let head = text.substring(0, pos);
    let startCaret = head.lastIndexOf("<");
    let startBar = head.lastIndexOf("|");
    let isAtBar = startBar > startCaret;
    let isAtCaret = startCaret > startBar;

    let inRange = await connection.sendRequest("template/inRange", params.position, isAtBar);
    if (!inRange) {
        return [];
    }

    if ( isAtCaret && completion.candidates.components) {
        let tail = text.substring(pos).match(XmlNameParts) || [""];
        let selector = (head.substring(startCaret + 1)
            .split("").reverse().join("")
            .match(XmlNameParts) || [""])[0]
            .split("").reverse().join("") + tail;

        let cand = completion.candidates.components.find(c => c.selector === selector);
        if (cand) {
            return vscls.Location.create(
                uri.file(cand.src).toString(),
                vscls.Range.create(0, 0, 0, 0)
            );
        }
    } else if (isAtBar && completion.candidates.pipes) {
        let tail = text.substring(pos).match(PipeNameParts) || [""];
        let pipe = (head.substring(startBar + 1)
            .split("").reverse().join("")
            .match(PipeNameParts) || [""])[0]
            .split("").reverse().join("") + tail;
        
        let cand = completion.candidates.pipes.find(c => c.name === pipe);
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
function sweepTsFiles(settings : config.Settings) {
    glob(`${workspaceRoot}/**/*.ts`, { ignore: settings["ng-c-ext"].ngcignore }, (err, match) => {
        if (err) {
            return;
        }
        let oldCompCount = (completion.candidates.components && completion.candidates.components.length) || 0;
        let oldPipeCount = (completion.candidates.pipes && completion.candidates.pipes.length) || 0;

        let cands = match.map(m => {
            let src = utils.createSourceFile(m);
            let found = utils.findComponentsAndPipes(utils.getClasses(src.statements));
            if (!found) {
                return [];
            }
            return found.map(c => createCandidate(c[0], c[1], src));
        }).reduce((p, c) => p.concat(c), []).filter(x => x);

        completion.candidates.components = <ComponentCompletionCandidate[]>cands.filter(c => c.type == CandidateType.Component);
        completion.candidates.pipes = <PipeCompletionCandidate[]>cands.filter(c => c.type == CandidateType.Pipe);

        if (settings["ng-c-ext"].shutupMode)
            return;

        let newCompCount = completion.candidates.components.length;
        let newPipeCount = completion.candidates.pipes.length;
        let message: string = null;
        if ( newCompCount !== oldCompCount ) {
            message = `Found ${newCompCount} Components`;
        }
        if (newPipeCount !== oldPipeCount) {
            message = message ? message + `, ${newPipeCount} Pipes` : `Found ${newPipeCount} Pipes`;
        }
        if (message) {
            connection.window.showInformationMessage(message,);
        }
    });
}

function createCandidate(decl: ts.ClassDeclaration, dec: ts.Decorator, src: ts.SourceFile): CompletionCandidate {
    let type = utils.getDecoratorName(dec);
    switch (type) {
        case "Component": return createComponentCand(decl, dec, src);
        case "Pipe": return createPipeCand(decl, dec, src);
        default: return null;
    }
}

function createComponentCand(decl: ts.ClassDeclaration, dec: ts.Decorator, src: ts.SourceFile): ComponentCompletionCandidate {
    let cand = {
        class: (<ts.Identifier>decl.name).text,
        type: CandidateType.Component,
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

function createPipeCand(decl: ts.ClassDeclaration, dec: ts.Decorator, src: ts.SourceFile): PipeCompletionCandidate {
    let cand = {
        class: "",//(<ts.Identifier>decl.name).text,
        type: CandidateType.Pipe,
        name: utils.getPipeName(dec),
        pure: utils.getPipePureness(dec),
        src: src.fileName
    };

    if (cand.name) {
        return cand;
    }
    return null;
}

function getTriggerCharacter(pos: vscls.TextDocumentPositionParams): string[] {
    let doc = documents.get(pos.textDocument.uri);
    let text = doc.getText();
    return [
        text.charAt(doc.offsetAt(pos.position) - 2),
        text.charAt(doc.offsetAt(pos.position) - 1),
        text.charAt(doc.offsetAt(pos.position)),
        text.charAt(doc.offsetAt(pos.position) + 1),
    ];
}

function findClosestCandidate(pos: vscls.TextDocumentPositionParams): ComponentCompletionCandidate {
    if (completion.candidates && completion.candidates.components.length == 1) {
        return completion.candidates[0];
    }

    let doc = documents.get(pos.textDocument.uri);
    let text = doc.getText().substring(0, doc.offsetAt(pos.position) - 1);
    if (completion.candidates && completion.candidates.components.length > 1) {
        let closest = completion.candidates.components
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

function calculateDistance(text: string, cand: ComponentCompletionCandidate) {
    let pos = text.lastIndexOf(`<${cand.selector}`);
    if (pos > 0) {
        let isMatch = text.substring(pos).match(/^<(?:[^'"<>=]|=\s*"[^"]*"|=\s*'[^']*')+(>.*<)?$/);
        if (!isMatch)
            return -1;
        return pos + cand.selector.length;
    }
    return pos;
}

function isAtExpression(pos: vscls.TextDocumentPositionParams): boolean {
    // TODO: complete me, please!
    return true;
}