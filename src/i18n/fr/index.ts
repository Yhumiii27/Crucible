// French dictionaries, one file per area of the application (English source string → French). One French translation per
// key across the files (src/i18n/completeness.test.ts checks it).
import admin from './admin.json';
import auth from './auth.json';
import demo from './demo.json';
import needs from './needs.json';
import planning from './planning.json';
import resources from './resources.json';
import shell from './shell.json';

const FILES: Record<string, Record<string, string>> = { admin, auth, demo, needs, planning, resources, shell };

export const FR_FILES = FILES;
export const FR_DICT: Record<string, string> = Object.assign({}, ...Object.values(FILES));
