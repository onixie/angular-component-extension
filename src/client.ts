import * as vsc from 'vscode';
import * as vsclc from 'vscode-languageclient';
import * as path from 'path';

export function setup(context: vsc.ExtensionContext) {
    let serverModule = context.asAbsolutePath(path.join('out', 'src', 'server.js'));
    let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };

    let serverOptions: vsclc.ServerOptions = {
        run: { module: serverModule, transport: vsclc.TransportKind.ipc },
        debug: { module: serverModule, transport: vsclc.TransportKind.ipc, options: debugOptions }
    }

    let clientOptions: vsclc.LanguageClientOptions = {
        documentSelector: ['typescript'],
        synchronize: {
            configurationSection: 'angular.component.extension',
            fileEvents: vsc.workspace.createFileSystemWatcher('**/*.ts')
        }
    }

    context.subscriptions.push(
        new vsclc.LanguageClient(
            'angular.component.extension',
            'Language Client for Angular @Component Extension',
            serverOptions,
            clientOptions
        ).start()
    );
}