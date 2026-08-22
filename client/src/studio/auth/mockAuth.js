// This is the swap seam for authentication.
// Currently it simulates latency and validates locally.
// Later, someone can replace only the inside of this one function with a real
// fetch call (e.g., fetch('/api/auth/login', { method: 'POST', body: ... }).then(r => r.json()))
// and nothing else in the app needs to change.

export function login({ email, password }) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const emailTrim = email?.trim() || '';
      const passwordTrim = password?.trim() || '';
      if (!emailTrim || !passwordTrim) {
        return reject(new Error('Email and password are required.'));
      }
      resolve({ user: { email: emailTrim } });
    }, 500);
  });
}
