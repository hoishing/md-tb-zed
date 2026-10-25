import {
  CodeActionKind,
  createConnection,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getTableActions } from './tables.mjs';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize(() => ({
  capabilities: {
    positionEncoding: 'utf-16',
    textDocumentSync: {
      openClose: true,
      change: TextDocumentSyncKind.Incremental,
    },
    codeActionProvider: {
      codeActionKinds: [CodeActionKind.RefactorRewrite],
      resolveProvider: false,
    },
  },
  serverInfo: { name: 'Markdown Table Tools', version: '0.1.0' },
}));

connection.onCodeAction((params) => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];
  const only = params.context.only;
  if (only && !only.some((kind) =>
    kind === '' || CodeActionKind.RefactorRewrite === kind ||
    CodeActionKind.RefactorRewrite.startsWith(`${kind}.`))) return [];

  try {
    return getTableActions(document, params.range);
  } catch (error) {
    connection.console.error(`Unable to inspect Markdown table: ${error.message}`);
    return [];
  }
});

documents.listen(connection);
connection.listen();
