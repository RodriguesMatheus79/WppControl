/**
 * Telefones BR. Mantemos lógica simples (sem libphonenumber) — assume DDI 55.
 * O objetivo é normalizar pra dedupe e dar input previsível pro wa.me.
 */

export type PhoneParseResult = {
  /** Apenas dígitos, sem DDI 55. Ex: "11999990000" (10 ou 11 dígitos). */
  national: string;
  /** Forma canônica para dedupe e wa.me (com 55 prefixado). Ex: "5511999990000" */
  e164: string;
  /** Display formatado, "(11) 99999-0000" */
  display: string;
  valid: boolean;
};

/** Aceita qualquer string e devolve só dígitos. */
export function digits(input: string): string {
  return String(input ?? "").replace(/\D/g, "");
}

export function parsePhone(input: string): PhoneParseResult {
  let d = digits(input);
  // Remove DDI BR se vier
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  // 10 ou 11 dígitos: DDD + número (com ou sem 9 inicial)
  const valid = d.length === 10 || d.length === 11;

  let display = d;
  if (d.length === 11) {
    display = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  } else if (d.length === 10) {
    display = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }

  return {
    national: d,
    e164: d ? `55${d}` : "",
    display,
    valid,
  };
}

/** Aplica máscara progressiva enquanto o usuário digita, sem travar a digitação. */
export function maskPhoneInput(input: string): string {
  const d = digits(input).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Compara dois telefones — usa forma E.164 (ignora pontuação/DDI). */
export function samePhone(a: string, b: string): boolean {
  const pa = parsePhone(a);
  const pb = parsePhone(b);
  if (!pa.national || !pb.national) return false;
  return pa.national === pb.national;
}
