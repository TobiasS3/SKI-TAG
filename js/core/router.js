// Welche Ansicht wird gezeigt? Gesteuert über die Adresse: #/login, #/guest, #/staff …
//
// Jede Ansicht ist eine Funktion mount(root, session), die eine Aufräum-Funktion zurückgibt.

import { currentSession } from './session.js';

const routes = {};
let unmount = null;
let root = null;

export function addRoute(name, mount) {
  routes[name] = mount;
}

export const go = (name) => {
  location.hash = `#/${name}`;
};

/** Zur Startansicht der Rolle springen (oder zum Login). */
export function home() {
  const session = currentSession();
  go(session ? session.role : 'login');
}

async function render() {
  const name = location.hash.replace(/^#\/?/, '') || 'login';
  const session = currentSession();

  // Ohne Sitzung nur Login, mit Sitzung nur die eigene Ansicht
  if (!session && name !== 'login') return go('login');
  if (session && name !== session.role) return go(session.role);
  if (!routes[name]) return go('login');

  unmount?.();
  root.replaceChildren();
  root.dataset.view = name;
  unmount = await routes[name](root, session);
}

export function startRouter(el) {
  root = el;
  addEventListener('hashchange', render);
  render();
}
