/*---------------------------------------------------------------------------------------------
 *  SideX - Tauri-based VSCode port
 *  This is the Tauri equivalent of VSCode's desktop.main.ts
 *  It bootstraps the real VSCode workbench through Tauri instead of Electron
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../nls.js';
import product from '../../platform/product/common/product.js';
import { Workbench } from '../../workbench/browser/workbench.js';
import { domContentLoaded } from '../../base/browser/dom.js';
import { onUnexpectedError } from '../../base/common/errors.js';
import { URI } from '../../base/common/uri.js';
import { WorkspaceService } from '../../workbench/services/configuration/browser/configurationService.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ILoggerService, ILogService, LogLevel } from '../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../platform/workspace/common/workspace.js';
import { IWorkbenchConfigurationService } from '../../workbench/services/configuration/common/configuration.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { Disposable } from '../../base/common/lifecycle.js';
import { FileService } from '../../platform/files/common/fileService.js';
import { IFileService } from '../../platform/files/common/files.js';
import { ISignService } from '../../platform/sign/common/sign.js';
import { IProductService } from '../../platform/product/common/productService.js';
import { IUriIdentityService } from '../../platform/uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../platform/uriIdentity/common/uriIdentityService.js';
import { Schemas } from '../../base/common/network.js';
import { IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileService } from '../../workbench/services/userDataProfile/common/userDataProfile.js';
import { UserDataProfileService } from '../../workbench/services/userDataProfile/common/userDataProfileService.js';
import { IConfigurationService } from '../../platform/configuration/common/configuration.js';
import { mainWindow } from '../../base/browser/window.js';
import { BrowserStorageService } from '../../workbench/services/storage/browser/storageService.js';
import { BrowserWorkbenchEnvironmentService } from '../../workbench/services/environment/browser/environmentService.js';
import { IWorkbenchEnvironmentService } from '../../workbench/services/environment/common/environmentService.js';
import { IRemoteAgentService } from '../../workbench/services/remote/common/remoteAgentService.js';
import { RemoteAgentService } from '../../workbench/services/remote/browser/remoteAgentService.js';
import { IRemoteAuthorityResolverService } from '../../platform/remote/common/remoteAuthorityResolver.js';
import { RemoteAuthorityResolverService } from '../../platform/remote/browser/remoteAuthorityResolverService.js';
import { IRemoteSocketFactoryService, RemoteSocketFactoryService } from '../../platform/remote/common/remoteSocketFactoryService.js';
import { BrowserSocketFactory } from '../../platform/remote/browser/browserSocketFactory.js';
import { ConfigurationCache } from '../../workbench/services/configuration/common/configurationCache.js';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * TauriMain — the Tauri equivalent of VSCode's DesktopMain.
 * Bootstraps the real VSCode workbench on a Tauri webview.
 */
export class TauriMain extends Disposable {

	constructor() {
		super();
	}

	async open(): Promise<void> {
		const [services, instantiationService] = await this.initServices();

		await domContentLoaded(mainWindow);

		const workbench = new Workbench(
			mainWindow.document.body,
			{ extraClasses: ['tauri'] },
			services.serviceCollection,
			services.logService,
		);

		this._register(workbench);

		workbench.startup();
	}

	private async initServices(): Promise<[{ serviceCollection: ServiceCollection; logService: ILogService }, any]> {
		const serviceCollection = new ServiceCollection();

		// Product
		const productService: IProductService = { _serviceBrand: undefined, ...product };
		serviceCollection.set(IProductService, productService);

		// Environment — use browser environment service since we're in a Tauri webview
		const environmentService = new BrowserWorkbenchEnvironmentService(
			productService.nameShort ?? 'SideX',
			productService,
			undefined,
			undefined
		);
		serviceCollection.set(IWorkbenchEnvironmentService, environmentService);

		// Log
		const logService = this._register(new class implements ILogService {
			_serviceBrand: undefined;
			readonly onDidChangeLogLevel = new (await import('../../base/common/event.js')).Emitter<LogLevel>().event;
			getLevel() { return LogLevel.Info; }
			setLevel(_level: LogLevel) { }
			trace(message: string, ...args: any[]) { console.trace(message, ...args); }
			debug(message: string, ...args: any[]) { console.debug(message, ...args); }
			info(message: string, ...args: any[]) { console.info(message, ...args); }
			warn(message: string, ...args: any[]) { console.warn(message, ...args); }
			error(message: string | Error, ...args: any[]) { console.error(message, ...args); }
			flush() { }
			dispose() { }
		});
		serviceCollection.set(ILogService, logService);

		// Sign
		const signService: ISignService = {
			_serviceBrand: undefined,
			async sign(value: string) { return value; },
			async validate(_signedValue: string, _value: string) { return true; }
		};
		serviceCollection.set(ISignService, signService);

		// Remote
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService(
			false, undefined, undefined, productService, logService
		);
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);

		const remoteSocketFactoryService = new RemoteSocketFactoryService();
		remoteSocketFactoryService.register(0, new BrowserSocketFactory(null));
		serviceCollection.set(IRemoteSocketFactoryService, remoteSocketFactoryService);

		const remoteAgentService = this._register(new RemoteAgentService(
			remoteSocketFactoryService, environmentService, productService,
			remoteAuthorityResolverService, signService, logService
		));
		serviceCollection.set(IRemoteAgentService, remoteAgentService);

		// Files
		const fileService = this._register(new FileService(logService));
		serviceCollection.set(IFileService, fileService);

		// URI Identity
		const uriIdentityService = new UriIdentityService(fileService);
		serviceCollection.set(IUriIdentityService, uriIdentityService);

		// Configuration
		const configurationCache = new ConfigurationCache([Schemas.file, Schemas.vscodeUserData, Schemas.tmp], environmentService, fileService);
		const workspaceService = new WorkspaceService(
			{ remoteAuthority: undefined, configurationCache },
			environmentService, fileService, remoteAgentService, uriIdentityService,
			logService, new (await import('../../platform/policy/common/policy.js')).NullPolicyService()
		);
		serviceCollection.set(IWorkbenchConfigurationService, workspaceService);
		serviceCollection.set(IWorkspaceContextService, workspaceService);

		// Storage
		const storageService = this._register(new BrowserStorageService(
			{ id: 'sidex-workspace' }, logService
		));
		serviceCollection.set(IStorageService, storageService);

		await storageService.initialize();

		return [{ serviceCollection, logService }, null];
	}
}

export async function main(): Promise<void> {
	const tauriMain = new TauriMain();
	try {
		await tauriMain.open();
	} catch (error) {
		onUnexpectedError(error);
		console.error('[SideX] Failed to boot workbench:', error);
	}
}
