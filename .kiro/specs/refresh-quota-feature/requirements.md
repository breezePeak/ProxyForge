# Requirements Document

## Introduction

本需求文档定义了账号额度刷新功能（Refresh Quota Feature）。该功能允许用户在账号中心的账号卡片上手动刷新单个账号的额度信息，而无需重新加载整个账号列表或执行完整的账号同步操作。此功能旨在提供轻量级、快速的额度更新体验，提升用户操作效率。

## Glossary

- **Account_Center_Store**: Pinia 状态管理存储，负责管理账号中心的所有数据和业务逻辑
- **Account_Card**: 账号卡片 UI 组件，显示单个账号的详细信息，包括邮箱、用户名、额度、模型等
- **Quota_Used**: 账号已使用的额度数值
- **Quota_Total**: 账号的总额度数值
- **Refresh_Button**: 刷新按钮 UI 元素，位于账号卡片右上角，用于触发额度刷新操作
- **Provider_Detail_View**: 提供商详情视图组件，展示特定提供商的所有账号列表
- **Error_Message**: 错误提示信息，当操作失败时向用户显示的文本消息
- **Loading_State**: 加载状态，表示异步操作正在进行中的 UI 状态

## Requirements

### Requirement 1: 刷新按钮 UI 展示

**User Story:** 作为用户，我希望在账号卡片上看到一个刷新图标按钮，以便我能够识别并触发额度刷新操作

#### Acceptance Criteria

1. THE Account_Card SHALL display a Refresh_Button in the top-right corner of the card
2. THE Refresh_Button SHALL use a recognizable refresh icon (circular arrow or similar)
3. THE Refresh_Button SHALL be visually distinct from other action buttons on the Account_Card
4. WHEN the user hovers over the Refresh_Button, THE Refresh_Button SHALL display a tooltip with text "刷新额度"
5. THE Refresh_Button SHALL maintain consistent styling with the existing UI design system

### Requirement 2: 刷新额度操作

**User Story:** 作为用户，我希望点击刷新按钮后能够更新账号的额度信息，以便我能够获取最新的额度数据

#### Acceptance Criteria

1. WHEN the user clicks the Refresh_Button, THE Account_Center_Store SHALL invoke a new refreshQuota method
2. THE refreshQuota method SHALL accept providerId and accountId as parameters
3. THE refreshQuota method SHALL update only the Quota_Used and Quota_Total fields for the specified account
4. THE refreshQuota method SHALL NOT reload or modify other account data fields
5. WHEN the refreshQuota operation completes successfully, THE Account_Card SHALL display the updated quota values
6. THE refreshQuota method SHALL complete within 5 seconds under normal network conditions

### Requirement 3: 加载状态反馈

**User Story:** 作为用户，我希望在刷新操作进行时看到加载状态，以便我知道系统正在处理我的请求

#### Acceptance Criteria

1. WHEN the user clicks the Refresh_Button, THE Refresh_Button SHALL immediately enter a Loading_State
2. WHILE in Loading_State, THE Refresh_Button SHALL display a spinning animation or loading indicator
3. WHILE in Loading_State, THE Refresh_Button SHALL be disabled to prevent duplicate requests
4. WHEN the refreshQuota operation completes or fails, THE Refresh_Button SHALL exit the Loading_State
5. THE Loading_State SHALL persist for the entire duration of the refreshQuota operation

### Requirement 4: 错误处理与重试

**User Story:** 作为用户，当刷新操作失败时，我希望看到错误提示并能够重试，以便我能够在网络问题或临时故障后继续操作

#### Acceptance Criteria

1. IF the refreshQuota operation fails, THEN THE Provider_Detail_View SHALL display an Error_Message
2. THE Error_Message SHALL describe the failure reason in user-friendly language
3. THE Error_Message SHALL be displayed near the Account_Card or in a notification area
4. WHEN an Error_Message is displayed, THE Refresh_Button SHALL remain enabled to allow retry
5. WHEN the user clicks the Refresh_Button after a failure, THE Account_Center_Store SHALL clear the previous Error_Message
6. THE Error_Message SHALL automatically dismiss after 5 seconds if the user does not interact with it

### Requirement 5: 数据持久化

**User Story:** 作为用户，我希望刷新后的额度数据能够被保存，以便我在重新打开应用时仍能看到最新的额度信息

#### Acceptance Criteria

1. WHEN the refreshQuota operation updates Quota_Used and Quota_Total, THE Account_Center_Store SHALL persist the updated values to localStorage
2. THE Account_Center_Store SHALL use the existing persistDebounced method for data persistence
3. THE persisted data SHALL include the updated Quota_Used and Quota_Total values
4. WHEN the user reloads the application, THE Account_Center_Store SHALL load the persisted quota values
5. THE persistence operation SHALL complete within 500 milliseconds

### Requirement 6: 缓存失效处理

**User Story:** 作为用户，当我手动刷新额度时，我希望系统清除旧的缓存数据，以便我能够获取真实的最新数据而不是缓存值

#### Acceptance Criteria

1. WHEN the user clicks the Refresh_Button, THE Account_Center_Store SHALL invalidate the quota cache for the specified account
2. THE Account_Center_Store SHALL remove the cached entry from the quotaCache object before invoking the refreshQuota method
3. WHEN the refreshQuota operation completes successfully, THE Account_Center_Store SHALL update the quotaCache with the new quota data
4. THE cache invalidation SHALL occur before the network request is initiated
5. IF the refreshQuota operation fails, THE Account_Center_Store SHALL NOT update the quotaCache

### Requirement 7: 轻量级实现

**User Story:** 作为开发者，我希望刷新额度功能使用轻量级的实现方式，以便减少系统资源消耗和提升响应速度

#### Acceptance Criteria

1. THE refreshQuota method SHALL be implemented as a separate method in the Account_Center_Store
2. THE refreshQuota method SHALL NOT invoke the full account synchronization logic
3. THE refreshQuota method SHALL make a targeted API request that retrieves only quota information
4. THE refreshQuota method SHALL update only the Quota_Used and Quota_Total fields in the account object
5. THE refreshQuota method SHALL NOT trigger re-rendering of other Account_Card components
6. THE refreshQuota method SHALL consume less than 100KB of network bandwidth per request

### Requirement 8: 可访问性支持

**User Story:** 作为使用辅助技术的用户，我希望刷新按钮具有适当的可访问性属性，以便我能够通过屏幕阅读器或键盘操作使用该功能

#### Acceptance Criteria

1. THE Refresh_Button SHALL have an aria-label attribute with value "刷新额度"
2. THE Refresh_Button SHALL be keyboard accessible via Tab key navigation
3. WHEN the Refresh_Button receives keyboard focus, THE Refresh_Button SHALL display a visible focus indicator
4. THE Refresh_Button SHALL be activatable via Enter or Space key when focused
5. WHILE in Loading_State, THE Refresh_Button SHALL have aria-busy attribute set to "true"
6. WHEN an Error_Message is displayed, THE Error_Message SHALL have role="alert" for screen reader announcement
