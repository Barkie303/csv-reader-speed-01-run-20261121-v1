// A fast drop-in for csv-reader 1.0.0: run(input) returns exactly {columns, rows, errors} for
// {text, header}, with the same broken-row policy (a BOM dropped, stray CRs, doubled quotes,
// quote junk, unterminated quotes, short and long rows). The reference walks the text one
// character at a time; this reader jumps between delimiters with indexOf, slices fields out
// whole, and only slows down for the rare broken piece. No dependencies, no state kept
// between calls.

// How a field ended: at a comma, at a line break, or at the end of the text.
const COMMA = 0;
const BREAK = 1;
const CR = 2;
const END = 3;

/** csv-reader 1.0.0's answer for one case's input, read faster. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;

  // Where the next LF and the next CR sit at or after pos, refreshed lazily as pos moves on;
  // Infinity once none is left. Kept so a rare CR never makes a field scan the rest of the text.
  let nextLF = -1;
  let nextCR = -1;

  // How the last field ended, and how many characters its unquoted scan kept.
  let ended = END;
  let added = 0;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Refreshes the next-LF / next-CR caches for the current pos.
  function refresh() {
    if (nextLF < pos) {
      const i = text.indexOf('\n', pos);
      nextLF = i === -1 ? Infinity : i;
    }
    if (nextCR < pos) {
      const i = text.indexOf('\r', pos);
      nextCR = i === -1 ? Infinity : i;
    }
  }

  // Reads an unquoted field from pos onto `init`, up to the next comma or line break; a CR not
  // followed by LF is dropped (stray_cr). Sets ended and added.
  function unquoted(init) {
    let v = init;
    added = 0;
    for (;;) {
      refresh();
      const c = text.indexOf(',', pos);
      let end = c === -1 ? Infinity : c;
      let kind = COMMA;
      if (nextLF < end) {
        end = nextLF;
        kind = BREAK;
      }
      if (nextCR < end) {
        end = nextCR;
        kind = CR;
      }
      if (end === Infinity) {
        if (pos < len) {
          v += text.slice(pos);
          added += len - pos;
          pos = len;
        }
        ended = END;
        return v;
      }
      if (end > pos) {
        v += text.slice(pos, end);
        added += end - pos;
      }
      if (kind === COMMA) {
        pos = end + 1;
        ended = COMMA;
        return v;
      }
      if (kind === BREAK) {
        pos = end + 1;
        line += 1;
        ended = BREAK;
        return v;
      }
      if (text.charCodeAt(end + 1) === 10) {
        pos = end + 2;
        line += 1;
        ended = BREAK;
        return v;
      }
      pushError('stray_cr');
      pos = end + 1;
    }
  }

  // Line breaks inside text[start, end): each LF one, each CR one (a CRLF pair one, not two).
  function countBreaks(start, end) {
    let n = 0;
    let p = start;
    for (;;) {
      let a = text.indexOf('\n', p);
      let b = text.indexOf('\r', p);
      if (a === -1 || a >= end) a = Infinity;
      if (b === -1 || b >= end) b = Infinity;
      if (a === Infinity && b === Infinity) return n;
      if (b < a) {
        n += 1;
        p = text.charCodeAt(b + 1) === 10 ? b + 2 : b + 1;
      } else {
        n += 1;
        p = a + 1;
      }
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets ended.
  function quoted() {
    const open = pos;
    const openLine = line;
    let start = pos + 1;
    let q = text.indexOf('"', start);
    if (q === -1) {
      pos = open + 1;
      line = openLine;
      pushError('unterminated_quote');
      return unquoted('"');
    }
    let value;
    if (text.charCodeAt(q + 1) === 34) {
      // Doubled quotes inside: gather the pieces and join them with one quote each.
      const parts = [];
      for (;;) {
        parts.push(text.slice(start, q));
        start = q + 2;
        q = text.indexOf('"', start);
        if (q === -1) {
          pos = open + 1;
          line = openLine;
          pushError('unterminated_quote');
          return unquoted('"');
        }
        if (text.charCodeAt(q + 1) !== 34) {
          parts.push(text.slice(start, q));
          break;
        }
      }
      value = parts.join('"');
    } else {
      value = text.slice(start, q);
    }
    // The raw span (open+1, q): count its line breaks, and read each CRLF or lone CR as LF.
    // A newline in the span is a newline in the value (quote collapsing only drops quotes), so
    // the short value is the cheaper place to look.
    const hasCR = value.indexOf('\r') !== -1;
    const hasNL = value.indexOf('\n') !== -1;
    if (hasNL || hasCR) {
      line += countBreaks(open + 1, q);
      if (hasCR) value = value.replace(/\r\n?/g, '\n');
    }
    pos = q + 1;
    if (pos >= len) {
      ended = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      ended = COMMA;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      ended = BREAK;
      return value;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      ended = BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the next comma or break.
    const junk = unquoted(value);
    if (added > 0) pushError('quote_junk');
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    do {
      lastQuoted = text.charCodeAt(pos) === 34;
      fields.push(lastQuoted ? quoted() : unquoted(''));
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
