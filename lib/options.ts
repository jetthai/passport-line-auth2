import {StrategyOptions, StrategyOptionsWithRequest} from 'passport-oauth2';

export const defaultOptions = {
	useAuthorizationHeaderforGET: true,
	authorizationURL: 'https://access.line.me/oauth2/v2.1/authorize',
	tokenURL: 'https://api.line.me/oauth2/v2.1/token',
	profileURL: 'https://api.line.me/v2/profile',
	scope: ['profile', 'openid'],
	botPrompt: null,
	uiLocales: null,
};

export type LineStrategyOptions = {
	channelID: string;
	channelSecret: string;
	botPrompt?: string;
	scope?: string[];
	uiLocales?: string;
	authorizationURL?: string;
	tokenURL?: string;
	profileURL?: string;
	prompt?: string;
} & StrategyOptionsWithRequest;
