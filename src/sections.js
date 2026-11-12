// Waitlist endpoint. While this is empty, the form says sign-ups are not being saved.
// When set, the form POSTs JSON { email, topper } to this URL.
const WAITLIST_ENDPOINT = '';

const form = document.getElementById('sx-waitlist-form');
const emailInput = document.getElementById('sx-email');
const emailError = document.getElementById('sx-email-error');
const select = document.getElementById('sx-topper-select');
const status = document.getElementById('sx-status');
const submit = document.getElementById('sx-submit');
const radios = Array.from(document.querySelectorAll('input[name="topper"][type="radio"]'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Keep the vote cards and the waitlist select in sync.
function setVote(value) {
  radios.forEach((r) => { r.checked = r.value === value; });
  if (select) select.value = value;
}

radios.forEach((r) => {
  r.addEventListener('change', () => {
    if (r.checked && select) select.value = r.value;
  });
});

if (select) {
  select.addEventListener('change', () => setVote(select.value));
}

function showError(message) {
  emailError.textContent = message;
  emailError.hidden = false;
  emailInput.setAttribute('aria-invalid', 'true');
}

function clearError() {
  emailError.textContent = '';
  emailError.hidden = true;
  emailInput.removeAttribute('aria-invalid');
}

function showStatus(message, kind) {
  status.textContent = message;
  status.dataset.kind = kind;
  status.hidden = false;
}

function clearStatus() {
  status.textContent = '';
  status.hidden = true;
  delete status.dataset.kind;
}

function validEmail(value) {
  return value.length > 0 && value.length <= 254 && EMAIL_RE.test(value);
}

if (emailInput) {
  emailInput.addEventListener('input', () => {
    if (!emailError.hidden) clearError();
  });
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus();

    const email = emailInput.value.trim();
    if (!email) {
      showError('Enter your email address.');
      emailInput.focus();
      return;
    }
    if (!validEmail(email)) {
      showError('That email address doesn’t look right. Check it and try again.');
      emailInput.focus();
      return;
    }
    clearError();

    if (!WAITLIST_ENDPOINT) {
      showStatus('Preview only. Sign-ups aren’t being saved yet.', 'notice');
      return;
    }

    const topper = select ? select.value : '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    submit.disabled = true;
    try {
      const response = await fetch(WAITLIST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, topper }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      showStatus('You’re on the list.', 'success');
      form.reset();
      setVote('');
    } catch (err) {
      showStatus('That didn’t go through. Try again.', 'failure');
    } finally {
      clearTimeout(timer);
      submit.disabled = false;
    }
  });
}
