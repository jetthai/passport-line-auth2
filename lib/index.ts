// Load modules.
export { Strategy, AuthenticateOptions } from './strategy';
export { LineAuthorizationError } from './errors';
export {
	LineStrategyOptions,
	LineStrategyOptionsWithRequest,
	PKCEStore,
	PKCEStoreMeta,
	StoreCallback,
	VerifyCallback,
	PKCEOptions,
	LineProfile,
	// 向後相容的類型別名
	PKCEStoreCallback,
	PKCEVerifyCallback,
} from './options';
