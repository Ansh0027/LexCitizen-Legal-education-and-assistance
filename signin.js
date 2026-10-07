const loginForm = document.querySelector('#loginForm');

if (loginForm) {
  const identityInput = document.querySelector('#identityInput');
  const identityLabel = document.querySelector('#identityLabel');
  const passwordInput = document.querySelector('#passwordInput');
  const passwordToggle = document.querySelector('#passwordToggle');
  const formMessage = document.querySelector('#formMessage');
  const identityError = document.querySelector('#identityError');
  const passwordError = document.querySelector('#passwordError');
  const submitButton = document.querySelector('#submitButton');
  const submitLabel = document.querySelector('#submitLabel');
  const portalNotice = document.querySelector('#portalNotice');
  const demoCredentials = document.querySelector('#demoCredentials');
  const tabs = document.querySelectorAll('.account-tab');
  let loginMode = 'user';

  const demoAccounts = {
    user: { identity: 'learner@lexcitizen.demo', password: 'CitizenDemo1!' },
    admin: { identity: 'admin@lexcitizen.demo', username: 'admin', password: 'AdminDemo1!' },
  };

  function showMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
    formMessage.hidden = false;
  }

  function clearErrors() {
    identityError.textContent = '';
    passwordError.textContent = '';
    identityInput.removeAttribute('aria-invalid');
    passwordInput.removeAttribute('aria-invalid');
    formMessage.hidden = true;
    formMessage.textContent = '';
  }

  function setMode(mode) {
    loginMode = mode;
    const isAdmin = mode === 'admin';
    tabs.forEach((tab) => {
      const selected = tab.dataset.mode === mode;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    identityLabel.textContent = isAdmin ? 'Admin email or username' : 'Email address';
    identityInput.type = isAdmin ? 'text' : 'email';
    identityInput.inputMode = isAdmin ? 'text' : 'email';
    identityInput.autocomplete = isAdmin ? 'username' : 'email';
    identityInput.placeholder = isAdmin ? 'Admin email or username' : 'you@example.com';
    document.querySelector('#submitLabel').textContent = isAdmin ? 'Admin sign in' : 'Sign in';
    portalNotice.hidden = !isAdmin;
    const demo = demoAccounts[mode];
    demoCredentials.textContent = `Email / username: ${demo.identity}${demo.username ? ` / ${demo.username}` : ''}\nPassword: ${demo.password}`;
    clearErrors();
  }

  function validateForm(identity, password) {
    let valid = true;
    if (!identity) {
      identityError.textContent = loginMode === 'admin' ? 'Enter your admin email or username.' : 'Enter your email address.';
      identityInput.setAttribute('aria-invalid', 'true');
      valid = false;
    } else if (loginMode === 'user' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity)) {
      identityError.textContent = 'Enter a valid email address.';
      identityInput.setAttribute('aria-invalid', 'true');
      valid = false;
    } else if (loginMode === 'admin' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity) && !/^[a-zA-Z0-9._-]{3,}$/.test(identity)) {
      identityError.textContent = 'Enter a valid email address or username.';
      identityInput.setAttribute('aria-invalid', 'true');
      valid = false;
    }

    if (!password) {
      passwordError.textContent = 'Enter your password.';
      passwordInput.setAttribute('aria-invalid', 'true');
      valid = false;
    } else if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      passwordError.textContent = 'Use at least 8 characters, including a letter and a number.';
      passwordInput.setAttribute('aria-invalid', 'true');
      valid = false;
    }
    return valid;
  }

  // TODO: Replace demo authentication with a secure backend API.
  // Never validate or store production passwords only on the frontend.
  async function authenticateDemo(identity, password) {
    const account = demoAccounts[loginMode];
    const identityMatches = identity.toLowerCase() === account.identity.toLowerCase()
      || (account.username && identity.toLowerCase() === account.username.toLowerCase());
    return identityMatches && password === account.password;
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));

  passwordToggle.addEventListener('click', () => {
    const showPassword = passwordInput.type === 'password';
    passwordInput.type = showPassword ? 'text' : 'password';
    passwordToggle.textContent = showPassword ? 'Hide' : 'Show';
    passwordToggle.setAttribute('aria-label', showPassword ? 'Hide password' : 'Show password');
    passwordToggle.setAttribute('aria-pressed', String(showPassword));
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    const identity = identityInput.value.trim();
    const password = passwordInput.value;
    if (!validateForm(identity, password)) {
      showMessage('Please correct the highlighted fields and try again.', 'error');
      return;
    }

    submitButton.disabled = true;
    submitLabel.textContent = 'Signing in…';
    try {
      const authenticated = await authenticateDemo(identity, password);
      if (!authenticated) {
        showMessage('Those demo credentials were not recognised. Check the sample credentials below and try again.', 'error');
        return;
      }
      showMessage('Demo sign-in successful. Opening your dashboard…', 'success');
      window.setTimeout(() => {
        window.location.href = loginMode === 'admin' ? 'admin-dashboard.html' : 'user-dashboard.html';
      }, 650);
    } catch (error) {
      console.error('Sign-in request failed:', error);
      showMessage('Sign-in could not be completed. Please try again.', 'error');
    } finally {
      if (!formMessage.classList.contains('success')) {
        submitButton.disabled = false;
        submitLabel.textContent = loginMode === 'admin' ? 'Admin sign in' : 'Sign in';
      }
    }
  });

  document.querySelector('#forgotPasswordLink').addEventListener('click', (event) => {
    event.preventDefault();
    showMessage('Password recovery will be available when a secure account service is connected.', 'error');
  });

  document.querySelector('#createAccountLink').addEventListener('click', (event) => {
    event.preventDefault();
    showMessage('Account registration is not enabled in this prototype yet.', 'error');
  });
}
