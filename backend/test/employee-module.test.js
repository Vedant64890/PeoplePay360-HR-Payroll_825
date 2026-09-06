import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import app from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import {
  createEmployeeFixture,
  cleanupEmployeeFixture,
} from "./helpers/employee-fixture.js";

test(
  "employee module end-to-end API workflows and ownership",
  { timeout: 120000 },
  async (t) => {
    const fixture = await createEmployeeFixture();
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api`,
      cookies = [];
    async function request(
      path,
      {
        method = "GET",
        body,
        actor = 0,
        type = "application/json",
        origin = process.env.FRONTEND_URL || "http://localhost:3000",
      } = {},
    ) {
      const result = await fetch(base + path, {
        method,
        headers: {
          "Content-Type": type,
          Origin: origin,
          ...(cookies[actor] ? { Cookie: cookies[actor] } : {}),
        },
        ...(body !== undefined
          ? { body: type === "application/json" ? JSON.stringify(body) : body }
          : {}),
      });
      const content = result.headers.get("content-type") || "";
      return {
        status: result.status,
        headers: result.headers,
        cookie: result.headers.get("set-cookie")?.split(";")[0],
        body: content.includes("json")
          ? await result.json()
          : Buffer.from(await result.arrayBuffer()),
      };
    }
    try {
      for (const [index, user] of fixture.users.entries()) {
        const login = await request("/auth/login", {
          method: "POST",
          body: { email: user.email, password: fixture.password },
          actor: index,
        });
        assert.equal(login.status, 200, JSON.stringify(login.body));
        cookies[index] = login.cookie;
      }
      await t.test(
        "authentication, role checks, validation and private profile",
        async () => {
          assert.equal(
            (await request("/employee/contacts", { actor: 9 })).status,
            401,
          );
          assert.equal(
            (await request("/employee/contacts", { actor: 2 })).status,
            403,
          );
          assert.equal(
            (await request("/employee/dashboard?month=2026-09&employeeId=1"))
              .status,
            400,
          );
          assert.equal(
            (await request("/employee/schedule?month=2026-13")).status,
            400,
          );
          assert.equal(
            (
              await request("/employee/profile", {
                method: "PATCH",
                body: { wage: 100000 },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("/employee/profile", {
                method: "PATCH",
                body: {
                  personalPhone: "5550199",
                  state: "Karnataka",
                  countryCode: "IN",
                },
              })
            ).status,
            200,
          );
          const profile = (await request("/employee/dashboard?month=2026-09"))
            .body.data.profile;
          assert.equal(profile.personalPhone, "5550199");
          assert.equal(profile.state, "Karnataka");
          assert.equal(
            (
              await prisma.employee.findUnique({
                where: { id: fixture.employees[1].id },
              })
            ).personalPhone,
            "PRIVATE_PHONE",
          );
        },
      );
      await t.test(
        "directory exposes work contacts with search and pagination",
        async () => {
          const result = await request(
            `/employee/contacts?departmentId=${fixture.department.id}`,
          );
          assert.equal(result.status, 200, JSON.stringify(result.body));
          assert.equal(result.body.data.total, 2);
          const serialized = JSON.stringify(result.body);
          for (const secret of [
            "PRIVATE_PHONE",
            "PRIVATE_ADDRESS",
            "PRIVATE_CONTACT",
            "private@example.test",
            "password",
            "accountNumberEncrypted",
          ])
            assert.ok(!serialized.includes(secret), secret);
          assert.equal(
            (
              await request(
                `/employee/contacts?q=Jordan&departmentId=${fixture.department.id}`,
              )
            ).body.data.total,
            1,
          );
          assert.equal(
            (
              await request(
                `/employee/contacts?page=2&departmentId=${fixture.department.id}`,
              )
            ).body.data.items.length,
            0,
          );
        },
      );
      await t.test(
        "schedule calendar includes all dates, breaks and holidays",
        async () => {
          const result = await request("/employee/schedule?month=2026-09");
          assert.equal(result.status, 200, JSON.stringify(result.body));
          assert.equal(result.body.data.days.length, 30);
          assert.equal(
            result.body.data.days.find((d) => d.date === "2026-09-07").minutes,
            480,
          );
          assert.equal(
            result.body.data.days.find((d) => d.date === "2026-09-06").status,
            "REST_DAY",
          );
          assert.equal(
            result.body.data.days.find((d) => d.date === "2026-09-16").holiday,
            "QA Company Holiday",
          );
          assert.equal(
            result.body.data.days.find((d) => d.date === "2026-09-16").minutes,
            0,
          );
        },
      );
      await t.test(
        "payroll hides draft and other employees' statements including PDFs",
        async () => {
          const payroll = await request("/employee/payroll?year=2026");
          assert.equal(payroll.status, 200, JSON.stringify(payroll.body));
          assert.deepEqual(
            payroll.body.data.slips.map((s) => s.id),
            [fixture.slips[0].id],
          );
          assert.equal(payroll.body.data.totals[0].net, "45000");
          assert.deepEqual(
            payroll.body.data.pendingSlips.map((s) => s.id),
            [fixture.slips[1].id],
          );
          assert.equal(payroll.body.data.pendingSlips[0].status, "DRAFT");
          assert.equal(payroll.body.data.pendingSlips[0].netAmount, undefined);
          assert.equal(
            (await request(`/employee/payslips/${fixture.slips[0].id}`)).status,
            200,
          );
          for (const slip of fixture.slips.slice(1)) {
            assert.equal(
              (await request(`/employee/payslips/${slip.id}`)).status,
              404,
            );
            assert.equal(
              (await request(`/employee/payslips/${slip.id}/pdf`)).status,
              404,
            );
          }
          const pdf = await request(
            `/employee/payslips/${fixture.slips[0].id}/pdf`,
          );
          assert.equal(pdf.status, 200, JSON.stringify(pdf.body));
          assert.equal(pdf.body.subarray(0, 5).toString(), "%PDF-");
          assert.equal(pdf.headers.get("cache-control"), "no-store");
          assert.ok(
            pdf.headers.get("content-disposition").startsWith("attachment"),
          );
          assert.equal(
            (await request("/employee/contracts")).body.data.length,
            1,
          );
          assert.equal(
            (await request("/employee/contracts", { actor: 1 })).body.data
              .length,
            0,
          );
        },
      );
      await t.test(
        "computed payslips show awaiting approval, then move to released after validation",
        async () => {
          const id = fixture.slips[1].id;
          try {
            await prisma.payslip.update({
              where: { id },
              data: { status: "COMPUTED" },
            });
            let result = await request("/employee/payroll?year=2026");
            const pending = result.body.data.pendingSlips.find(
              (s) => s.id === id,
            );
            assert.equal(pending.status, "COMPUTED");
            assert.deepEqual(Object.keys(pending).sort(), [
              "id",
              "number",
              "periodEnd",
              "periodStart",
              "status",
            ]);
            assert.equal(
              (await request(`/employee/payslips/${id}/pdf`)).status,
              404,
            );
            assert.equal(
              (await request("/employee/payroll?year=2026", { actor: 1 })).body
                .data.pendingSlips.length,
              0,
            );
            await prisma.payslip.update({
              where: { id },
              data: { status: "VALIDATED" },
            });
            result = await request("/employee/payroll?year=2026");
            assert.equal(result.body.data.pendingSlips.length, 0);
            assert.ok(result.body.data.slips.some((s) => s.id === id));
            assert.equal(
              (await request(`/employee/payslips/${id}`)).status,
              200,
            );
          } finally {
            await prisma.payslip.update({
              where: { id },
              data: { status: "DRAFT" },
            });
          }
        },
      );
      let document;
      const bytes = Buffer.from("%PDF-1.4\nQA employee document\n%%EOF");
      await t.test(
        "document upload, metadata, authenticated download, validation and deletion",
        async () => {
          const path =
            "/employee/documents?title=QA%20Certificate&category=EDUCATION&fileName=certificate.pdf";
          assert.equal(
            (
              await request(path, {
                method: "POST",
                type: "application/pdf",
                body: bytes,
                origin: "https://invalid.test",
              })
            ).status,
            403,
          );
          assert.equal(
            (
              await request(path, {
                method: "POST",
                type: "application/pdf",
                body: Buffer.from("not a PDF"),
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request(path, {
                method: "POST",
                type: "application/pdf",
                body: Buffer.alloc(5 * 1024 * 1024 + 1),
              })
            ).status,
            413,
          );
          const uploaded = await request(path, {
            method: "POST",
            type: "application/pdf",
            body: bytes,
          });
          assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
          document = uploaded.body.data;
          assert.equal(document.content, undefined);
          assert.equal(document.byteSize, bytes.length);
          assert.equal(
            (await request("/employee/documents")).body.data.length,
            1,
          );
          assert.equal(
            (await request("/employee/documents", { actor: 1 })).body.data
              .length,
            0,
          );
          assert.deepEqual(
            (await request(`/employee/documents/${document.id}/download`)).body,
            bytes,
          );
          assert.equal(
            (
              await request(`/employee/documents/${document.id}/download`, {
                actor: 1,
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await request(`/employee/documents/${document.id}`, {
                method: "DELETE",
                actor: 1,
              })
            ).status,
            404,
          );
        },
      );
      await t.test(
        "notification read state persists and cannot be written for a colleague",
        async () => {
          let feed = await request("/employee/notifications");
          assert.equal(feed.status, 200, JSON.stringify(feed.body));
          assert.equal(feed.body.data.unread, 2);
          const keys = feed.body.data.items.map((i) => i.key);
          assert.equal(
            (
              await request("/employee/notifications/read", {
                method: "POST",
                body: { keys },
                actor: 1,
              })
            ).status,
            404,
          );
          assert.equal(
            (
              await request("/employee/notifications/read", {
                method: "POST",
                body: { keys },
              })
            ).status,
            200,
          );
          assert.equal(
            (await request("/employee/notifications")).body.data.unread,
            0,
          );
          await prisma.payslip.update({
            where: { id: fixture.slips[0].id },
            data: { status: "PAID", paidAt: new Date() },
          });
          feed = await request("/employee/notifications");
          assert.equal(feed.body.data.unread, 1);
          assert.ok(
            feed.body.data.items.some(
              (i) => i.title === "Salary payment recorded",
            ),
          );
        },
      );
      await t.test(
        "saved preferences affect notifications and stay private",
        async () => {
          const preferences = (await request("/employee/settings")).body.data;
          assert.equal(preferences.theme, "system");
          const body = {
            ...preferences,
            theme: "dark",
            weekStartsOn: 0,
            payrollUpdates: false,
            defaultSection: "schedule",
          };
          assert.equal(
            (await request("/employee/settings", { method: "PUT", body }))
              .status,
            200,
          );
          assert.deepEqual(
            (await request("/employee/settings")).body.data,
            body,
          );
          assert.equal(
            (await request("/employee/settings", { actor: 1 })).body.data.theme,
            "system",
          );
          assert.ok(
            (await request("/employee/notifications")).body.data.items.every(
              (i) => i.category !== "payroll",
            ),
          );
          assert.equal(
            (
              await request("/employee/settings", {
                method: "PUT",
                body: { ...body, theme: "invalid" },
              })
            ).status,
            400,
          );
        },
      );
      await t.test(
        "leave requests appear in notification feed and can be withdrawn",
        async () => {
          const result = await request("/employee/leave", {
            method: "POST",
            body: {
              leaveTypeId: fixture.leaveType.id,
              startDate: "2026-09-21",
              endDate: "2026-09-21",
              reason: "QA leave request",
            },
          });
          assert.equal(result.status, 200, JSON.stringify(result.body));
          const feed = (await request("/employee/notifications")).body.data;
          assert.ok(
            feed.items.some(
              (i) => i.category === "leave" && i.title.includes("submitted"),
            ),
          );
          assert.equal(
            (
              await request(`/employee/leave/${result.body.data.id}/cancel`, {
                method: "POST",
                body: { reason: "QA plans changed" },
              })
            ).status,
            200,
          );
        },
      );
      await t.test(
        "deleting a file removes it from the library and notification feed",
        async () => {
          assert.equal(
            (
              await request(`/employee/documents/${document.id}`, {
                method: "DELETE",
              })
            ).status,
            200,
          );
          assert.equal(
            (await request(`/employee/documents/${document.id}/download`))
              .status,
            404,
          );
          assert.ok(
            (await request("/employee/notifications")).body.data.items.every(
              (i) => i.category !== "document",
            ),
          );
        },
      );
      await t.test(
        "password change verifies current password and invalidates previous sessions",
        async () => {
          const newPassword = "Employee-QA-new-password-2026";
          assert.equal(
            (
              await request("/employee/settings/password", {
                method: "POST",
                body: { currentPassword: "wrong", newPassword },
              })
            ).status,
            400,
          );
          assert.equal(
            (
              await request("/employee/settings/password", {
                method: "POST",
                body: { currentPassword: fixture.password, newPassword },
              })
            ).status,
            200,
          );
          assert.equal((await request("/employee/settings")).status, 401);
          const login = await request("/auth/login", {
            method: "POST",
            body: { email: fixture.users[0].email, password: newPassword },
          });
          assert.equal(login.status, 200);
          cookies[0] = login.cookie;
          assert.equal((await request("/employee/settings")).status, 200);
        },
      );
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await cleanupEmployeeFixture(fixture);
      await prisma.$disconnect();
    }
  },
);
