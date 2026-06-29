// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { SQUAWK, checkCode, isAuthed, setAuthed, clearAuthed } from './auth';

const AUTH_KEY = 'fleet.admin';

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('checkCode', () => {
  it('accepts the exact squawk', () => {
    expect(checkCode(SQUAWK)).toBe(true);
    expect(checkCode('7700')).toBe(true);
  });

  it('tolerates surrounding whitespace', () => {
    expect(checkCode('  7700 ')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(checkCode('0000')).toBe(false);
    expect(checkCode('770')).toBe(false);
    expect(checkCode('77000')).toBe(false);
    expect(checkCode('')).toBe(false);
  });
});

describe('session flag', () => {
  it('starts locked', () => {
    expect(isAuthed()).toBe(false);
  });

  it('setAuthed writes "1" to sessionStorage and unlocks', () => {
    setAuthed();
    expect(isAuthed()).toBe(true);
    expect(sessionStorage.getItem(AUTH_KEY)).toBe('1');
  });

  it('clearAuthed re-locks', () => {
    setAuthed();
    clearAuthed();
    expect(isAuthed()).toBe(false);
    expect(sessionStorage.getItem(AUTH_KEY)).toBeNull();
  });

  it('uses sessionStorage, never localStorage', () => {
    setAuthed();
    expect(localStorage.getItem(AUTH_KEY)).toBeNull();
  });
});
