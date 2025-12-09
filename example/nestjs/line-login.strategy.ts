import { Injectable } from '@nestjs/common';
import { Strategy, LineStrategyOptionsWithRequest, PKCEStore } from '@jetthai/passport-line-auth2';
import type { Request } from 'express';

/**
 * LINE 使用者資料
 */
export interface LineProfile {
	provider: 'line';
	id: string;
	displayName: string;
	pictureUrl?: string;
}

/**
 * LINE 登入設定介面
 */
export interface LineLoginConfig {
	channelID: string;
	channelSecret: string;
	callbackURL: string;
	scope?: string[];
}

/**
 * LINE 登入策略 Service
 *
 * 使用方式：
 * ```typescript
 * // 在 Guard 或 Provider 中創建
 * const strategy = new LineLoginStrategyService(
 *   lineConfig,
 *   verifyCallback,
 *   redisPKCEStore, // 可選，若不傳則使用 session
 * );
 * passport.use('line-siteName', strategy);
 * ```
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
			// PKCE 配置：如果有傳入 store 則使用，否則使用 session
			pkce: pkceStore ? { enabled: true, store: pkceStore } : true,
		};
		super(options, callback);
	}
}

/**
 * 不使用 PKCE 的版本（向後兼容）
 */
@Injectable()
export class LineLoginStrategyWithoutPKCE extends Strategy {
	constructor(
		config: LineLoginConfig,
		callback: (
			req: Request,
			accessToken: string,
			refreshToken: string,
			profile: LineProfile,
			done: (error: Error | null, user?: object, info?: object) => void,
		) => void,
	) {
		const options: LineStrategyOptionsWithRequest = {
			passReqToCallback: true,
			channelID: config.channelID,
			channelSecret: config.channelSecret,
			callbackURL: config.callbackURL,
			scope: config.scope || ['profile', 'openid'],
			// 不啟用 PKCE
			pkce: false,
		};
		super(options, callback);
	}
}
