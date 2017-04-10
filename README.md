# Angular @Component Extension

[![Build Status](https://travis-ci.org/onixie/angular-component-extension.svg?branch=master)](https://travis-ci.org/onixie/angular-component-extension)

A vscode extension for Angular @Component.

![demo](./demo.gif "demo")

## Features
- Language support for inline-defined template and styles
  - Syntax highlighting
  - Code Formatting
  - Code Completion
  - Go to Definition

## Extension Settings

## Known Issues

### Language
- Javascript support.

### Function

#### Code Formatting
- Whitespace might not always be formatted perfectly.
- Xml element starting with : is not formatted correctly.

#### Syntax Highlighting
- Wrong coloring in some cases. eg. using ?. operator in {{ }}
- No coloring in some cases.

#### Code Completion
- NgModule and Component dependency is not considered.
- Unsaved modification might not be listed.

#### Go to Definition

## Release Notes