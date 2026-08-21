// client/src/studio/UploadForm.logic.js
//
// The pure, dependency-free validation behind UploadForm.jsx, pulled into its
// own module so it is unit-testable with a bare `node --test` run, without
// React installed — the same split as
// client/src/sections/generated/HeroSection.logic.js and for the same reason.
//
// It lives here rather than inside the .jsx because Node cannot import JSX. The
// alternative the test previously used was to slice this function out of the
// component's source text and rebuild it with `new Function`, which breaks the
// moment anyone reorders the file or adds a second import — and it tests a
// reconstruction of the code rather than the code the browser actually runs.
//
// The accepted formats and the size ceiling are CONTRACT.md §13.1's, and they
// must stay in step with the server's own check in
// server/src/pipeline/stage1InputAcquisition.js. A file this form accepts and
// the server then rejects is a worse experience than rejecting it up front,
// which is the whole point of validating client-side (FR-G01).

export function validateFile(file) {
  if (!file) {
    return 'Please select a wireframe image to upload.';
  }

  const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  if (!acceptedTypes.includes(file.type)) {
    return 'Invalid file format. Please upload a PNG, JPEG, or WebP image.';
  }

  const maxSize = 8 * 1024 * 1024; // 8 MB
  if (file.size > maxSize) {
    return 'File is too large. The maximum allowed size is 8 MB.';
  }

  return null;
}
