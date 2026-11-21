const fs = require('node:fs');
const { open, unlink } = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const multer = require('multer');

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const documentRoot = path.resolve(
  process.env.DOCUMENTS_DIR || path.join(__dirname, '../../storage/documents')
);
const pendingDirectory = path.join(documentRoot, 'pending');
const privateDirectory = path.join(documentRoot, 'private');

fs.mkdirSync(pendingDirectory, { recursive: true, mode: 0o700 });
fs.mkdirSync(privateDirectory, { recursive: true, mode: 0o700 });

const allowedTypes = new Map([
  ['application/pdf', new Set(['.pdf'])],
  ['image/jpeg', new Set(['.jpg', '.jpeg'])],
  ['image/png', new Set(['.png'])]
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: pendingDirectory,
    filename(req, file, callback) {
      callback(null, randomUUID());
    }
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 10, fieldSize: 16 * 1024 },
  fileFilter(req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      const error = new Error('Format non autorisé. Formats acceptés : PDF, JPEG et PNG.');
      error.code = 'INVALID_DOCUMENT_TYPE';
      return callback(error);
    }
    return callback(null, true);
  }
});

function receiveDiploma(req, res, next) {
  upload.single('diplome')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Le diplôme ne doit pas dépasser 5 Mo.' });
    }
    if (error.code === 'INVALID_DOCUMENT_TYPE') {
      return res.status(400).json({ error: error.message });
    }
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ error: 'Fichier de candidature invalide.' });
    }
    return next(error);
  });
}

async function verifyDiploma(file) {
  const handle = await open(file.path, 'r');
  const header = Buffer.alloc(1024);
  let bytesRead;
  try {
    ({ bytesRead } = await handle.read(header, 0, header.length, 0));
  } finally {
    await handle.close();
  }

  const content = header.subarray(0, bytesRead);
  let detectedType = null;
  if (content.includes(Buffer.from('%PDF-'))) detectedType = 'application/pdf';
  else if (content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) detectedType = 'image/jpeg';
  else if (content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    detectedType = 'image/png';
  }

  const safeName = safeOriginalName(file.originalname);
  const allowedExtensions = allowedTypes.get(detectedType);
  if (detectedType !== file.mimetype || !allowedExtensions?.has(path.extname(safeName).toLowerCase())) {
    const error = new Error('Le contenu du fichier ne correspond pas à un PDF, JPEG ou PNG valide.');
    error.code = 'INVALID_DOCUMENT_CONTENT';
    throw error;
  }
  return detectedType;
}

function safeOriginalName(originalName) {
  return String(originalName || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[\x00-\x1f\x7f]/g, '_')
    .trim()
    .slice(0, 255) || 'diplome';
}

function getStoredPath(storageKey) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storageKey)) {
    throw new Error('Clé de stockage de document invalide.');
  }
  return path.join(privateDirectory, storageKey);
}

async function removeFile(filePath) {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

module.exports = { getStoredPath, receiveDiploma, removeFile, safeOriginalName, verifyDiploma };
