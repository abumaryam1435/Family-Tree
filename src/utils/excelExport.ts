import { Person } from '../types/family';
import { extractGivenName, formatAppName } from './nameUtils';
import { buildZipArchiveBlob, ZipEntryInput } from './zipExport';

export interface ExportTreeExcelOptions {
  rootPerson: Person;
  rootPersons?: Person[];
  getChildren: (personId: string) => Person[];
  allPersons?: Person[];
  includeFemales?: boolean;
  collapsedNodes?: Set<string>;
}

interface ExcelCellData {
  value: string | number;
  styleIndex: number;
  type?: 'str' | 'num';
}

interface ExcelMergeRange {
  startRow: number; // 1-indexed
  startCol: number; // 1-indexed
  endRow: number; // 1-indexed
  endCol: number; // 1-indexed
}

interface ExcelWorksheetSpec {
  name: string;
  colWidths: number[];
  rows: {
    heightPt?: number;
    cells: (ExcelCellData | null)[];
  }[];
  merges: ExcelMergeRange[];
  freezeTopRows?: number;
}

function escapeXml(str: string): string {
  return String(str ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colIndexToLetter(col1Based: number): string {
  let n = col1Based;
  let result = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function cellRef(row1Based: number, col1Based: number): string {
  return `${colIndexToLetter(col1Based)}${row1Based}`;
}

/**
 * Style Indices in buildStylesXml():
 *  0: Default cell (Cairo 11pt, RTL, thin border)
 *  1: Main Title Banner (Royal Emerald #0F4C3A fill, White 16pt Bold, Gold border, Center)
 *  2: Subtitle Banner (Deep Emerald #145E48 fill, Gold #FDE68A 11pt Bold, Gold border, Center)
 *  3: Table Column Header (Emerald #0B3B2D fill, Gold #FDE68A 11pt Bold, Center, Medium Gold bottom border)
 *  4: Standard Data Cell - Even Row (#FFFFFF fill, Slate #0F172A 11pt Bold, Right/Center)
 *  5: Standard Data Cell - Odd Row (#F8FAFC fill, Slate #0F172A 11pt Bold, Right/Center)
 *  6: Centered Data Cell - Even Row (#FFFFFF fill, Slate #0F172A 11pt Bold, Center)
 *  7: Centered Data Cell - Odd Row (#F8FAFC fill, Slate #0F172A 11pt Bold, Center)
 *  8: Male Badge Cell (#ECFDF5 fill, Emerald #065F46 11pt Bold, Center)
 *  9: Female Badge Cell (#FFF1F2 fill, Rose #9F1239 11pt Bold, Center)
 * 10: Summary / Totals Row Cell (#FEF3C7 fill, Dark Amber #78350F 12pt Bold, Center)
 * 11: Section Subheader Banner (#F1F5F9 fill, Emerald #0F4C3A 12pt Bold, Right)
 * 12: Empty Tree Grid Cell (#FCFBF7 warm cream fill, subtle dotted/thin border)
 * 13..22: Generation 1..10 Colored Card Cells (Distinct vibrant background + bold text + colored border)
 */
export function getGenerationStyleIndex(depth: number): number {
  if (depth <= 1) return 13; // Gen 1 (Root): Royal Emerald & Gold
  const offset = ((depth - 2) % 9) + 1; // 1..9 -> indices 14..22
  return 13 + offset;
}

function buildStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="17">
    <!-- 0: Default 11pt -->
    <font><sz val="11"/><color rgb="FF0F172A"/><name val="Cairo"/><family val="2"/></font>
    <!-- 1: Main Banner Title 16pt White Bold -->
    <font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Cairo"/><family val="2"/></font>
    <!-- 2: Subtitle / Table Header 11pt Gold Bold -->
    <font><b/><sz val="11"/><color rgb="FFFDE68A"/><name val="Cairo"/><family val="2"/></font>
    <!-- 3: Data Bold 11pt Dark Slate -->
    <font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Cairo"/><family val="2"/></font>
    <!-- 4: Male Emerald Bold 11pt -->
    <font><b/><sz val="11"/><color rgb="FF065F46"/><name val="Cairo"/><family val="2"/></font>
    <!-- 5: Female Rose Bold 11pt -->
    <font><b/><sz val="11"/><color rgb="FF9F1239"/><name val="Cairo"/><family val="2"/></font>
    <!-- 6: Totals / Gen 3 Amber Bold 11pt -->
    <font><b/><sz val="11"/><color rgb="FF78350F"/><name val="Cairo"/><family val="2"/></font>
    <!-- 7: Section Header Emerald 12pt Bold -->
    <font><b/><sz val="12"/><color rgb="FF0F4C3A"/><name val="Cairo"/><family val="2"/></font>
    <!-- 8: Gen 1 Root Gold Bold 12pt -->
    <font><b/><sz val="12"/><color rgb="FFFDE68A"/><name val="Cairo"/><family val="2"/></font>
    <!-- 9: Gen 2 Navy Blue Bold 11pt -->
    <font><b/><sz val="11"/><color rgb="FF1E3A8A"/><name val="Cairo"/><family val="2"/></font>
    <!-- 10: Gen 4 Purple Bold 11pt -->
    <font><b/><sz val="11"/><color rgb="FF4C1D95"/><name val="Cairo"/><family val="2"/></font>
    <!-- 11: Gen 5 Teal Bold 11pt -->
    <font><b/><sz val="11"/><color rgb="FF134E4A"/><name val="Cairo"/><family val="2"/></font>
    <!-- 12: Gen 6 Ruby Crimson Bold 11pt -->
    <font><b/><sz val="11"/><color rgb="FF881337"/><name val="Cairo"/><family val="2"/></font>
    <!-- 13: Gen 7 Olive Bold 11pt -->
    <font><b/><sz val="11"/><color rgb="FF1A2E05"/><name val="Cairo"/><family val="2"/></font>
    <!-- 14: Gen 8 Indigo Bold 11pt -->
    <font><b/><sz val="11"/><color rgb="FF1E1B4B"/><name val="Cairo"/><family val="2"/></font>
    <!-- 15: Gen 9 Copper Bold 11pt -->
    <font><b/><sz val="11"/><color rgb="FF431407"/><name val="Cairo"/><family val="2"/></font>
    <!-- 16: Gen 10 Emerald Bold 11pt -->
    <font><b/><sz val="11"/><color rgb="FF064E3B"/><name val="Cairo"/><family val="2"/></font>
  </fonts>

  <fills count="21">
    <!-- 0: None (Required by Excel) -->
    <fill><patternFill patternType="none"/></fill>
    <!-- 1: Gray125 (Required by Excel) -->
    <fill><patternFill patternType="gray125"/></fill>
    <!-- 2: Main Title Royal Emerald #0F4C3A -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F4C3A"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 3: Subtitle Emerald #145E48 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF145E48"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 4: Table Header Dark Emerald #093829 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF093829"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 5: Even Row White #FFFFFF -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 6: Odd Row Soft Slate #F8FAFC -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 7: Male Soft Mint #ECFDF5 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFECFDF5"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 8: Female Soft Rose #FFF1F2 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF1F2"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 9: Totals / Gen 3 Warm Amber #FEF3C7 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 10: Section Subheader #E2E8F0 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 11: Empty Tree Grid Cream #FCFBF7 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCFBF7"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 12: Gen 2 Soft Navy Blue #DBEAFE -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 13: Gen 4 Soft Violet #EDE9FE -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFEDE9FE"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 14: Gen 5 Soft Teal #CCFBF1 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFCCFBF1"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 15: Gen 6 Soft Ruby #FFE4E6 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFE4E6"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 16: Gen 7 Soft Olive #ECFCCB -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFECFCCB"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 17: Gen 8 Soft Indigo #E0E7FF -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 18: Gen 9 Soft Copper #FFEDD5 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFEDD5"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 19: Gen 10 Soft Emerald #D1FAE5 -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/><bgColor indexed="64"/></patternFill></fill>
    <!-- 20: Gen 1 Root Deep Emerald #0F4C3A -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F4C3A"/><bgColor indexed="64"/></patternFill></fill>
  </fills>

  <borders count="5">
    <!-- 0: None -->
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <!-- 1: Standard Crisp Slate Grid Border -->
    <border>
      <left style="thin"><color rgb="FFCBD5E1"/></left>
      <right style="thin"><color rgb="FFCBD5E1"/></right>
      <top style="thin"><color rgb="FFCBD5E1"/></top>
      <bottom style="thin"><color rgb="FFCBD5E1"/></bottom>
      <diagonal/>
    </border>
    <!-- 2: Royal Gold Frame Border (#D4AF37) -->
    <border>
      <left style="medium"><color rgb="FFD4AF37"/></left>
      <right style="medium"><color rgb="FFD4AF37"/></right>
      <top style="medium"><color rgb="FFD4AF37"/></top>
      <bottom style="medium"><color rgb="FFD4AF37"/></bottom>
      <diagonal/>
    </border>
    <!-- 3: Generation Card Distinct Border (#0F4C3A) -->
    <border>
      <left style="medium"><color rgb="FF0F4C3A"/></left>
      <right style="medium"><color rgb="FF0F4C3A"/></right>
      <top style="medium"><color rgb="FF0F4C3A"/></top>
      <bottom style="medium"><color rgb="FF0F4C3A"/></bottom>
      <diagonal/>
    </border>
    <!-- 4: Subtle Cream Grid Border -->
    <border>
      <left style="thin"><color rgb="FFF1F5F9"/></left>
      <right style="thin"><color rgb="FFF1F5F9"/></right>
      <top style="thin"><color rgb="FFF1F5F9"/></top>
      <bottom style="thin"><color rgb="FFF1F5F9"/></bottom>
      <diagonal/>
    </border>
  </borders>

  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>

  <cellXfs count="23">
    <!-- 0: Default -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1" applyBorder="1">
      <alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 1: Main Title Banner -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 2: Subtitle Banner -->
    <xf numFmtId="0" fontId="2" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 3: Table Header -->
    <xf numFmtId="0" fontId="2" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 4: Standard Data - Even Row (Right aligned) -->
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 5: Standard Data - Odd Row (Right aligned) -->
    <xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 6: Centered Data - Even Row -->
    <xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 7: Centered Data - Odd Row -->
    <xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 8: Male Badge -->
    <xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 9: Female Badge -->
    <xf numFmtId="0" fontId="5" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 10: Totals / Summary Row -->
    <xf numFmtId="0" fontId="6" fillId="9" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 11: Section Subheader -->
    <xf numFmtId="0" fontId="7" fillId="10" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 12: Empty Tree Grid Cell -->
    <xf numFmtId="0" fontId="0" fillId="11" borderId="4" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2"/>
    </xf>
    <!-- 13: Gen 1 (Root) Card: Emerald + Gold -->
    <xf numFmtId="0" fontId="8" fillId="20" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 14: Gen 2 Card: Royal Navy Blue -->
    <xf numFmtId="0" fontId="9" fillId="12" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 15: Gen 3 Card: Warm Amber Gold -->
    <xf numFmtId="0" fontId="6" fillId="9" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 16: Gen 4 Card: Royal Purple -->
    <xf numFmtId="0" fontId="10" fillId="13" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 17: Gen 5 Card: Deep Teal -->
    <xf numFmtId="0" fontId="11" fillId="14" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 18: Gen 6 Card: Ruby Crimson -->
    <xf numFmtId="0" fontId="12" fillId="15" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 19: Gen 7 Card: Olive Forest -->
    <xf numFmtId="0" fontId="13" fillId="16" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 20: Gen 8 Card: Indigo -->
    <xf numFmtId="0" fontId="14" fillId="17" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 21: Gen 9 Card: Copper -->
    <xf numFmtId="0" fontId="15" fillId="18" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
    <!-- 22: Gen 10 Card: Emerald -->
    <xf numFmtId="0" fontId="16" fillId="19" borderId="3" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/>
    </xf>
  </cellXfs>
</styleSheet>`;
}

function buildWorksheetXml(sheet: ExcelWorksheetSpec): string {
  const { colWidths, rows, merges, freezeTopRows = 3 } = sheet;

  const colsXml =
    colWidths.length > 0
      ? `<cols>${colWidths
          .map(
            (w, idx) =>
              `<col min="${idx + 1}" max="${idx + 1}" width="${w}" customWidth="1"/>`
          )
          .join('')}</cols>`
      : '';

  const paneXml =
    freezeTopRows > 0
      ? `<pane ySplit="${freezeTopRows}" topLeftCell="A${freezeTopRows + 1}" activePane="bottomLeft" state="frozen"/>`
      : '';

  const rowsXmlParts: string[] = [];

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const rowObj = rows[rIdx];
    const rNum = rIdx + 1;
    const htAttr = rowObj.heightPt
      ? ` ht="${rowObj.heightPt}" customHeight="1"`
      : '';
    const cellsXml: string[] = [];

    for (let cIdx = 0; cIdx < rowObj.cells.length; cIdx++) {
      const cell = rowObj.cells[cIdx];
      if (!cell) continue;
      const ref = cellRef(rNum, cIdx + 1);
      const sAttr = ` s="${cell.styleIndex}"`;

      if (cell.type === 'num' && typeof cell.value === 'number' && Number.isFinite(cell.value)) {
        cellsXml.push(`<c r="${ref}"${sAttr}><v>${cell.value}</v></c>`);
      } else {
        const text = escapeXml(String(cell.value ?? ''));
        cellsXml.push(
          `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`
        );
      }
    }

    rowsXmlParts.push(`<row r="${rNum}"${htAttr}>${cellsXml.join('')}</row>`);
  }

  const mergesXml =
    merges.length > 0
      ? `<mergeCells count="${merges.length}">${merges
          .map(
            (m) =>
              `<mergeCell ref="${cellRef(m.startRow, m.startCol)}:${cellRef(
                m.endRow,
                m.endCol
              )}"/>`
          )
          .join('')}</mergeCells>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView rightToLeft="1" showGridLines="1" workbookViewId="0">
      ${paneXml}
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="26"/>
  ${colsXml}
  <sheetData>
    ${rowsXmlParts.join('\n    ')}
  </sheetData>
  ${mergesXml}
  <pageSetup orientation="landscape" paperSize="9"/>
</worksheet>`;
}

function buildXlsxBlobFromSheets(sheets: ExcelWorksheetSpec[]): Blob {
  const encoder = new TextEncoder();
  const entries: ZipEntryInput[] = [];

  // 1. [Content_Types].xml
  const sheetOverrides = sheets
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n  ');

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`;

  entries.push({
    path: '[Content_Types].xml',
    data: encoder.encode(contentTypesXml)
  });

  // 2. _rels/.rels
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  entries.push({
    path: '_rels/.rels',
    data: encoder.encode(rootRelsXml)
  });

  // 3. xl/workbook.xml
  const sheetsEntriesXml = sheets
    .map((s, i) => {
      const safeName = escapeXml(s.name.slice(0, 31));
      return `<sheet name="${safeName}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
    })
    .join('\n    ');

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews>
    <workbookView activeTab="0"/>
  </bookViews>
  <sheets>
    ${sheetsEntriesXml}
  </sheets>
</workbook>`;

  entries.push({
    path: 'xl/workbook.xml',
    data: encoder.encode(workbookXml)
  });

  // 4. xl/_rels/workbook.xml.rels
  const sheetRelsXml = sheets
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('\n  ');
  const styleRelId = `rId${sheets.length + 1}`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelsXml}
  <Relationship Id="${styleRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  entries.push({
    path: 'xl/_rels/workbook.xml.rels',
    data: encoder.encode(workbookRelsXml)
  });

  // 5. xl/styles.xml
  entries.push({
    path: 'xl/styles.xml',
    data: encoder.encode(buildStylesXml())
  });

  // 6. xl/worksheets/sheet{N}.xml
  sheets.forEach((sheet, idx) => {
    entries.push({
      path: `xl/worksheets/sheet${idx + 1}.xml`,
      data: encoder.encode(buildWorksheetXml(sheet))
    });
  });

  const zipBlob = buildZipArchiveBlob(entries);
  return new Blob([zipBlob], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

function triggerExcelDownload(blob: Blob, filename: string) {
  const safeName = filename.replace(/[\\/:*?"<>|]/g, '_');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Generates an RTL, multi-sheet, color-formatted Excel (.xlsx) Blob for one or multiple family trees
 */
export function generateTreeExcelBlob(options: ExportTreeExcelOptions): {
  blob: Blob;
  filename: string;
  rootFirstName: string;
} {
  const {
    rootPerson,
    rootPersons,
    getChildren,
    allPersons = [],
    includeFemales = true
  } = options;

  const personById = new Map<string, Person>();
  for (const p of allPersons) {
    personById.set(p.id, p);
  }

  const roots =
    rootPersons && rootPersons.length > 0 ? rootPersons : [rootPerson];

  const rootFirstName =
    roots.length === 1
      ? extractGivenName(rootPerson.fullName)
      : `مجمعة_${roots.length}_أشجار_${roots
          .slice(0, 3)
          .map((r) => extractGivenName(r.fullName))
          .join('_')}`;

  const mainTitleText =
    roots.length === 1
      ? `شجرة وسجل عائلة: ${formatAppName(rootPerson.fullName)}`
      : `السجل الموحد لأشجار العائلة (${roots.length} أشجار: ${roots
          .map((r) => extractGivenName(r.fullName))
          .join(' ، ')})`;

  const dateStr = new Date().toLocaleDateString('ar-SA');

  // Collect full hierarchy data across all selected roots
  interface TraversedMember {
    seq: number;
    person: Person;
    givenName: string;
    lineageChain: string;
    depth: number;
    fatherName: string;
    rootTreeName: string;
    maleChildren: Person[];
    femaleChildren: Person[];
    allVisibleChildren: Person[];
  }

  const members: TraversedMember[] = [];
  const treeHierarchyRows: {
    depth: number;
    person: Person;
    givenName: string;
    fatherGivenName: string;
    childrenCount: number;
    rootTreeName: string;
  }[] = [];

  const visited = new Set<string>();
  let maxDepth = 1;

  const filterKids = (personId: string): Person[] => {
    const raw = getChildren(personId);
    return includeFemales ? raw : raw.filter((c) => c.gender === 'male');
  };

  function traverse(
    person: Person,
    depth: number,
    ancestorsGivenNames: string[],
    fatherName: string,
    rootTreeName: string
  ) {
    if (visited.has(person.id)) return;
    visited.add(person.id);

    if (depth > maxDepth) maxDepth = depth;

    const givenName = extractGivenName(person.fullName);
    const connector = person.gender === 'female' ? ' بنت ' : ' بن ';
    const lineageChain =
      ancestorsGivenNames.length > 0
        ? `${givenName}${connector}${ancestorsGivenNames.join(' بن ')}`
        : formatAppName(person.fullName);

    const visibleKids = filterKids(person.id).filter((k) => !visited.has(k.id));
    const maleChildren = visibleKids.filter((c) => c.gender === 'male');
    const femaleChildren = visibleKids.filter((c) => c.gender === 'female');

    members.push({
      seq: members.length + 1,
      person,
      givenName,
      lineageChain,
      depth,
      fatherName,
      rootTreeName,
      maleChildren,
      femaleChildren,
      allVisibleChildren: visibleKids
    });

    treeHierarchyRows.push({
      depth,
      person,
      givenName,
      fatherGivenName: fatherName,
      childrenCount: visibleKids.length,
      rootTreeName
    });

    const nextAncestors = [givenName, ...ancestorsGivenNames];
    for (const child of visibleKids) {
      traverse(child, depth + 1, nextAncestors, givenName, rootTreeName);
    }
  }

  for (const r of roots) {
    const rTitle = formatAppName(r.fullName);
    traverse(r, 1, [], 'الأصل المؤسس (جذر الشجرة)', rTitle);
  }

  const totalMales = members.filter((m) => m.person.gender === 'male').length;
  const totalFemales = members.filter((m) => m.person.gender === 'female').length;
  const subtitleText = `إجمالي الأفراد: ${members.length} فرداً (${totalMales} ذكور · ${totalFemales} إناث) — عدد الأجيال: ${maxDepth} أجيال — تاريخ التصدير: ${dateStr} م`;

  // ============================================================================
  // SHEET 1: المخطط الهرمي للشجرة (Visual Generation Columns RTL)
  // ============================================================================
  const genColCount = Math.max(4, maxDepth + 3);
  const sheet1ColWidths: number[] = [];
  sheet1ColWidths.push(8); // Col 1: م
  for (let d = 1; d <= maxDepth; d++) {
    sheet1ColWidths.push(24); // Generation column
  }
  sheet1ColWidths.push(14); // الجنس
  sheet1ColWidths.push(16); // عدد الفروع

  const sheet1Rows: ExcelWorksheetSpec['rows'] = [];
  const sheet1Merges: ExcelMergeRange[] = [];

  // Row 1: Main Title Banner
  const r1Cells: (ExcelCellData | null)[] = Array.from(
    { length: sheet1ColWidths.length },
    (_, i) => ({
      value: i === 0 ? `${mainTitleText} — المخطط الهرمي الملون حسب الأجيال` : '',
      styleIndex: 1
    })
  );
  sheet1Rows.push({ heightPt: 40, cells: r1Cells });
  sheet1Merges.push({
    startRow: 1,
    startCol: 1,
    endRow: 1,
    endCol: sheet1ColWidths.length
  });

  // Row 2: Subtitle Banner
  const r2Cells: (ExcelCellData | null)[] = Array.from(
    { length: sheet1ColWidths.length },
    (_, i) => ({
      value: i === 0 ? subtitleText : '',
      styleIndex: 2
    })
  );
  sheet1Rows.push({ heightPt: 28, cells: r2Cells });
  sheet1Merges.push({
    startRow: 2,
    startCol: 1,
    endRow: 2,
    endCol: sheet1ColWidths.length
  });

  // Row 3: Generation Headers (RTL: Col 1 = #, Col 2 = Gen 1, Col 3 = Gen 2 ... then Gender & Branches)
  const r3Cells: (ExcelCellData | null)[] = [
    { value: 'م', styleIndex: 3 }
  ];
  for (let d = 1; d <= maxDepth; d++) {
    r3Cells.push({
      value: d === 1 ? 'الجيل 1 (الأصل الراسخ)' : `الجيل ${d}`,
      styleIndex: getGenerationStyleIndex(d)
    });
  }
  r3Cells.push({ value: 'الجنس', styleIndex: 3 });
  r3Cells.push({ value: 'الفروع المباشرة', styleIndex: 3 });
  sheet1Rows.push({ heightPt: 32, cells: r3Cells });

  // Hierarchy rows: Each person is placed in their exact Generation Column with their generation's color!
  treeHierarchyRows.forEach((item, idx) => {
    const rowCells: (ExcelCellData | null)[] = [];
    const isEven = idx % 2 === 0;

    // Col 1: Sequence
    rowCells.push({
      value: idx + 1,
      styleIndex: isEven ? 6 : 7,
      type: 'num'
    });

    // Generation Columns (1 .. maxDepth)
    for (let d = 1; d <= maxDepth; d++) {
      if (d === item.depth) {
        const cardLabel =
          item.depth === 1
            ? `★ ${item.givenName} (الأصل)`
            : item.childrenCount > 0
            ? `${item.givenName} (${item.childrenCount})`
            : item.givenName;
        rowCells.push({
          value: cardLabel,
          styleIndex: getGenerationStyleIndex(d)
        });
      } else if (d === item.depth - 1 && item.depth > 1) {
        rowCells.push({
          value: `↳ ابن/بنت ${item.fatherGivenName}`,
          styleIndex: 12
        });
      } else {
        rowCells.push({
          value: '',
          styleIndex: 12
        });
      }
    }

    // Gender Badge
    rowCells.push({
      value: item.person.gender === 'male' ? 'ذكر' : 'أنثى',
      styleIndex: item.person.gender === 'male' ? 8 : 9
    });

    // Direct Branches Count
    rowCells.push({
      value: item.childrenCount > 0 ? `${item.childrenCount} فروع` : '—',
      styleIndex: isEven ? 6 : 7
    });

    sheet1Rows.push({ heightPt: 30, cells: rowCells });
  });

  // ============================================================================
  // SHEET 2: الآباء وفروعهم بالتسلسل (Fathers & Direct Branches Register)
  // ============================================================================
  const fathersList = members.filter(
    (m) => m.allVisibleChildren.length > 0 || m.depth === 1
  );

  const sheet2ColWidths = [9, 22, 16, 42, 14, 42, 42];
  const sheet2Rows: ExcelWorksheetSpec['rows'] = [];
  const sheet2Merges: ExcelMergeRange[] = [];

  sheet2Rows.push({
    heightPt: 40,
    cells: sheet2ColWidths.map((_, i) => ({
      value:
        i === 0
          ? `${mainTitleText} — سجل الآباء وفروعهم المباشرة بالتسلسل`
          : '',
      styleIndex: 1
    }))
  });
  sheet2Merges.push({
    startRow: 1,
    startCol: 1,
    endRow: 1,
    endCol: sheet2ColWidths.length
  });

  sheet2Rows.push({
    heightPt: 28,
    cells: sheet2ColWidths.map((_, i) => ({
      value:
        i === 0
          ? `عدد الآباء أصحاب الفروع: ${fathersList.length} أباً — ${subtitleText}`
          : '',
      styleIndex: 2
    }))
  });
  sheet2Merges.push({
    startRow: 2,
    startCol: 1,
    endRow: 2,
    endCol: sheet2ColWidths.length
  });

  sheet2Rows.push({
    heightPt: 32,
    cells: [
      { value: 'تسلسل الأب', styleIndex: 3 },
      { value: 'اسم الأب (الفرع)', styleIndex: 3 },
      { value: 'الجيل', styleIndex: 3 },
      { value: 'سلسلة النسب الصاعد حتى الجذر', styleIndex: 3 },
      { value: 'عدد الأبناء', styleIndex: 3 },
      { value: 'الأبناء الذكور (بالاسم الأول)', styleIndex: 3 },
      { value: 'البنات الإناث (بالاسم الأول)', styleIndex: 3 }
    ]
  });

  fathersList.forEach((f, idx) => {
    const isEven = idx % 2 === 0;
    const baseStyle = isEven ? 4 : 5;
    const centerStyle = isEven ? 6 : 7;

    const sonsNames =
      f.maleChildren.length > 0
        ? f.maleChildren
            .map((s, i) => `${i + 1}. ${extractGivenName(s.fullName)}`)
            .join(' ، ')
        : '—';

    const daughtersNames = !includeFemales
      ? 'غير مشمول في هذا التصدير'
      : f.femaleChildren.length > 0
      ? f.femaleChildren
          .map((d, i) => `${i + 1}. ${extractGivenName(d.fullName)}`)
          .join(' ، ')
      : '—';

    sheet2Rows.push({
      heightPt: 34,
      cells: [
        { value: idx + 1, styleIndex: centerStyle, type: 'num' },
        {
          value: f.givenName,
          styleIndex: getGenerationStyleIndex(f.depth)
        },
        {
          value: f.depth === 1 ? 'الجيل 1 (الأصل)' : `الجيل ${f.depth}`,
          styleIndex: getGenerationStyleIndex(f.depth)
        },
        { value: f.lineageChain, styleIndex: baseStyle },
        {
          value: f.allVisibleChildren.length,
          styleIndex: centerStyle,
          type: 'num'
        },
        { value: sonsNames, styleIndex: 8 },
        { value: daughtersNames, styleIndex: includeFemales && f.femaleChildren.length > 0 ? 9 : centerStyle }
      ]
    });
  });

  // ============================================================================
  // SHEET 3: السجل الشامل للأفراد (Complete Family Registry Table)
  // ============================================================================
  const sheet3ColWidths = [8, 20, 42, 12, 16, 20, 26, 14, 14, 14, 24, 34];
  const sheet3Rows: ExcelWorksheetSpec['rows'] = [];
  const sheet3Merges: ExcelMergeRange[] = [];

  sheet3Rows.push({
    heightPt: 40,
    cells: sheet3ColWidths.map((_, i) => ({
      value: i === 0 ? `${mainTitleText} — السجل الشامل لجميع الأفراد` : '',
      styleIndex: 1
    }))
  });
  sheet3Merges.push({
    startRow: 1,
    startCol: 1,
    endRow: 1,
    endCol: sheet3ColWidths.length
  });

  sheet3Rows.push({
    heightPt: 28,
    cells: sheet3ColWidths.map((_, i) => ({
      value: i === 0 ? subtitleText : '',
      styleIndex: 2
    }))
  });
  sheet3Merges.push({
    startRow: 2,
    startCol: 1,
    endRow: 2,
    endCol: sheet3ColWidths.length
  });

  sheet3Rows.push({
    heightPt: 32,
    cells: [
      { value: 'م', styleIndex: 3 },
      { value: 'الاسم الأول', styleIndex: 3 },
      { value: 'الاسم الكامل وسلسلة النسب', styleIndex: 3 },
      { value: 'الجنس', styleIndex: 3 },
      { value: 'الجيل', styleIndex: 3 },
      { value: 'الأب المباشر', styleIndex: 3 },
      { value: 'الأم / الزوجات', styleIndex: 3 },
      { value: 'الأبناء الذكور', styleIndex: 3 },
      { value: 'البنات الإناث', styleIndex: 3 },
      { value: 'إجمالي الفروع', styleIndex: 3 },
      { value: 'الشجرة (الجذر)', styleIndex: 3 },
      { value: 'السيرة والملاحظات', styleIndex: 3 }
    ]
  });

  members.forEach((m, idx) => {
    const isEven = idx % 2 === 0;
    const baseStyle = isEven ? 4 : 5;
    const centerStyle = isEven ? 6 : 7;

    const familyDetailsParts: string[] = [];
    if (m.person.motherId) {
      const motherObj =
        personById.get(m.person.motherId) ||
        members.find((x) => x.person.id === m.person.motherId)?.person;
      if (motherObj) {
        familyDetailsParts.push(`الأم: ${formatAppName(motherObj.fullName)}`);
      }
    }
    if (m.person.gender === 'male') {
      const pool = allPersons.length > 0 ? allPersons : members.map((x) => x.person);
      const wivesList = pool.filter(
        (w) => w.gender === 'female' && w.husbandId === m.person.id
      );
      if (wivesList.length > 0) {
        familyDetailsParts.push(
          `الزوجات: ${wivesList.map((w) => formatAppName(w.fullName)).join(' ، ')}`
        );
      }
    } else {
      const husbandObj = m.person.husbandId
        ? personById.get(m.person.husbandId) ||
          members.find((x) => x.person.id === m.person.husbandId)?.person
        : undefined;
      const hName = husbandObj
        ? formatAppName(husbandObj.fullName)
        : m.person.husbandName?.trim();
      if (hName) {
        familyDetailsParts.push(`الزوج: ${hName}`);
      }
    }

    sheet3Rows.push({
      heightPt: 29,
      cells: [
        { value: m.seq, styleIndex: centerStyle, type: 'num' },
        { value: m.givenName, styleIndex: getGenerationStyleIndex(m.depth) },
        { value: m.lineageChain, styleIndex: baseStyle },
        {
          value: m.person.gender === 'male' ? 'ذكر' : 'أنثى',
          styleIndex: m.person.gender === 'male' ? 8 : 9
        },
        {
          value: m.depth === 1 ? 'الجيل 1 (الأصل)' : `الجيل ${m.depth}`,
          styleIndex: getGenerationStyleIndex(m.depth)
        },
        { value: m.fatherName, styleIndex: baseStyle },
        {
          value: familyDetailsParts.length > 0 ? familyDetailsParts.join(' | ') : '—',
          styleIndex: baseStyle
        },
        {
          value: m.maleChildren.length,
          styleIndex: centerStyle,
          type: 'num'
        },
        {
          value: m.femaleChildren.length,
          styleIndex: centerStyle,
          type: 'num'
        },
        {
          value: m.allVisibleChildren.length,
          styleIndex: centerStyle,
          type: 'num'
        },
        { value: m.rootTreeName, styleIndex: baseStyle },
        {
          value: m.person.notes?.trim() || '—',
          styleIndex: baseStyle
        }
      ]
    });
  });

  // Totals Row at bottom of Sheet 3
  sheet3Rows.push({
    heightPt: 32,
    cells: [
      { value: 'الإجمالي', styleIndex: 10 },
      { value: `${members.length} فرداً`, styleIndex: 10 },
      { value: `الذكور: ${totalMales} | الإناث: ${totalFemales}`, styleIndex: 10 },
      { value: `${maxDepth} أجيال`, styleIndex: 10 },
      { value: '—', styleIndex: 10 },
      { value: '—', styleIndex: 10 },
      { value: '—', styleIndex: 10 },
      {
        value: members.reduce((acc, x) => acc + x.maleChildren.length, 0),
        styleIndex: 10,
        type: 'num'
      },
      {
        value: members.reduce((acc, x) => acc + x.femaleChildren.length, 0),
        styleIndex: 10,
        type: 'num'
      },
      {
        value: members.reduce((acc, x) => acc + x.allVisibleChildren.length, 0),
        styleIndex: 10,
        type: 'num'
      },
      { value: `${roots.length} شجرة`, styleIndex: 10 },
      { value: `تاريخ الإصدار: ${dateStr} م`, styleIndex: 10 }
    ]
  });

  // ============================================================================
  // SHEET 4: إحصائيات وملخص الأجيال (Generations Breakdown Dashboard)
  // ============================================================================
  const sheet4ColWidths = [18, 26, 18, 18, 18, 18, 36];
  const sheet4Rows: ExcelWorksheetSpec['rows'] = [];
  const sheet4Merges: ExcelMergeRange[] = [];

  sheet4Rows.push({
    heightPt: 40,
    cells: sheet4ColWidths.map((_, i) => ({
      value: i === 0 ? `${mainTitleText} — إحصائيات وملخص الأجيال` : '',
      styleIndex: 1
    }))
  });
  sheet4Merges.push({
    startRow: 1,
    startCol: 1,
    endRow: 1,
    endCol: sheet4ColWidths.length
  });

  sheet4Rows.push({
    heightPt: 28,
    cells: sheet4ColWidths.map((_, i) => ({
      value: i === 0 ? subtitleText : '',
      styleIndex: 2
    }))
  });
  sheet4Merges.push({
    startRow: 2,
    startCol: 1,
    endRow: 2,
    endCol: sheet4ColWidths.length
  });

  sheet4Rows.push({
    heightPt: 32,
    cells: [
      { value: 'رقم الجيل', styleIndex: 3 },
      { value: 'وصف الجيل ولونه المميز', styleIndex: 3 },
      { value: 'عدد الذكور', styleIndex: 3 },
      { value: 'عدد الإناث', styleIndex: 3 },
      { value: 'إجمالي أفراد الجيل', styleIndex: 3 },
      { value: 'النسبة المئوية', styleIndex: 3 },
      { value: 'أبرز الأسماء في هذا الجيل', styleIndex: 3 }
    ]
  });

  for (let d = 1; d <= maxDepth; d++) {
    const genMembers = members.filter((m) => m.depth === d);
    const gMales = genMembers.filter((m) => m.person.gender === 'male').length;
    const gFemales = genMembers.filter((m) => m.person.gender === 'female').length;
    const pct =
      members.length > 0
        ? `${((genMembers.length / members.length) * 100).toFixed(1)}%`
        : '0%';
    const sampleNames = genMembers
      .slice(0, 6)
      .map((m) => m.givenName)
      .join(' ، ');

    sheet4Rows.push({
      heightPt: 30,
      cells: [
        {
          value: `الجيل ${d}`,
          styleIndex: getGenerationStyleIndex(d)
        },
        {
          value: d === 1 ? 'الجيل الأول (الأصل المؤسس)' : `الجيل رقم ${d} في الشجرة`,
          styleIndex: getGenerationStyleIndex(d)
        },
        { value: gMales, styleIndex: 8, type: 'num' },
        { value: gFemales, styleIndex: 9, type: 'num' },
        { value: genMembers.length, styleIndex: 6, type: 'num' },
        { value: pct, styleIndex: 6 },
        {
          value:
            sampleNames + (genMembers.length > 6 ? ` ... (+${genMembers.length - 6})` : ''),
          styleIndex: 4
        }
      ]
    });
  }

  sheet4Rows.push({
    heightPt: 32,
    cells: [
      { value: 'المجموع الكلي', styleIndex: 10 },
      { value: `${maxDepth} أجيال متسلسلة`, styleIndex: 10 },
      { value: totalMales, styleIndex: 10, type: 'num' },
      { value: totalFemales, styleIndex: 10, type: 'num' },
      { value: members.length, styleIndex: 10, type: 'num' },
      { value: '100%', styleIndex: 10 },
      { value: `إجمالي الآباء أصحاب الفروع: ${fathersList.length}`, styleIndex: 10 }
    ]
  });

  const blob = buildXlsxBlobFromSheets([
    {
      name: 'المخطط الهرمي للشجرة',
      colWidths: sheet1ColWidths,
      rows: sheet1Rows,
      merges: sheet1Merges,
      freezeTopRows: 3
    },
    {
      name: 'الآباء وفروعهم بالتسلسل',
      colWidths: sheet2ColWidths,
      rows: sheet2Rows,
      merges: sheet2Merges,
      freezeTopRows: 3
    },
    {
      name: 'السجل الشامل للأفراد',
      colWidths: sheet3ColWidths,
      rows: sheet3Rows,
      merges: sheet3Merges,
      freezeTopRows: 3
    },
    {
      name: 'إحصائيات الأجيال',
      colWidths: sheet4ColWidths,
      rows: sheet4Rows,
      merges: sheet4Merges,
      freezeTopRows: 3
    }
  ]);

  const genderSuffix = includeFemales ? 'مع_الإناث' : 'الذكور_فقط';
  const filename = `شجرة_وسجل_العائلة_${rootFirstName}_${genderSuffix}.xlsx`.replace(
    /[\\/:*?"<>|]/g,
    '_'
  );

  return { blob, filename, rootFirstName };
}

/**
 * Generates and immediately downloads the formatted RTL Excel (.xlsx) file for a tree or combined trees
 */
export function exportTreeToExcel(options: ExportTreeExcelOptions): {
  blob: Blob;
  filename: string;
} {
  const { blob, filename } = generateTreeExcelBlob(options);
  triggerExcelDownload(blob, filename);
  return { blob, filename };
}

/**
 * Exports a filtered list of members (from MembersList tab) directly to a formatted RTL Excel (.xlsx) file
 */
export function exportMembersListToExcel(options: {
  persons: Person[];
  getPerson: (id: string) => Person | undefined;
  getChildren: (id: string) => Person[];
  getAncestors: (id: string) => Person[];
}) {
  const { persons, getPerson, getChildren, getAncestors } = options;
  const dateStr = new Date().toLocaleDateString('ar-SA');
  const totalMales = persons.filter((p) => p.gender === 'male').length;
  const totalFemales = persons.filter((p) => p.gender === 'female').length;

  const colWidths = [8, 20, 44, 12, 14, 22, 28, 14, 14, 34];
  const rows: ExcelWorksheetSpec['rows'] = [];
  const merges: ExcelMergeRange[] = [];

  rows.push({
    heightPt: 40,
    cells: colWidths.map((_, i) => ({
      value:
        i === 0
          ? 'السجل العام لأفراد شجرة العائلة (منسق من اليمين إلى اليسار)'
          : '',
      styleIndex: 1
    }))
  });
  merges.push({ startRow: 1, startCol: 1, endRow: 1, endCol: colWidths.length });

  rows.push({
    heightPt: 28,
    cells: colWidths.map((_, i) => ({
      value:
        i === 0
          ? `إجمالي الأفراد: ${persons.length} (${totalMales} ذكور · ${totalFemales} إناث) — تاريخ التصدير: ${dateStr} م`
          : '',
      styleIndex: 2
    }))
  });
  merges.push({ startRow: 2, startCol: 1, endRow: 2, endCol: colWidths.length });

  rows.push({
    heightPt: 32,
    cells: [
      { value: 'م', styleIndex: 3 },
      { value: 'الاسم الأول', styleIndex: 3 },
      { value: 'الاسم الكامل والنسب الصاعد', styleIndex: 3 },
      { value: 'الجنس', styleIndex: 3 },
      { value: 'الجيل', styleIndex: 3 },
      { value: 'الأب المباشر', styleIndex: 3 },
      { value: 'الأم / الزوجات', styleIndex: 3 },
      { value: 'الأبناء الذكور', styleIndex: 3 },
      { value: 'البنات الإناث', styleIndex: 3 },
      { value: 'السيرة والملاحظات', styleIndex: 3 }
    ]
  });

  persons.forEach((p, idx) => {
    const isEven = idx % 2 === 0;
    const baseStyle = isEven ? 4 : 5;
    const centerStyle = isEven ? 6 : 7;

    const ancestors = getAncestors(p.id);
    const depth = ancestors.length + 1;
    const givenName = extractGivenName(p.fullName);
    const connector = p.gender === 'female' ? ' بنت ' : ' بن ';
    const lineage =
      ancestors.length > 0
        ? `${givenName}${connector}${ancestors
            .map((a) => extractGivenName(a.fullName))
            .join(' بن ')}`
        : formatAppName(p.fullName);

    const father = p.fatherId ? getPerson(p.fatherId) : undefined;
    const kids = getChildren(p.id);
    const maleKids = kids.filter((k) => k.gender === 'male').length;
    const femaleKids = kids.filter((k) => k.gender === 'female').length;

    const familyDetails: string[] = [];
    if (p.motherId) {
      const motherObj = getPerson(p.motherId);
      if (motherObj) {
        familyDetails.push(`الأم: ${formatAppName(motherObj.fullName)}`);
      }
    }
    if (p.gender === 'male') {
      const wivesList = persons.filter(
        (w) => w.gender === 'female' && w.husbandId === p.id
      );
      if (wivesList.length > 0) {
        familyDetails.push(
          `الزوجات: ${wivesList.map((w) => formatAppName(w.fullName)).join(' ، ')}`
        );
      }
    } else {
      const husbandObj = p.husbandId ? getPerson(p.husbandId) : undefined;
      const hName = husbandObj
        ? formatAppName(husbandObj.fullName)
        : p.husbandName?.trim();
      if (hName) {
        familyDetails.push(`الزوج: ${hName}`);
      }
    }

    rows.push({
      heightPt: 29,
      cells: [
        { value: idx + 1, styleIndex: centerStyle, type: 'num' },
        { value: givenName, styleIndex: getGenerationStyleIndex(depth) },
        { value: lineage, styleIndex: baseStyle },
        {
          value: p.gender === 'male' ? 'ذكر' : 'أنثى',
          styleIndex: p.gender === 'male' ? 8 : 9
        },
        {
          value: `الجيل ${depth}`,
          styleIndex: getGenerationStyleIndex(depth)
        },
        {
          value: father ? extractGivenName(father.fullName) : 'أصل شجرة',
          styleIndex: baseStyle
        },
        {
          value: familyDetails.length > 0 ? familyDetails.join(' | ') : '—',
          styleIndex: baseStyle
        },
        { value: maleKids, styleIndex: centerStyle, type: 'num' },
        { value: femaleKids, styleIndex: centerStyle, type: 'num' },
        { value: p.notes?.trim() || '—', styleIndex: baseStyle }
      ]
    });
  });

  const blob = buildXlsxBlobFromSheets([
    {
      name: 'قائمة أفراد العائلة',
      colWidths,
      rows,
      merges,
      freezeTopRows: 3
    }
  ]);

  triggerExcelDownload(blob, `سجل_أفراد_العائلة_${dateStr.replace(/\//g, '-')}.xlsx`);
}
