import { CanActivate, ExecutionContext, Injectable, BadRequestException, Inject } from '@nestjs/common';
import type { Request } from 'express';
import passport from 'passport';
import { PKCEStore } from '../../lib';
import { LineLoginStrategyService, LineLoginConfig } from './line-login.strategy';
import { AuthService } from './auth.service';

/**
 * 設定服務介面
 * 根據你的專案實作
 */
interface ConfigService {
	getLineConfig(site: string): LineLoginConfig;
}

/**
 * 第三方登入驗證 Guard
 *
 * 功能：
 * 1. 驗證請求參數
 * 2. 根據 site 取得對應的 LINE 設定
 * 3. 創建並註冊 LINE 登入策略到 passport
 */
@Injectable()
export class ThirdPartyLoginGuard implements CanActivate {
	constructor(
		@Inject('CONFIG_SERVICE') private readonly configService: ConfigService,
		@Inject('PKCE_STORE') private readonly pkceStore: PKCEStore,
		private readonly authService: AuthService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request: Request = context.switchToHttp().getRequest();
		const site = request.params.site;
		const provider = request.query.provider as string;

		// 驗證必要參數
		if (!site) {
			throw new BadRequestException('site parameter is required');
		}

		// 根據 provider 創建對應的策略
		if (provider === 'line') {
			await this.setupLineStrategy(site);
		} else {
			throw new BadRequestException(`Unsupported provider: ${provider}`);
		}

		return true;
	}

	/**
	 * 設定 LINE 登入策略
	 */
	private async setupLineStrategy(site: string): Promise<void> {
		const config = this.configService.getLineConfig(site);
		const strategyName = `line-${site}`;

		// 檢查策略是否已存在
		try {
			passport.unuse(strategyName);
		} catch {
			// 策略不存在，忽略錯誤
		}

		// 創建新的 LINE 登入策略
		const strategy = new LineLoginStrategyService(
			config,
			this.authService.createLineVerifyCallback(),
			this.pkceStore,
		);

		// 註冊策略
		passport.use(strategyName, strategy);
	}
}

/**
 * 簡化版 Guard（適用於單一站點）
 */
@Injectable()
export class SimpleLineLoginGuard implements CanActivate {
	constructor(
		@Inject('LINE_CONFIG') private readonly lineConfig: LineLoginConfig,
		@Inject('PKCE_STORE') private readonly pkceStore: PKCEStore,
		private readonly authService: AuthService,
	) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const strategyName = 'line';

		// 檢查策略是否已存在
		try {
			passport.unuse(strategyName);
		} catch {
			// 忽略
		}

		const strategy = new LineLoginStrategyService(
			this.lineConfig,
			this.authService.createLineVerifyCallback(),
			this.pkceStore,
		);

		passport.use(strategyName, strategy);
		return true;
	}
}
