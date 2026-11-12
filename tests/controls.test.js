// Étape 2, lot 5 : le guide des commandes dit la même chose que le code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, PAD } from '../src/input/input.js';
import { ACTIONS, keyActions, keyName, reminder } from '../src/ui/controls.js';

test('chaque action du jeu a une touche pour les deux claviers et un bouton à la manette', () => {
  const actions = Object.keys(ACTIONS).filter((a) => a !== 'move' && a !== 'pause');
  for (const a of actions) {
    assert.ok(Number.isInteger(PAD[a]), `manette : ${a}`);
    for (let i = 0; i < 2; i++) {
      assert.ok(KEYS[i][a]?.length, `clavier ${i + 1} : ${a}`);
      const map = keyActions(i);
      for (const code of KEYS[i][a]) assert.equal(map.get(code), a);
      // La touche existe sur le dessin du clavier (son nom n'est pas resté un code).
      assert.doesNotMatch(keyName(KEYS[i][a][0]), /^(Key|Arrow|Shift|Numpad)/, `${a} : ${KEYS[i][a][0]}`);
    }
  }
  assert.equal(new Set(Object.values(PAD)).size, Object.keys(PAD).length, 'deux actions sur le même bouton');
});

test('une touche ne sert qu à une action par joueur, et les deux joueurs ne se marchent pas dessus', () => {
  for (let i = 0; i < 2; i++) {
    const codes = Object.values(KEYS[i]).flat();
    assert.equal(new Set(codes).size, codes.length, `clavier ${i + 1}`);
    assert.ok(!codes.includes('Escape') && !codes.includes('KeyP'), 'touche de pause réutilisée');
  }
  const both = Object.values(KEYS[0]).flat().filter((c) => Object.values(KEYS[1]).flat().includes(c));
  assert.deepEqual(both, []);
});

test('noms AZERTY et rappel de début de match', () => {
  assert.equal(keyName('KeyQ'), 'A');
  assert.equal(keyName('KeyW'), 'Z');
  assert.equal(keyName('Semicolon'), 'M');
  assert.equal(keyName('ShiftLeft'), 'Maj gauche');
  assert.match(reminder(false), /<b>F<\/b> passe.*<b>G<\/b> tir.*Échap/s);
  assert.match(reminder(true), /Stick gauche.*<b>A<\/b> passe.*<b>X<\/b> tir.*Start/s);
});
