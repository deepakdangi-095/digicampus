import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { z } from 'zod';
import { NotificationKind, VaultStatus } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { authenticate, authorize } from '../../middleware/auth.middleware';
import { Role } from '../../types';
import { notify } from '../../services/notification.service';

const router = Router();

export const VAULT_DIR = path.resolve(env.UPLOAD_DIR, 'vault');
fs.mkdirSync(VAULT_DIR, { recursive: true });

const ALLOWED = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.txt', '.md', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.zip']);
const upload = multer({
  storage: multer.diskStorage({
    destination: VAULT_DIR,
    // Random name + whitelisted extension: the client-supplied filename never touches the disk path.
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED.has(path.extname(file.originalname).toLowerCase())),
});

const staff = authorize(Role.FACULTY, Role.HOD, Role.DEAN, Role.ADMIN);
const withUploader = { uploadedBy: { select: { name: true } } };

// GET /api/vault/resources?subject= — approved uploads only
router.get('/resources', authenticate, asyncHandler(async (req, res) => {
  const subject = req.query.subject ? String(req.query.subject) : undefined;
  res.json(await prisma.vaultResource.findMany({ where: { status: VaultStatus.APPROVED, subject }, include: withUploader, orderBy: { createdAt: 'desc' } }));
}));

// GET /api/vault/pending — moderation queue
router.get('/pending', authenticate, staff, asyncHandler(async (_req, res) => {
  res.json(await prisma.vaultResource.findMany({ where: { status: VaultStatus.PENDING }, include: withUploader, orderBy: { createdAt: 'asc' } }));
}));

const metaSchema = z.object({ title: z.string().min(1).max(120), subject: z.string().min(1).max(80) });

// POST /api/vault/upload (multipart: file + title + subject) — lands as PENDING until moderated.
router.post('/upload', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError(400, `Attach a file (field "file"). Allowed types: ${[...ALLOWED].join(' ')}`);
  const p = metaSchema.safeParse(req.body);
  if (!p.success) {
    fs.unlink(req.file.path, () => undefined);
    throw new AppError(400, 'Invalid metadata', p.error.flatten());
  }
  const resource = await prisma.vaultResource.create({
    data: { ...p.data, fileUrl: `/uploads/vault/${req.file.filename}`, uploadedById: req.user!.id, status: VaultStatus.PENDING },
  });
  res.status(201).json(resource);
}));

// PUT /api/vault/:id/moderate { status: APPROVED | REJECTED }
router.put('/:id/moderate', authenticate, staff, asyncHandler(async (req, res) => {
  const p = z.object({ status: z.enum(['APPROVED', 'REJECTED']) }).safeParse(req.body);
  if (!p.success) throw new AppError(400, 'status must be APPROVED or REJECTED');
  const r = await prisma.vaultResource.update({ where: { id: req.params.id }, data: { status: p.data.status } }).catch(() => null);
  if (!r) throw new AppError(404, 'Resource not found');
  await notify(r.uploadedById, NotificationKind.GENERAL, `Your upload "${r.title}" was ${p.data.status.toLowerCase()}`, 'Peer-to-Peer Academic Vault moderation result.');
  res.json(r);
}));

export default router;
