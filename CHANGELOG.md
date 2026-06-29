# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Fixed

- GitHub Actions can now find the MSBuild installation configured by the workflow.
- Electron Builder no longer attempts its own CI publish before the release workflow uploads the installer.

## [0.1.1] - 2026-06-29

### Fixed

- Map conversion no longer fails while assembling worlds without static props.
- Rejected Roblox uploads now fall back to local assets without aborting the conversion.

## [0.1.0] - 2026-06-29

### Added

- Windows Electron desktop app for Source2Roblox conversions.
- First-run setup checks for .NET Framework, Roblox Studio Mod Manager, Source games, and Roblox Open Cloud credentials.
- Steam Source game scanning, manual path entry, and map discovery.
- Map, model, texture, and advanced conversion modes.
- Live conversion logs, output history, and generated file actions.
- Roblox Open Cloud texture upload support.
- GitHub Actions CI and release packaging.

### Fixed

- Source game setup browse button now opens the folder picker correctly.
