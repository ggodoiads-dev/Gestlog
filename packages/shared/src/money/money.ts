import Decimal from 'decimal.js';

export type Currency = 'BRL' | 'USD' | 'EUR';

export type RoundingMode = 'half-up' | 'half-even' | 'down' | 'up';

const CURRENCY_PRECISION: Record<Currency, number> = {
  BRL: 2,
  USD: 2,
  EUR: 2,
};

const ROUNDING_MAP: Record<RoundingMode, Decimal.Rounding> = {
  'half-up': Decimal.ROUND_HALF_UP,
  'half-even': Decimal.ROUND_HALF_EVEN,
  down: Decimal.ROUND_DOWN,
  up: Decimal.ROUND_UP,
};

/**
 * Money value object. Dinheiro NUNCA circula como `number`.
 *
 * - Precisão arbitrária internamente (decimal.js).
 * - Moeda explícita.
 * - Arredondamento decidido no ponto de exibição/escrituração,
 *   nunca implícito.
 */
export class Money {
  private readonly amount: Decimal;
  public readonly currency: Currency;

  private constructor(amount: Decimal, currency: Currency) {
    this.amount = amount;
    this.currency = currency;
  }

  // --- construtores seguros ---

  static zero(currency: Currency): Money {
    return new Money(new Decimal(0), currency);
  }

  /** Aceita string ("1234.56", "1.234,56" em pt-BR também), Decimal ou bigint. */
  static of(value: string | Decimal | bigint, currency: Currency): Money {
    if (typeof value === 'string') {
      const normalized = value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value;
      return new Money(new Decimal(normalized), currency);
    }
    if (typeof value === 'bigint') {
      return new Money(new Decimal(value.toString()), currency);
    }
    return new Money(value, currency);
  }

  /** Centavos inteiros → Money. Útil para integrações bancárias. */
  static fromMinorUnits(minor: bigint | number, currency: Currency): Money {
    const precision = CURRENCY_PRECISION[currency];
    const d = new Decimal(minor.toString()).dividedBy(new Decimal(10).pow(precision));
    return new Money(d, currency);
  }

  // --- aritmética ---

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  times(factor: Decimal | number | string): Money {
    return new Money(this.amount.times(new Decimal(factor)), this.currency);
  }

  dividedBy(divisor: Decimal | number | string): Money {
    return new Money(this.amount.dividedBy(new Decimal(divisor)), this.currency);
  }

  negated(): Money {
    return new Money(this.amount.negated(), this.currency);
  }

  abs(): Money {
    return new Money(this.amount.abs(), this.currency);
  }

  // --- comparação ---

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.greaterThan(other.amount);
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.lessThan(other.amount);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative();
  }

  // --- arredondamento e saída ---

  roundToCurrency(mode: RoundingMode = 'half-even'): Money {
    const precision = CURRENCY_PRECISION[this.currency];
    const rounded = this.amount.toDecimalPlaces(precision, ROUNDING_MAP[mode]);
    return new Money(rounded, this.currency);
  }

  /** Centavos inteiros (bigint). Seguro para persistência. */
  toMinorUnits(mode: RoundingMode = 'half-even'): bigint {
    const precision = CURRENCY_PRECISION[this.currency];
    const scaled = this.amount
      .times(new Decimal(10).pow(precision))
      .toDecimalPlaces(0, ROUNDING_MAP[mode]);
    return BigInt(scaled.toFixed(0));
  }

  toString(): string {
    return `${this.currency} ${this.amount.toFixed(CURRENCY_PRECISION[this.currency])}`;
  }

  toJSON(): { amount: string; currency: Currency } {
    return {
      amount: this.amount.toFixed(CURRENCY_PRECISION[this.currency]),
      currency: this.currency,
    };
  }

  /** Formato pt-BR com símbolo da moeda. */
  toFormattedBRL(): string {
    if (this.currency !== 'BRL') {
      throw new Error(`toFormattedBRL() chamado em moeda ${this.currency}`);
    }
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number(this.amount.toFixed(2)));
  }

  // --- invariantes ---

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `Operação entre moedas diferentes é proibida: ${this.currency} × ${other.currency}`,
      );
    }
  }
}
