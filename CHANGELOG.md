# Change Log
All notable changes to the "angular-component-extension" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [v0.0.10]
### Fix
- Use valid element name as wordPattern in html/razor/xml
### Add
- Configuration for disabling Go to Definition if a more powerful one from [Angular Language Service](https://marketplace.visualstudio.com/items?itemName=Angular.ng-template) is prefered.

## [v0.0.9]
### Fixed
- Server error when target file contains no statements.

## [v0.0.8]
### Fixed
- Syntax highlighting disruption caused by ?.
### Added
- Support cshtml files (razor language mode)
- Code completion for 2-way data binding
### Removed
- Broken command to reset language server

## [v0.0.7]
### Added
- Demo.gif for README.md

## [v0.0.6]
### Added
- Code Completion for element selector, input and output
- Go to Definition support for element selector
- New shortcut key for language server restart
- Support non-inline template (if language id == html)
- New configuration section for altering this extension
### Fixed
- Improve whitespace removal

## [v0.0.5]
### Added
- Support multiple components formatting in one file simultaneously
### Changed
- Trim text between start and end tag (violate xml standard though)
- Locate format ranges by parsing typescript, instead of unstable regex matching
### Fixed
- Some null exception cases

## [v0.0.4]
### Added
- Css formatting
- Selection Format
### Fixed
- Fragile formatter for template

## [v0.0.3]
### Added
- Syntax highlighting for inline-defined template and styles
- Code formatting for inline-defined template