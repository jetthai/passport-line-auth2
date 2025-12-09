import { Injectable } from '@nestjs/common';
import { PKCEStore } from '../../lib';

/**
 * Redis Service 介面（根據你的專案實作）
 */
interface RedisService {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSeconds?: number): Promise<void>;
	del(key: string): Promise<void>;
}

/**
 * Redis PKCE Store 實作
 *
 * 這個 Store 會被用於：
 * 1. 儲存 PKCE code_verifier
 * 2. 儲存 OAuth state（由 Strategy 內部的 PKCEStateStore 使用）
 *
 * 當配置 pkce: { store: redisPKCEStore } 時，
 * Strategy 會自動使用這個 store 來處理 state 和 code_verifier，
 * **不需要 express-session**。
 */
@Injectable()
export class RedisPKCEStore implements PKCEStore {
	private readonly keyPrefix = 'line:pkce:';
	private readonly ttlSeconds = 600; // 10 分鐘

	constructor(private readonly redis: RedisService) {}

	/**
	 * 儲存資料
	 */
	store(key: string, value: string, callback: (err: Error) => void): void {
		const redisKey = this.keyPrefix + key;
		this.redis
			.set(redisKey, value, this.ttlSeconds)
			.then(() => callback(null as unknown as Error))
			.catch((err) => callback(err));
	}

	/**
	 * 驗證並取得資料（取得後自動刪除）
	 */
	verify(key: string, callback: (err: Error, value?: string) => void): void {
		const redisKey = this.keyPrefix + key;
		this.redis
			.get(redisKey)
			.then((value) => {
				if (value) {
					this.redis.del(redisKey).catch(() => {});
				}
				callback(null as unknown as Error, value || undefined);
			})
			.catch((err) => callback(err));
	}
}
