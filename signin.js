const loginForm = document.querySelector('#loginForm');

if (loginForm) {
  const identityInput = document.querySelector('#identityInput');
  const identityLabel = document.querySelector('#identityLabel');
  const passwordInput = document.querySelector('#passwordInput');
  const passwordToggle = document.querySelector('#passwordToggle');
  const formMessage = document.querySelector('#formMessage');
  const identityError = document.querySelector('#identityError');
  const passwordError = document.querySelector('#passwordError');
  const confirmPasswordInput = document.querySelector('#confirmPasswordInput');
  const confirmPasswordError = document.querySelector('#confirmPasswordError');
  const confirmPasswordField = document.querySelector('#confirmPasswordField');
  const submitButton = document.querySelector('#submitButton');
  const submitLabel = document.querySelector('#submitLabel');
  const portalNotice = document.querySelector('#portalNotice');
  const forgotPasswordLink = document.querySelector('#forgotPasswordLink');
  const accountModePrompt = document.querySelector('#accountModePrompt');
  const adminTab = document.querySelector('#adminTab');
  const tabs = document.querySelectorAll('.account-tab');
  let loginMode = 'user';
  let registrationMode = false;

  function showMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = `form-message ${type}`;
    formMessage.hidden = false;
  }

  function clearErrors() {
    [identityError, passwordError, confirmPasswordError].forEach((error) => { error.textContent = ''; });
    [identityInput, passwordInput, confirmPasswordInput].forEach((input) => input.removeAttribute('aria-invalid'));
    formMessage.hidden = true;
    formMessage.textContent = '';
  }

  function setMode(mode) {
    loginMode = mode;
    registrationMode = false;
    const isAdmin = mode === 'admin';
    tabs.forEach((tab) => {
      const selected = tab.dataset.mode === mode;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    document.querySelector('.account-tabs').classList.remove('registering');
    adminTab.hidden = false;
    identityLabel.textContent = isAdmin ? 'Admin email or username' : 'Email address';
    identityInput.type = isAdmin ? 'text' : 'email';
    identityInput.inputMode = isAdmin ? 'text' : 'email';
    identityInput.autocomplete = isAdmin ? 'username' : 'email';
    identityInput.placeholder = isAdmin ? 'Admin email or username' : 'you@example.com';
    identityInput.setAttribute('aria-label', identityLabel.textContent);
    passwordInput.autocomplete = 'current-password';
    passwordInput.placeholder = 'Enter your password';
    confirmPasswordField.hidden = true;
    confirmPasswordInput.required = false;
    forgotPasswordLink.hidden = false;
    portalNotice.hidden = !isAdmin;
    document.querySelector('#signin-title').textContent = isAdmin ? 'Administrator sign in' : 'Sign in to LexCitizen';
    document.querySelector('.panel-intro').textContent = isAdmin
      ? 'Sign in to the administrator portal.'
      : 'Choose your account type to continue.';
    submitLabel.textContent = isAdmin ? 'Admin sign in' : 'Sign in';
    accountModePrompt.innerHTML = 'New to LexCitizen? <a class="subtle-link" id="createAccountLink" href="#create-account">Create account</a>';
    document.querySelector('#createAccountLink').addEventListener('click', beginRegistration);
    clearErrors();
  }

  function beginRegistration(event) {
    event.preventDefault();
    registrationMode = true;
    document.querySelector('.account-tabs').classList.add('registering');
    loginMode = 'user';
    tabs.forEach((tab) => {
      const selected = tab.dataset.mode === 'user';
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-selected', String(selected));
    });
    adminTab.hidden = true;
    portalNotice.hidden = true;
    identityLabel.textContent = 'Email address';
    identityInput.type = 'email';
    identityInput.inputMode = 'email';
    identityInput.autocomplete = 'email';
    identityInput.placeholder = 'you@example.com';
    identityInput.setAttribute('aria-label', 'Email address');
    passwordInput.autocomplete = 'new-password';
    passwordInput.placeholder = 'Create a password';
    confirmPasswordField.hidden = false;
    confirmPasswordInput.required = true;
    forgotPasswordLink.hidden = true;
    document.querySelector('#signin-title').textContent = 'Create your account';
    document.querySelector('.panel-intro').textContent = 'Save readings and continue where you left off.';
    submitLabel.textContent = 'Create account';
    accountModePrompt.innerHTML = 'Already have an account? <a class="subtle-link" id="signInLink" href="#sign-in">Sign in</a>';
    document.querySelector('#signInLink').addEventListener('click', (signInEvent) => {
      signInEvent.preventDefault();
      setMode('user');
    });
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

    if (typeof password !== 'string' || password.length < 10 || new TextEncoder().encode(password).length > 72) {
      passwordError.textContent = 'Use at least 10 characters and no more than 72 UTF-8 bytes.';
      passwordInput.setAttribute('aria-invalid', 'true');
      valid = false;
    } else if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      passwordError.textContent = 'Use a password with at least one letter and one number.';
      passwordInput.setAttribute('aria-invalid', 'true');
      valid = false;
    }

    if (registrationMode && confirmPasswordInput.value !== password) {
      confirmPasswordError.textContent = 'The passwords do not match.';
      confirmPasswordInput.setAttribute('aria-invalid', 'true');
      valid = false;
    }
    return valid;
  }

  async function sendRequest(endpoint, body) {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-LexCitizen-Request': '1' },
      body: JSON.stringify(body),
    });
    const result = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
    return result;
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
  document.querySelector('#createAccountLink').addEventListener('click', beginRegistration);

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
    submitLabel.textContent = registrationMode ? 'Creating account…' : 'Signing in…';
    let redirecting = false;
    try {
      if (registrationMode) {
        await sendRequest('/api/auth/register', {
          email: identity,
          password,
          remember: document.querySelector('#rememberMe').checked,
        });
        setMode('user');
        showMessage('Account request submitted. An administrator must approve it before you can sign in.', 'success');
        return;
      }
      const result = await sendRequest('/api/auth/login', {
        identity,
        password,
        mode: loginMode,
        remember: document.querySelector('#rememberMe').checked,
      });
      showMessage('Sign-in successful. Opening your account…', 'success');
      redirecting = true;
      window.setTimeout(() => {
        const requestedDestination = new URLSearchParams(window.location.search).get('next');
        const safeReaderDestination = /^reader\.html\?slug=[a-z0-9-]+$/i.test(requestedDestination || '');
        window.location.href = result.user.role === 'admin'
          ? 'admin-dashboard.html'
          : safeReaderDestination ? requestedDestination : 'user-dashboard.html';
      }, 450);
    } catch (error) {
      showMessage(error.message || 'Sign-in could not be completed. Please try again.', 'error');
    } finally {
      if (!redirecting) {
        submitButton.disabled = false;
        submitLabel.textContent = registrationMode ? 'Create account' : loginMode === 'admin' ? 'Admin sign in' : 'Sign in';
      }
    }
  });

  forgotPasswordLink.addEventListener('click', (event) => {
    event.preventDefault();
    showMessage('Password recovery is not available yet. Contact the site administrator to reset your account.', 'error');
  });
}
