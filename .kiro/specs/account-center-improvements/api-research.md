# Kiro API 调研文档

## 1. 概述

本文档记录了 Kiro 客户端获取额度信息的 API 接口调研结果，包括 API 端点、请求/响应结构、字段映射关系和特殊情况处理。

**调研日期**: 2024-01-15  
**调研目标**: 识别额度相关 API 端点，提取套餐额度、免费额度、福利额度等细分信息  
**调研方法**: 分析现有代码、API 拦截逻辑、响应结构

---

## 2. API 拦截机制

### 2.1 当前实现

在 `electron/main.cjs` 中，通过 `isInterestingKiroApi` 函数拦截相关 API：

```javascript
function isInterestingKiroApi(url) {
  return /kiro|amazonaws|awsapps|builder/i.test(url)
    && /usage|quota|credit|billing|subscription|entitlement|model|profile|account/i.test(url);
}
```

**拦截条件**:
- URL 包含关键词: `kiro`, `amazonaws`, `awsapps`, `builder`
- 且 URL 包含: `usage`, `quota`, `credit`, `billing`, `subscription`, `entitlement`, `model`, `profile`, `account`

### 2.2 拦截流程

在 `captureKiroWebAccount` 函数中，通过 Playwright 的 `page.on('response')` 事件拦截 API 响应：

```javascript
page.on('response', async (response) => {
  const responseUrl = response.url();
  if (!isInterestingKiroApi(responseUrl)) return;
  
  const item = {
    url: responseUrl,
    method: response.request().method(),
    status: response.status()
  };
  
  // 记录 API 调用
  if (!discoveredApis.some((api) => api.url === item.url && api.method === item.method)) {
    discoveredApis.push(item);
  }

  // 提取 JSON 响应中的额度信息
  const contentType = response.headers()['content-type'] || '';
  if (!contentType.includes('json')) return;
  
  try {
    const json = await response.json();
    const extracted = extractUsageAndModels(json);
    if (extracted.quotaUsed !== null) discoveredUsage.quotaUsed = extracted.quotaUsed;
    if (extracted.quotaTotal !== null) discoveredUsage.quotaTotal = extracted.quotaTotal;
    if (extracted.availableModels.length > 0) discoveredUsage.availableModels = extracted.availableModels;
  } catch (_error) {}
});
```

---

## 3. 已识别的 API 端点

### 3.1 可能的额度相关端点

基于关键词匹配，以下是可能包含额度信息的 API 端点类型：

#### 3.1.1 AWS Builder ID 相关
- **用户配置文件**: `https://*/profile` 或 `https://*/account`
  - 可能包含用户基本信息和订阅状态
  
- **订阅信息**: `https://*/subscription` 或 `https://*/billing`
  - 可能包含套餐类型、额度限制
  
- **使用情况**: `https://*/usage` 或 `https://*/quota`
  - 可能包含当前使用量和总额度

#### 3.1.2 Kiro 特定端点
- **Kiro 应用 API**: `https://app.kiro.dev/api/*`
  - 可能包含 Kiro 特定的额度和模型信息
  
- **AWS Apps 端点**: `https://*.awsapps.com/*`
  - AWS Builder ID 的官方端点

#### 3.1.3 权益相关
- **权益查询**: `https://*/entitlement`
  - 可能包含免费额度、促销额度等权益信息

---

## 4. 数据提取逻辑

### 4.1 当前实现

`extractUsageAndModels` 函数通过递归遍历 JSON 响应，提取额度和模型信息：

```javascript
function extractUsageAndModels(json) {
  const result = {
    quotaUsed: null,
    quotaTotal: null,
    availableModels: []
  };

  walkJson(json, (node) => {
    // 提取已用额度
    if (result.quotaUsed === null) {
      result.quotaUsed = readNumberByKeys(node, [
        /used/i, 
        /consumed/i, 
        /usage/i, 
        /creditsUsed/i
      ]);
    }
    
    // 提取总额度
    if (result.quotaTotal === null) {
      result.quotaTotal = readNumberByKeys(node, [
        /limit/i, 
        /total/i, 
        /quota/i, 
        /credits/i, 
        /monthly/i
      ]);
    }

    // 提取模型列表
    for (const [key, value] of Object.entries(node)) {
      if (!/model/i.test(key)) continue;
      if (Array.isArray(value)) {
        const names = value
          .map((item) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              return item.name || item.displayName || item.label || item.id;
            }
            return '';
          })
          .filter(Boolean);
        if (names.length > result.availableModels.length) {
          result.availableModels = names;
        }
      } else if (typeof value === 'string' && value.length <= 80) {
        result.availableModels.push(value);
      }
    }
  });

  result.availableModels = [...new Set(result.availableModels)];
  return result;
}
```

### 4.2 字段匹配规则

#### 已用额度 (quotaUsed)
匹配以下字段名（不区分大小写）：
- `used`
- `consumed`
- `usage`
- `creditsUsed`

#### 总额度 (quotaTotal)
匹配以下字段名（不区分大小写）：
- `limit`
- `total`
- `quota`
- `credits`
- `monthly`

#### 模型列表 (availableModels)
- 字段名包含 `model`
- 值为字符串数组或对象数组
- 从对象中提取 `name`, `displayName`, `label`, `id` 字段

---

## 5. 额度细分字段映射

### 5.1 目标数据结构

根据需求文档，需要提取以下细分额度：

```javascript
{
  quotaBreakdown: {
    subscription: {
      used: number,
      total: number,
      type: 'paid'
    },
    freeTier: {
      used: number,
      total: number,
      type: 'free'
    },
    bonus: {
      used: number,
      total: number,
      type: 'promotional'
    },
    total: {
      used: number,
      total: number
    }
  }
}
```

### 5.2 可能的字段名称

基于常见 API 设计模式，以下是可能的字段名称：

#### 套餐额度 (subscription)
- `subscriptionQuota`
- `subscriptionUsage`
- `paidQuota`
- `paidUsage`
- `planQuota`
- `planUsage`
- `subscription.used` / `subscription.total`
- `paid.used` / `paid.total`

#### 免费额度 (freeTier)
- `freeQuota`
- `freeUsage`
- `freeTierQuota`
- `freeTierUsage`
- `trialQuota`
- `trialUsage`
- `free.used` / `free.total`
- `freeTier.used` / `freeTier.total`

#### 福利额度 (bonus)
- `bonusQuota`
- `bonusUsage`
- `promotionalQuota`
- `promotionalUsage`
- `creditQuota`
- `creditUsage`
- `bonus.used` / `bonus.total`
- `promotional.used` / `promotional.total`

### 5.3 扩展提取逻辑

需要扩展 `extractUsageAndModels` 函数以支持细分额度提取：

```javascript
function extractUsageAndModels(json) {
  const result = {
    quotaUsed: null,
    quotaTotal: null,
    quotaBreakdown: null,
    availableModels: []
  };

  // 尝试提取细分额度
  const breakdown = {
    subscription: { used: 0, total: 0, type: 'paid' },
    freeTier: { used: 0, total: 0, type: 'free' },
    bonus: { used: 0, total: 0, type: 'promotional' },
    total: { used: 0, total: 0 }
  };

  let foundBreakdown = false;

  walkJson(json, (node) => {
    // 提取套餐额度
    const subscriptionUsed = readNumberByKeys(node, [
      /subscriptionUsed/i,
      /paidUsed/i,
      /planUsed/i
    ]);
    const subscriptionTotal = readNumberByKeys(node, [
      /subscriptionQuota/i,
      /subscriptionTotal/i,
      /paidQuota/i,
      /paidTotal/i,
      /planQuota/i,
      /planTotal/i
    ]);
    
    if (subscriptionUsed !== null || subscriptionTotal !== null) {
      breakdown.subscription.used = subscriptionUsed || 0;
      breakdown.subscription.total = subscriptionTotal || 0;
      foundBreakdown = true;
    }

    // 提取免费额度
    const freeUsed = readNumberByKeys(node, [
      /freeUsed/i,
      /freeTierUsed/i,
      /trialUsed/i
    ]);
    const freeTotal = readNumberByKeys(node, [
      /freeQuota/i,
      /freeTotal/i,
      /freeTierQuota/i,
      /freeTierTotal/i,
      /trialQuota/i,
      /trialTotal/i
    ]);
    
    if (freeUsed !== null || freeTotal !== null) {
      breakdown.freeTier.used = freeUsed || 0;
      breakdown.freeTier.total = freeTotal || 0;
      foundBreakdown = true;
    }

    // 提取福利额度
    const bonusUsed = readNumberByKeys(node, [
      /bonusUsed/i,
      /promotionalUsed/i,
      /creditUsed/i
    ]);
    const bonusTotal = readNumberByKeys(node, [
      /bonusQuota/i,
      /bonusTotal/i,
      /promotionalQuota/i,
      /promotionalTotal/i,
      /creditQuota/i,
      /creditTotal/i
    ]);
    
    if (bonusUsed !== null || bonusTotal !== null) {
      breakdown.bonus.used = bonusUsed || 0;
      breakdown.bonus.total = bonusTotal || 0;
      foundBreakdown = true;
    }

    // 提取总额度（作为降级方案）
    if (result.quotaUsed === null) {
      result.quotaUsed = readNumberByKeys(node, [
        /used/i,
        /consumed/i,
        /usage/i,
        /creditsUsed/i
      ]);
    }
    
    if (result.quotaTotal === null) {
      result.quotaTotal = readNumberByKeys(node, [
        /limit/i,
        /total/i,
        /quota/i,
        /credits/i,
        /monthly/i
      ]);
    }

    // 提取模型列表（保持原有逻辑）
    // ...
  });

  // 如果找到了细分额度，计算总额度
  if (foundBreakdown) {
    breakdown.total.used = 
      breakdown.subscription.used + 
      breakdown.freeTier.used + 
      breakdown.bonus.used;
    breakdown.total.total = 
      breakdown.subscription.total + 
      breakdown.freeTier.total + 
      breakdown.bonus.total;
    result.quotaBreakdown = breakdown;
  }

  // 如果没有细分额度，使用总额度作为降级方案
  if (!foundBreakdown && (result.quotaUsed !== null || result.quotaTotal !== null)) {
    result.quotaBreakdown = {
      subscription: { used: 0, total: 0, type: 'paid' },
      freeTier: { used: 0, total: 0, type: 'free' },
      bonus: { used: 0, total: 0, type: 'promotional' },
      total: {
        used: result.quotaUsed || 0,
        total: result.quotaTotal || 0
      }
    };
  }

  result.availableModels = [...new Set(result.availableModels)];
  return result;
}
```

---

## 6. 响应结构示例

### 6.1 理想的 API 响应结构

假设 API 返回以下结构（示例）：

```json
{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "username": "kiro_user"
  },
  "quota": {
    "subscription": {
      "used": 100,
      "total": 300,
      "type": "paid"
    },
    "freeTier": {
      "used": 50,
      "total": 200,
      "type": "free"
    },
    "bonus": {
      "used": 0,
      "total": 0,
      "type": "promotional"
    },
    "total": {
      "used": 150,
      "total": 500
    }
  },
  "models": [
    {
      "id": "claude-opus-4.7",
      "name": "Claude Opus 4.7",
      "displayName": "Claude Opus 4.7"
    },
    {
      "id": "claude-sonnet-4.6",
      "name": "Claude Sonnet 4.6",
      "displayName": "Claude Sonnet 4.6"
    }
  ]
}
```

### 6.2 扁平化响应结构

如果 API 返回扁平化结构：

```json
{
  "userId": "user_123",
  "email": "user@example.com",
  "subscriptionUsed": 100,
  "subscriptionQuota": 300,
  "freeUsed": 50,
  "freeQuota": 200,
  "bonusUsed": 0,
  "bonusQuota": 0,
  "totalUsed": 150,
  "totalQuota": 500,
  "availableModels": [
    "Claude Opus 4.7",
    "Claude Sonnet 4.6"
  ]
}
```

### 6.3 嵌套对象结构

如果 API 返回嵌套对象：

```json
{
  "account": {
    "id": "user_123",
    "email": "user@example.com",
    "usage": {
      "subscription": {
        "consumed": 100,
        "limit": 300
      },
      "free": {
        "consumed": 50,
        "limit": 200
      },
      "promotional": {
        "consumed": 0,
        "limit": 0
      }
    }
  },
  "capabilities": {
    "models": [
      "Claude Opus 4.7",
      "Claude Sonnet 4.6"
    ]
  }
}
```

---

## 7. 特殊情况处理

### 7.1 API 不提供细分额度

**情况**: API 只返回总额度，不提供细分信息

**处理方案**: 降级显示总额度

```javascript
// 在前端组件中
function getQuotaBreakdown(item) {
  if (item.quotaBreakdown) {
    return item.quotaBreakdown;
  }
  
  // 降级方案：只显示总额度
  return {
    subscription: { used: 0, total: 0 },
    freeTier: { used: 0, total: 0 },
    bonus: { used: 0, total: 0 },
    total: {
      used: item.quotaUsed || 0,
      total: item.quotaTotal || 0
    }
  };
}
```

### 7.2 额度字段缺失

**情况**: API 响应中缺少某些额度字段

**处理方案**: 使用默认值 0

```javascript
breakdown.subscription.used = subscriptionUsed || 0;
breakdown.subscription.total = subscriptionTotal || 0;
```

### 7.3 额度数据不一致

**情况**: 细分额度之和不等于总额度

**处理方案**: 优先使用细分额度，重新计算总额度

```javascript
if (foundBreakdown) {
  breakdown.total.used = 
    breakdown.subscription.used + 
    breakdown.freeTier.used + 
    breakdown.bonus.used;
  breakdown.total.total = 
    breakdown.subscription.total + 
    breakdown.freeTier.total + 
    breakdown.bonus.total;
}
```

### 7.4 API 响应格式变化

**情况**: Kiro API 响应结构发生变化

**处理方案**: 
1. 使用灵活的字段匹配逻辑（正则表达式）
2. 提供降级方案（显示总额度或"待同步"）
3. 添加详细的错误日志，便于调试

```javascript
try {
  const json = await response.json();
  const extracted = extractUsageAndModels(json);
  // 更新额度信息
} catch (error) {
  console.error('额度提取失败:', error);
  // 降级显示
}
```

### 7.5 新账号无额度数据

**情况**: 新注册的账号可能没有额度数据

**处理方案**: 显示"待同步"状态

```javascript
function quotaLabel(item) {
  const total = Number(item?.quotaTotal || 0);
  const used = Number(item?.quotaUsed || 0);
  
  if (!total) return '待同步';
  return `${used}/${total}`;
}
```

### 7.6 额度超限

**情况**: 已用额度超过总额度

**处理方案**: 
1. 显示警告标识 ⚠️
2. 进度条显示为 100%
3. 高亮显示超限状态

```javascript
function quotaPercent(item) {
  const total = Number(item?.quotaTotal || 0);
  if (!total) return 0;
  
  const used = Number(item?.quotaUsed || 0);
  return Math.max(0, Math.min(100, Math.round((used / total) * 100)));
}
```

---

## 8. 实施建议

### 8.1 分阶段实施

#### 阶段 1: 增强 API 拦截
1. 扩展 `isInterestingKiroApi` 函数，确保捕获所有额度相关 API
2. 添加更详细的日志，记录 API URL、请求方法、响应状态

#### 阶段 2: 扩展数据提取
1. 修改 `extractUsageAndModels` 函数，支持细分额度提取
2. 实现字段匹配逻辑，支持多种可能的字段名称
3. 添加降级方案，确保向后兼容

#### 阶段 3: 前端集成
1. 扩展 Account 数据模型，添加 `quotaBreakdown` 字段
2. 创建 QuotaDisplay 组件，显示细分额度
3. 实现分段进度条，不同类型用不同颜色

#### 阶段 4: 测试和优化
1. 测试不同账号状态下的额度显示
2. 测试 API 响应格式变化的降级方案
3. 优化性能，减少不必要的 API 调用

### 8.2 日志和调试

在开发和测试阶段，建议添加详细的日志：

```javascript
page.on('response', async (response) => {
  const responseUrl = response.url();
  if (!isInterestingKiroApi(responseUrl)) return;
  
  console.log('[API Intercepted]', {
    url: responseUrl,
    method: response.request().method(),
    status: response.status()
  });
  
  try {
    const json = await response.json();
    console.log('[API Response]', JSON.stringify(json, null, 2));
    
    const extracted = extractUsageAndModels(json);
    console.log('[Extracted Data]', extracted);
  } catch (error) {
    console.error('[API Parse Error]', error);
  }
});
```

### 8.3 测试用例

#### 测试用例 1: 完整细分额度
- **输入**: API 返回完整的细分额度数据
- **预期**: 正确提取并显示套餐、免费、福利额度

#### 测试用例 2: 只有总额度
- **输入**: API 只返回总额度，无细分数据
- **预期**: 降级显示总额度

#### 测试用例 3: 部分细分额度
- **输入**: API 只返回部分细分额度（如只有套餐和免费）
- **预期**: 显示已有的细分额度，缺失的显示为 0

#### 测试用例 4: 无额度数据
- **输入**: API 不返回任何额度数据
- **预期**: 显示"待同步"状态

#### 测试用例 5: 额度超限
- **输入**: 已用额度 > 总额度
- **预期**: 显示警告标识，进度条为 100%

---

## 9. 风险和缓解措施

### 9.1 API 结构未知

**风险**: 实际 API 响应结构可能与预期不同

**缓解措施**:
1. 使用灵活的字段匹配逻辑（正则表达式）
2. 提供多种可能的字段名称
3. 实现降级方案
4. 添加详细的日志，便于调试

### 9.2 API 频繁变化

**风险**: Kiro API 可能频繁更新，导致提取逻辑失效

**缓解措施**:
1. 设计灵活的提取逻辑，减少对特定字段名的依赖
2. 实现降级方案，确保基本功能可用
3. 定期检查和更新提取逻辑
4. 添加版本检测机制（如果 API 提供版本信息）

### 9.3 性能影响

**风险**: 拦截和解析所有 API 响应可能影响性能

**缓解措施**:
1. 只拦截匹配关键词的 API
2. 只解析 JSON 响应
3. 使用异步处理，避免阻塞主流程
4. 添加超时机制，防止长时间等待

### 9.4 数据隐私

**风险**: API 响应可能包含敏感信息

**缓解措施**:
1. 只提取必要的字段（额度、模型）
2. 不记录完整的 API 响应到日志
3. 敏感信息（如 token）只记录前缀
4. 确保数据只存储在本地

---

## 10. 后续工作

### 10.1 实际 API 调研

在实施阶段，需要进行实际的 API 调研：

1. **手动登录 Kiro 账号**
   - 打开浏览器开发者工具
   - 登录 Kiro 账号
   - 观察网络请求

2. **识别额度相关 API**
   - 查找包含 `usage`, `quota`, `credit` 等关键词的 API
   - 记录 API URL、请求方法、请求参数

3. **分析 API 响应**
   - 记录完整的响应结构
   - 识别额度相关字段
   - 确定字段类型和取值范围

4. **测试不同账号状态**
   - 新账号（无额度）
   - 免费账号（只有免费额度）
   - 付费账号（有套餐额度）
   - 促销账号（有福利额度）

5. **更新提取逻辑**
   - 根据实际 API 结构更新 `extractUsageAndModels` 函数
   - 添加实际的字段名称到匹配规则
   - 测试提取逻辑的准确性

### 10.2 文档更新

在完成实际 API 调研后，需要更新本文档：

1. 添加实际的 API 端点列表
2. 添加实际的请求和响应示例
3. 更新字段映射关系
4. 添加实际测试结果

### 10.3 监控和维护

在功能上线后，需要持续监控和维护：

1. 监控 API 提取成功率
2. 收集用户反馈
3. 定期检查 API 结构变化
4. 及时更新提取逻辑

---

## 11. 参考资料

### 11.1 相关文件
- `electron/main.cjs` - API 拦截和数据提取逻辑
- `src/stores/accountCenter.js` - 账号数据管理
- `src/views/ProviderDetailView.vue` - 额度显示组件

### 11.2 相关需求
- REQ-004: 额度信息细化展示
- REQ-005: API 接口调研

### 11.3 技术文档
- Playwright API 文档: https://playwright.dev/
- Electron IPC 文档: https://www.electronjs.org/docs/latest/api/ipc-main

---

## 12. 附录

### 12.1 字段匹配正则表达式

#### 套餐额度
```javascript
// 已用
/subscriptionUsed/i
/paidUsed/i
/planUsed/i

// 总量
/subscriptionQuota/i
/subscriptionTotal/i
/paidQuota/i
/paidTotal/i
/planQuota/i
/planTotal/i
```

#### 免费额度
```javascript
// 已用
/freeUsed/i
/freeTierUsed/i
/trialUsed/i

// 总量
/freeQuota/i
/freeTotal/i
/freeTierQuota/i
/freeTierTotal/i
/trialQuota/i
/trialTotal/i
```

#### 福利额度
```javascript
// 已用
/bonusUsed/i
/promotionalUsed/i
/creditUsed/i

// 总量
/bonusQuota/i
/bonusTotal/i
/promotionalQuota/i
/promotionalTotal/i
/creditQuota/i
/creditTotal/i
```

### 12.2 数据验证函数

```javascript
function validateQuotaBreakdown(breakdown) {
  const errors = [];
  
  const segments = ['subscription', 'freeTier', 'bonus', 'total'];
  for (const segment of segments) {
    if (!breakdown[segment]) {
      errors.push(`缺少 ${segment} 字段`);
      continue;
    }
    
    const { used, total } = breakdown[segment];
    
    if (typeof used !== 'number' || used < 0) {
      errors.push(`${segment}.used 必须是非负数`);
    }
    
    if (typeof total !== 'number' || total < 0) {
      errors.push(`${segment}.total 必须是非负数`);
    }
    
    if (used > total) {
      errors.push(`${segment}.used 不能大于 ${segment}.total`);
    }
  }
  
  return errors;
}
```

---

**文档版本**: 1.0  
**最后更新**: 2024-01-15  
**维护者**: ProxyForge 开发团队
