const { PDFParse } = require('pdf-parse');
const fs = require('fs');

async function main() {
  const buf = fs.readFileSync('UI_Generation_Requirements.pdf');
  const parser = new PDFParse(buf);
  const data = await parser.getRawTextContent();
  console.log(data);
}
main().catch(e => console.error(e));
