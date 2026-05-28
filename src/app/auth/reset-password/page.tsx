"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { confirmPasswordReset } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/client";

type SessionState =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const [sessionState, setSessionState] = useState<SessionState>({ kind: "loading" });

  // Consumir el hash de Supabase (implicit flow) ANTES de habilitar el form.
  // Sin esto hay una carrera: el form se submite antes que el cliente
  // del navegador haya seteado cookies con setSession, y el server action
  // falla con "Auth session missing".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const hash = window.location.hash;
      // Path 1: ya hay sesión activa (cookies presentes desde otra navegacion).
      if (!hash.includes("access_token=")) {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        if (data.user) setSessionState({ kind: "ready" });
        else
          setSessionState({
            kind: "error",
            message:
              "Enlace inválido o expirado. Solicita un nuevo enlace de restablecimiento.",
          });
        return;
      }
      // Path 2: tokens en el fragmento. Parsear y aplicar setSession.
      const params = new URLSearchParams(hash.slice(1));
      const access_token = params.get("access_token");
      const refresh_token = params.get("refresh_token");
      if (!access_token || !refresh_token) {
        setSessionState({
          kind: "error",
          message:
            "El enlace está incompleto. Solicita un nuevo enlace de restablecimiento.",
        });
        return;
      }
      const { error: setErr } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });
      if (cancelled) return;
      if (setErr) {
        setSessionState({
          kind: "error",
          message:
            "El enlace expiró o ya fue usado. Solicita un nuevo enlace de restablecimiento.",
        });
        return;
      }
      // Limpiar el hash de la URL para evitar que el token vuelva a procesarse
      // en un refresh.
      window.history.replaceState(null, "", window.location.pathname);
      setSessionState({ kind: "ready" });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await confirmPasswordReset(formData);
      if (result.ok) {
        setSuccess(true);
        setTimeout(() => router.push("/login"), 2000);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg,#0a1628,#0e1a2e)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: "rgba(255,255,255,.04)",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 24,
          padding: "40px 32px",
        }}
      >
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Restablecer contraseña</h1>
        <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 24 }}>
          Ingresa una contraseña nueva. Después podrás iniciar sesión con ella.
        </p>

        {sessionState.kind === "loading" && (
          <div style={{ padding: 14, fontSize: 13, opacity: 0.7 }}>
            Validando enlace…
          </div>
        )}

        {sessionState.kind === "error" && (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: "rgba(248,113,113,.1)",
              border: "1px solid rgba(248,113,113,.3)",
              color: "#f87171",
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {sessionState.message}
            <div style={{ marginTop: 12 }}>
              <a href="#/forgot-password" style={{ color: "#f5a623", fontWeight: 700 }}>
                Solicitar nuevo enlace →
              </a>
            </div>
          </div>
        )}

        {sessionState.kind === "ready" && success ? (
          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: "rgba(74,222,128,.1)",
              border: "1px solid rgba(74,222,128,.3)",
              color: "#4ade80",
              fontSize: 13,
            }}
          >
            ✓ Contraseña actualizada. Redirigiendo a inicio de sesión…
          </div>
        ) : sessionState.kind === "ready" ? (
          <form onSubmit={onSubmit}>
            <div style={{ marginBottom: 14 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  opacity: 0.7,
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                }}
              >
                Nueva contraseña
              </label>
              <input
                type="password"
                name="newPassword"
                required
                minLength={8}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,.05)",
                  border: "1px solid rgba(255,255,255,.12)",
                  color: "#fff",
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  display: "block",
                  fontSize: 11,
                  opacity: 0.7,
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: ".08em",
                }}
              >
                Confirmar contraseña
              </label>
              <input
                type="password"
                name="confirmPassword"
                required
                minLength={8}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,.05)",
                  border: "1px solid rgba(255,255,255,.12)",
                  color: "#fff",
                  fontSize: 14,
                }}
              />
            </div>
            {error && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "rgba(248,113,113,.1)",
                  border: "1px solid rgba(248,113,113,.3)",
                  color: "#f87171",
                  fontSize: 12.5,
                  marginBottom: 14,
                }}
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={pending}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 12,
                background: "linear-gradient(135deg,#f5a623,#ef6c2b)",
                color: "#fff",
                border: "none",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                cursor: pending ? "wait" : "pointer",
                opacity: pending ? 0.7 : 1,
              }}
            >
              {pending ? "Actualizando…" : "Actualizar contraseña"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
