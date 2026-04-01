/*---------------------------------------------------------------------------------------------
 *  SideX — Tauri-based VSCode port
 *  Entry point. Globals set by inline script in index.html.
 *--------------------------------------------------------------------------------------------*/

async function boot() {
	// Import the web workbench barrel in stages so partial failures are isolated.
	const stages = [
		['common',       () => import('./vs/workbench/workbench.common.main.js')],
		['web.main',     () => import('./vs/workbench/browser/web.main.js')],
		['web-dialog',   () => import('./vs/workbench/browser/parts/dialogs/dialog.web.contribution.js')],
		['web-services', () => import('./vs/workbench/workbench.web.main.js')],
	] as const;

	for (const [label, loader] of stages) {
		try {
			await loader();
		} catch (e) {
			console.warn(`[SideX] Barrel stage "${label}" failed (non-fatal):`, e);
		}
	}

	const { create } = await import('./vs/workbench/browser/web.factory.js');

	if (document.readyState === 'loading') {
		await new Promise<void>(r => window.addEventListener('DOMContentLoaded', () => r()));
	}

	// Check if a folder was passed via URL params (from Tauri folder open)
	const urlParams = new URLSearchParams(window.location.search);
	const folderParam = urlParams.get('folder');

	// Clear stale workbench state when folder changes to avoid editor restore errors
	if (folderParam) {
		const lastFolder = sessionStorage.getItem('sidex-last-folder');
		if (lastFolder !== folderParam) {
			sessionStorage.setItem('sidex-last-folder', folderParam);
			// Clear IndexedDB workbench state to prevent stale editor tab errors
			try {
				const dbs = await indexedDB.databases();
				for (const db of dbs) {
					if (db.name && (db.name.includes('vscode-web-state') || db.name.includes('vscode-userdata'))) {
						indexedDB.deleteDatabase(db.name);
					}
				}
			} catch { /* ignore */ }
		}
	}

	const options: any = {
		windowIndicator: {
			label: 'SideX',
			tooltip: 'SideX — Tauri Code Editor',
			command: undefined as any,
		},
		productConfiguration: {
			nameShort: 'SideX',
			nameLong: 'SideX',
			applicationName: 'sidex',
			dataFolderName: '.sidex',
			version: '0.1.0',
		},
		settingsSyncOptions: {
			enabled: false,
		},
		additionalBuiltinExtensions: [],
		defaultLayout: {
			editors: [],
		},
	};

	if (folderParam) {
		// Open with a folder workspace
		const { URI } = await import('./vs/base/common/uri.js');
		options.folderUri = URI.parse(folderParam);
	}

	create(document.body, options);

	console.log('[SideX] Workbench created successfully' + (folderParam ? ` (folder: ${folderParam})` : ''));
}

boot().catch((err) => {
	console.error('[SideX] Fatal:', err);
	document.body.innerHTML = `<div style="padding:40px;color:#ccc;font-family:system-ui">
		<h2>SideX failed to start</h2>
		<pre style="color:#f88;white-space:pre-wrap">${(err as Error)?.stack || err}</pre>
	</div>`;
});
