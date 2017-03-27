'use strict';

import * as vscls from 'vscode-languageserver';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: vscls.IConnection = vscls.createConnection(new vscls.IPCMessageReader(process), new vscls.IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: vscls.TextDocuments = new vscls.TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities. 
let workspaceRoot: string;
connection.onInitialize((params): vscls.InitializeResult => {
    workspaceRoot = params.rootPath;
    return {
        capabilities: {
            // Tell the client that the server works in FULL text document sync mode
            textDocumentSync: documents.syncKind
        }
    }
});

// Listen on the connection
connection.listen();

documents.onDidChangeContent((change) => {
    let diagnostics: vscls.Diagnostic[] = [];
    let lines = change.document.getText().split(/\r?\n/g);
    lines.forEach((line, i) => {
        let index = line.indexOf('typescript');
        if (index >= 0) {
            diagnostics.push({
                severity: vscls.DiagnosticSeverity.Warning,
                range: {
                    start: { line: i, character: index},
                    end: { line: i, character: index + 10 }
                },
                message: `${line.substr(index, 10)} should be spelled TypeScript`,
                source: 'ex'
            });
        }
    })
    // Send the computed diagnostics to VS Code.
    connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});