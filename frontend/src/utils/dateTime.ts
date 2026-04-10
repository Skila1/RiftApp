import type { DesktopDateTimePreferences } from '@/types/desktop';
import { getDesktop } from './desktop';

type DateInput = Date | string | number;
type DateFormatKind = 'short' | 'medium' | 'long' | 'longWithWeekday';

type PatternToken =
  | { type: 'literal'; value: string }
  | { type: 'token'; value: string };

const PATTERN_LETTERS = new Set(['d', 'M', 'y', 'h', 'H', 'm', 's', 't']);
const formatterCache = new Map<string, Intl.DateTimeFormat>();

let desktopDateTimePreferences: DesktopDateTimePreferences | null = null;

function resolveBrowserLocale(): string {
  if (typeof navigator !== 'undefined' && navigator.language?.trim()) {
    return navigator.language;
  }

  return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
}

function normalizePattern(value: string | null | undefined): string | null {
  const pattern = value?.trim();
  return pattern && pattern.length > 0 ? pattern : null;
}

function getActivePreferences(): DesktopDateTimePreferences {
  return desktopDateTimePreferences ?? {
    locale: resolveBrowserLocale(),
    shortDatePattern: null,
    longDatePattern: null,
    shortTimePattern: null,
    uses24HourClock: null,
  };
}

function getLocale(): string | undefined {
  return getActivePreferences().locale || undefined;
}

function getHour12Preference(): boolean | undefined {
  const uses24HourClock = getActivePreferences().uses24HourClock;
  return typeof uses24HourClock === 'boolean' ? !uses24HourClock : undefined;
}

function getFormatter(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale ?? ''}:${JSON.stringify(options)}`;
  const cached = formatterCache.get(key);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat(locale, options);
  formatterCache.set(key, formatter);
  return formatter;
}

function toDate(value: DateInput): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function joinPattern(tokens: PatternToken[]): string {
  return tokens.map((token) => token.value).join('');
}

function tokenizePattern(pattern: string): PatternToken[] {
  const tokens: PatternToken[] = [];
  let index = 0;

  while (index < pattern.length) {
    const current = pattern[index];

    if (current === "'") {
      let literal = '';
      index += 1;

      while (index < pattern.length) {
        const next = pattern[index];
        if (next === "'") {
          if (pattern[index + 1] === "'") {
            literal += "'";
            index += 2;
            continue;
          }

          index += 1;
          break;
        }

        literal += next;
        index += 1;
      }

      if (literal) {
        tokens.push({ type: 'literal', value: literal });
      }
      continue;
    }

    if (PATTERN_LETTERS.has(current)) {
      let end = index + 1;
      while (end < pattern.length && pattern[end] === current) {
        end += 1;
      }
      tokens.push({ type: 'token', value: pattern.slice(index, end) });
      index = end;
      continue;
    }

    let end = index + 1;
    while (end < pattern.length && pattern[end] !== "'" && !PATTERN_LETTERS.has(pattern[end])) {
      end += 1;
    }
    tokens.push({ type: 'literal', value: pattern.slice(index, end) });
    index = end;
  }

  return tokens;
}

function formatIntl(date: Date, options: Intl.DateTimeFormatOptions): string {
  return getFormatter(getLocale(), options).format(date);
}

function formatDayPeriod(date: Date): string {
  const parts = getFormatter(getLocale(), { hour: 'numeric', hour12: true }).formatToParts(date);
  return parts.find((part) => part.type === 'dayPeriod')?.value ?? (date.getHours() < 12 ? 'AM' : 'PM');
}

function formatPatternToken(date: Date, token: string): string {
  const symbol = token[0];
  const length = token.length;

  switch (symbol) {
    case 'd':
      if (length <= 2) {
        return length === 2 ? String(date.getDate()).padStart(2, '0') : String(date.getDate());
      }
      return formatIntl(date, { weekday: length === 3 ? 'short' : 'long' });
    case 'M':
      if (length <= 2) {
        const month = date.getMonth() + 1;
        return length === 2 ? String(month).padStart(2, '0') : String(month);
      }
      return formatIntl(date, { month: length === 3 ? 'short' : 'long' });
    case 'y': {
      const year = date.getFullYear();
      if (length === 2) {
        return String(year % 100).padStart(2, '0');
      }
      return String(year).padStart(length >= 4 ? length : 4, '0');
    }
    case 'H':
      return length === 2 ? String(date.getHours()).padStart(2, '0') : String(date.getHours());
    case 'h': {
      const hours = date.getHours() % 12 || 12;
      return length === 2 ? String(hours).padStart(2, '0') : String(hours);
    }
    case 'm':
      return length === 2 ? String(date.getMinutes()).padStart(2, '0') : String(date.getMinutes());
    case 's':
      return length === 2 ? String(date.getSeconds()).padStart(2, '0') : String(date.getSeconds());
    case 't': {
      const dayPeriod = formatDayPeriod(date);
      return length === 1 ? (dayPeriod[0] ?? '') : dayPeriod;
    }
    default:
      return token;
  }
}

function formatPattern(date: Date, pattern: string): string {
  return tokenizePattern(pattern)
    .map((token) => token.type === 'literal' ? token.value : formatPatternToken(date, token.value))
    .join('');
}

function stripWeekdayFromPattern(pattern: string | null): string | null {
  if (!pattern) {
    return null;
  }

  const tokens = tokenizePattern(pattern);
  const stripped: PatternToken[] = [];
  let skipLeadingLiteral = false;

  for (const token of tokens) {
    if (token.type === 'token' && token.value[0] === 'd' && token.value.length >= 3) {
      if (stripped.length === 0) {
        skipLeadingLiteral = true;
      }
      continue;
    }

    if (skipLeadingLiteral && token.type === 'literal') {
      skipLeadingLiteral = false;
      if (/^[\s,./-]+$/.test(token.value)) {
        continue;
      }
    }

    stripped.push(token);
  }

  const normalized = joinPattern(stripped)
    .replace(/^[,./\-\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return normalized || pattern;
}

function buildMediumDatePattern(pattern: string | null): string | null {
  if (!pattern) {
    return null;
  }

  return joinPattern(
    tokenizePattern(pattern).map((token) => {
      if (token.type === 'token' && token.value[0] === 'M' && token.value.length <= 2) {
        return { type: 'token', value: 'MMM' } satisfies PatternToken;
      }
      return token;
    }),
  );
}

function stripSecondsFromTimePattern(pattern: string | null): string | null {
  if (!pattern) {
    return null;
  }

  const tokens = tokenizePattern(pattern);
  const stripped: PatternToken[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === 'token' && token.value[0] === 's') {
      const previous = stripped[stripped.length - 1];
      const next = tokens[index + 1];

      if (previous?.type === 'literal' && /[:.\s]+$/.test(previous.value)) {
        stripped.pop();
      }
      if (next?.type === 'literal' && /^[.:\s]+/.test(next.value)) {
        index += 1;
      }
      continue;
    }

    stripped.push(token);
  }

  return joinPattern(stripped).trim() || pattern;
}

function getDatePattern(kind: DateFormatKind): string | null {
  const preferences = getActivePreferences();

  switch (kind) {
    case 'short':
      return normalizePattern(preferences.shortDatePattern);
    case 'medium':
      return buildMediumDatePattern(normalizePattern(preferences.shortDatePattern));
    case 'long':
      return stripWeekdayFromPattern(normalizePattern(preferences.longDatePattern));
    case 'longWithWeekday':
      return normalizePattern(preferences.longDatePattern);
    default:
      return null;
  }
}

function formatDateWithFallback(date: Date, kind: DateFormatKind): string {
  const pattern = getDatePattern(kind);
  if (pattern) {
    return formatPattern(date, pattern);
  }

  switch (kind) {
    case 'short':
      return formatIntl(date, { year: 'numeric', month: '2-digit', day: '2-digit' });
    case 'medium':
      return formatIntl(date, { year: 'numeric', month: 'short', day: 'numeric' });
    case 'long':
      return formatIntl(date, { year: 'numeric', month: 'long', day: 'numeric' });
    case 'longWithWeekday':
      return formatIntl(date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    default:
      return formatIntl(date, { year: 'numeric', month: '2-digit', day: '2-digit' });
  }
}

export async function initializeDateTimePreferences(): Promise<void> {
  const desktop = getDesktop();
  if (!desktop || typeof desktop.getDateTimePreferences !== 'function') {
    return;
  }

  try {
    const preferences = await desktop.getDateTimePreferences();
    desktopDateTimePreferences = {
      locale: preferences.locale?.trim() || resolveBrowserLocale(),
      shortDatePattern: normalizePattern(preferences.shortDatePattern),
      longDatePattern: normalizePattern(preferences.longDatePattern),
      shortTimePattern: normalizePattern(preferences.shortTimePattern),
      uses24HourClock: typeof preferences.uses24HourClock === 'boolean' ? preferences.uses24HourClock : null,
    };
  } catch {
    desktopDateTimePreferences = null;
  }
}

export function isSameCalendarDay(left: DateInput, right: DateInput): boolean {
  const leftDate = toDate(left);
  const rightDate = toDate(right);

  return Boolean(
    leftDate
    && rightDate
    && leftDate.getFullYear() === rightDate.getFullYear()
    && leftDate.getMonth() === rightDate.getMonth()
    && leftDate.getDate() === rightDate.getDate(),
  );
}

export function formatDate(value: DateInput, kind: DateFormatKind = 'short'): string {
  const date = toDate(value);
  if (!date) {
    return '';
  }

  return formatDateWithFallback(date, kind);
}

export function formatShortDate(value: DateInput): string {
  return formatDate(value, 'short');
}

export function formatMediumDate(value: DateInput): string {
  return formatDate(value, 'medium');
}

export function formatLongDate(value: DateInput): string {
  return formatDate(value, 'long');
}

export function formatLongDateWithWeekday(value: DateInput): string {
  return formatDate(value, 'longWithWeekday');
}

export function formatShortTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) {
    return '';
  }

  const timePattern = stripSecondsFromTimePattern(normalizePattern(getActivePreferences().shortTimePattern));
  if (timePattern) {
    return formatPattern(date, timePattern);
  }

  return formatIntl(date, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: getHour12Preference(),
  });
}

export function formatShortDateTime(value: DateInput, dateKind: Exclude<DateFormatKind, 'longWithWeekday'> = 'short'): string {
  const date = toDate(value);
  if (!date) {
    return '';
  }

  const datePart = formatDateWithFallback(date, dateKind);
  const timePart = formatShortTime(date);

  if (!datePart) {
    return timePart;
  }
  if (!timePart) {
    return datePart;
  }

  return `${datePart} ${timePart}`;
}