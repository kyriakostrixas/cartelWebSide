export function cleanText(value, maxLength = 200) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function normalizeEmail(value) {
  return cleanText(value, 160).toLowerCase();
}

export function phoneKey(value) {
  return cleanText(value, 60).replace(/[^\d+]/g, "");
}

export function europeanDate(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function seasonYear(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const seasonStart = `${year}-04-01`;
  const seasonEnd = `${year}-11-15`;
  return value >= seasonStart && value <= seasonEnd ? year : null;
}

export function eventParts(date) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return { day: "", month: "" };
  return {
    day: String(parsed.getDate()).padStart(2, "0"),
    month: parsed.toLocaleString("en", { month: "short" }),
  };
}
