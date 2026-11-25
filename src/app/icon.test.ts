// The tool's logo of Norma 2.3.0 (norma/charte/COQUE.md § 8 bis): the favicon is norma/charte/logos/crucible.svg, served without a
// session, and the brand of the sidebar and of the top bar is the charter's ToolLogo.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPublicPath } from '@/domain/auth';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('logo and favicon', () => {
  it('serves the logo of Norma as the favicon, without a session', () => {
    expect(read('src/app/icon.svg')).toBe(read('norma/charte/logos/crucible.svg'));
    for (const old of ['src/app/favicon.ico', 'src/app/icon.png', 'src/app/icon.tsx', 'public/favicon.ico']) expect(existsSync(join(process.cwd(), old))).toBe(false);
    expect(isPublicPath('/icon.svg')).toBe(true);
  });

  it('shows the logo in the brand of the sidebar and of the top bar', () => {
    const shell = ['src/components/app/shell/sidebar.tsx', 'src/components/app/shell/prefs.tsx'].map(read).join('\n');
    expect(shell).toMatch(/<CoqueSidebar[^>]*logo=\{<ToolLogo code="crucible" \/>\}/);
    expect(shell).toMatch(/<MobileTopBar[^>]*logo=\{<ToolLogo code="crucible" size=\{20\} \/>\}/);
  });
});
