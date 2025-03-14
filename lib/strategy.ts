import OAuth2Strategy, { InternalOAuthError, VerifyFunction, VerifyFunctionWithRequest } from 'passport-oauth2';
import { defaultOptions, LineStrategyOptions, LineStrategyOptionsWithRequest } from './options';
import { Request } from 'express';
import { LineAuthorizationError } from './errors';

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
		private readonly options: LineStrategyOptions | LineStrategyOptionsWithRequest,
		private readonly verify: VerifyFunction | VerifyFunctionWithRequest,
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
	 * 身份驗證方法
	 * @param req - HTTP 請求物件
	 * @param options - 可選的策略特定選項
	 */
	public authenticate(req: Request, options?: any): void {
		if (req.query && req.query.error_code && !req.query.error) {
			return this.error(
				new LineAuthorizationError(req.query.error_message as string, parseInt(req.query.error_code as string, 10)),
			);
		}

		super.authenticate(req, options);
	}

	/**
	 * 獲取用戶資料
	 * @param accessToken - 訪問令牌
	 * @param done - 回調函數，返回用戶資料或錯誤
	 */
	userProfile(accessToken: string, done: (err: Error | null, profile?: any) => void): void {
		const url = new URL(this._profileURL);

		this._oauth2.get(url.toString(), accessToken, (err: any, body: any, res: any) => {
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
}
