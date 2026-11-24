const multer = require('multer');

function errorHandler(error, request, response, next) {
  if (response.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return response.status(status).json({ error: status === 413
      ? 'Supporting documents must be no larger than 5 MB.'
      : 'Attach only one supported evidence file.' });
  }
  if (error.message === 'Attach a PDF, plain-text file, PNG image, or JPEG image.') {
    return response.status(400).json({ error: error.message });
  }
  const status = Number(error.status);
  if (status >= 500 || !Number.isInteger(status)) console.error('Request failed:', error);
  const safeStatus = status >= 400 && status < 500 ? status : 500;
  const message = safeStatus === 413
    ? 'The request body is too large.'
    : safeStatus === 400
      ? 'The request body is invalid.'
      : 'The request could not be completed. Please try again.';
  return response.status(safeStatus).json({ error: message });
}

module.exports = errorHandler;
