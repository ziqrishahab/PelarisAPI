import { describe, it, expect } from 'vitest';
import { 
  sanitizeString, 
  sanitizeText, 
  sanitizeSku, 
  sanitizeUrl, 
  sanitizePositiveInt, 
  sanitizeNumber,
  sanitizeInt,
  sanitizeFilename,
  stripHtml,
  escapeHtml,
  sanitizeObject
} from './sanitize';

describe('Sanitization Functions', () => {
  describe('sanitizeString()', () => {
    it('should remove HTML tags but keep text content', () => {
      const input = '<script>alert("xss")</script>Hello';
      const result = sanitizeString(input);
      // Tags are removed but text content is kept
      expect(result).toBe('alert("xss")Hello');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
    });

    it('should handle null/undefined input', () => {
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should respect maxLength', () => {
      const input = 'a'.repeat(2000);
      const result = sanitizeString(input, 100);
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('should remove control characters', () => {
      const input = 'Hello\x00World\x1F';
      const result = sanitizeString(input);
      expect(result).toBe('HelloWorld');
    });

    it('should handle normal strings without modification', () => {
      expect(sanitizeString('Hello World')).toBe('Hello World');
      expect(sanitizeString('Product Name 123')).toBe('Product Name 123');
    });
  });

  describe('sanitizeText()', () => {
    it('should remove HTML tags', () => {
      const input = '<p>Hello <strong>World</strong></p>';
      const result = sanitizeText(input);
      expect(result).toBe('Hello World');
    });

    it('should preserve newlines', () => {
      const input = 'Line 1\nLine 2\nLine 3';
      const result = sanitizeText(input);
      expect(result).toContain('\n');
    });

    it('should normalize line endings', () => {
      const input = 'Line 1\r\nLine 2\rLine 3';
      const result = sanitizeText(input);
      expect(result).toBe('Line 1\nLine 2\nLine 3');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeText(null)).toBe('');
      expect(sanitizeText(undefined)).toBe('');
    });

    it('should respect maxLength', () => {
      const input = 'a'.repeat(10000);
      const result = sanitizeText(input, 500);
      expect(result.length).toBeLessThanOrEqual(500);
    });
  });

  describe('sanitizeSku()', () => {
    it('should allow alphanumeric characters', () => {
      expect(sanitizeSku('ABC123')).toBe('ABC123');
    });

    it('should allow hyphens, underscores, and periods', () => {
      expect(sanitizeSku('ABC-123_XYZ.01')).toBe('ABC-123_XYZ.01');
    });

    it('should remove special characters', () => {
      expect(sanitizeSku('ABC<>123')).toBe('ABC123');
      expect(sanitizeSku('SKU@#$%')).toBe('SKU');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeSku(null)).toBe('');
      expect(sanitizeSku(undefined)).toBe('');
    });

    it('should respect maxLength', () => {
      const input = 'A'.repeat(200);
      const result = sanitizeSku(input, 50);
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should handle typical SKU formats', () => {
      expect(sanitizeSku('PRD-001-RED-L')).toBe('PRD-001-RED-L');
      expect(sanitizeSku('SHIRT_M_BLUE')).toBe('SHIRT_M_BLUE');
    });
  });

  describe('sanitizeUrl()', () => {
    it('should allow valid http URLs', () => {
      const url = 'http://example.com/image.jpg';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should allow valid https URLs', () => {
      const url = 'https://cdn.example.com/product/123.png';
      expect(sanitizeUrl(url)).toBe(url);
    });

    it('should reject javascript: URLs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
    });

    it('should reject data: URLs', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    });

    it('should handle null/undefined', () => {
      expect(sanitizeUrl(null)).toBeNull();
      expect(sanitizeUrl(undefined)).toBeNull();
    });

    it('should handle invalid URLs', () => {
      expect(sanitizeUrl('not-a-url')).toBeNull();
      expect(sanitizeUrl('ftp://example.com')).toBeNull();
    });

    it('should handle URLs with query params', () => {
      const url = 'https://example.com/image.jpg?width=100&height=100';
      expect(sanitizeUrl(url)).toBe(url);
    });
  });

  describe('sanitizeNumber()', () => {
    it('should return valid numbers', () => {
      expect(sanitizeNumber(10.5)).toBe(10.5);
      expect(sanitizeNumber('25.99')).toBe(25.99);
      expect(sanitizeNumber(0)).toBe(0);
    });

    it('should return default for invalid input', () => {
      expect(sanitizeNumber('abc')).toBe(0);
      expect(sanitizeNumber(null)).toBe(0);
      expect(sanitizeNumber(undefined)).toBe(0);
    });

    it('should use custom default value', () => {
      expect(sanitizeNumber('abc', 100)).toBe(100);
    });

    it('should handle typical price values', () => {
      expect(sanitizeNumber('99.99')).toBe(99.99);
      expect(sanitizeNumber('1000000')).toBe(1000000);
      expect(sanitizeNumber(0.01)).toBe(0.01);
    });

    it('should handle negative numbers', () => {
      expect(sanitizeNumber(-5)).toBe(-5);
    });
  });

  describe('sanitizeInt()', () => {
    it('should return integers', () => {
      expect(sanitizeInt(10)).toBe(10);
      expect(sanitizeInt('25')).toBe(25);
    });

    it('should floor decimal values', () => {
      expect(sanitizeInt(10.9)).toBe(10);
      expect(sanitizeInt('5.7')).toBe(5);
    });

    it('should return default for invalid input', () => {
      expect(sanitizeInt('abc')).toBe(0);
    });
  });

  describe('sanitizePositiveInt()', () => {
    it('should return positive integers', () => {
      expect(sanitizePositiveInt(10)).toBe(10);
      expect(sanitizePositiveInt('25')).toBe(25);
      expect(sanitizePositiveInt(0)).toBe(0);
    });

    it('should convert negative to zero', () => {
      expect(sanitizePositiveInt(-5)).toBe(0);
      expect(sanitizePositiveInt('-10')).toBe(0);
    });

    it('should return default for invalid input', () => {
      expect(sanitizePositiveInt('abc')).toBe(0);
    });
  });

  describe('sanitizeFilename()', () => {
    it('should allow valid filenames', () => {
      expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
      expect(sanitizeFilename('image-2024.jpg')).toBe('image-2024.jpg');
    });

    it('should prevent directory traversal', () => {
      expect(sanitizeFilename('../../../etc/passwd')).toBe('etcpasswd');
      expect(sanitizeFilename('..\\..\\windows\\system32')).toBe('windowssystem32');
    });

    it('should replace invalid characters with underscore', () => {
      expect(sanitizeFilename('file name.txt')).toBe('file_name.txt');
      expect(sanitizeFilename('file@name.txt')).toBe('file_name.txt');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeFilename(null)).toBe('');
      expect(sanitizeFilename(undefined)).toBe('');
    });
  });

  describe('stripHtml()', () => {
    it('should remove all HTML tags but keep text content', () => {
      expect(stripHtml('<p>Hello</p>')).toBe('Hello');
      // stripHtml removes tags but preserves inner text
      expect(stripHtml('<script>alert(1)</script>Text')).toBe('alert(1)Text');
      expect(stripHtml('<div><span>Nested</span></div>')).toBe('Nested');
    });

    it('should handle empty/null input', () => {
      expect(stripHtml('')).toBe('');
    });
  });

  describe('escapeHtml()', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('"test"')).toBe('&quot;test&quot;');
      expect(escapeHtml("'test'")).toBe('&#39;test&#39;');
      expect(escapeHtml('&test')).toBe('&amp;test');
    });

    it('should handle empty/null input', () => {
      expect(escapeHtml('')).toBe('');
    });
  });

  describe('sanitizeObject()', () => {
    it('should sanitize multiple properties', () => {
      const input = {
        name: '<b>Product</b> Name',
        sku: 'SKU@123#',
        price: '99.99',
        quantity: '10'
      };

      const result = sanitizeObject(input, {
        name: 'string',
        sku: 'sku',
        price: 'number',
        quantity: 'positiveInt'
      });

      // Tags removed, text content kept
      expect(result.name).toBe('Product Name');
      expect(result.sku).toBe('SKU123');
      expect(result.price).toBe(99.99);
      expect(result.quantity).toBe(10);
    });
  });
});

describe('XSS Prevention', () => {
  const xssVectors = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert("XSS")>',
    '<svg onload=alert("XSS")>',
    '<body onload=alert("XSS")>',
    '<iframe src="javascript:alert(\'XSS\')">',
    '<input onfocus=alert("XSS") autofocus>',
    '<a href="javascript:alert(\'XSS\')">click</a>',
    '"><script>alert("XSS")</script>',
  ];

  describe('sanitizeString should prevent XSS', () => {
    xssVectors.forEach((vector, index) => {
      it(`should neutralize XSS vector ${index + 1}`, () => {
        const result = sanitizeString(vector);
        expect(result).not.toContain('<script');
        expect(result).not.toContain('<img');
        expect(result).not.toContain('<svg');
        expect(result).not.toContain('<iframe');
        expect(result).not.toContain('<input');
        expect(result).not.toContain('<a ');
      });
    });
  });

  describe('sanitizeSku should prevent injection', () => {
    it('should remove SQL injection attempts', () => {
      const result = sanitizeSku("SKU'; DROP TABLE products;--");
      expect(result).not.toContain("'");
      expect(result).not.toContain(';');
    });
  });
});

describe('Edge Cases', () => {
  it('should handle empty strings', () => {
    expect(sanitizeString('')).toBe('');
    expect(sanitizeText('')).toBe('');
    expect(sanitizeSku('')).toBe('');
  });

  it('should handle strings with only whitespace', () => {
    expect(sanitizeString('   ')).toBe('');
    expect(sanitizeSku('   ')).toBe('');
  });

  it('should handle Unicode characters', () => {
    expect(sanitizeString('Produk こんにちは 你好')).toBe('Produk こんにちは 你好');
    expect(sanitizeString('Café Résumé')).toBe('Café Résumé');
  });

  it('should handle emoji', () => {
    expect(sanitizeString('Product 🎉 Name')).toBe('Product 🎉 Name');
  });
});
