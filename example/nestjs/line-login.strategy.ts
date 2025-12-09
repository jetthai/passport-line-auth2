import { Injectable } from '@nestjs/common';
import { Strategy, LineStrategyOptionsWithRequest, PKCEStore, LineProfile } from '../../lib';
import type { Request } from 'express';

export { LineProfile, PKCEStore };

export interface LineLoginConfig {
	channelID: string;
	channelSecret: string;
	callbackURL: string;
	scope?: string[];
}

/**
 * LINE 登入策略 Service（含 PKCE + 自定義 StateStore）
 *
 * 當傳入 pkceStore 時：
 * - 不需要 express-session
 * - state 和 code_verifier 都會儲存在 pkceStore 中
 */
@Injectable()
export class LineLoginStrategyService extends Strategy {
	constructor(
		config: LineLoginConfig,
		callback: (
			req: Request,
			accessToken: string,
			refreshToken: string,
			profile: LineProfile,
			done: (error: Error | null, user?: object, info?: object) => void,
		) => void,
		pkceStore?: PKCEStore,
	) {
		const options: LineStrategyOptionsWithRequest = {
			passReqToCallback: true,
			channelID: config.channelID,
			channelSecret: config.channelSecret,
			callbackURL: config.callbackURL,
			scope: config.scope || ['profile', 'openid'],
			// 使用自定義 store 時，同時處理 state 和 PKCE
			pkce: pkceStore ? { enabled: true, store: pkceStore } : true,
		};
		super(options, callback);
	}
}
