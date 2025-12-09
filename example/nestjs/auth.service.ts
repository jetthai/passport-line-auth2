import { Injectable, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { LineProfile } from '../../lib';

/**
 * 登入結果介面
 */
export interface LoginResult {
	success: boolean;
	user?: {
		id: string;
		displayName: string;
		pictureUrl?: string;
		provider: string;
		accessToken: string;
	};
	error?: string;
}

/**
 * 認證服務
 */
@Injectable()
export class AuthService {
	private readonly logger = new Logger(AuthService.name);

	/**
	 * 發起第三方登入
	 */
	initiateLogin(strategyName: string, req: Request, res: Response, next: NextFunction): void {
		passport.authenticate(strategyName)(req, res, next);
	}

	/**
	 * 處理第三方登入回調
	 */
	async handleCallback(
		strategyName: string,
		redirectURI: string,
		req: Request,
		res: Response,
		next: NextFunction,
	): Promise<string> {
		return new Promise((resolve, reject) => {
			passport.authenticate(
				strategyName,
				(err: Error | null, user: LoginResult['user'], info: any) => {
					const url = new URL(redirectURI);

					if (err) {
						this.logger.error(`Login error: ${err.message}`, err.stack);
						url.searchParams.set('error', err.message || 'authentication_failed');
						return resolve(url.toString());
					}

					if (!user) {
						this.logger.warn(`No user returned: ${JSON.stringify(info)}`);
						url.searchParams.set('error', 'user_not_found');
						return resolve(url.toString());
					}

					this.logger.log(`User logged in: ${user.id}`);

					// 成功：將使用者資訊加入 URL
					url.searchParams.set('userId', user.id);
					url.searchParams.set('displayName', user.displayName);
					if (user.accessToken) {
						url.searchParams.set('token', user.accessToken);
					}

					resolve(url.toString());
				},
			)(req, res, next);
		});
	}

	/**
	 * LINE 登入的驗證回調函數
	 * 用於 passport strategy 的 verify callback
	 */
	createLineVerifyCallback() {
		return (
			req: Request,
			accessToken: string,
			refreshToken: string,
			profile: LineProfile,
			done: (error: Error | null, user?: LoginResult['user'], info?: object) => void,
		) => {
			try {
				// 在這裡處理使用者資料
				// 例如：查找或創建使用者、生成 JWT 等
				const user: LoginResult['user'] = {
					id: profile.id,
					displayName: profile.displayName,
					pictureUrl: profile.pictureUrl,
					provider: 'line',
					accessToken,
				};

				// TODO: 在這裡加入你的業務邏輯
				// 例如：
				// const dbUser = await this.userService.findOrCreate(profile);
				// const jwtToken = await this.jwtService.sign({ sub: dbUser.id });
				// user.token = jwtToken;

				done(null, user);
			} catch (error) {
				done(error as Error);
			}
		};
	}
}
