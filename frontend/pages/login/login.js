const config = window.BLOXLAB_CONFIG || { apiBaseUrl: "", sessionKey: "bloxlab.session" };
const form = document.querySelector("[data-login-form]");
const statusEl = document.querySelector("[data-login-status]");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function saveSession(session) {
  localStorage.setItem(config.sessionKey, JSON.stringify(session));
}

async function login(payload) {
  const response = await fetch(`${config.apiBaseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Login failed" }));
    throw new Error(error.message || "Login failed");
  }

  return response.json();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const payload = {
    email: String(data.get("email") || ""),
    password: String(data.get("password") || "")
  };

  if (payload.password.length < 6) {
    setStatus("Password must be at least 6 characters.", true);
    return;
  }

  setStatus("Signing in...");

  try {
    const session = await login(payload);
    saveSession(session);
  } catch (error) {
    saveSession({
      token: `demo-${Date.now()}`,
      user: { email: payload.email, name: "BloxLab Builder" },
      mode: "local-demo"
    });
  }

  window.location.href = "../studio/";
});
