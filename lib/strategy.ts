import OAuth2Strategy, { InternalOAuthError, VerifyFunction, VerifyFunctionWithRequest } from 'passport-oauth2';
import { defaultOptions, LineStrategyOptions, LineStrategyOptionsWithRequest, PKCEStore } from './options';
import { Request } from 'express';
import { LineAuthorizationError } from './errors';
import * as crypto from 'crypto';
import * as url from 'url';

/**
 * 認證選項介面
 */
export interface AuthenticateOptions {
	scope?: string[] | string;
	state?: unknown;
	callbackURL?: string;
	failureRedirect?: string;
	failureMessage?: boolean;
	code_challenge?: string;
	code_challenge_method?: string;
	code_verifier?: string;
}

export class Strategy extends OAuth2Strategy {
	private readonly _profileURL: string;
	private readonly _botPrompt?: string;
	private readonly _prompt?: string;
	private readonly _uiLocales?: string;
	private readonly _useRealPKCE: boolean;
	// passport-oauth2 的屬性（未在類型中定義）
	declare _stateStore: PKCEStore;
	declare _callbackURL: string;
	declare _scope: string | string[];

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
		options.scope = options.scope || defaultOptions.scope;
		options.uiLocales = options.uiLocales ?? defaultOptions.uiLocales;

		// 設定預設 URL
		const authorizationURL = options.authorizationURL || defaultOptions.authorizationURL;
		const tokenURL = options.tokenURL || defaultOptions.tokenURL;
		(options as any).authorizationURL = authorizationURL;
		(options as any).tokenURL = tokenURL;

		// PKCE 設定（參考 Twitter 的實作方式）
		// 如果提供了自定義 store，使用真實 PKCE；否則使用假 PKCE bypass
		const pkceConfig = options.pkce;
		const hasCustomStore = pkceConfig && typeof pkceConfig === 'object' && pkceConfig.store;

		if (!hasCustomStore) {
			// 假 PKCE bypass：使用固定的 challenge/verifier
			// LINE 要求 PKCE，但如果沒有提供 store，我們使用簡化的方式
			type StoreCb = (err: Error | null, state?: string) => void;
			type VerifyCb = (err: Error | null, ok?: string | false, state?: string) => void;

			(options as any).store = {
				store: (_req: unknown, _verifier: string, _state: unknown, _meta: unknown, cb: StoreCb) => {
					cb(null, 'state');
				},
				verify: (_req: unknown, _state: string, cb: VerifyCb) => {
					cb(null, 'challenge', 'state');
				},
			};
		} else {
			// 使用真實 PKCE store
			(options as any).store = pkceConfig.store;
		}

		(options as any).pkce = true;
		(options as any).state = true;

		if (!options.botPrompt) {
			delete options.botPrompt;
		}
		if (!options.uiLocales) {
			delete options.uiLocales;
		}
		if (!options.prompt) {
			delete options.prompt;
		}

		// 使用 as any 繞過類型檢查
		if (options.passReqToCallback) {
			super(options as any, verify as VerifyFunctionWithRequest);
		} else {
			super(options as any, verify as VerifyFunction);
		}

		this.name = 'line';
		this._profileURL = options.profileURL || defaultOptions.profileURL;
		this._botPrompt = options.botPrompt;
		this._prompt = options.prompt;
		this._useRealPKCE = !!hasCustomStore;

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
	 * 返回授權請求的額外參數
	 * 當使用真實 PKCE（提供 custom store）時，passport-oauth2 會自動處理
	 * 當使用假 PKCE（無 custom store）時，返回固定的 code_challenge
	 */
	authorizationParams(_options?: AuthenticateOptions): object {
		const params: Record<string, string> = {};

		if (this._botPrompt === 'normal' || this._botPrompt === 'aggressive') {
			params.bot_prompt = this._botPrompt;
		}
		if (this._uiLocales) {
			params.ui_locales = this._uiLocales;
		}
		if (this._prompt === 'consent') {
			params.prompt = this._prompt;
		}

		if (!this._useRealPKCE) {
			// 假 PKCE bypass：使用固定的 challenge
			params.code_challenge = 'challenge';
			params.code_challenge_method = 'plain';
		}

		return params;
	}

	/**
	 * 返回 token 請求的額外參數
	 * 當使用真實 PKCE（提供 custom store）時，passport-oauth2 會自動處理
	 * 當使用假 PKCE（無 custom store）時，返回固定的 code_verifier
	 */
	tokenParams(_options?: AuthenticateOptions): object {
		if (!this._useRealPKCE) {
			// 假 PKCE bypass：使用固定的 verifier
			return {
				code_verifier: 'challenge',
			};
		}
		return {};
	}

	/**
	 * 身份驗證方法
	 * 當使用自定義 PKCEStore 並提供 string state 時，passport-oauth2 會跳過
	 * store.store() 呼叫，導致 PKCE verifier 未被儲存。此覆寫確保在使用真實
	 * PKCE 時 store 總是被呼叫。
	 *
	 * @param req - HTTP 請求物件
	 * @param options - 可選的策略特定選項
	 */
	public authenticate(req: Request, options?: AuthenticateOptions): void {
		// 處理 LINE 特有的錯誤格式
		if (req.query && req.query.error_code && !req.query.error) {
			return this.error(
				new LineAuthorizationError(req.query.error_message as string, parseInt(req.query.error_code as string, 10)),
			);
		}

		// 如果沒有使用真實 PKCE，或沒有提供 string state，使用預設行為
		if (!this._useRealPKCE || !options?.state || typeof options.state !== 'string') {
			return super.authenticate(req, options);
		}

		// 檢查是否為 callback（有 code 參數）
		const query = req.query as Record<string, unknown>;
		const body = req.body as Record<string, unknown>;
		const hasCode = query?.code || body?.code;
		if (hasCode) {
			// Callback phase：使用預設行為，verify 會被呼叫
			return super.authenticate(req, options);
		}

		// Authorization phase：使用 string state 和真實 PKCE
		// 需要手動處理 PKCE，因為 passport-oauth2 在 state 為 string 時會跳過 store.store()
		const stateStore = this._stateStore;
		const customState = options.state;

		// 取得 _oauth2 的受保護屬性
		const oauth2 = this._oauth2 as unknown as {
			_authorizeUrl: string;
			_accessTokenUrl: string;
			_clientId: string;
		};
		const res = (req as unknown as { res?: { headersSent?: boolean } }).res || undefined;
		let responded = false;

		// 生成 PKCE verifier 和 challenge（S256 方法）
		const { codeVerifier, codeChallenge } = Strategy.generatePKCE();

		const meta = {
			authorizationURL: oauth2._authorizeUrl,
			tokenURL: oauth2._accessTokenUrl,
			clientID: oauth2._clientId,
		};

		// 呼叫 store 儲存 verifier
		stateStore.store(req, codeVerifier, customState, meta, (err, handle) => {
			if (responded) {
				return;
			}
			responded = true;

			if (err) {
				return this.error(err);
			}

			// 建構帶有 PKCE 參數的授權 URL
			const params = this.authorizationParams(options) as Record<string, string>;
			params.response_type = 'code';
			params.code_challenge = codeChallenge;
			params.code_challenge_method = 'S256';
			params.state = handle || customState;

			// 處理 callback URL
			const callbackURL = options.callbackURL || this._callbackURL;
			if (callbackURL) {
				params.redirect_uri = callbackURL;
			}

			// 處理 scope
			const scope = options.scope || this._scope;
			if (scope) {
				params.scope = Array.isArray(scope) ? scope.join(' ') : scope;
			}

			// 建構授權 URL
			const parsed = url.parse(oauth2._authorizeUrl, true);
			Object.assign(parsed.query, params);
			parsed.query['client_id'] = oauth2._clientId;
			delete parsed.search;
			const location = url.format(parsed);

			// 如果 header 已經被上游 middleware 發送，不要再重定向
			if (res?.headersSent) {
				return;
			}

			this.redirect(location);
		});
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
}
