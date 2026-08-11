/**
 * "Editado há 18 min" — a frase que a Home do design usa para dizer onde se parou.
 *
 * Recebe o "agora" por parâmetro em vez de ler o relógio: é o que permite testar as sete faixas
 * sem congelar o tempo do processo, e é o que evita a diferença entre o relógio do servidor (onde
 * a página renderiza) e o do navegador virar um texto que muda sozinho na hidratação.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(instant: Date, now: Date): string {
  const elapsed = now.getTime() - instant.getTime();

  // Relógio adiantado no cliente, ou linha gravada no mesmo segundo: "há -3 s" seria pior que
  // arredondar para agora.
  if (elapsed < MINUTE) return "agora";
  if (elapsed < HOUR) return `há ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  }

  const days = Math.floor(elapsed / DAY);
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;

  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;

  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}
