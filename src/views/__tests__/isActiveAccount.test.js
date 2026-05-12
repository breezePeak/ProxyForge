/**
 * Manual test for isActiveAccount function
 * 
 * To run this test manually:
 * 1. Open browser console
 * 2. Copy and paste this code
 * 3. Run testIsActiveAccount()
 */

function isActiveAccount(account) {
  // 处理边界情况：空值
  if (!account.kiroClientLastLaunchAt) return false;
  
  // 处理边界情况：无效日期
  const lastLaunch = new Date(account.kiroClientLastLaunchAt);
  if (isNaN(lastLaunch.getTime())) return false;
  
  const now = new Date();
  const diffMinutes = (now - lastLaunch) / 1000 / 60;
  
  // 处理边界情况：未来时间（视为非活跃）
  if (diffMinutes < 0) return false;
  
  return diffMinutes <= 30;
}

function testIsActiveAccount() {
  const now = new Date();
  const tests = [
    {
      name: '空值测试 - null',
      account: { kiroClientLastLaunchAt: null },
      expected: false
    },
    {
      name: '空值测试 - undefined',
      account: {},
      expected: false
    },
    {
      name: '空值测试 - 空字符串',
      account: { kiroClientLastLaunchAt: '' },
      expected: false
    },
    {
      name: '无效日期测试',
      account: { kiroClientLastLaunchAt: 'invalid-date' },
      expected: false
    },
    {
      name: '未来时间测试',
      account: { kiroClientLastLaunchAt: new Date(now.getTime() + 10 * 60 * 1000).toISOString() },
      expected: false
    },
    {
      name: '29分钟前 - 应该是活跃的',
      account: { kiroClientLastLaunchAt: new Date(now.getTime() - 29 * 60 * 1000).toISOString() },
      expected: true
    },
    {
      name: '30分钟前 - 应该是活跃的（边界值）',
      account: { kiroClientLastLaunchAt: new Date(now.getTime() - 30 * 60 * 1000 + 1000).toISOString() }, // 加1秒确保在30分钟内
      expected: true
    },
    {
      name: '31分钟前 - 应该不是活跃的',
      account: { kiroClientLastLaunchAt: new Date(now.getTime() - 31 * 60 * 1000).toISOString() },
      expected: false
    },
    {
      name: '1小时前 - 应该不是活跃的',
      account: { kiroClientLastLaunchAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString() },
      expected: false
    },
    {
      name: '刚刚启动 - 应该是活跃的',
      account: { kiroClientLastLaunchAt: now.toISOString() },
      expected: true
    },
    {
      name: '中文日期格式测试',
      account: { kiroClientLastLaunchAt: new Date(now.getTime() - 10 * 60 * 1000).toLocaleString('zh-CN', { hour12: false }) },
      expected: true
    }
  ];

  console.log('开始测试 isActiveAccount 函数...\n');
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach((test, index) => {
    const result = isActiveAccount(test.account);
    const status = result === test.expected ? '✅ 通过' : '❌ 失败';
    
    if (result === test.expected) {
      passed++;
    } else {
      failed++;
    }
    
    console.log(`测试 ${index + 1}: ${test.name}`);
    console.log(`  账号数据: ${JSON.stringify(test.account)}`);
    console.log(`  预期结果: ${test.expected}`);
    console.log(`  实际结果: ${result}`);
    console.log(`  ${status}\n`);
  });
  
  console.log('='.repeat(50));
  console.log(`测试完成！通过: ${passed}/${tests.length}, 失败: ${failed}/${tests.length}`);
  console.log('='.repeat(50));
  
  return { passed, failed, total: tests.length };
}

// 如果在 Node.js 环境中运行
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isActiveAccount, testIsActiveAccount };
}

// 自动运行测试
if (typeof window === 'undefined') {
  testIsActiveAccount();
}
