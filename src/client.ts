import * as vsc from 'vscode';
import * as vsclc from 'vscode-languageclient';
import * as path from 'path';
import * as utils from './vscUtils';

let selPat = /\w(\w|\d|[-_\\])*/g

export function setup(context: vsc.ExtensionContext): vsclc.LanguageClient {
    let serverModule = context.asAbsolutePath(path.join('out', 'src', 'server.js'));
    let debugOptions = { execArgv: ["--nolazy", "--debug=6004"] };

    let serverOptions: vsclc.ServerOptions = {
        run: { module: serverModule, transport: vsclc.TransportKind.ipc },
        debug: { module: serverModule, transport: vsclc.TransportKind.ipc, options: debugOptions }
    }

    let clientOptions: vsclc.LanguageClientOptions = {
        documentSelector: ['typescript', 'html', 'razor'],
        synchronize: {
            configurationSection: 'ng-c-ext',
            fileEvents: vsc.workspace.createFileSystemWatcher('**/*.ts')
        }
    }

    let client = new vsclc.LanguageClient(
        'ng-c-ext',
        'Language Client for Angular @Component Extension',
        serverOptions,
        clientOptions
    );
    context.subscriptions.push(client.start());

    let lcTxml: boolean = false,
        lcHtml: boolean = false,
        lcRazr: boolean = false;

    client.onReady().then(_ => {
        client.onRequest("template/inRange", (pos: vsclc.Position, isAtBar: boolean) => {
            let doc = vsc.window.activeTextEditor.document;
            if (doc.languageId == 'html' || doc.languageId == 'razor'
                || (isAtBar && (doc.languageId == 'typescript' || doc.languageId == 'javascript'))) /* TODO */ {
                if (!lcRazr || !lcHtml) {
                    context.subscriptions.push(
                        vsc.languages.setLanguageConfiguration(doc.languageId, {
                            wordPattern: selPat
                        })
                    );
                    lcRazr = doc.languageId == "razor";
                    lcHtml = doc.languageId == "html";
                }
                return true;
            }

            if (!lcTxml) {
                context.subscriptions.push(
                    vsc.languages.setLanguageConfiguration("xml", {
                        wordPattern: selPat
                    })
                );
                lcTxml = true;
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