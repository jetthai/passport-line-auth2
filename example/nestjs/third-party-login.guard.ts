import { CanActivate, ExecutionContext, Injectable, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import passport from 'passport';
import { LineLoginStrategyService, LineLoginConfig, LineProfile } from './line-login.strategy';
import { RedisPKCEStore } from './redis-pkce-store';

/**
 * 登入設定服務介面
 */
interface ConfigService {
	getLineConfig(site: string): LineLoginConfig;
}

/**
 * Redis 服務介面
 */
interface RedisService {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSeconds?: number): Promise<void>;
	del(key: string): Promise<void>;
}

/**
 * 第三方登入驗證 Guard
 *
 * 這個 Guard 會：
 * 1. 驗證請求參數
 * 2. 根據 provider 創建對應的登入策略
 * 3. 註冊策略到 passport
 */
@Injectable()
export class ThirdPartyLoginGuard implements CanActivate {
	private readonly redisPKCEStore: RedisPKCEStore;

	constructor(
		private readonly configService: ConfigService,
		private readonly redisService: RedisService,
	) {
		this.redisPKCEStore = new RedisPKCEStore(redisService);
	}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request: Request = context.switchToHttp().getRequest();
		const provider = request.query.provider as string;
		const site = request.params.site as string;
		const redirectURI = request.query.redirectURI as string;

		// 驗證必要參數
		if (!provider) {
			throw new BadRequestException('provider is required');
		}
		if (!site) {
			throw new BadRequestException('site is required');
		}
		if (!redirectURI) {
			throw new BadRequestException('redirectURI is required');
		}

		// 根據 provider 創建對應的策略
		if (provider === 'line') {
			const config = this.configService.getLineConfig(site);
			const strategy = this.createLineStrategy(config);
			const strategyName = `line-${site}`;
			passport.use(strategyName, strategy);
		}
		// 可以在這裡加入其他 provider（google, facebook 等）

		return true;
	}

	/**
	 * 創建 LINE 登入策略
	 */
	private createLineStrategy(config: LineLoginConfig): LineLoginStrategyService {
		return new LineLoginStrategyService(
			config,
			(req, accessToken, refreshToken, profile, done) => {
				// 驗證回調：處理使用者資料
				this.handleLineCallback(req, accessToken, refreshToken, profile, done);
			},
			this.redisPKCEStore, // 使用 Redis 儲存 PKCE
		);
	}

	/**
	 * 處理 LINE 登入回調
	 */
	private handleLineCallback(
		req: Request,
		accessToken: string,
		refreshToken: string,
		profile: LineProfile,
		done: (error: Error | null, user?: object, info?: object) => void,
	): void {
		try {
			// 在這裡處理使用者資料
			// 例如：查找或創建使用者、生成 JWT 等

			const user = {
				id: profile.id,
				displayName: profile.displayName,
				pictureUrl: profile.pictureUrl,
				provider: 'line',
				accessToken,
				// 可以在這裡加入 JWT token
				// token: this.jwtService.sign({ sub: profile.id }),
			};

			done(null, user);
		} catch (error) {
			done(error as Error);
		}
	}
}
