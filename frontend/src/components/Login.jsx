import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("Sending you a link...");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    setStatus(error ? `Error: ${error.message}` : "Check your email for a sign-in link.");
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <h1>Boardroom</h1>
        <p>Sign in with your work email. No password needed — we'll send a magic link.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            required
            placeholder="you@yourteam.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button type="submit">Send magic link</button>
        </form>
        {status && <p className="login-status">{status}</p>}
      </div>
    </div>
  );
}
