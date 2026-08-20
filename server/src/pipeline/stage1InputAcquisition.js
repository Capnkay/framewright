import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve('uploads');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    let ext = 'jpg';
    if (file.mimetype === 'image/png') ext = 'png';
    else if (file.mimetype === 'image/webp') ext = 'webp';
    else if (file.mimetype === 'image/jpeg') ext = 'jpg';
    
    cb(null, `${req.jobId}.${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('INVALID_TYPE'));
    }
  }
}).single('image');

/**
 * Stage 1: Input Acquisition
 * Parses the multipart request, validates size & format, and writes to uploads/<jobId>.<ext>.
 * @param {import('http').IncomingMessage} req 
 * @param {import('http').ServerResponse} res 
 * @param {string} jobId 
 * @returns {Promise<{ status: number, error?: string, path?: string }>}
 */
export function acquireInput(req, res, jobId) {
  return new Promise((resolve) => {
    req.jobId = jobId;
    
    upload(req, res, (err) => {
      if (err) {
        if (err.message === 'INVALID_TYPE') {
          return resolve({ status: 400, error: 'Only PNG, JPEG, and WebP are allowed' });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          return resolve({ status: 413, error: 'File size exceeds 8 MB limit' });
        }
        return resolve({ status: 500, error: err.message });
      }
      
      if (!req.file) {
        return resolve({ status: 400, error: 'No image provided' });
      }
      
      resolve({
        status: 200,
        path: `uploads/${req.file.filename}`
      });
    });
  });
}
