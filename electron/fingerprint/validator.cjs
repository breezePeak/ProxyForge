class ConsistencyValidator {
  validate(profile) {
    const errors = [];
    const warnings = [];

    const uaOS = this.extractOSFromUserAgent(profile.navigator.userAgent);
    if (uaOS !== profile.os) {
      errors.push(`User Agent OS (${uaOS}) does not match profile OS (${profile.os})`);
    }

    const platformOS = this.extractOSFromPlatform(profile.navigator.platform);
    if (platformOS !== profile.os) {
      errors.push(`Platform (${profile.navigator.platform}) does not match profile OS (${profile.os})`);
    }

    if (!this.validateFontsForOS(profile.fonts, profile.os)) {
      warnings.push(`Font list may not be typical for ${profile.os}`);
    }

    if (!this.validateWebGLForOS(profile.webgl.vendor, profile.os)) {
      errors.push(`WebGL vendor (${profile.webgl.vendor}) is not compatible with ${profile.os}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  autoFixInconsistencies(profile) {
    const fixed = { ...profile };
    fixed.navigator = { ...fixed.navigator };
    fixed.webgl = { ...fixed.webgl };

    fixed.navigator.platform = this.getPlatformForOS(profile.os);

    const uaOS = this.extractOSFromUserAgent(profile.navigator.userAgent);
    if (uaOS !== profile.os) {
      const chromeMatch = profile.navigator.userAgent.match(/Chrome\/([\d.]+)/);
      const chromeVersion = chromeMatch ? chromeMatch[1] : '120.0.0.0';
      fixed.navigator.userAgent = this.generateUserAgentForOS(profile.os, chromeVersion);
    }

    if (profile.os === 'macOS' && !profile.webgl.vendor.includes('Apple')) {
      fixed.webgl = {
        vendor: 'Apple Inc.',
        renderer: 'Apple M1',
        unmaskedVendor: 'Apple Inc.',
        unmaskedRenderer: 'Apple M1'
      };
    }

    return fixed;
  }

  extractOSFromUserAgent(userAgent) {
    if (userAgent.includes('Windows')) return 'Windows';
    if (userAgent.includes('Macintosh') || userAgent.includes('Mac OS X')) return 'macOS';
    if (userAgent.includes('Linux') || userAgent.includes('X11')) return 'Linux';
    return 'Windows';
  }

  extractOSFromPlatform(platform) {
    if (platform.includes('Win')) return 'Windows';
    if (platform.includes('Mac')) return 'macOS';
    if (platform.includes('Linux')) return 'Linux';
    return 'Windows';
  }

  getPlatformForOS(os) {
    if (os === 'Windows') return 'Win32';
    if (os === 'macOS') return 'MacIntel';
    return 'Linux x86_64';
  }

  generateUserAgentForOS(os, chromeVersion) {
    const webkit = '537.36';

    if (os === 'Windows') {
      return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/${webkit} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${webkit}`;
    }

    if (os === 'macOS') {
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/${webkit} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${webkit}`;
    }

    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/${webkit} (KHTML, like Gecko) Chrome/${chromeVersion} Safari/${webkit}`;
  }

  validateFontsForOS(fonts, os) {
    const windowsFonts = ['Segoe UI', 'Calibri', 'Cambria'];
    const macFonts = ['Helvetica Neue', 'Avenir'];
    const linuxFonts = ['Ubuntu', 'DejaVu Sans', 'Liberation Sans'];

    if (os === 'Windows') return windowsFonts.some((f) => fonts.includes(f));
    if (os === 'macOS') return macFonts.some((f) => fonts.includes(f));
    return linuxFonts.some((f) => fonts.includes(f));
  }

  validateWebGLForOS(vendor, os) {
    if (os === 'macOS') return vendor.includes('Apple') || vendor.includes('AMD');
    return true;
  }
}

module.exports = { ConsistencyValidator };
