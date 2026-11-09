import { describe, expect, it } from 'vitest';

import { Money } from './money.js';

describe('Money', () => {
  it('soma mantem precisao sem drift de float', () => {
    const a = Money.of('0.1', 'BRL');
    const b = Money.of('0.2', 'BRL');
    expect(a.plus(b).equals(Money.of('0.3', 'BRL'))).toBe(true);
  });

  it('proibe operacao entre moedas diferentes', () => {
    const brl = Money.of('10', 'BRL');
    const usd = Money.of('10', 'USD');
    expect(() => brl.plus(usd)).toThrow(/moedas diferentes/i);
  });

  it('centavos para persistencia sao exatos', () => {
    expect(Money.of('123.45', 'BRL').toMinorUnits()).toBe(12345n);
    expect(Money.fromMinorUnits(12345n, 'BRL').toMinorUnits()).toBe(12345n);
  });

  it('aceita formato pt-BR com virgula', () => {
    expect(Money.of('1.234,56', 'BRL').toMinorUnits()).toBe(123456n);
  });

  it('arredondamento half-even eh explicito', () => {
    const m = Money.of('0.125', 'BRL');
    expect(m.roundToCurrency('half-even').toJSON().amount).toBe('0.12');
    expect(m.roundToCurrency('half-up').toJSON().amount).toBe('0.13');
  });

  it('formatacao BRL segue pt-BR', () => {
    const formatted = Money.of('1234567.89', 'BRL').toFormattedBRL();
    // Intl pode usar NBSP ou espacos convencionais entre simbolo e numero.
    expect(formatted).toMatch(/R\$\s?1\.234\.567,89/);
  });
});
