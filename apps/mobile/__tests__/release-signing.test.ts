// eslint-disable-next-line @typescript-eslint/no-require-imports
const { applySigning } = require('../plugins/withReleaseSigning.cjs');

const GRADLE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled false
        }
    }
}`;

describe('withReleaseSigning', () => {
  it('signs only the release with the upload key from the environment', () => {
    const out: string = applySigning(GRADLE);
    expect(out).toContain("System.getenv('BORAMARCA_UPLOAD_STORE_FILE')");
    expect(out).toContain(
      "signingConfig System.getenv('BORAMARCA_UPLOAD_STORE_FILE') ? signingConfigs.upload : signingConfigs.debug",
    );
    // the debug build type keeps the debug key
    expect(out).toMatch(/debug \{\s*signingConfig signingConfigs\.debug/);
    expect(applySigning(out)).toBe(out);
  });

  it('fails loudly when the template changes', () => {
    expect(() => applySigning('android { }')).toThrow(/release block/);
  });
});
