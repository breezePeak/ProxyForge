function generateAdvancedOverrides(profile) {
  return `
  try {
    const fakePlugins = ${JSON.stringify(profile.plugins || [])};
    Object.defineProperty(Navigator.prototype, 'plugins', {
      get: function() {
        return {
          length: fakePlugins.length,
          item: function(index) { return fakePlugins[index] || null; },
          namedItem: function(name) { return fakePlugins.find((p) => p.name === name) || null; },
          refresh: function() {},
          [Symbol.iterator]: function*() { for (const plugin of fakePlugins) yield plugin; }
        };
      }
    });
  } catch (e) {}

  try {
    const fakeSpeechVoices = [
      { name: 'Google US English', lang: 'en-US', default: true, localService: false, voiceURI: 'Google US English' },
      { name: 'Google UK English Female', lang: 'en-GB', default: false, localService: false, voiceURI: 'Google UK English Female' }
    ];
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices = function() { return fakeSpeechVoices; };
      setTimeout(() => {
        try { window.speechSynthesis.dispatchEvent(new Event('voiceschanged')); } catch (e) {}
      }, 100);
    }
  } catch (e) {}

  try {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query = function() {
        return Promise.resolve({
          state: 'denied',
          onchange: null,
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return true; }
        });
      };
    }
  } catch (e) {}

  try {
    if (!window.chrome) {
      window.chrome = {
        runtime: {},
        app: { isInstalled: false }
      };
    }
  } catch (e) {}

  try {
    delete Object.getPrototypeOf(navigator).webdriver;
  } catch (e) {}
`;
}

module.exports = { generateAdvancedOverrides };
