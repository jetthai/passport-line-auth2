import OAuth2Strategy, { InternalOAuthError, VerifyFunction, VerifyFunctionWithRequest } from 'passport-oauth2';
import { defaultOptions, LineStrategyOptions, LineStrategyOptionsWithRequest, PKCEStore } from './options';
import { Request } from 'express';
import { LineAuthorizationError } from './errors';
import * as crypto from 'crypto';

/**
 * 基於 PKCEStore 的 StateStore 包裝器
 * 讓 passport-oauth2 的 state 也使用相同的 store（如 Redis）
 */
class PKCEStateStore {
	private readonly keyPrefix = 'state:';

	constructor(private readonly pkceStore: PKCEStore) {}

	store(req: Request, callback: (err: Error | null, state: string) => void): void {
		const state = crypto.randomBytes(24).toString('hex');
		// 使用 PKCEStore 儲存 state（用 state 作為 key 和 value）
		this.pkceStore.store(this.keyPrefix + state, state, (err) => {
			if (err) {
				return callback(err, '');
			}
			callback(null, state);
		});
	}

	verify(
		req: Request,
		providedState: string,
		callback: (err: Error | null, ok: boolean, state?: string) => void,
	): void {
		this.pkceStore.verify(this.keyPrefix + providedState, (err, storedState) => {
			if (err) {
				return callback(err, false);
			}
			if (!storedState || storedState !== providedState) {
				return callback(null, false);
			}
			callback(null, true, providedState);
		});
	}
}

export class Strategy extends OAuth2Strategy {
	private readonly _profileURL: string;
	private readonly _clientId: string;
	private readonly _clientSecret: string;
	private readonly _botPrompt?: string;
	private readonly _prompt?: string;
	private readonly _uiLocales?: string;
	private readonly _pkceEnabled: boolean;
	private readonly _pkceStore?: PKCEStore;
	private readonly _pkceSessionKey: string;

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

		// 設定 passport-oauth2 需要的 clientID 和 clientSecret
		(options as any).clientID = options.channelID;
		(options as any).clientSecret = options.channelSecret;

		options.scopeSeparator = '';
		options.botPrompt = options.botPrompt ?? defaultOptions.botPrompt;

		// 判斷是否使用自定義 PKCEStore
		const pkceConfig = options.pkce;
		const hasCustomStore = pkceConfig && typeof pkceConfig === 'object' && pkceConfig.store;

		// 如果有自定義 store，使用 PKCEStateStore；否則使用 session (state: true)
		if (hasCustomStore) {
			(options as any).store = new PKCEStateStore(pkceConfig.store);
			(options as any).state = undefined; // 不使用內建的 session state
		} else {
			(options as any).state = true; // 使用 session
		}
		options.scope = options.scope || defaultOptions.scope;
		options.uiLocales = options.uiLocales ?? defaultOptions.uiLocales;

		// 設定預設 URL
		(options as any).authorizationURL = options.authorizationURL || defaultOptions.authorizationURL;
		(options as any).tokenURL = options.tokenURL || defaultOptions.tokenURL;

		if (!options.botPrompt) {
			delete options.botPrompt;
		}
		if (!options.uiLocales) {
			delete options.uiLocales;
		}
		if (!options.prompt) {
			delete options.prompt;
		}

		// 使用 as any 繞過類型檢查，因為我們擴展了 pkce 的類型
		if (options.passReqToCallback) {
			super(options as any, verify as VerifyFunctionWithRequest);
		} else {
			super(options as any, verify as VerifyFunction);
		}
		this.name = 'line';
		this._profileURL = options.profileURL || defaultOptions.profileURL;
		this._clientId = options.channelID;
		this._clientSecret = options.channelSecret;
		this._botPrompt = options.botPrompt;
		this._prompt = options.prompt;

		if (options.uiLocales) {
			this._uiLocales = options.uiLocales;
		}

		// PKCE 配置
		this._pkceSessionKey = 'line:pkce';
		if (options.pkce === true) {
			this._pkceEnabled = true;
			this._pkceStore = undefined; // 使用 session
		} else if (options.pkce && typeof options.pkce === 'object') {
			const pkceOptions = options.pkce;
			this._pkceEnabled = pkceOptions.enabled !== false;
			this._pkceStore = pkceOptions.store;
		} else {
			this._pkceEnabled = false;
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
	 * 當啟用 PKCE 時 (pkce: true 或 pkce: { enabled: true })：
	 *   - Authorization phase: 自動生成並儲存 code_verifier，傳送 code_challenge
	 *   - Callback phase: 自動取得 code_verifier 並用於 token 交換
	 *
	 * 手動 PKCE 模式 (未啟用自動 PKCE)：
	 *   - Authorization phase: 需傳入 options.code_challenge
	 *   - Callback phase: 需傳入 options.code_verifier
	 */
	public authenticate(req: Request, options?: any): void {
		if (req.query && req.query.error_code && !req.query.error) {
			return this.error(
				new LineAuthorizationError(req.query.error_message as string, parseInt(req.query.error_code as string, 10)),
			);
		}

		options = options || {};

		const isCallbackPhase = req.query && req.query.code;

		if (this._pkceEnabled) {
			if (isCallbackPhase) {
				// Callback phase: 取得 code_verifier
				this._getCodeVerifier(req, (err, codeVerifier) => {
					if (err) {
						return this.error(err);
					}
					if (!codeVerifier) {
						return this.error(new Error('PKCE code_verifier not found. Session may have expired.'));
					}
					options.code_verifier = codeVerifier;
					super.authenticate(req, options);
				});
				return;
			} else {
				// Authorization phase: 生成 PKCE 並儲存
				const { codeVerifier, codeChallenge } = Strategy.generatePKCE();
				options.code_challenge = codeChallenge;
				options.code_challenge_method = 'S256';

				// 儲存 code_verifier
				this._storeCodeVerifier(req, codeVerifier, (err) => {
					if (err) {
						return this.error(err);
					}
					super.authenticate(req, options);
				});
				return;
			}
		}

		// 手動 PKCE 模式或未啟用 PKCE
		if (!isCallbackPhase && options.code_challenge) {
			options.code_challenge_method = 'S256';
		}

		super.authenticate(req, options);
	}

	/**
	 * 儲存 code_verifier
	 */
	private _storeCodeVerifier(req: Request, codeVerifier: string, callback: (err: Error) => void): void {
		if (this._pkceStore) {
			// 使用自定義 store（如 Redis）
			// 從 req 取得 state 或生成新的
			const state = (req.query?.state as string) || crypto.randomBytes(16).toString('hex');
			this._pkceStore.store(state, codeVerifier, callback);
		} else {
			// 使用 session
			const session = (req as any).session;
			if (!session) {
				return callback(
					new Error('PKCE requires session support. Please configure express-session or provide a custom pkce.store.'),
				);
			}
			if (!session[this._pkceSessionKey]) {
				session[this._pkceSessionKey] = {};
			}
			session[this._pkceSessionKey].codeVerifier = codeVerifier;
			callback(null);
		}
	}

	/**
	 * 取得並清除 code_verifier
	 */
	private _getCodeVerifier(req: Request, callback: (err: Error, codeVerifier?: string) => void): void {
		const state = req.query?.state as string;

		if (this._pkceStore) {
			// 使用自定義 store（如 Redis）
			if (!state) {
				return callback(new Error('State parameter is required for PKCE verification.'));
			}
			this._pkceStore.verify(state, callback);
		} else {
			// 使用 session
			const session = (req as any).session;
			if (!session) {
				return callback(new Error('PKCE requires session support.'));
			}
			const pkceData = session[this._pkceSessionKey];
			if (!pkceData || !pkceData.codeVerifier) {
				return callback(null, undefined);
			}
			const codeVerifier = pkceData.codeVerifier;
			// 清除已使用的 code_verifier
			delete session[this._pkceSessionKey];
			callback(null, codeVerifier);
		}
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
