/*---------------------------------------------------------------------------------------------
 *  SideX — Tauri-based VSCode port
 *  Application entry point. Boots the real VSCode workbench.
 *--------------------------------------------------------------------------------------------*/

import { main } from './vs/code/browser/workbench.main';

// Import the real VSCode workbench modules via the barrel files
// This triggers side-effect registrations for all contributions and services
import './vs/workbench/workbench.desktop.main.js';

main().catch((err) => {
	console.error('[SideX] Fatal: workbench failed to boot', err);
	document.body.textContent = `SideX failed to start: ${err?.message || err}`;
});
