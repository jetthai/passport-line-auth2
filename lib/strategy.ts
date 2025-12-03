import OAuth2Strategy, { InternalOAuthError, VerifyFunction, VerifyFunctionWithRequest } from 'passport-oauth2';
import { defaultOptions, LineStrategyOptions, LineStrategyOptionsWithRequest } from './options';
import { Request } from 'express';
import { LineAuthorizationError } from './errors';
import * as crypto from 'crypto';

export class Strategy extends OAuth2Strategy {
	private readonly _profileURL: string;
	private readonly _clientId: string;
	private readonly _clientSecret: string;
	private readonly _botPrompt?: string;
	private readonly _prompt?: string;
	private readonly _uiLocales?: string;

	constructor(options: LineStrategyOptions, verify: VerifyFunction);
	constructor(options: LineStrategyOptionsWithRequest, verify: VerifyFunctionWithRequest);

	constructor(
		options: LineStrategyOptions | LineStrategyOptionsWithRequest,
		verify: VerifyFunction | VerifyFunctionWithRequest,
	) {
		if (!options) {
			throw new TypeError('Options must be setting.');
		}
		if (!options.channelID) {
			throw new TypeError("Channel's Id must be setting.");
		}
		if (!options.channelSecret) {
			throw new TypeError("Channel's Secret must be setting.");
		}
		options.scopeSeparator = '';
		options.state = true;
		options.botPrompt = options.botPrompt || defaultOptions.botPrompt;
		options.scope = options.scope || defaultOptions.scope;
		options.uiLocales = options.uiLocales || defaultOptions.uiLocales;

		options.authorizationURL = options.authorizationURL || defaultOptions.authorizationURL;
		options.tokenURL = options.tokenURL || defaultOptions.tokenURL;

		if (!options.botPrompt) {
			delete options.botPrompt;
		}
		if (!options.uiLocales) {
			delete options.uiLocales;
		}
		if (!options.prompt) {
			delete options.prompt;
		}

		if (options.passReqToCallback) {
			super(options, verify as VerifyFunctionWithRequest);
		} else {
			super(options as LineStrategyOptions, verify as VerifyFunction);
		}
		this.name = 'line';
		this._profileURL = options.profileURL || defaultOptions.profileURL;
		this._clientId = options.clientID;
		this._clientSecret = options.clientSecret;
		this._botPrompt = options.botPrompt;
		this._prompt = options.prompt;

		if (options.uiLocales) {
			this._uiLocales = options.uiLocales;
		}

		this._oauth2.useAuthorizationHeaderforGET(defaultOptions.useAuthorizationHeaderforGET);
	}

	/**
	 * 生成 PKCE 參數
	 * @returns 包含 codeVerifier 和 codeChallenge 的物件
	 */
	public static generatePKCE(): { codeVerifier: string; codeChallenge: string } {
		const codeVerifier = crypto.randomBytes(32).toString('base64url');
		const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
		return { codeVerifier, codeChallenge };
	}

	/**
	 * 身份驗證方法
	 * @param req - HTTP 請求物件
	 * @param options - 可選的策略特定選項
	 *
	 * Authorization phase (無 code):
	 *   需傳入 options.code_challenge (可用 Strategy.generatePKCE() 生成)
	 *
	 * Callback phase (有 code):
	 *   需傳入 options.code_verifier (從 Redis 取得)
	 */
	public authenticate(req: Request, options?: any): void {
		if (req.query && req.query.error_code && !req.query.error) {
			return this.error(
				new LineAuthorizationError(req.query.error_message as string, parseInt(req.query.error_code as string, 10)),
			);
		}

		options = options || {};

		if (req.query && req.query.code) {
			// Callback phase: code_verifier 應由呼叫者透過 options.code_verifier 傳入
		} else {
			// Authorization phase: 設定 code_challenge_method
			if (options.code_challenge) {
				options.code_challenge_method = 'S256';
			}
		}

		super.authenticate(req, options);
	}

	/**
	 * 獲取用戶資料
	 * @param accessToken - 訪問令牌
	 * @param done - 回調函數，返回用戶資料或錯誤
	 */
	userProfile(accessToken: string, done: (err: Error, profile?: any) => void): void {
		const url = new URL(this._profileURL);

		this._oauth2.get(url.toString(), accessToken, (err: any, body: any) => {
			if (err) {
				return done(new InternalOAuthError('Failed to fetch user profile', err));
			}

			try {
				const json = JSON.parse(body);

				const profile = {
					provider: 'line',
					id: json.userId,
					displayName: json.displayName,
					pictureUrl: json.pictureUrl,
					_raw: body,
				};

				done(null, profile);
			} catch (e) {
				done(e);
			}
		});
	}

	/**
	 * 授權參數
	 * @param _options - 可選的選項
	 * @returns 授權參數物件
	 */
	authorizationParams(_options: any): any {
		const options = { ...(_options || {}) };

		if (this._botPrompt === 'normal' || this._botPrompt === 'aggressive') {
			options.bot_prompt = this._botPrompt;
		}
		if (this._uiLocales) {
			options.ui_locales = this._uiLocales;
		}
		if (this._prompt === 'consent') {
			options.prompt = this._prompt;
		} else {
			delete options.prompt;
		}

		return options;
	}

	/**
	 * Token 請求參數
	 * @param options - 可選的選項
	 * @returns Token 請求參數物件
	 */
	tokenParams(options: any): any {
		const params: any = {};

		if (options && options.code_verifier) {
			params.code_verifier = options.code_verifier;
		}

		return params;
	}
}
