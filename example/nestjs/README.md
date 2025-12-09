# NestJS LINE Login with PKCE Example

這個範例展示如何在 NestJS 專案中使用 `@jetthai/passport-line-auth2` 實現 LINE 登入。

## 特點

- **PKCE 支援**：符合 LINE 最新的安全要求
- **無需 Session**：使用 Redis 儲存 state 和 code_verifier
- **多站點支援**：可根據不同站點使用不同的 LINE Channel 設定

## 檔案結構

```
example/nestjs/
├── index.ts                    # 統一匯出
├── auth.module.ts              # NestJS 模組
├── auth.controller.ts          # 認證 Controller
├── auth.service.ts             # 認證 Service
├── third-party-login.guard.ts  # 登入驗證 Guard
├── line-login.strategy.ts      # LINE 登入策略
├── redis-pkce-store.ts         # Redis PKCE Store 實作
└── README.md                   # 說明文件
```

## 快速開始

### 1. 安裝依賴

```bash
npm install @jetthai/passport-line-auth2 passport
npm install @types/passport --save-dev
```

### 2. 實作 Redis Service

```typescript
// redis.service.ts
@Injectable()
export class RedisService {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
```

### 3. 設定模組

```typescript
// auth.module.ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ThirdPartyLoginGuard } from './third-party-login.guard';
import { RedisPKCEStore } from './redis-pkce-store';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    ThirdPartyLoginGuard,
    {
      provide: 'PKCE_STORE',
      useFactory: (redis: RedisService) => new RedisPKCEStore(redis),
      inject: [RedisService],
    },
    {
      provide: 'CONFIG_SERVICE',
      useClass: YourConfigService,
    },
  ],
})
export class AuthModule {}
```

### 4. 設定 LINE Channel

```typescript
// config.service.ts
@Injectable()
export class ConfigService {
  getLineConfig(site: string): LineLoginConfig {
    // 根據 site 返回對應的設定
    return {
      channelID: process.env.LINE_CHANNEL_ID,
      channelSecret: process.env.LINE_CHANNEL_SECRET,
      callbackURL: `https://your-domain.com/auth/${site}/callback?provider=line`,
      scope: ['profile', 'openid'],
    };
  }
}
```

## API 路由

### 發起登入

```
GET /auth/:site/login?provider=line&redirectURI=https://example.com/done
```

### 登入回調

```
GET /auth/:site/callback?provider=line&code=xxx&state=xxx
```

## 流程說明

```
┌──────────────────────────────────────────────────────────────────┐
│                         LOGIN FLOW                                │
└──────────────────────────────────────────────────────────────────┘

1. Client
   │
   │  GET /auth/my-site/login?provider=line&redirectURI=xxx
   ▼
2. ThirdPartyLoginGuard
   │  - 驗證參數
   │  - 從 ConfigService 取得 LINE 設定
   │  - 創建 LineLoginStrategyService（帶 RedisPKCEStore）
   │  - 註冊 passport strategy
   ▼
3. AuthController.login()
   │  - 呼叫 authService.initiateLogin()
   │  - passport.authenticate() 開始 OAuth 流程
   ▼
4. Strategy (內部處理)
   │  - 生成 state（儲存到 Redis）
   │  - 生成 PKCE code_verifier/code_challenge
   │  - code_verifier 儲存到 Redis
   │  - 重定向到 LINE 授權頁面（帶 code_challenge）
   ▼
5. LINE 授權頁面
   │  - 使用者同意授權
   │  - 重定向回 callback URL（帶 code + state）
   ▼
6. ThirdPartyLoginGuard (callback)
   │  - 重新創建 strategy
   ▼
7. AuthController.callback()
   │  - 呼叫 authService.handleCallback()
   │  - passport.authenticate() 處理回調
   ▼
8. Strategy (內部處理)
   │  - 從 Redis 驗證 state
   │  - 從 Redis 取得 code_verifier
   │  - 用 code + code_verifier 交換 access_token
   │  - 取得使用者資料
   │  - 刪除 Redis 中的資料
   ▼
9. AuthService.createLineVerifyCallback()
   │  - 處理使用者資料
   │  - 創建/查找使用者
   │  - 生成 JWT（可選）
   ▼
10. 重定向到 redirectURI
    │  - 帶上 userId, displayName, token 等參數
    ▼
11. Client 完成登入
```

## Redis Key 結構

```
line:pkce:state:{hex}    → {hex}            # OAuth state（TTL: 10分鐘）
line:pkce:{state}        → {code_verifier}  # PKCE code_verifier（TTL: 10分鐘）
```

## 套件導出的型別

```typescript
import {
  Strategy,                       // LINE 登入策略
  LineStrategyOptions,            // 選項（不含 Request）
  LineStrategyOptionsWithRequest, // 選項（含 Request）
  PKCEStore,                      // PKCE Store 介面
  PKCEOptions,                    // PKCE 配置
  LineProfile,                    // LINE 使用者資料
  LineAuthorizationError,         // 授權錯誤
} from '@jetthai/passport-line-auth2';
```

## 環境變數

```env
LINE_CHANNEL_ID=your_channel_id
LINE_CHANNEL_SECRET=your_channel_secret
```

## 注意事項

1. **不需要 express-session**：當使用自定義 `PKCEStore` 時，state 和 code_verifier 都會儲存在你的 store 中。

2. **Redis TTL**：預設 10 分鐘，可在 `RedisPKCEStore` 中調整。

3. **多站點支援**：透過 `:site` 路由參數和 `ConfigService`，可以支援多個站點使用不同的 LINE Channel。

4. **錯誤處理**：登入失敗時會重定向到 `redirectURI` 並帶上 `error` 參數。
