import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmTableFromMarkdown } from 'mdast-util-gfm-table';
import { gfmTable } from 'micromark-extension-gfm-table';

const KIND = 'refactor.rewrite';

function tablesIn(node, result = []) {
  if (node.type === 'table') result.push(node);
  else for (const child of node.children ?? []) tablesIn(child, result);
  return result;
}

function lineAt(text, offset) {
  const start = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
  const newline = text.indexOf('\n', offset);
  const end = newline < 0 ? text.length : newline;
  const contentEnd = end > start && text[end - 1] === '\r' ? end - 1 : end;
  return { start, end: newline < 0 ? end : end + 1, contentEnd };
}

// GFM uses unescaped pipes as cell boundaries, including inside code spans.
function readRow(text, start, end) {
  const body = text.slice(start, end);
  const boundaries = [];
  let backslashes = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '|' && backslashes % 2 === 0) boundaries.push(i);
    backslashes = body[i] === '\\' ? backslashes + 1 : 0;
  }
  const segments = [];
  let previous = 0;
  for (const boundary of boundaries) {
    segments.push({ start: previous, end: boundary, raw: body.slice(previous, boundary) });
    previous = boundary + 1;
  }
  segments.push({ start: previous, end: body.length, raw: body.slice(previous) });
  const leading = boundaries.length > 0 && segments[0].raw.trim() === '';
  const trailing = boundaries.length > 0 && segments.at(-1).raw.trim() === '';
  if (trailing) segments.pop();
  if (leading) segments.shift();
  return { start, end, cells: segments, leading, trailing };
}

function renderRow(row, cells) {
  // An unpiped one-column header followed by `---` becomes a setext heading.
  if (cells.length === 1 && !row.leading && !row.trailing) return `|${cells[0]}|`;
  // Empty edge cells otherwise look like optional outer pipes and disappear.
  const leading = row.leading || cells[0].trim() === '';
  const trailing = row.trailing || cells.at(-1).trim() === '';
  return `${leading ? '|' : ''}${cells.join('|')}${trailing ? '|' : ''}`;
}

function emptyCell(row) {
  const sample = row.cells.find((cell) => cell.raw.trim() !== '')?.raw ?? ' ';
  const left = sample.match(/^\s*/)[0];
  const right = sample.match(/\s*$/)[0];
  return left || right ? left + right : ' ';
}

function replacement(document, start, end, newText) {
  return {
    range: { start: document.positionAt(start), end: document.positionAt(end) },
    newText,
  };
}

function action(document, title, edits) {
  return {
    title: `Table: ${title}`,
    kind: KIND,
    edit: {
      documentChanges: [{
        textDocument: { uri: document.uri, version: document.version },
        edits,
      }],
    },
  };
}

export function getTableActions(document, range) {
  // One caret is required: a multi-cell selection has no unambiguous target.
  if (range.start.line !== range.end.line || range.start.character !== range.end.character) return [];
  const text = document.getText();
  const offset = document.offsetAt(range.start);
  const tree = fromMarkdown(text, {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
  });
  const table = tablesIn(tree).find((node) =>
    node.position.start.offset <= offset && offset <= node.position.end.offset);
  if (!table) return [];

  const width = table.align.length;
  const rows = table.children.map((node) => ({
    ...readRow(text, node.position.start.offset, node.position.end.offset),
    line: lineAt(text, node.position.start.offset),
    header: node === table.children[0],
  }));
  const header = rows[0];
  const separatorLine = lineAt(text, header.line.end);
  const separatorText = text.slice(separatorLine.start, separatorLine.contentEnd);
  const separatorPrefix = separatorText.match(/^[\t >]*/)[0];
  const separator = {
    ...readRow(text, separatorLine.start + separatorPrefix.length, separatorLine.contentEnd),
    line: separatorLine,
    separator: true,
  };
  const allRows = [header, separator, ...rows.slice(1)];
  // Extra GFM body cells are ignored by renderers. Do not silently discard them.
  if (allRows.some((row) => row.cells.length > width) || separator.cells.length !== width) return [];
  const current = allRows.find((row) => row.start <= offset && offset <= row.end);
  if (!current) return [];
  let column = current.cells.findIndex((cell) => offset - current.start <= cell.end);
  if (column < 0) column = current.cells.length - 1;
  column = Math.max(0, Math.min(width - 1, column));

  const result = [];
  if (!current.header && !current.separator) {
    let start = current.line.start;
    let end = current.line.end;
    // Keep an end-of-file table's original absence of a final newline.
    if (end === text.length && current.line.contentEnd === text.length && start > 0) {
      start -= text[start - 2] === '\r' ? 2 : 1;
    }
    result.push(action(document, 'Remove Row', [replacement(document, start, end, '')]));
  }

  const columnEdit = (operation, index) => allRows.map((row) => {
    const cells = row.cells.map((cell) => cell.raw);
    while (cells.length < width) cells.push(emptyCell(row));
    if (operation === 'remove') cells.splice(index, 1);
    else {
      const blank = row.separator ? ' --- ' : emptyCell(row);
      cells.splice(index, 0, blank);
    }
    return replacement(document, row.start, row.end, renderRow(row, cells));
  });

  if (width > 1) result.push(action(document, 'Remove Column', columnEdit('remove', column)));
  result.push(action(document, 'Add Column Left', columnEdit('add', column)));
  result.push(action(document, 'Add Column Right', columnEdit('add', column + 1)));

  if (!current.separator) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const template = current.header ? rows[1] ?? header : current;
    // List markers belong to the header, not to newly inserted body rows.
    const prefixSource = current.header ? separator : template;
    const prefix = text.slice(prefixSource.line.start, prefixSource.start);
    const blank = prefix + renderRow(template, Array.from({ length: width }, () => emptyCell(template)));
    if (!current.header) {
      result.push(action(document, 'Add Row Above', [
        replacement(document, current.line.start, current.line.start, blank + eol),
      ]));
    }
    const after = current.header ? separator : current;
    const hasNewline = after.line.end > after.line.contentEnd;
    result.push(action(document, 'Add Row Below', [
      replacement(document, after.line.end, after.line.end, hasNewline ? blank + eol : eol + blank),
    ]));
  }
  return result;
}
