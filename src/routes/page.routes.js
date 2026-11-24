const express = require('express');
const { renderPage } = require('../controllers/page.controller');

const router = express.Router();
const pages = [
  'admin-dashboard',
  'amendments',
  'books',
  'everyday-laws',
  'fundamental-duties',
  'fundamental-rights',
  'index',
  'key-articles',
  'origin-structure',
  'reader',
  'signin',
  'user-dashboard',
];

router.get('/', (request, response) => renderPage(request, response));
router.get('/:page.html', (request, response, next) => {
  const { page } = request.params;
  if (!pages.includes(page)) return next();
  return renderPage(request, response);
});

module.exports = router;
