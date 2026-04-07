const { z } = require("zod");

const personnummerRegex = /^\d{8}-\d{4}$/;
const phoneRegex = /^[\+]?[0-9\s\-\(\)]{8,}$/;
const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

const swedishDays = [
  "Måndag",
  "Tisdag",
  "Onsdag",
  "Torsdag",
  "Fredag",
  "Lördag",
  "Söndag",
];

function getMinimumPersonnummerYear() {
  return new Date().getFullYear() - 120;
}

function isAllowedBirthYear(year) {
  const currentYear = new Date().getFullYear();
  return Number.isInteger(year) && year >= getMinimumPersonnummerYear() && year <= currentYear;
}

function parseBirthDateFromPersonnummer(personnummer) {
  if (!personnummerRegex.test(personnummer)) return null;

  const [birthPart] = personnummer.split("-");
  const year = Number(birthPart.slice(0, 4));
  const month = Number(birthPart.slice(4, 6));
  const day = Number(birthPart.slice(6, 8));

  if (!isAllowedBirthYear(year)) {
    return null;
  }

  const birthDate = new Date(year, month - 1, day);

  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return null;
  }

  birthDate.setHours(0, 0, 0, 0);
  return birthDate;
}

function calculateAgeFromPersonnummer(personnummer, referenceDate = new Date()) {
  const birthDate = parseBirthDateFromPersonnummer(personnummer);
  if (!birthDate) return null;

  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

function isMinorFromPersonnummer(personnummer) {
  const age = calculateAgeFromPersonnummer(personnummer);
  if (age === null) return false;

  return age < 18;
}

function isFutureBirthDate(personnummer) {
  const birthDate = parseBirthDateFromPersonnummer(personnummer);
  if (!birthDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return birthDate > today;
}

const registerSchema = z
  .object({
    email: z.email({ message: "Ange en giltig e-postadress" }),
    password: z.string().min(8, "Lösenordet måste vara minst 8 tecken").optional(),
    first_name: z.string().trim().min(1, "Förnamn är obligatoriskt"),
    last_name: z.string().trim().min(1, "Efternamn är obligatoriskt"),
    personnummer: z.string().regex(personnummerRegex, "Ange personnummer som YYYYMMDD-XXXX"),
    phone: z.string().regex(phoneRegex, "Ange ett giltigt telefonnummer"),
    address: z.string().trim().min(1, "Adress är obligatorisk"),
    parent_name: z.string().trim().optional().or(z.literal("")),
    parent_lastname: z.string().trim().optional().or(z.literal("")),
    parent_phone: z.string().trim().optional().or(z.literal("")),
    website: z.string().trim().max(0, "Ogiltig förfrågan").optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (!parseBirthDateFromPersonnummer(data.personnummer)) {
      ctx.addIssue({
        code: "custom",
        message: "Ange ett giltigt datum i personnumret",
        path: ["personnummer"],
      });
      return;
    }

    if (isFutureBirthDate(data.personnummer)) {
      ctx.addIssue({
        code: "custom",
        message: "Personnumret kan inte innehÃ¥lla ett framtida fÃ¶delsedatum",
        path: ["personnummer"],
      });
      return;
    }

    if (isMinorFromPersonnummer(data.personnummer)) {
      if (!data.parent_name || !data.parent_lastname || !data.parent_phone) {
        ctx.addIssue({
          code: "custom",
          message: "Vårdnadshavares namn och telefon krävs för minderåriga",
          path: ["parent_name"],
        });
      }
    }
  });

const loginSchema = z.object({
  email: z.email({ message: "Ange en giltig e-postadress" }),
  password: z.string().min(1, "Lösenord är obligatoriskt"),
});

const adminCreateSchema = z.object({
  email: z.email(),
  password: z.string().min(12),
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().min(1),
  phone: z.string().trim().optional().or(z.literal("")),
});

const adminManualPaymentEmailSchema = z.object({
  email: z.email({ message: "Ange en giltig e-postadress" }),
});

const sportSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  age_groups: z.array(z.string().trim().min(1)).default([]),
  is_active: z.boolean().optional(),
  existing_image_path: z.string().optional(),
});

const scheduleSchema = z
  .object({
    sport_id: z.coerce.number().int().positive(),
    day_of_week: z.string().refine((value) => swedishDays.includes(value), {
      message: "Invalid day of week",
    }),
    start_time: z.string().regex(timeRegex),
    end_time: z.string().regex(timeRegex),
    age_group: z.string().trim().min(1),
    max_participants: z.coerce.number().int().min(1).max(500).default(20),
    is_active: z.boolean().optional(),
  })
  .refine((data) => data.start_time < data.end_time, {
    message: "Start time must be before end time",
    path: ["start_time"],
  });

const socialLinkSchema = z.object({
  platform: z.string().trim().min(1).max(40),
  url: z.url(),
  icon_class: z.string().trim().min(1).max(80),
  display_order: z.coerce.number().int().min(0).max(1000).default(0),
  is_active: z.boolean().optional(),
});

const contactInfoSchema = z.object({
  type: z.string().trim().min(1).max(30),
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(200),
  href: z.string().trim().max(255).optional().or(z.literal("")),
  display_order: z.coerce.number().int().min(0).max(1000).default(0),
  is_active: z.boolean().optional(),
});

const contactSubmissionSchema = z.object({
  name: z.string().trim().min(2, "Namn måste vara minst 2 tecken").max(120),
  email: z.email({ message: "Ange en giltig e-postadress" }),
  message: z.string().trim().min(10, "Meddelandet måste vara minst 10 tecken").max(4000),
  website: z.string().trim().max(0, "Ogiltig förfrågan").optional().or(z.literal("")),
});

const memberProfileUpdateSchema = z.object({
  first_name: z.string().trim().min(1, "Förnamn är obligatoriskt").max(80),
  last_name: z.string().trim().min(1, "Efternamn är obligatoriskt").max(80),
  phone: z.string().regex(phoneRegex, "Ange ett giltigt telefonnummer"),
  address: z.string().trim().min(1, "Adress är obligatorisk").max(200),
});

function normalizeBody(bodyInput) {
  const body = { ...(bodyInput || {}) };

  Object.keys(body).forEach((key) => {
    if (body[key] === "true") body[key] = true;
    if (body[key] === "false") body[key] = false;
  });

  if (body.age_groups !== undefined && !Array.isArray(body.age_groups)) {
    body.age_groups = [body.age_groups];
  }

  return body;
}

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(normalizeBody(req.body));

    if (!result.success) {
      return res.status(400).json({
        error: result.error.issues.map((issue) => issue.message).join(", "),
      });
    }

    req.validatedBody = result.data;
    next();
  };
}

module.exports = {
  validateBody,
  registerSchema,
  loginSchema,
  adminCreateSchema,
  adminManualPaymentEmailSchema,
  sportSchema,
  scheduleSchema,
  socialLinkSchema,
  contactInfoSchema,
  contactSubmissionSchema,
  memberProfileUpdateSchema,
};
