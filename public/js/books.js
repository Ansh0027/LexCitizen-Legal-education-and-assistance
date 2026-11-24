const menuButton = document.querySelector('#booksMenuButton');
const navigation = document.querySelector('#booksNavigation');

menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!open));
  navigation.classList.toggle('mobile-open', !open);
});
