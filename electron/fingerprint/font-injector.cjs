function generateFontOverrides(fonts) {
  return `
  try {
    const originalFonts = document.fonts;
    const fakeFonts = new Set(${JSON.stringify(fonts)});

    Object.defineProperty(document, 'fonts', {
      get: function() {
        return {
          ...originalFonts,
          check: function(font, text) {
            const fontFamily = font.match(/['\"]([^'\"]+)['\"]/)?.[1] || font.split(' ').pop();
            if (fakeFonts.has(fontFamily)) return true;
            return originalFonts.check.call(originalFonts, font, text);
          },
          load: function() { return Promise.resolve([]); },
          forEach: function(callback) {
            fakeFonts.forEach((font) => callback({ family: font, style: 'normal', weight: '400' }));
          },
          values: function() {
            return Array.from(fakeFonts).map((font) => ({ family: font, style: 'normal', weight: '400' }));
          },
          size: fakeFonts.size
        };
      }
    });

    const originalMeasureText = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function(text) {
      const result = originalMeasureText.call(this, text);
      const currentFont = this.font || '';
      const fontFamily = currentFont.match(/['\"]([^'\"]+)['\"]/)?.[1] || currentFont.split(' ').pop();

      if (fakeFonts.has(fontFamily)) {
        const offset = (fontFamily.charCodeAt(0) % 10) * 0.1;
        return { ...result, width: result.width + offset };
      }

      return result;
    };
  } catch (e) {
    console.warn('[Fingerprint] Failed to override fonts:', e);
  }
`;
}

module.exports = { generateFontOverrides };
