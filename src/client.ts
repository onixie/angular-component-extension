import * as vsc from 'vscode';
import * as vsclc from 'vscode-languageclient';
import * as path from 'path';
import * as utils from './vscUtils';

export function setup(context: vsc.ExtensionContext): vsclc.LanguageClient {
    let serverModule = context.asAbsolutePath(path.join('out', 'src', 'server.js'));
    let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };

    let serverOptions: vsclc.ServerOptions = {
        run: { module: serverModule, transport: vsclc.TransportKind.ipc },
        debug: { module: serverModule, transport: vsclc.TransportKind.ipc, options: debugOptions }
    }

    let clientOptions: vsclc.LanguageClientOptions = {
        documentSelector: ['typescript', 'html'],
        synchronize: {
            configurationSection: 'angular.component.extension',
            fileEvents: vsc.workspace.createFileSystemWatcher('**/*.ts')
        }
    }

    let client = new vsclc.LanguageClient(
        'angular.component.extension',
        'Language Client for Angular @Component Extension',
        serverOptions,
        clientOptions
    );

    registerRestartCommand(context, client);
    context.subscriptions.push(client.start());

    client.onReady().then(_ => {
        context.subscriptions.push(
            vsc.languages.setLanguageConfiguration("xml", {
                wordPattern: /(?:\w|[_:])(?:\w|\d|[-._:])*/g
            })
        );
        context.subscriptions.push(
            vsc.languages.setLanguageConfiguration("html", {
                wordPattern: /(?:\w|[_:])(?:\w|\d|[-._:])*/g
            })
        );

        client.onRequest("template/inRange", (pos: vsclc.Position) => {
            let doc = vsc.window.activeTextEditor.document;
            if (doc.languageId == 'html') {
                return true;
            }

            let ranges = utils.getTemplateRanges(doc);
            if (ranges) {
                let _pos: vsc.Position = new vsc.Position(pos.line, pos.character);
                return ranges.some(r => r.contains(_pos));
            }
            return false;
        });
    });

    return client;
}

function registerRestartCommand(context: vsc.ExtensionContext, client: vsclc.LanguageClient) {
    context.subscriptions.push(
        vsc.commands.registerCommand("ng.c-ext.action.restartServer", async () => {
            await client.stop();
            context.subscriptions.push(client.start());
        })
    );
}