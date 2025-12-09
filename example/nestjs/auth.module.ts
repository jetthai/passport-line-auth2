import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ThirdPartyLoginGuard } from './third-party-login.guard';
import { RedisPKCEStore } from './redis-pkce-store';

/**
 * 認證模組
 *
 * 注意：這是範例程式碼，你需要根據你的專案調整：
 * 1. RedisModule - 替換成你的 Redis 模組
 * 2. ConfigModule - 替換成你的設定模組
 */
@Module({
	imports: [
		// RedisModule,  // 你的 Redis 模組
		// ConfigModule, // 你的設定模組
	],
	controllers: [AuthController],
	providers: [
		AuthService,
		ThirdPartyLoginGuard,
		{
			provide: 'PKCE_STORE',
			useFactory: (redisService: any) => new RedisPKCEStore(redisService),
			inject: ['REDIS_SERVICE'], // 注入你的 Redis Service
		},
	],
	exports: [AuthService],
})
export class AuthModule {}
