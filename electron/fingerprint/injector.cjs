const { generateFontOverrides } = require('./font-injector.cjs');
const { generateClientRectsOverrides } = require('./clientrects-injector.cjs');
const { generateAdvancedOverrides } = require('./advanced-injector.cjs');

class FingerprintInjector {
  generateInjectionCode(profile) {
    return `
(function() {
  'use strict';

  if (window.__fingerprint_injected__) return;
  window.__fingerprint_injected__ = true;

  ${this.generateSeededRandom(profile.canvas.seed)}
  ${this.generateNavigatorOverrides(profile)}
  ${this.generateScreenOverrides(profile)}
  ${this.generateCanvasOverrides(profile)}
  ${this.generateWebGLOverrides(profile)}
  ${this.generateAudioOverrides(profile)}
  ${this.generateTimezoneOverrides(profile)}
  ${this.generateWebRTCOverrides(profile)}
  ${this.generateMediaDevicesOverrides(profile)}
  ${generateFontOverrides(profile.fonts)}
  ${generateClientRectsOverrides(profile.canvas.seed)}
  ${generateAdvancedOverrides({ plugins: [] })}
})();
`;
  }

  generateSeededRandom(seed) {
    return `
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
  const canvasRandom = seededRandom('${seed}');
`;
  }

  generateNavigatorOverrides(profile) {
    const nav = profile.navigator;
    const hardware = profile.hardware;

    return `
  try {
    Object.defineProperty(Navigator.prototype, 'platform', { get: function() { return '${nav.platform}'; } });
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: function() { return ${hardware.hardwareConcurrency}; } });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: function() { return ${hardware.deviceMemory}; } });
    Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: function() { return ${hardware.maxTouchPoints}; } });
    Object.defineProperty(Navigator.prototype, 'language', { get: function() { return '${nav.language}'; } });
    Object.defineProperty(Navigator.prototype, 'languages', { get: function() { return ${JSON.stringify(nav.languages)}; } });
    Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: function() { return ${nav.doNotTrack === null ? 'null' : `'${nav.doNotTrack}'`}; } });
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: function() { return false; } });
    Object.defineProperty(Navigator.prototype, 'pdfViewerEnabled', { get: function() { return ${Boolean(nav.pdfViewerEnabled)}; } });
  } catch (e) {}
`;
  }

  generateScreenOverrides(profile) {
    const screen = profile.screen;
    return `
  try {
    Object.defineProperty(Screen.prototype, 'width', { get: function() { return ${screen.width}; } });
    Object.defineProperty(Screen.prototype, 'height', { get: function() { return ${screen.height}; } });
    Object.defineProperty(Screen.prototype, 'availWidth', { get: function() { return ${screen.availWidth}; } });
    Object.defineProperty(Screen.prototype, 'availHeight', { get: function() { return ${screen.availHeight}; } });
    Object.defineProperty(Screen.prototype, 'colorDepth', { get: function() { return ${screen.colorDepth}; } });
    Object.defineProperty(Screen.prototype, 'pixelDepth', { get: function() { return ${screen.pixelDepth}; } });
    Object.defineProperty(window, 'devicePixelRatio', { get: function() { return ${screen.devicePixelRatio}; } });
  } catch (e) {}
`;
  }

  generateCanvasOverrides(profile) {
    if (!profile.canvas.noise) return '';
    return `
  try {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

    HTMLCanvasElement.prototype.toDataURL = function() {
      const context = this.getContext('2d');
      if (context) {
        const imageData = context.getImageData(0, 0, this.width, this.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const noise = Math.floor(canvasRandom() * 5) - 2;
          data[i] = Math.max(0, Math.min(255, data[i] + noise));
          data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
          data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }
        context.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.apply(this, arguments);
    };

    CanvasRenderingContext2D.prototype.getImageData = function() {
      const imageData = originalGetImageData.apply(this, arguments);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = Math.floor(canvasRandom() * 5) - 2;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
      }
      return imageData;
    };
  } catch (e) {}
`;
  }

  generateWebGLOverrides(profile) {
    const webgl = profile.webgl;
    return `
  try {
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return '${webgl.unmaskedVendor}';
      if (parameter === 37446) return '${webgl.unmaskedRenderer}';
      if (parameter === 7936) return '${webgl.vendor}';
      if (parameter === 7937) return '${webgl.renderer}';
      return getParameter.apply(this, arguments);
    };

    if (window.WebGL2RenderingContext && WebGL2RenderingContext.prototype) {
      const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function(parameter) {
        if (parameter === 37445) return '${webgl.unmaskedVendor}';
        if (parameter === 37446) return '${webgl.unmaskedRenderer}';
        if (parameter === 7936) return '${webgl.vendor}';
        if (parameter === 7937) return '${webgl.renderer}';
        return getParameter2.apply(this, arguments);
      };
    }
  } catch (e) {}
`;
  }

  generateAudioOverrides(profile) {
    if (!profile.audio.noise) return '';
    return `
  try {
    const audioRandom = seededRandom('${profile.audio.seed}');
    const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
    if (OriginalAudioContext) {
      const createOscillator = OriginalAudioContext.prototype.createOscillator;
      OriginalAudioContext.prototype.createOscillator = function() {
        const oscillator = createOscillator.apply(this, arguments);
        const originalStart = oscillator.start;
        oscillator.start = function() {
          const noise = (audioRandom() - 0.5) * 0.001;
          if (oscillator.frequency) oscillator.frequency.value += noise;
          return originalStart.apply(this, arguments);
        };
        return oscillator;
      };
    }
  } catch (e) {}
`;
  }

  generateTimezoneOverrides(profile) {
    const timezone = profile.timezone;
    return `
  try {
    Date.prototype.getTimezoneOffset = function() { return ${timezone.offset}; };

    const OriginalDateTimeFormat = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function() {
      const locale = arguments[0];
      const options = { ...(arguments[1] || {}), timeZone: '${timezone.name}' };
      return new OriginalDateTimeFormat(locale, options);
    };
    Intl.DateTimeFormat.prototype = OriginalDateTimeFormat.prototype;
  } catch (e) {}
`;
  }

  generateWebRTCOverrides(profile) {
    if (profile.webrtc.mode !== 'disabled') return '';
    return `
  try {
    if (window.RTCPeerConnection) {
      window.RTCPeerConnection = function() { throw new Error('WebRTC is disabled'); };
    }
    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = function() { throw new Error('WebRTC is disabled'); };
    }
    if (window.mozRTCPeerConnection) {
      window.mozRTCPeerConnection = function() { throw new Error('WebRTC is disabled'); };
    }
  } catch (e) {}
`;
  }

  generateMediaDevicesOverrides(profile) {
    const mediaDevices = profile.mediaDevices;
    return `
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices = async function() {
        const devices = [];
        for (let i = 0; i < ${mediaDevices.audioInputs}; i++) {
          devices.push({ deviceId: 'audioinput_' + i, kind: 'audioinput', label: 'Microphone ' + (i + 1), groupId: 'group_audio_' + i });
        }
        for (let i = 0; i < ${mediaDevices.audioOutputs}; i++) {
          devices.push({ deviceId: 'audiooutput_' + i, kind: 'audiooutput', label: 'Speaker ' + (i + 1), groupId: 'group_audio_' + i });
        }
        for (let i = 0; i < ${mediaDevices.videoInputs}; i++) {
          devices.push({ deviceId: 'videoinput_' + i, kind: 'videoinput', label: 'Camera ' + (i + 1), groupId: 'group_video_' + i });
        }
        return devices;
      };
    }
  } catch (e) {}
`;
  }
}

module.exports = { FingerprintInjector };
