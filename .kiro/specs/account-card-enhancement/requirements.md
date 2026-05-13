# Requirements Document

## Introduction

本需求文档定义了账号中心账号卡片展示和交互功能的改进需求。该功能旨在优化 Kiro/AWS Builder ID 账号管理的用户体验,包括响应式布局、快速账号切换、反代配置和详细额度信息展示。

## Glossary

- **Account_Card**: 账号卡片,显示单个账号信息的 UI 组件
- **Provider_Detail_View**: 账号中心详情视图组件 (ProviderDetailView.vue)
- **Account_Center_Store**: 账号中心状态管理存储 (accountCenter.js)
- **Desktop_Client**: Kiro 桌面客户端应用程序
- **Proxy_Config**: 反代配置,包含代理服务器地址、端口、认证信息等
- **Quota_Info**: 额度信息,包括套餐额度、免费额度、福利额度等
- **Active_Account**: 当前正在使用的账号
- **Layout_Container**: 账号卡片的布局容器元素
- **Modal_Dialog**: 模态对话框,用于显示反代配置表单
- **Electron_Environment**: Electron 桌面应用运行环境

## Requirements

### Requirement 1: 响应式自动布局

**User Story:** 作为用户,我希望账号卡片能够根据屏幕宽度自动调整布局,以便在大屏幕上查看更多账号信息

#### Acceptance Criteria

1. THE Layout_Container SHALL support responsive grid layout with automatic column adjustment
2. WHEN screen width is greater than 1536px AND total Account_Cards count is 3 or more, THE Layout_Container SHALL display 3 or more Account_Cards per row
3. WHEN screen width is greater than 1536px AND total Account_Cards count is less than 3, THE Layout_Container SHALL display available Account_Cards per row
4. WHEN screen width is between 1024px and 1536px, THE Layout_Container SHALL display 2 Account_Cards per row with flexible transition near breakpoints
5. WHEN screen width is less than 1024px, THE Layout_Container SHALL display 1 Account_Card per row
6. THE Account_Card SHALL maintain minimum width of 320px
7. THE Account_Card SHALL maintain maximum width of 600px

### Requirement 2: 账号切换功能

**User Story:** 作为用户,我希望能够快速切换到指定账号,以便无需重复登录即可使用不同账号

#### Acceptance Criteria

1. THE Account_Card SHALL display a switch account button
2. WHEN the switch account button is clicked AND Electron_Environment is available, THE Provider_Detail_View SHALL invoke launchKiroClient interface
3. WHEN launchKiroClient is invoked, THE Desktop_Client SHALL launch and switch to the specified account
4. IF launchKiroClient fails with permanent OR user-actionable error, THEN THE Provider_Detail_View SHALL display error message to user
5. WHILE an account is the Active_Account, THE Account_Card SHALL display the switch button in disabled state
6. WHILE an account is the Active_Account, THE Account_Card SHALL display visual indicator showing active status
7. WHEN Electron_Environment is not available, THE Account_Card SHALL display the switch button in disabled state with tooltip explaining Electron requirement

### Requirement 3: 反代配置功能

**User Story:** 作为用户,我希望能够为每个账号配置独立的反代设置,以便通过代理服务器访问服务

#### Acceptance Criteria

1. THE Account_Card SHALL display a proxy configuration button
2. WHEN the proxy configuration button is clicked, THE Provider_Detail_View SHALL display Modal_Dialog with proxy configuration form
3. THE Modal_Dialog SHALL contain input fields for proxy server address
4. THE Modal_Dialog SHALL contain input fields for proxy port number
5. THE Modal_Dialog SHALL contain input fields for authentication credentials
6. THE Modal_Dialog SHALL contain enable/disable toggle switch
7. WHEN proxy configuration is saved, THE Account_Center_Store SHALL persist Proxy_Config associated with the account without validating field completeness
8. IF persistence fails, THEN THE Account_Center_Store SHALL fail the save operation
9. WHEN Modal_Dialog is successfully displayed AND then closed, THE Provider_Detail_View SHALL update Account_Card display with proxy status
10. WHEN the proxy configuration button is clicked AND Modal_Dialog fails to display, THE Provider_Detail_View SHALL allow the button click to succeed

### Requirement 4: 额度信息细化展示

**User Story:** 作为用户,我希望能够查看详细的额度信息,以便更好地管理和规划账号使用

#### Acceptance Criteria

1. THE Account_Card SHALL display subscription quota information
2. THE Account_Card SHALL display free tier quota information
3. THE Account_Card SHALL display bonus quota information
4. THE Account_Card SHALL display total quota and used quota
5. WHEN quota data is not available AND synchronization is in progress, THE Account_Card SHALL display "待同步" status
6. WHEN quota data is not available AND synchronization is complete, THE Account_Card SHALL display "同步失败" OR "数据不可用" status
7. WHEN quota data is available, THE Account_Card SHALL display the quota data regardless of synchronization state
8. THE Account_Card SHALL display visual progress indicator for quota usage percentage

### Requirement 5: 额度数据获取

**User Story:** 作为开发者,我希望系统能够从 API 响应中提取细分额度信息,以便向用户展示详细的额度数据

#### Acceptance Criteria

1. THE extractUsageAndModels function SHALL extract subscription quota from API responses
2. THE extractUsageAndModels function SHALL extract free tier quota from API responses
3. THE extractUsageAndModels function SHALL retrieve bonus quota data from API responses
4. WHEN API response contains quota breakdown fields, THE extractUsageAndModels function SHALL parse and return structured quota data
5. WHEN API response does not contain quota breakdown fields, THE extractUsageAndModels function SHALL fail the parsing operation
6. WHEN parsing fails due to malformed data, THE extractUsageAndModels function SHALL return null for all quota fields
7. THE Account_Center_Store SHALL store subscription quota, free tier quota, and bonus quota for each account

### Requirement 6: 反代配置持久化

**User Story:** 作为用户,我希望反代配置能够被保存,以便下次使用时无需重新配置

#### Acceptance Criteria

1. WHEN Proxy_Config is saved, THE Account_Center_Store SHALL persist configuration to localStorage
2. WHEN application is reloaded, THE Account_Center_Store SHALL restore Proxy_Config from localStorage
3. WHEN stored configuration is corrupted, THE Account_Center_Store SHALL continue with hardcoded minimal default configuration
4. WHEN localStorage is unavailable, THE Account_Center_Store SHALL continue with hardcoded minimal default configuration
5. WHEN restoration fails, THE Account_Center_Store SHALL continue with hardcoded minimal default configuration
6. THE Account_Center_Store SHALL associate Proxy_Config with specific account ID in memory before persistence
7. WHEN account is deleted, THE Account_Center_Store SHALL remove associated Proxy_Config

### Requirement 7: 活跃账号识别

**User Story:** 作为用户,我希望能够清楚地识别当前正在使用的账号,以便避免误操作

#### Acceptance Criteria

1. THE Provider_Detail_View SHALL track the Active_Account identifier
2. WHEN an account is launched via launchKiroClient, THE Provider_Detail_View SHALL update Active_Account identifier
3. IF Active_Account identifier update fails, THEN THE Provider_Detail_View SHALL allow the launch to proceed AND display non-blocking notification about the failure
4. WHEN Account_Card is rendered, THE Provider_Detail_View SHALL compare account ID with Active_Account identifier
5. WHILE an account matches Active_Account identifier AND distinct visual styling is available, THE Account_Card SHALL apply the styling
6. WHILE an account matches Active_Account identifier, THE Account_Card SHALL display "当前使用" badge

### Requirement 8: 反代配置数据结构

**User Story:** 作为开发者,我希望定义清晰的反代配置数据结构,以便系统能够正确存储和使用配置信息

#### Acceptance Criteria

1. THE Proxy_Config SHALL contain proxyServer field for server address
2. THE Proxy_Config SHALL contain proxyPort field for port number
3. THE Proxy_Config SHALL contain proxyUsername field for authentication username
4. THE Proxy_Config SHALL contain proxyPassword field for authentication password
5. THE Proxy_Config SHALL contain proxyEnabled field for enable/disable status
6. THE Proxy_Config SHALL contain proxyType field for proxy protocol type
7. WHEN Proxy_Config is created, THE Account_Center_Store SHALL initialize all fields with default values
8. WHEN Proxy_Config is created, THE Account_Center_Store SHALL allow custom values to override default values during initialization

