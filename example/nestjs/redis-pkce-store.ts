import { Injectable } from '@nestjs/common';
import { PKCEStore } from '@jetthai/passport-line-auth2';

/**
 * Redis PKCE Store 介面
 * 你需要根據你的專案實作 RedisService
 */
interface RedisService {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttlSeconds?: number): Promise<void>;
	del(key: string): Promise<void>;
}

/**
 * Redis PKCE Store 實作
 * 用於在分散式環境中儲存 PKCE code_verifier
 */
@Injectable()
export class RedisPKCEStore implements PKCEStore {
	private readonly keyPrefix = 'line:pkce:';
	private readonly ttlSeconds = 600; // 10 分鐘

	constructor(private readonly redis: RedisService) {}

	/**
	 * 儲存 code_verifier
	 */
	store(state: string, codeVerifier: string, callback: (err: Error) => void): void {
		const key = this.keyPrefix + state;
		this.redis
			.set(key, codeVerifier, this.ttlSeconds)
			.then(() => callback(null as unknown as Error))
			.catch((err) => callback(err));
	}

	/**
	 * 取得並刪除 code_verifier
	 */
	verify(state: string, callback: (err: Error, codeVerifier?: string) => void): void {
		const key = this.keyPrefix + state;
		this.redis
			.get(key)
			.then((codeVerifier) => {
				if (codeVerifier) {
					// 使用後刪除
					this.redis.del(key).catch(() => {
						// 忽略刪除錯誤
					});
				}
				callback(null as unknown as Error, codeVerifier || undefined);
			})
			.catch((err) => callback(err));
	}
}
