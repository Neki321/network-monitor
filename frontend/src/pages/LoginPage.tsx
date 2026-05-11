import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";

type LoginPageProps = {
  onAdminLogin: (token: string) => void;
  onGuestLogin: (hostname: string) => void;
};

export function LoginPage({ onAdminLogin, onGuestLogin }: LoginPageProps) {
  const { t } = useLanguage();
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [guestHostname, setGuestHostname] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    });
    console.log("/api/login response:", response);

    if (!response.ok) {
      setError(t.invalidCredentials);
      return;
    }

    const data = (await response.json()) as { token: string };
    console.log("/api/login payload:", data);
    onAdminLogin(data.token);
  };

  const guestLogin = () => {
    setError("");
    const trimmed = guestHostname.trim();
    if (!trimmed) {
      setError(t.guestPcRequired);
      return;
    }
    onGuestLogin(trimmed);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">{t.title}</h1>
        <form onSubmit={submit} className="login-form">
          <label>
            {t.login}
            <input
              value={login}
              onChange={(event) => setLogin(event.target.value)}
            />
          </label>
          <label>
            {t.password}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          <button type="submit" className="btn btn-primary">
            {t.loginBtn}
          </button>
        </form>
        <label className="guest-host-label">
          {t.guestPcName}
          <input
            value={guestHostname}
            onChange={(event) => setGuestHostname(event.target.value)}
            placeholder="DESKTOP-ABC"
            autoComplete="off"
          />
        </label>
        <p className="login-hint muted">{t.guestPcHint}</p>
        <button type="button" onClick={guestLogin} className="btn btn-secondary">
          {t.guestBtn}
        </button>
      </div>
    </div>
  );
}