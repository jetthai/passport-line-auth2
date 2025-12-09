import { Controller, Get, Req, Res, Next, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { ThirdPartyLoginGuard } from './third-party-login.guard';

/**
 * 認證 Controller
 *
 * 路由：
 * - GET /auth/:site/login?provider=line&redirectURI=xxx  - 發起登入
 * - GET /auth/:site/callback?provider=line               - 登入回調
 *
 * 範例：
 * - GET /auth/my-site/login?provider=line&redirectURI=https://example.com/done
 * - GET /auth/my-site/callback?provider=line&code=xxx&state=xxx
 */
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	/**
	 * 發起第三方登入
	 *
	 * @param site - 站點名稱（用於取得對應的 LINE 設定）
	 * @param provider - 登入提供者（line, google, facebook 等）
	 * @param redirectURI - 登入完成後的重定向 URI
	 */
	@Get(':site/login')
	@UseGuards(ThirdPartyLoginGuard)
	login(
		@Param('site') site: string,
		@Query('provider') provider: string,
		@Query('redirectURI') redirectURI: string,
		@Req() req: Request,
		@Res() res: Response,
		@Next() next: NextFunction,
	): void {
		if (!redirectURI) {
			throw new BadRequestException('redirectURI is required');
		}

		// 將 redirectURI 存入 session 或其他地方（供 callback 使用）
		// 這裡簡單地存入 query 參數
		const strategyName = `${provider}-${site}`;

		this.authService.initiateLogin(strategyName, req, res, next);
	}

	/**
	 * 第三方登入回調
	 *
	 * LINE 會將使用者重定向回這個 URL，帶有 code 和 state 參數
	 */
	@Get(':site/callback')
	@UseGuards(ThirdPartyLoginGuard)
	async callback(
		@Param('site') site: string,
		@Query('provider') provider: string,
		@Query('redirectURI') redirectURI: string,
		@Query('state') state: string,
		@Req() req: Request,
		@Res() res: Response,
		@Next() next: NextFunction,
	): Promise<void> {
		// 從 state 或其他地方取得 redirectURI
		// 這裡假設 redirectURI 是透過 query 參數傳入
		const finalRedirectURI = redirectURI || 'https://example.com/login-result';

		const strategyName = `${provider}-${site}`;

		const redirectUrl = await this.authService.handleCallback(
			strategyName,
			finalRedirectURI,
			req,
			res,
			next,
		);

		res.redirect(redirectUrl);
	}
}

/**
 * 簡化版 Controller（適用於單一站點）
 *
 * 路由：
 * - GET /auth/line/login?redirectURI=xxx
 * - GET /auth/line/callback
 */
@Controller('auth/line')
export class SimpleLineAuthController {
	constructor(private readonly authService: AuthService) {}

	@Get('login')
	// @UseGuards(SimpleLineLoginGuard)  // 取消註解以使用
	login(
		@Query('redirectURI') redirectURI: string,
		@Req() req: Request,
		@Res() res: Response,
		@Next() next: NextFunction,
	): void {
		if (!redirectURI) {
			throw new BadRequestException('redirectURI is required');
		}

		this.authService.initiateLogin('line', req, res, next);
	}

	@Get('callback')
	// @UseGuards(SimpleLineLoginGuard)  // 取消註解以使用
	async callback(
		@Query('redirectURI') redirectURI: string,
		@Req() req: Request,
		@Res() res: Response,
		@Next() next: NextFunction,
	): Promise<void> {
		const finalRedirectURI = redirectURI || 'https://example.com/login-result';

		const redirectUrl = await this.authService.handleCallback(
			'line',
			finalRedirectURI,
			req,
			res,
			next,
		);

		res.redirect(redirectUrl);
	}
}
