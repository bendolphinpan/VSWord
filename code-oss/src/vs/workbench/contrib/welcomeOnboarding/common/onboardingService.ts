/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IOnboardingService = createDecorator<IOnboardingService>('onboardingService');

export interface IOnboardingService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires when the onboarding modal is dismissed.
	 */
	readonly onDidDismiss: Event<void>;

	/**
	 * Show the onboarding modal.
	 */
	show(): void;
}

export class NullOnboardingService extends Disposable implements IOnboardingService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidDismiss = this._register(new Emitter<void>());
	readonly onDidDismiss: Event<void> = this._onDidDismiss.event;

	show(): void {
		this._onDidDismiss.fire();
	}
}
