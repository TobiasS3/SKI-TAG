// Startpunkt: Ansichten anmelden, Router starten.

import { addRoute, startRouter, go } from './core/router.js';
import { onExpire } from './core/session.js';
import { on } from './core/events.js';
import { t } from './core/i18n.js';
import { toast } from './components/toast.js';
import { mountLogin } from '../views/login/login-view.js';
import { mountGuest } from '../views/guest/guest-view.js';
import { mountStaff } from '../views/staff/staff-view.js';
import { mountSchool } from '../views/school/school-view.js';

addRoute('login', mountLogin);
addRoute('guest', mountGuest);
addRoute('staff', mountStaff);
addRoute('school', mountSchool);

startRouter(document.getElementById('app'));

// Um Mitternacht automatisch abmelden
let cancelExpiry = onExpire(expired);
addEventListener('hashchange', () => {
  cancelExpiry();
  cancelExpiry = onExpire(expired);
});

function expired() {
  go('login');
  toast(t('expired'), { icon: 'clock', ms: 6000 });
}

// Sprachwechsel: Titel im Browser-Tab mitziehen
on('lang', () => {
  document.title = t('app.name');
});
