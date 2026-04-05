const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const request = require("supertest");

const testDbPath = path.join(__dirname, "test-nylose.db");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET =
  "test-secret-please-change-this-in-real-env-1234567890";
process.env.DB_PATH = testDbPath;
process.env.ADMIN_BOOTSTRAP_EMAIL = "admin@test.local";
process.env.ADMIN_BOOTSTRAP_PASSWORD = "VeryStrongTestPassword123!";
process.env.FRONTEND_URL = "http://localhost:3001";
process.env.EMAIL_HOST = "";
process.env.EMAIL_PORT = "";
process.env.EMAIL_USER = "";
process.env.EMAIL_PASS = "";
process.env.EMAIL_FROM = "";

if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

const db = require("../database/init");
const { createApp } = require("../server");

function formatPersonnummerDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function subtractYears(date, years) {
  return new Date(date.getFullYear() - years, date.getMonth(), date.getDate());
}

test.before(async () => {
  await db.initDatabase();
});

test.after(() => {
  db.close();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

test("health endpoint responds ok", async () => {
  const app = createApp();
  const response = await request(app).get("/api/health");

  assert.equal(response.status, 200);
  assert.equal(response.body.status, "OK");
});

test("admin login sets auth cookie", async () => {
  const app = createApp();
  const response = await request(app).post("/api/auth/login").send({
    email: "admin@test.local",
    password: "VeryStrongTestPassword123!",
  });

  assert.equal(response.status, 200);
  assert.ok(response.headers["set-cookie"]);
  assert.equal(response.body.user.role, "admin");
});

test("member registration is accepted and visible in admin list", async () => {
  const app = createApp();

  const registerResponse = await request(app).post("/api/auth/register").send({
    email: "member@test.local",
    first_name: "Test",
    last_name: "Member",
    personnummer: "20120101-1234",
    phone: "0701234567",
    address: "Testgatan 1",
    parent_name: "Parent",
    parent_lastname: "Member",
    parent_phone: "0707654321",
  });

  assert.equal(registerResponse.status, 201);

  const loginResponse = await request(app).post("/api/auth/login").send({
    email: "admin@test.local",
    password: "VeryStrongTestPassword123!",
  });

  const cookies = loginResponse.headers["set-cookie"];
  assert.ok(cookies);

  const membersResponse = await request(app)
    .get("/api/admin/members")
    .set("Cookie", cookies);

  assert.equal(membersResponse.status, 200);
  assert.equal(membersResponse.body.length, 1);
  assert.equal(membersResponse.body[0].email, "member@test.local");
  assert.equal(membersResponse.body[0].personnummer, "20120101-1234");
});

test("registration does not require parent details on the 18th birthday", async () => {
  const app = createApp();
  const today = new Date();
  const turned18Today = `${formatPersonnummerDate(subtractYears(today, 18))}-1234`;

  const response = await request(app).post("/api/auth/register").send({
    email: "adult18today@test.local",
    first_name: "Adult",
    last_name: "Today",
    personnummer: turned18Today,
    phone: "0701112233",
    address: "Birthday Street 18",
  });

  assert.equal(response.status, 201);
});

test("registration still requires parent details until the 18th birthday has passed", async () => {
  const app = createApp();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const turns18Tomorrow = `${formatPersonnummerDate(subtractYears(tomorrow, 18))}-1234`;

  const response = await request(app).post("/api/auth/register").send({
    email: "minor17@test.local",
    first_name: "Minor",
    last_name: "Tomorrow",
    personnummer: turns18Tomorrow,
    phone: "0703332211",
    address: "Guardian Street 17",
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error, /V.+rdnadshavares namn och telefon/i);
});

test("contact form submission is stored and visible to admin", async () => {
  const app = createApp();

  const contactResponse = await request(app).post("/api/public/contact").send({
    name: "Test Contact",
    email: "contact@test.local",
    message: "Hej! Jag vill veta mer om träningstiderna.",
  });

  assert.equal(contactResponse.status, 201);

  const loginResponse = await request(app).post("/api/auth/login").send({
    email: "admin@test.local",
    password: "VeryStrongTestPassword123!",
  });

  const submissionsResponse = await request(app)
    .get("/api/admin/contact-submissions")
    .set("Cookie", loginResponse.headers["set-cookie"]);

  assert.equal(submissionsResponse.status, 200);
  assert.equal(submissionsResponse.body.length, 1);
  assert.equal(submissionsResponse.body[0].email, "contact@test.local");
});
