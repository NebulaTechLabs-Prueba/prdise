"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmPasswordReset } from "@/lib/auth/actions";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

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

        {success ? (
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
        ) : (
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
        )}
      </div>
    </div>
  );
}
