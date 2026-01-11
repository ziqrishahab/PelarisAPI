import ExcelJS from 'exceljs';

export class ExcelHelper {
  static async createWorkbook(): Promise<ExcelJS.Workbook> {
    return new ExcelJS.Workbook();
  }

  static async readFromBuffer(buffer: Buffer): Promise<ExcelJS.Workbook> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    return workbook;
  }

  static async writeToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  static worksheetToJSON(worksheet: ExcelJS.Worksheet, headerRow: number = 1): any[] {
    const data: any[] = [];
    const headers: string[] = [];
    
    worksheet.getRow(headerRow).eachCell((cell, colNumber) => {
      headers[colNumber - 1] = cell.value?.toString() || `Column${colNumber}`;
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRow) return;
      
      const rowData: any = {};
      let hasData = false;
      
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = headers[colNumber - 1];
        const value = cell.value;
        rowData[header] = value ?? '';
        if (value !== null && value !== undefined && value !== '') {
          hasData = true;
        }
      });
      
      if (hasData) {
        data.push(rowData);
      }
    });

    return data;
  }

  static addWorksheet(
    workbook: ExcelJS.Workbook, 
    name: string, 
    data: any[][], 
    options?: {
      columnWidths?: number[];
      merges?: { start: { row: number; col: number }; end: { row: number; col: number } }[];
    }
  ): ExcelJS.Worksheet {
    const worksheet = workbook.addWorksheet(name);
    
    data.forEach(row => {
      worksheet.addRow(row);
    });

    if (options?.columnWidths) {
      options.columnWidths.forEach((width, index) => {
        worksheet.getColumn(index + 1).width = width;
      });
    }

    if (options?.merges) {
      options.merges.forEach(merge => {
        worksheet.mergeCells(
          merge.start.row, 
          merge.start.col, 
          merge.end.row, 
          merge.end.col
        );
      });
    }

    return worksheet;
  }
}
