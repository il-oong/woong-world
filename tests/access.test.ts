import { test } from "node:test";
import assert from "node:assert/strict";
import { isSuperAdminEmail } from "../src/lib/admin";
import { dashboardConfigKey } from "../src/lib/dashboard-preferences";
import { defaultDashboardConfig, parseDashboardConfig } from "../src/lib/dashboard-config";

test("기본 관리자만 다른 관리자를 지정할 수 있다", () => {
  const previous = process.env.ADMIN_EMAIL;
  process.env.ADMIN_EMAIL = "kww2962@gmail.com";
  try {
    assert.equal(isSuperAdminEmail("KWW2962@GMAIL.COM"), true);
    assert.equal(isSuperAdminEmail("member@example.com"), false);
    assert.equal(isSuperAdminEmail(null), false);
  } finally {
    if (previous === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = previous;
  }
});

test("위젯 설정은 이메일마다 별도 키를 사용하고 임의 항목은 거부한다", () => {
  assert.notEqual(dashboardConfigKey("kww2962@gmail.com"), dashboardConfigKey("member@example.com"));
  assert.equal(dashboardConfigKey(" KWW2962@GMAIL.COM "), dashboardConfigKey("kww2962@gmail.com"));
  assert.deepEqual(parseDashboardConfig(defaultDashboardConfig), defaultDashboardConfig);
  assert.throws(() => parseDashboardConfig({ order: ["plugins"], hidden: [] }));
  assert.throws(() => parseDashboardConfig({ order: ["calendar", "calendar"], hidden: [] }));
});
