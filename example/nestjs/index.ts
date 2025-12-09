/**
 * NestJS LINE Login with PKCE Example
 *
 * 這個範例展示如何在 NestJS 專案中使用 @jetthai/passport-line-auth2
 * 實現 LINE 登入，包含 PKCE 支援，且不需要 express-session。
 */

// Stores
export { RedisPKCEStore } from './redis-pkce-store';

// Strategies
export { LineLoginStrategyService, LineLoginConfig, LineProfile, PKCEStore } from './line-login.strategy';

// Guards
export { ThirdPartyLoginGuard, SimpleLineLoginGuard } from './third-party-login.guard';

// Services
export { AuthService, LoginResult } from './auth.service';

// Controllers
export { AuthController, SimpleLineAuthController } from './auth.controller';

// Modules
export { AuthModule } from './auth.module';
