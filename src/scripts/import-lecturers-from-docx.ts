/* eslint-disable no-console */
import 'dotenv/config';
import * as crypto from 'crypto';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Role } from '../../generated/prisma/enums';

type LecturerRow = {
  fullName: string;
  email: string;
  phone: string;
  staffNo?: string;
  recipientCode?: string;
};

type ImportStats = {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
};

function getArgValue(flag: string): string | undefined {
  const idx = process.argv.findIndex((a) => a === flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function collectTextNodes(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectTextNodes).join('');
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    // fast-xml-parser default text node is '#text'
    const directText = obj['#text'];
    if (typeof directText === 'string' || typeof directText === 'number') {
      return String(directText);
    }
    return Object.values(obj).map(collectTextNodes).join('');
  }
  return '';
}

function extractDocxTables(docxPath: string): string[][][] {
  const zip = new AdmZip(docxPath);
  const entry = zip.getEntry('word/document.xml');
  if (!entry) {
    throw new Error('Invalid .docx: missing word/document.xml');
  }

  const xml = entry.getData().toString('utf8');
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    // keepNodeTypes is not needed; we traverse structurally
  });
  const doc = parser.parse(xml) as Record<string, unknown>;

  const tables: unknown[] = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) {
      for (const item of n) visit(item);
      return;
    }
    const obj = n as Record<string, unknown>;
    if (obj.tbl) {
      const found = obj.tbl;
      if (Array.isArray(found)) tables.push(...found);
      else tables.push(found);
    }
    for (const v of Object.values(obj)) visit(v);
  };

  visit(doc);

  const out: string[][][] = [];
  for (const tbl of tables) {
    const rows: string[][] = [];
    const trList = asArray((tbl as any).tr);
    for (const tr of trList) {
      const cells: string[] = [];
      const tcList = asArray((tr as any).tc);
      for (const tc of tcList) {
        // Text is typically in tc.p.r.t but can be nested; just collect all t nodes
        const texts: string[] = [];
        const walk = (node: unknown) => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) {
            for (const item of node) walk(item);
            return;
          }
          const o = node as Record<string, unknown>;
          if (o.t) {
            const tNodes = asArray(o.t);
            for (const t of tNodes) {
              const tText = collectTextNodes(t).trim();
              if (tText) texts.push(tText);
            }
          }
          for (const v of Object.values(o)) walk(v);
        };
        walk(tc);
        cells.push(texts.join(' ').replace(/\s+/g, ' ').trim());
      }
      const hasAny = cells.some((c) => c && c.trim().length > 0);
      if (hasAny) rows.push(cells);
    }
    if (rows.length > 0) out.push(rows);
  }

  return out;
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function guessMapping(headers: string[]): {
  fullNameIdx?: number;
  emailIdx?: number;
  phoneIdx?: number;
  staffNoIdx?: number;
  recipientCodeIdx?: number;
} {
  const norm = headers.map((h) => normalizeHeader(h));

  const find = (pred: (v: string) => boolean) => {
    const idx = norm.findIndex(pred);
    return idx === -1 ? undefined : idx;
  };

  return {
    fullNameIdx: find(
      (v) => v === 'name' || v === 'full name' || v.includes('lecturer name'),
    ),
    emailIdx: find((v) => v.includes('email')),
    phoneIdx: find(
      (v) =>
        v === 'phone' ||
        v === 'phone number' ||
        v.includes('mobile') ||
        v.includes('contact'),
    ),
    staffNoIdx: find(
      (v) =>
        v === 'staff no' ||
        v === 'staff number' ||
        v === 'staffno' ||
        v === 'lecturer id' ||
        v === 'lecturerid' ||
        v === 'id',
    ),
    recipientCodeIdx: find((v) => v.includes('recipient')),
  };
}

function tableLooksLikeLecturers(table: string[][]): boolean {
  if (table.length < 2) return false;
  const headerRow = table[0] ?? [];
  const headers = headerRow.map(normalizeHeader);
  const headerText = headers.join(' | ');
  return (
    headerText.includes('email') &&
    (headerText.includes('phone') ||
      headerText.includes('mobile') ||
      headerText.includes('contact'))
  );
}

function sanitizeEmail(value: string): string {
  const raw = value.trim().toLowerCase();
  if (!raw) return '';

  // Some .docx cells contain multiple emails like: "a@b.com ; c@d.com".
  // Import a single primary email (first token) to keep the DB consistent.
  const primary = raw.split(/[;,]/g)[0] ?? '';
  return primary.replace(/\s+/g, '');
}

function sanitizePhone(value: string): string {
  const raw = value.trim();
  if (!raw) return '';

  // Pick the first phone-like chunk if many are present.
  // Examples seen in the docx:
  // - "208150873 ; 244245005"
  // - "+233 (0) 54 221 1099"
  // - "Phone: 233546533719 ; WhatsApp: 233261240131"
  const firstMatch = raw.match(/[+]?\d[\d\s\-()]{6,}/);
  const candidate = (firstMatch?.[0] ?? raw).trim();

  // Keep only digits for normalization
  let digits = candidate.replace(/\D/g, '');
  if (!digits) return '';

  // Normalize common prefixes
  if (digits.startsWith('00233')) digits = '233' + digits.slice(5);
  if (digits.startsWith('2330')) digits = '233' + digits.slice(4); // "+233 (0) ..."

  // Ghana mobile format should end up as 233 + 9 digits
  if (digits.startsWith('0') && digits.length >= 10) {
    digits = '233' + digits.slice(1, 10);
  } else if (digits.startsWith('233') && digits.length >= 12) {
    digits = digits.slice(0, 12);
  } else if (digits.length === 9) {
    digits = '233' + digits;
  } else if (digits.length > 12 && digits.includes('233')) {
    // If other numbers/labels are present, try anchoring from the first 233
    const idx = digits.indexOf('233');
    digits = digits.slice(idx, idx + 12);
  }

  // Final fallback: if we still don't have 12 digits, use the last 9 as local number.
  if (
    !(digits.startsWith('233') && digits.length === 12) &&
    digits.length >= 9
  ) {
    digits = '233' + digits.slice(-9);
  }

  return `+${digits}`;
}

function sanitizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function sanitizeOptionalId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (!v) return undefined;
  return v;
}

function validateRow(row: LecturerRow): string[] {
  const issues: string[] = [];
  if (!row.fullName) issues.push('Missing full name');
  if (!row.email) issues.push('Missing email');
  if (!row.phone) issues.push('Missing phone');
  // staffNo is optional in schema
  return issues;
}

async function main() {
  const docx = getArgValue('--docx');
  const dryRun = hasFlag('--dry-run');
  const hourlyRate = Number(getArgValue('--hourly-rate') ?? '120');

  if (!docx) {
    console.error(
      'Usage: npx ts-node src/scripts/import-lecturers-from-docx.ts --docx <path-to-docx> [--dry-run] [--hourly-rate 120]',
    );
    process.exitCode = 1;
    return;
  }

  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    console.error(`Invalid hourly rate: ${hourlyRate}`);
    process.exitCode = 1;
    return;
  }

  const resolvedDocx = path.resolve(process.cwd(), docx);
  console.log(`Reading: ${resolvedDocx}`);

  const tables = extractDocxTables(resolvedDocx);
  if (tables.length === 0) {
    console.error(
      'No tables found in .docx. If the document is not a table, please export it as CSV/Excel and I can import that instead.',
    );
    process.exitCode = 1;
    return;
  }

  const candidateTables = tables.filter(tableLooksLikeLecturers);
  const table = candidateTables[0] ?? tables[0];
  const headerRow = table[0] ?? [];
  const mapping = guessMapping(headerRow);

  console.log('Detected headers:', headerRow);
  console.log('Column mapping:', mapping);

  if (
    mapping.emailIdx == null ||
    mapping.fullNameIdx == null ||
    mapping.phoneIdx == null
  ) {
    console.error(
      'Could not reliably detect columns from the header row. Detected headers:',
    );
    console.error(headerRow);
    console.error(
      'Expected headers like: Name, Email, Phone, Lecturer ID/Staff No (optional).',
    );
    process.exitCode = 1;
    return;
  }

  const rows: LecturerRow[] = [];
  for (const dataRow of table.slice(1)) {
    const fullName = sanitizeName(dataRow[mapping.fullNameIdx] ?? '');
    const email = sanitizeEmail(dataRow[mapping.emailIdx] ?? '');
    const phone = sanitizePhone(dataRow[mapping.phoneIdx] ?? '');
    const staffNo = sanitizeOptionalId(
      mapping.staffNoIdx != null ? dataRow[mapping.staffNoIdx] : undefined,
    );
    const recipientCode = sanitizeOptionalId(
      mapping.recipientCodeIdx != null
        ? dataRow[mapping.recipientCodeIdx]
        : undefined,
    );

    // Skip totally blank lines
    if (!fullName && !email && !phone && !staffNo) continue;

    rows.push({ fullName, email, phone, staffNo, recipientCode });
  }

  const dedupedByEmail = new Map<string, LecturerRow>();
  for (const r of rows) {
    if (!r.email) continue;
    if (!dedupedByEmail.has(r.email)) dedupedByEmail.set(r.email, r);
  }
  const finalRows = [...dedupedByEmail.values()];

  console.log(
    `Parsed ${rows.length} rows; ${finalRows.length} unique by email.`,
  );

  // Pre-validate and show issues before DB work
  const invalid: Array<{ row: LecturerRow; issues: string[] }> = [];
  for (const r of finalRows) {
    const issues = validateRow(r);
    if (issues.length) invalid.push({ row: r, issues });
  }

  if (invalid.length) {
    console.error(
      `Validation failed for ${invalid.length} row(s). Fix these first to avoid partial imports:`,
    );
    for (const item of invalid.slice(0, 20)) {
      console.error(
        `- ${item.row.email || '(no email)'}: ${item.issues.join(', ')}`,
      );
    }
    if (invalid.length > 20)
      console.error(`...and ${invalid.length - 20} more`);
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log('--- Dry run preview (first 10) ---');
    for (const r of finalRows.slice(0, 10)) {
      console.log({ ...r, hourlyRate });
    }
    console.log(`Dry run: would import ${finalRows.length} lecturer(s).`);
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error('Missing DATABASE_URL in environment.');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const stats: ImportStats = {
    total: finalRows.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    await prisma.$connect();

    for (const r of finalRows) {
      try {
        const existingUser = await prisma.user.findUnique({
          where: { email: r.email },
        });

        // Guard: if staffNo is provided and already used by a different lecturer, skip
        if (r.staffNo) {
          const existingLecturerByStaffNo = await prisma.lecturer.findUnique({
            where: { staffNo: r.staffNo },
            include: { user: true },
          });
          if (
            existingLecturerByStaffNo &&
            existingLecturerByStaffNo.user.email !== r.email
          ) {
            console.warn(
              `Skipping ${r.email}: staffNo ${r.staffNo} already belongs to ${existingLecturerByStaffNo.user.email}`,
            );
            stats.skipped++;
            continue;
          }
        }

        await prisma.$transaction(async (tx) => {
          if (!existingUser) {
            const randomPassword = crypto.randomBytes(6).toString('base64url');
            const hashedPassword = await bcrypt.hash(randomPassword, 10);

            const user = await tx.user.create({
              data: {
                email: r.email,
                name: r.fullName,
                role: Role.LECTURER,
                phone: r.phone,
                password: hashedPassword,
                isActive: true,
                isPasswordChanged: false,
              },
            });

            await tx.lecturer.create({
              data: {
                userId: user.id,
                staffNo: r.staffNo,
                hourlyRate,
                recipientCode: r.recipientCode,
              },
            });

            stats.created++;
            return;
          }

          // Existing user found: ensure they are (or become) a lecturer
          await tx.user.update({
            where: { id: existingUser.id },
            data: {
              name: r.fullName || existingUser.name,
              phone: r.phone || existingUser.phone,
              role: Role.LECTURER,
              isActive: true,
            },
          });

          const existingLecturer = await tx.lecturer.findUnique({
            where: { userId: existingUser.id },
          });
          if (!existingLecturer) {
            await tx.lecturer.create({
              data: {
                userId: existingUser.id,
                staffNo: r.staffNo,
                hourlyRate,
                recipientCode: r.recipientCode,
              },
            });
            stats.created++;
            return;
          }

          await tx.lecturer.update({
            where: { id: existingLecturer.id },
            data: {
              hourlyRate,
              staffNo: r.staffNo ?? undefined,
              recipientCode: r.recipientCode ?? undefined,
            },
          });

          stats.updated++;
        });
      } catch (e) {
        stats.errors++;
        console.error(`Error importing ${r.email}:`, e);
      }
    }
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }

  console.log('--- Import summary ---');
  console.log(stats);
  if (dryRun) {
    console.log('Dry run completed. Re-run without --dry-run to write to DB.');
  }
}

void main();
