const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.join(__dirname, "nylose.db");

function getEncryptionKey() {
  if (process.env.ENCRYPTION_KEY) {
    const hex = process.env.ENCRYPTION_KEY.trim();
    if (!/^[a-fA-F0-9]{64}$/.test(hex)) {
      throw new Error("ENCRYPTION_KEY must be a 64 character hex string");
    }
    return Buffer.from(hex, "hex");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be configured in production");
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be configured before deriving encryption");
  }

  return crypto.createHash("sha256").update(process.env.JWT_SECRET).digest();
}

class Database {
  constructor() {
    this.encryptionKey = getEncryptionKey();
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error("Error opening database:", err.message);
      } else {
        console.log("Connected to SQLite database.");
      }
    });

    this.db.run("PRAGMA foreign_keys = ON");
  }

  async initDatabase() {
    try {
      await this.createTables();
      await this.runMigrations();
      await this.seedInitialData();
      console.log("Database initialized successfully");
    } catch (error) {
      console.error("Error initializing database:", error);
      throw error;
    }
  }

  createTables() {
    return new Promise((resolve, reject) => {
      const tables = [
        `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          personnummer TEXT,
          personnummer_hash TEXT,
          phone TEXT,
          address TEXT,
          parent_name TEXT,
          parent_lastname TEXT,
          parent_phone TEXT,
          role TEXT NOT NULL CHECK (role IN ('member', 'admin')),
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS sports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          image_path TEXT,
          age_groups TEXT,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS schedules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sport_id INTEGER NOT NULL,
          day_of_week TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT NOT NULL,
          age_group TEXT NOT NULL,
          max_participants INTEGER DEFAULT 20,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (sport_id) REFERENCES sports (id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS memberships (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          trial_ends_at DATETIME,
          status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
          payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'paid', 'failed')),
          amount_paid REAL DEFAULT 600.00,
          invoice_email_sent_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          membership_id INTEGER NOT NULL,
          amount REAL NOT NULL,
          payment_method TEXT NOT NULL,
          transaction_id TEXT UNIQUE,
          status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
          payment_date DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (membership_id) REFERENCES memberships (id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS statistics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          metric_type TEXT NOT NULL,
          metric_value REAL NOT NULL,
          date_recorded DATE NOT NULL,
          additional_data TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS social_media_links (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT NOT NULL,
          url TEXT NOT NULL,
          icon_class TEXT NOT NULL,
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS contact_info (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          label TEXT NOT NULL,
          value TEXT NOT NULL,
          href TEXT,
          display_order INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS contact_submissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          message TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
      ];

      let completed = 0;
      for (const sql of tables) {
        this.db.run(sql, (err) => {
          if (err) {
            reject(err);
            return;
          }

          completed += 1;
          if (completed === tables.length) {
            resolve();
          }
        });
      }
    });
  }

  runMigrations() {
    return new Promise((resolve, reject) => {
      this.db.all("PRAGMA table_info(users)", async (err, columns) => {
        if (err) {
          reject(err);
          return;
        }

        try {
          const names = new Set(columns.map((column) => column.name));
          const queries = [];

          if (!names.has("personnummer")) {
            queries.push("ALTER TABLE users ADD COLUMN personnummer TEXT");
          }
          if (!names.has("personnummer_hash")) {
            queries.push("ALTER TABLE users ADD COLUMN personnummer_hash TEXT");
          }
          if (!names.has("address")) {
            queries.push("ALTER TABLE users ADD COLUMN address TEXT");
          }
          if (!names.has("parent_name")) {
            queries.push("ALTER TABLE users ADD COLUMN parent_name TEXT");
          }
          if (!names.has("parent_lastname")) {
            queries.push("ALTER TABLE users ADD COLUMN parent_lastname TEXT");
          }
          if (!names.has("parent_phone")) {
            queries.push("ALTER TABLE users ADD COLUMN parent_phone TEXT");
          }

          queries.push("DROP TABLE IF EXISTS events");
          queries.push(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_personnummer_hash ON users(personnummer_hash)",
          );

          for (const sql of queries) {
            await this.runQuery(sql);
          }

          const membershipColumns = await this.getAllQuery("PRAGMA table_info(memberships)");
          const membershipNames = new Set(membershipColumns.map((column) => column.name));

          if (!membershipNames.has("trial_ends_at")) {
            await this.runQuery("ALTER TABLE memberships ADD COLUMN trial_ends_at DATETIME");
            await this.runQuery(
              "UPDATE memberships SET trial_ends_at = datetime(created_at, '+14 days') WHERE trial_ends_at IS NULL",
            );
          }

          if (!membershipNames.has("invoice_email_sent_at")) {
            await this.runQuery("ALTER TABLE memberships ADD COLUMN invoice_email_sent_at DATETIME");
          }

          resolve();
        } catch (migrationError) {
          reject(migrationError);
        }
      });
    });
  }

  async cleanupLegacyContentTables() {
    const tables = [
      "schedules",
      "sports",
      "social_media_links",
      "contact_info",
      "statistics",
      "payments",
    ];

    for (const table of tables) {
      await this.runQuery(`DELETE FROM ${table}`);
    }
  }

  async seedInitialData() {
    if (process.env.RESET_LEGACY_PUBLIC_CONTENT === "true") {
      console.warn("RESET_LEGACY_PUBLIC_CONTENT is enabled. Clearing legacy content tables.");
      await this.cleanupLegacyContentTables();
    }

    await this.ensureBootstrapAdmin();
    console.log("Database prepared for hardcoded public content");
  }

  async ensureBootstrapAdmin() {
    const adminCount = await this.getQuery(
      "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
    );

    if (adminCount.count > 0) {
      return;
    }

    const bootstrapEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
    const bootstrapPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;

    if (!bootstrapEmail || !bootstrapPassword) {
      if (process.env.NODE_ENV === "production") {
        throw new Error(
          "ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must be configured before first production startup",
        );
      }

      console.warn(
        "Skipping bootstrap admin creation because ADMIN_BOOTSTRAP_EMAIL or ADMIN_BOOTSTRAP_PASSWORD is missing.",
      );
      return;
    }

    const passwordHash = await bcrypt.hash(bootstrapPassword, 12);

    await this.runQuery(
      "INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)",
      [bootstrapEmail, passwordHash, "Admin", "User", "admin"],
    );

    console.log(`Bootstrap admin created for ${bootstrapEmail}.`);
  }

  encryptValue(value) {
    if (value === null || value === undefined || value === "") {
      return value || null;
    }

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(String(value), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return `enc:v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  decryptValue(value) {
    if (!value || typeof value !== "string" || !value.startsWith("enc:v1:")) {
      return value || null;
    }

    const [, , ivHex, tagHex, encryptedHex] = value.split(":");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.encryptionKey,
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, "hex")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  hashValue(value) {
    if (!value) return null;
    return crypto.createHash("sha256").update(String(value).trim()).digest("hex");
  }

  mapUser(user) {
    if (!user) return null;

    return {
      ...user,
      personnummer: this.decryptValue(user.personnummer),
      phone: this.decryptValue(user.phone),
      address: this.decryptValue(user.address),
      parent_name: this.decryptValue(user.parent_name),
      parent_lastname: this.decryptValue(user.parent_lastname),
      parent_phone: this.decryptValue(user.parent_phone),
    };
  }

  mapAuthUser(user) {
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      is_active: user.is_active,
      created_at: user.created_at,
    };
  }

  async createMember(member) {
    return this.runQuery(
      `INSERT INTO users (
        email, password_hash, first_name, last_name, personnummer, personnummer_hash,
        phone, address, parent_name, parent_lastname, parent_phone, role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'member')`,
      [
        member.email,
        member.password_hash,
        member.first_name,
        member.last_name,
        this.encryptValue(member.personnummer),
        this.hashValue(member.personnummer),
        this.encryptValue(member.phone),
        this.encryptValue(member.address),
        this.encryptValue(member.parent_name),
        this.encryptValue(member.parent_lastname),
        this.encryptValue(member.parent_phone),
      ],
    );
  }

  async getUserByPersonnummer(personnummer) {
    const personnummerHash = this.hashValue(personnummer);
    if (!personnummerHash) return null;

    return this.getQuery("SELECT id FROM users WHERE personnummer_hash = ?", [
      personnummerHash,
    ]);
  }

  async getMembersForAdmin() {
    const rows = await this.getAllQuery(`
      SELECT id, email, first_name, last_name, personnummer, phone, address,
             parent_name, parent_lastname, parent_phone, role, is_active, created_at
      FROM users
      WHERE role = 'member'
      ORDER BY created_at DESC
    `);

    return rows.map((row) => this.mapUser(row));
  }

  async createContactSubmission(submission) {
    return this.runQuery(
      "INSERT INTO contact_submissions (name, email, message) VALUES (?, ?, ?)",
      [
        this.encryptValue(submission.name),
        this.encryptValue(submission.email),
        this.encryptValue(submission.message),
      ],
    );
  }

  async getContactSubmissions() {
    const rows = await this.getAllQuery(
      `SELECT id, name, email, message, created_at
       FROM contact_submissions
       ORDER BY created_at DESC`,
    );

    return rows.map((row) => ({
      ...row,
      name: this.decryptValue(row.name),
      email: this.decryptValue(row.email),
      message: this.decryptValue(row.message),
    }));
  }

  async updateMemberProfile(userId, profile) {
    return this.runQuery(
      `UPDATE users
       SET first_name = ?, last_name = ?, phone = ?, address = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        profile.first_name,
        profile.last_name,
        this.encryptValue(profile.phone),
        this.encryptValue(profile.address),
        userId,
      ],
    );
  }

  async getPendingTrialInvoices() {
    const rows = await this.getAllQuery(
      `SELECT m.id, m.user_id, m.start_date, m.end_date, m.trial_ends_at, m.amount_paid,
              u.email, u.first_name, u.last_name
       FROM memberships m
       JOIN users u ON u.id = m.user_id
       WHERE u.role = 'member'
         AND u.is_active = 1
         AND m.status = 'active'
         AND m.payment_status = 'pending'
         AND m.invoice_email_sent_at IS NULL
         AND datetime(COALESCE(m.trial_ends_at, datetime(m.created_at, '+14 days'))) <= datetime('now')
       ORDER BY m.created_at ASC`,
    );

    return rows;
  }

  async markTrialInvoiceSent(membershipId) {
    return this.runQuery(
      `UPDATE memberships
       SET invoice_email_sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [membershipId],
    );
  }

  async getMemberWithLatestMembershipByEmail(email) {
    const row = await this.getQuery(
      `SELECT u.id as user_id, u.email, u.first_name, u.last_name,
              m.id as membership_id, m.start_date, m.end_date, m.trial_ends_at,
              m.status, m.payment_status, m.amount_paid, m.invoice_email_sent_at
       FROM users u
       LEFT JOIN memberships m ON m.id = (
         SELECT m2.id
         FROM memberships m2
         WHERE m2.user_id = u.id
         ORDER BY datetime(m2.created_at) DESC
         LIMIT 1
       )
       WHERE u.email = ? AND u.role = 'member'
       LIMIT 1`,
      [email],
    );

    return row || null;
  }

  runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, changes: this.changes });
        }
      });
    });
  }

  getQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  getAllQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async getUserByEmail(email) {
    return this.getQuery("SELECT * FROM users WHERE email = ?", [email]);
  }

  async getUserById(id) {
    const user = await this.getQuery(
      `SELECT id, email, first_name, last_name, phone, address, personnummer,
              parent_name, parent_lastname, parent_phone, role, is_active, created_at
       FROM users
       WHERE id = ?`,
      [id],
    );

    return this.mapUser(user);
  }

  async getAuthUserById(id) {
    const user = await this.getQuery(
      `SELECT id, email, first_name, last_name, role, is_active, created_at
       FROM users
       WHERE id = ?`,
      [id],
    );

    return this.mapAuthUser(user);
  }

  close() {
    this.db.close((err) => {
      if (err) {
        console.error("Error closing database:", err.message);
      } else {
        console.log("Database connection closed.");
      }
    });
  }
}

const db = new Database();
module.exports = db;
