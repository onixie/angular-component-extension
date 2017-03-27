'use strict';

import * as vsc from 'vscode';
import * as format from './format';
import * as client from './client';

export function activate(context: vsc.ExtensionContext) {
    client.setup(context);
    format.registFormatCommand(context);
}

export function deactivate() {
}