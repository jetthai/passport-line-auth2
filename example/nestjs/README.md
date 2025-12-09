# NestJS LINE Login with PKCE Example

這個範例展示如何在 NestJS 專案中使用 `@jetthai/passport-line-auth2` 實現 LINE 登入，包含 PKCE 支援。

## 檔案說明

| 檔案 | 說明 |
|------|------|
| `redis-pkce-store.ts` | Redis PKCE Store 實作，用於分散式環境 |
| `line-login.strategy.ts` | LINE 登入策略 Service |
| `third-party-login.guard.ts` | 第三方登入驗證 Guard |
| `auth.controller.ts` | 認證 Controller |

## 安裝

```bash
npm install @jetthai/passport-line-auth2 passport passport-oauth2
npm install @types/passport @types/passport-oauth2 --save-dev
```

## 使用方式

### 1. 基本使用（使用 Session）

如果你的專案已經設定好 `express-session`，只需要設定 `pkce: true`：

```typescript
import { Strategy, LineStrategyOptionsWithRequest } from '@jetthai/passport-line-auth2';

const options: LineStrategyOptionsWithRequest = {
  passReqToCallback: true,
  channelID: 'YOUR_CHANNEL_ID',
  channelSecret: 'YOUR_CHANNEL_SECRET',
  callbackURL: 'https://your-domain.com/auth/callback',
  scope: ['profile', 'openid'],
  pkce: true,  // 使用 session 儲存 code_verifier
};

const strategy = new Strategy(options, (req, accessToken, refreshToken, profile, done) => {
  // 處理使用者資料
  done(null, { id: profile.id, name: profile.displayName });
});

passport.use('line', strategy);
```

### 2. 使用 Redis Store（分散式環境）

```typescript
import { Strategy, LineStrategyOptionsWithRequest, PKCEStore } from '@jetthai/passport-line-auth2';
import { RedisPKCEStore } from './redis-pkce-store';

// 創建 Redis PKCE Store
const redisPKCEStore = new RedisPKCEStore(redisService);

const options: LineStrategyOptionsWithRequest = {
  passReqToCallback: true,
  channelID: 'YOUR_CHANNEL_ID',
  channelSecret: 'YOUR_CHANNEL_SECRET',
  callbackURL: 'https://your-domain.com/auth/callback',
  scope: ['profile', 'openid'],
  pkce: {
    enabled: true,
    store: redisPKCEStore,
  },
};

const strategy = new Strategy(options, verifyCallback);
```

### 3. 不使用 PKCE（向後兼容）

```typescript
const options: LineStrategyOptionsWithRequest = {
  passReqToCallback: true,
  channelID: 'YOUR_CHANNEL_ID',
  channelSecret: 'YOUR_CHANNEL_SECRET',
  callbackURL: 'https://your-domain.com/auth/callback',
  scope: ['profile', 'openid'],
  pkce: false,  // 或直接不設定 pkce
};
```

## PKCE 流程

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Client      │     │     Server      │     │      LINE       │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │  1. 發起登入           │                       │
         │  GET /auth/login      │                       │
         │──────────────────────>│                       │
         │                       │                       │
         │                       │  2. 生成 PKCE         │
         │                       │  code_verifier        │
         │                       │  code_challenge       │
         │                       │                       │
         │                       │  3. 儲存 code_verifier │
         │                       │  到 Redis/Session     │
         │                       │                       │
         │  4. 重定向到 LINE      │                       │
         │<──────────────────────│                       │
         │                       │                       │
         │  5. 帶 code_challenge │                       │
         │───────────────────────────────────────────────>
         │                       │                       │
         │  6. 使用者授權         │                       │
         │<───────────────────────────────────────────────
         │                       │                       │
         │  7. 回調帶 code + state│                       │
         │──────────────────────>│                       │
         │                       │                       │
         │                       │  8. 從 Redis/Session  │
         │                       │  取得 code_verifier   │
         │                       │                       │
         │                       │  9. 用 code +         │
         │                       │  code_verifier        │
         │                       │  交換 token           │
         │                       │──────────────────────>│
         │                       │                       │
         │                       │  10. 返回 token       │
         │                       │<──────────────────────│
         │                       │                       │
         │  11. 登入成功          │                       │
         │<──────────────────────│                       │
         │                       │                       │
```

## 整合到現有專案

### Module 設定

```typescript
// auth.module.ts
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { ThirdPartyLoginGuard } from './third-party-login.guard';
import { RedisPKCEStore } from './redis-pkce-store';

@Module({
  controllers: [AuthController],
  providers: [
    ThirdPartyLoginGuard,
    {
      provide: 'PKCE_STORE',
      useFactory: (redis: RedisService) => new RedisPKCEStore(redis),
      inject: [RedisService],
    },
  ],
})
export class AuthModule {}
```

### 環境變數

```env
LINE_CHANNEL_ID=your_channel_id
LINE_CHANNEL_SECRET=your_channel_secret
LINE_CALLBACK_URL=https://your-domain.com/auth/callback
```

## 注意事項

1. **PKCE 是必要的**：LINE 於 2024 年起要求所有 LINE Login 必須使用 PKCE。

2. **State 參數**：Strategy 會自動處理 state 參數用於 CSRF 防護和 PKCE 關聯。

3. **Redis TTL**：建議設定 10 分鐘的過期時間，避免 code_verifier 長期佔用記憶體。

4. **錯誤處理**：當 code_verifier 找不到時，Strategy 會自動返回錯誤。

## 型別定義

```typescript
// PKCEStore 介面
interface PKCEStore {
  store(state: string, codeVerifier: string, callback: (err: Error) => void): void;
  verify(state: string, callback: (err: Error, codeVerifier?: string) => void): void;
}

// PKCEOptions 介面
interface PKCEOptions {
  enabled?: boolean;
  store?: PKCEStore;
}

// LineStrategyOptionsWithRequest 介面
interface LineStrategyOptionsWithRequest {
  passReqToCallback: true;
  channelID: string;
  channelSecret: string;
  callbackURL: string;
  scope?: string[];
  pkce?: boolean | PKCEOptions;
  // ... 其他選項
}
```
