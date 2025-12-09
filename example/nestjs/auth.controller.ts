import { Controller, Get, Req, Res, Next, Param, Query, UseGuards } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { ThirdPartyLoginGuard } from './third-party-login.guard';

/**
 * 第三方登入 Controller
 *
 * 路由：
 * - GET /auth/:site/login?provider=line&redirectURI=xxx  - 發起登入
 * - GET /auth/:site/callback?provider=line               - 登入回調
 */
@Controller('auth')
export class AuthController {
	/**
	 * 發起第三方登入
	 *
	 * @example
	 * GET /auth/my-site/login?provider=line&redirectURI=https://example.com/callback
	 */
	@Get(':site/login')
	@UseGuards(ThirdPartyLoginGuard)
	async login(
		@Param('site') site: string,
		@Query('provider') provider: string,
		@Req() req: Request,
		@Res() res: Response,
		@Next() next: NextFunction,
	): Promise<void> {
		const strategyName = `${provider}-${site}`;

		// 發起 OAuth 認證
		// PKCE 會在 Strategy 內部自動處理
		passport.authenticate(strategyName, {
			// 可以傳入額外的 scope
			// scope: ['profile', 'openid', 'email'],
		})(req, res, next);
	}

	/**
	 * 第三方登入回調
	 *
	 * @example
	 * GET /auth/my-site/callback?provider=line&code=xxx&state=xxx
	 */
	@Get(':site/callback')
	@UseGuards(ThirdPartyLoginGuard)
	async callback(
		@Param('site') site: string,
		@Query('provider') provider: string,
		@Query('redirectURI') redirectURI: string,
		@Req() req: Request,
		@Res() res: Response,
		@Next() next: NextFunction,
	): Promise<void> {
		const strategyName = `${provider}-${site}`;

		// 處理 OAuth 回調
		// PKCE code_verifier 會在 Strategy 內部自動從 store 取得
		passport.authenticate(strategyName, (err: Error, user: any, info: any) => {
			const url = new URL(redirectURI);

			if (err) {
				console.error('OAuth error:', err);
				url.searchParams.set('error', err.message || 'authentication_failed');
				return res.redirect(url.toString());
			}

			if (!user) {
				console.error('No user returned:', info);
				url.searchParams.set('error', 'user_not_found');
				return res.redirect(url.toString());
			}

			// 成功：將 token 或使用者資訊傳回前端
			if (user.token) {
				url.searchParams.set('token', user.token);
			}
			url.searchParams.set('userId', user.id);

			return res.redirect(url.toString());
		})(req, res, next);
	}
}
