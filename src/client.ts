import * as vsc from 'vscode';
import * as vsclc from 'vscode-languageclient';
import * as path from 'path';

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