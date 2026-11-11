/**
 * Fortschrittsanzeige für die Werkzeuge.
 *
 * Die Interaktion (Ring → Fortschritt → Häkchen) orientiert sich an der
 * React-Bits-Komponente „Status Mark“ (https://reactbits.dev/c/micro/status-mark).
 * Hier bewusst als schlanke, abhängigkeitsfreie Implementierung, weil die
 * React-Variante auf jeder Werkzeugseite die komplette React-Laufzeit
 * (≈ 64 KB gzip) nachladen würde – die Seiten kommen aktuell mit ≈ 2 KB JS aus.
 */

const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

export interface ProgressOptions {
  /** Beschriftung während der Verarbeitung. */
  label?: string;
  /** Beschriftung nach Erfolg. */
  doneLabel?: string;
  /** Beschriftung im Fehlerfall. */
  errorLabel?: string;
}

export interface ProgressController {
  readonly el: HTMLElement;
  start(duration: number): void;
  /**
   * Setzt den Fortschritt direkt (0–1), statt ihn hochlaufen zu lassen.
   * Gedacht für Vorgänge mit bekannter Schrittzahl – etwa eine Liste von
   * Dateien, bei der nach jeder Datei ein Schritt weitergezählt wird.
   */
  setValue(value: number, text?: string): void;
  finish(): Promise<void>;
  fail(message?: string): void;
  reset(): void;
}

const reduced = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

const nextFrame = (): Promise<void> =>
  new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Erzeugt die Leiste direkt hinter dem übergebenen Anker-Element. */
export function createProgress(anchor: HTMLElement, options: ProgressOptions = {}): ProgressController {
  const label = options.label ?? 'Wird verarbeitet …';
  const doneLabel = options.doneLabel ?? 'Fertig';
  const errorLabel = options.errorLabel ?? 'Fehlgeschlagen';

  const el = document.createElement('div');
  el.className = 'progress';
  el.hidden = true;
  el.setAttribute('role', 'progressbar');
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.setAttribute('aria-valuenow', '0');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <div class="progress__head">
      <span class="progress__label"><span class="progress__icon"></span><span class="progress__text">${label}</span></span>
      <span class="progress__value">0 %</span>
    </div>
    <div class="progress__track"><span class="progress__fill"></span></div>
  `;
  anchor.insertAdjacentElement('afterend', el);

  const fill = el.querySelector<HTMLElement>('.progress__fill')!;
  const valueEl = el.querySelector<HTMLElement>('.progress__value')!;
  const textEl = el.querySelector<HTMLElement>('.progress__text')!;
  const iconEl = el.querySelector<HTMLElement>('.progress__icon')!;

  let raf = 0;
  let hideTimer = 0;

  const paint = (value: number): void => {
    const pct = Math.round(value * 100);
    // Breite statt scaleX: so bleibt die runde Kappe rechts erhalten.
    fill.style.width = `${(value * 100).toFixed(2)}%`;
    valueEl.textContent = `${pct} %`;
    el.setAttribute('aria-valuenow', String(pct));
  };

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const reset = (): void => {
    stop();
    window.clearTimeout(hideTimer);
    el.hidden = true;
    el.classList.remove('progress--done', 'progress--error', 'is-running');
    textEl.textContent = label;
    iconEl.innerHTML = '';
    paint(0);
  };

  const start = (duration: number): void => {
    window.clearTimeout(hideTimer);
    stop();
    el.hidden = false;
    el.classList.remove('progress--done', 'progress--error');
    el.classList.add('is-running');
    textEl.textContent = label;
    iconEl.innerHTML = '';
    paint(0);

    if (reduced()) {
      paint(0.5);
      return;
    }

    // Schnell anlaufen, dann gegen 86 % auslaufen. Die restlichen 14 %
    // kommen erst, wenn die eigentliche Arbeit wirklich fertig ist.
    const from = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - from) / Math.max(120, duration));
      const eased = 1 - (1 - t) ** 2.4;
      paint(0.86 * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else raf = 0;
    };
    raf = requestAnimationFrame(tick);
  };

  const setValue = (value: number, text?: string): void => {
    window.clearTimeout(hideTimer);
    stop();
    el.hidden = false;
    el.classList.remove('progress--done', 'progress--error');
    el.classList.add('is-running');
    if (text) textEl.textContent = text;
    paint(Math.min(1, Math.max(0, value)));
  };

  const finish = async (): Promise<void> => {    stop();
    const current = Number(el.getAttribute('aria-valuenow') ?? 0) / 100;
    if (!reduced() && current < 1) {
      const from = performance.now();
      await new Promise<void>(resolve => {
        const tick = (now: number): void => {
          const t = Math.min(1, (now - from) / 190);
          paint(current + (1 - current) * (1 - (1 - t) ** 2));
          if (t < 1) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    }
    paint(1);
    el.classList.remove('is-running');
    el.classList.add('progress--done');
    textEl.textContent = doneLabel;
    iconEl.innerHTML = CHECK;
    hideTimer = window.setTimeout(() => {
      el.hidden = true;
      el.classList.remove('progress--done');
    }, 1100);
  };

  const fail = (message?: string): void => {
    stop();
    paint(1);
    el.classList.remove('is-running', 'progress--done');
    el.classList.add('progress--error');
    textEl.textContent = message ?? errorLabel;
    hideTimer = window.setTimeout(() => {
      el.hidden = true;
      el.classList.remove('progress--error');
    }, 2400);
  };

  return { el, start, setValue, finish, fail, reset };
}

export interface WithProgressOptions {
  /** Mindestlaufzeit in Millisekunden, damit der Fortschritt sichtbar wird. */
  minDuration?: number;
}

/**
 * Führt eine Aufgabe aus, während die Leiste läuft, und garantiert eine
 * sichtbare Mindestdauer (Standard 0,7 s).
 */
export async function withProgress<T>(
  controller: ProgressController,
  task: () => Promise<T> | T,
  options: WithProgressOptions = {}
): Promise<T> {
  const minDuration = options.minDuration ?? 700;
  controller.start(minDuration);
  // Zwei Frames abwarten, damit der Balken vor der (synchronen) Canvas-Arbeit
  // tatsächlich gezeichnet ist.
  await nextFrame();

  const started = performance.now();
  let result!: T;
  let failure: unknown = null;
  try {
    result = await task();
  } catch (error) {
    failure = error;
  }

  const remaining = minDuration - (performance.now() - started);
  if (remaining > 0) await sleep(remaining);

  if (failure) {
    controller.fail(failure instanceof Error ? failure.message : undefined);
    throw failure;
  }
  await controller.finish();
  return result;
}
