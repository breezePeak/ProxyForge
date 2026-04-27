function generateClientRectsOverrides(seed) {
  return `
  try {
    function seededRandom(seed) {
      let state = 0;
      for (let i = 0; i < seed.length; i++) {
        state = ((state << 5) - state) + seed.charCodeAt(i);
        state = state & state;
      }
      return function() {
        state = (state * 9301 + 49297) % 233280;
        return state / 233280;
      };
    }

    const rectsRandom = seededRandom('${seed}');

    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function() {
      const rect = originalGetBoundingClientRect.call(this);
      const noise = (rectsRandom() - 0.5) * 0.0001;

      return {
        x: rect.x + noise,
        y: rect.y + noise,
        width: rect.width + noise,
        height: rect.height + noise,
        top: rect.top + noise,
        right: rect.right + noise,
        bottom: rect.bottom + noise,
        left: rect.left + noise,
        toJSON: rect.toJSON
      };
    };

    const originalGetClientRects = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function() {
      const rects = originalGetClientRects.call(this);
      const modifiedRects = [];

      for (let i = 0; i < rects.length; i++) {
        const rect = rects[i];
        const noise = (rectsRandom() - 0.5) * 0.0001;
        modifiedRects.push({
          x: rect.x + noise,
          y: rect.y + noise,
          width: rect.width + noise,
          height: rect.height + noise,
          top: rect.top + noise,
          right: rect.right + noise,
          bottom: rect.bottom + noise,
          left: rect.left + noise
        });
      }

      return modifiedRects;
    };
  } catch (e) {
    console.warn('[Fingerprint] Failed to override Client Rects:', e);
  }
`;
}

module.exports = { generateClientRectsOverrides };
