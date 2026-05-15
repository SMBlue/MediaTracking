// Re-export the typed top-level module under the inner subpath we
// actually import. See src/lib/pdf-parser.ts for why we bypass
// pdf-parse's index.js.
declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";
  export default pdfParse;
}
