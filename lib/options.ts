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
 * PKCE Store 介面
 * 用於儲存和取得 code_verifier
 */
export interface PKCEStore {
	/**
	 * 儲存 code_verifier
	 * @param state - OAuth state 參數，用作 key
	 * @param codeVerifier - PKCE code_verifier
	 * @param callback - 完成回調
	 */
	store(state: string, codeVerifier: string, callback: (err: Error) => void): void;

	/**
	 * 取得並刪除 code_verifier
	 * @param state - OAuth state 參數
	 * @param callback - 回調，返回 code_verifier
	 */
	verify(state: string, callback: (err: Error, codeVerifier?: string) => void): void;
}

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
