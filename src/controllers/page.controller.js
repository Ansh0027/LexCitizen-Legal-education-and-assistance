function renderPage(request, response) {
  const page = request.params.page || 'index';
  return response.render(`pages/${page}`);
}

module.exports = { renderPage };
