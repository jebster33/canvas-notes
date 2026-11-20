/**
 * Small spreadsheet formula engine for table cards.
 * Supports: numbers, + - * / ^, parentheses, cell refs (A1), ranges (A1:B3),
 * and SUM, AVG/AVERAGE, MIN, MAX, COUNT, ROUND, ABS, IF.
 */

export function colName(i: number) {
  let s = "";
  i++;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function parseRef(ref: string): [number, number] | null {
  const m = /^([A-Z]+)(\d+)$/.exec(ref.toUpperCase());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return [parseInt(m[2], 10) - 1, c - 1];
}

type Tok = { t: "num"; v: number } | { t: "ref"; v: string } | { t: "id"; v: string } | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: "num", v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9]/.test(src[j])) j++;
      const w = src.slice(i, j).toUpperCase();
      out.push(/^[A-Z]+\d+$/.test(w) ? { t: "ref", v: w } : { t: "id", v: w });
      i = j;
      continue;
    }
    if (src.startsWith("<=", i) || src.startsWith(">=", i) || src.startsWith("<>", i)) {
      out.push({ t: "op", v: src.slice(i, i + 2) });
      i += 2;
      continue;
    }
    if ("+-*/^(),:<>=".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error("bad char " + c);
  }
  return out;
}

export function evaluateTable(cells: string[][]): string[][] {
  const cache = new Map<string, number | string>();
  const visiting = new Set<string>();

  const cellValue = (r: number, c: number): number | string => {
    const key = r + ":" + c;
    if (cache.has(key)) return cache.get(key)!;
    if (visiting.has(key)) throw new Error("#CYCLE");
    const raw = (cells[r]?.[c] ?? "").trim();
    let v: number | string;
    if (raw.startsWith("=")) {
      visiting.add(key);
      try {
        v = evalFormula(raw.slice(1));
      } finally {
        visiting.delete(key);
      }
    } else if (raw !== "" && !isNaN(Number(raw.replace(/,/g, "")))) v = Number(raw.replace(/,/g, ""));
    else v = raw;
    cache.set(key, v);
    return v;
  };

  const evalFormula = (src: string): number | string => {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const eat = (v?: string) => {
      const t = toks[p++];
      if (!t || (v && t.v !== v)) throw new Error("#PARSE");
      return t;
    };
    const num = (x: number | string) => (typeof x === "number" ? x : x === "" ? 0 : Number(x) || 0);

    const args = (): (number | string)[] => {
      eat("(");
      const out: (number | string)[] = [];
      if (peek()?.v === ")") { eat(); return out; }
      for (;;) {
        const t = peek();
        if (t?.t === "ref" && toks[p + 1]?.v === ":") {
          const a = parseRef(eat().v as string)!;
          eat(":");
          const b = parseRef(eat().v as string);
          if (!b) throw new Error("#REF");
          for (let r = Math.min(a[0], b[0]); r <= Math.max(a[0], b[0]); r++)
            for (let c = Math.min(a[1], b[1]); c <= Math.max(a[1], b[1]); c++) out.push(cellValue(r, c));
        } else out.push(cmp());
        if (peek()?.v === ",") { eat(); continue; }
        eat(")");
        return out;
      }
    };

    const primary = (): number | string => {
      const t = eat();
      if (t.t === "num") return t.v;
      if (t.t === "ref") {
        const rc = parseRef(t.v)!;
        return cellValue(rc[0], rc[1]);
      }
      if (t.t === "op" && t.v === "(") {
        const v = cmp();
        eat(")");
        return v;
      }
      if (t.t === "op" && t.v === "-") return -num(primary());
      if (t.t === "id") {
        const a = args();
        const nums = a.filter((x) => typeof x === "number" || (x !== "" && !isNaN(Number(x)))).map(num);
        switch (t.v) {
          case "SUM": return nums.reduce((s, x) => s + x, 0);
          case "AVG": case "AVERAGE": return nums.length ? nums.reduce((s, x) => s + x, 0) / nums.length : 0;
          case "MIN": return nums.length ? Math.min(...nums) : 0;
          case "MAX": return nums.length ? Math.max(...nums) : 0;
          case "COUNT": return nums.length;
          case "ROUND": { const f = 10 ** num(a[1] ?? 0); return Math.round(num(a[0]) * f) / f; }
          case "ABS": return Math.abs(num(a[0]));
          case "ANY": return a.some((x) => x !== "" && x !== undefined) ? 1 : 0;
          case "IF": return num(a[0]) ? a[1] ?? "" : a[2] ?? "";
        }
        throw new Error("#NAME");
      }
      throw new Error("#PARSE");
    };
    const pow = (): number | string => {
      let l = primary();
      while (peek()?.v === "^") { eat(); l = num(l) ** num(primary()); }
      return l;
    };
    const mul = (): number | string => {
      let l = pow();
      while (peek()?.v === "*" || peek()?.v === "/") {
        const op = eat().v;
        const r = num(pow());
        // Dividing by an empty or zero cell gives a blank instead of an error.
        if (op === "/" && r === 0) { l = ""; continue; }
        l = op === "*" ? num(l) * r : num(l) / r;
      }
      return l;
    };
    const add = (): number | string => {
      let l = mul();
      while (peek()?.v === "+" || peek()?.v === "-") {
        const op = eat().v;
        l = op === "+" ? num(l) + num(mul()) : num(l) - num(mul());
      }
      return l;
    };
    const cmp = (): number | string => {
      const l = add();
      const op = peek();
      if (op?.t === "op" && ["<", ">", "=", "<=", ">=", "<>"].includes(op.v)) {
        eat();
        const a = num(l), b = num(add());
        return { "<": a < b, ">": a > b, "=": a === b, "<=": a <= b, ">=": a >= b, "<>": a !== b }[op.v as "<"] ? 1 : 0;
      }
      return l;
    };
    const v = cmp();
    if (p < toks.length) throw new Error("#PARSE");
    return v;
  };

  return cells.map((row, r) =>
    row.map((_, c) => {
      try {
        const v = cellValue(r, c);
        if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6);
        return v;
      } catch (e) {
        const m = (e as Error).message;
        return m.startsWith("#") ? m : "#ERR";
      }
    }),
  );
}
