import { Request } from 'express';
import { StrategyOptions, StrategyOptionsWithRequest } from 'passport-oauth2';

/**
 * LINE 使用者資料
 */
export interface LineProfile {
	provider: 'line';
	id: string;
	displayName: string;
	pictureUrl?: string;
	_raw: string;
}

export const defaultOptions = {
	useAuthorizationHeaderforGET: true,
	authorizationURL: 'https://access.line.me/oauth2/v2.1/authorize',
	tokenURL: 'https://api.line.me/oauth2/v2.1/token',
	profileURL: 'https://api.line.me/v2/profile',
	scope: ['profile', 'openid'],
	botPrompt: null,
	uiLocales: null,
};

/**
 * PKCEStore.store 方法的回調函數類型
 * @param err - 錯誤物件，成功時為 null
 * @param handle - 可選的 handle（state 識別符），若不提供則使用傳入的 state
 */
export type StoreCallback = (err: Error | null, handle?: string) => void;

/**
 * PKCEStore.verify 方法的回調函數類型
 * @param err - 錯誤物件，成功時為 null
 * @param ok - code_verifier 字串，或 false 表示驗證失敗
 * @param state - 可選的 state 值
 */
export type VerifyCallback = (err: Error | null, ok?: string | false, state?: string) => void;

/**
 * PKCE Store 的 metadata
 */
export interface PKCEStoreMeta {
	authorizationURL: string;
	tokenURL: string;
	clientID: string;
}

/**
 * PKCE Store 介面
 * 用於儲存和取得 code_verifier 及 OAuth state
 * 介面設計與 passport-twitter-oauth2-typescript 一致
 *
 * 當使用自定義 store 時，Strategy 會同時使用此 store 來儲存：
 * 1. OAuth state（用於 CSRF 防護）
 * 2. PKCE code_verifier
 *
 * @example
 * ```typescript
 * class RedisPKCEStore implements PKCEStore {
 *   store(
 *     req: Request,
 *     verifier: string,
 *     state: string | null,
 *     meta: PKCEStoreMeta,
 *     callback: StoreCallback
 *   ): void {
 *     const key = state || crypto.randomBytes(16).toString('hex');
 *     redis.set(`pkce:${key}`, verifier, 'EX', 600)
 *       .then(() => callback(null, key))
 *       .catch(callback);
 *   }
 *
 *   verify(
 *     req: Request,
 *     providedState: string,
 *     callback: VerifyCallback
 *   ): void {
 *     redis.get(`pkce:${providedState}`)
 *       .then((verifier) => {
 *         if (verifier) {
 *           redis.del(`pkce:${providedState}`);
 *           callback(null, verifier, providedState);
 *         } else {
 *           callback(null, false);
 *         }
 *       })
 *       .catch(callback);
 *   }
 * }
 * ```
 */
export interface PKCEStore {
	/**
	 * 儲存 PKCE code_verifier 和 state
	 * @param req - Express request 物件
	 * @param verifier - PKCE code_verifier
	 * @param state - state 參數（可為 null）
	 * @param meta - metadata 物件，包含 authorizationURL、tokenURL、clientID
	 * @param callback - 完成回調，成功時呼叫 callback(null, handle)，失敗時呼叫 callback(error)
	 */
	store(req: Request, verifier: string, state: string | null, meta: PKCEStoreMeta, callback: StoreCallback): void;

	/**
	 * 驗證並取得 code_verifier
	 * @param req - Express request 物件
	 * @param providedState - 從授權伺服器返回的 state 參數
	 * @param callback - 完成回調，成功時呼叫 callback(null, verifier, state)，失敗時呼叫 callback(null, false)
	 */
	verify(req: Request, providedState: string, callback: VerifyCallback): void;
}

// 保留舊的類型別名以維持向後相容
/** @deprecated 請使用 StoreCallback */
export type PKCEStoreCallback = (err: Error | null) => void;
/** @deprecated 請使用 VerifyCallback */
export type PKCEVerifyCallback = (err: Error | null, codeVerifier?: string) => void;

/**
 * PKCE 配置選項
 */
export interface PKCEOptions {
	/**
	 * 是否啟用 PKCE（預設：true）
	 */
	enabled?: boolean;

	/**
	 * PKCE Store 實例，用於儲存 code_verifier
	 * 如果不提供，將使用 session 儲存
	 */
	store?: PKCEStore;
}

/**
 * LINE Strategy 專用選項
 */
interface LineSpecificOptions {
	/**
	 * LINE Channel ID
	 */
	channelID: string;
	/**
	 * LINE Channel Secret
	 */
	channelSecret: string;
	/**
	 * Bot prompt 設定，可選 'normal' 或 'aggressive'
	 */
	botPrompt?: string;
	/**
	 * OAuth scope，LINE 登入支援 'profile', 'openid', 'email'
	 */
	scope?: string[];
	/**
	 * UI 語系設定
	 */
	uiLocales?: string;
	/**
	 * 授權 URL（預設：LINE OAuth 2.1 URL）
	 */
	authorizationURL?: string;
	/**
	 * Token URL（預設：LINE OAuth 2.1 URL）
	 */
	tokenURL?: string;
	/**
	 * Profile URL（預設：LINE API v2 URL）
	 */
	profileURL?: string;
	/**
	 * Prompt 設定，設為 'consent' 強制顯示同意畫面
	 */
	prompt?: string;
	/**
	 * PKCE 配置
	 * 設為 true 啟用（使用 session 儲存）
	 * 設為 PKCEOptions 物件進行詳細配置（可提供自定義 store 如 Redis）
	 */
	pkce?: boolean | PKCEOptions;
}

// 需要從 passport-oauth2 排除的屬性（我們會自動設定或有不同類型）
type OmittedOAuth2Props = 'pkce' | 'scope' | 'clientID' | 'clientSecret' | 'authorizationURL' | 'tokenURL';

/**
 * LINE Strategy Options（不含 Request）
 */
export interface LineStrategyOptions extends Omit<StrategyOptions, OmittedOAuth2Props>, LineSpecificOptions {
	passReqToCallback?: false;
}

/**
 * LINE Strategy Options（含 Request）
 */
export interface LineStrategyOptionsWithRequest
	extends Omit<StrategyOptionsWithRequest, OmittedOAuth2Props>, LineSpecificOptions {
	passReqToCallback: true;
}
